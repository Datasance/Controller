const WebSocket = require('ws')
const config = require('../config')
const logger = require('../logger')
const Errors = require('../helpers/errors')
const SessionManager = require('./session-manager')
const { WebSocketError } = require('./error-handler')
const MicroserviceManager = require('../data/managers/microservice-manager')
const ApplicationManager = require('../data/managers/application-manager')
const MicroserviceStatusManager = require('../data/managers/microservice-status-manager')
const { microserviceState, microserviceExecState } = require('../enums/microservice-state')
const MicroserviceExecStatusManager = require('../data/managers/microservice-exec-status-manager')
const keycloak = require('../config/keycloak.js').initKeycloak()
const AuthDecorator = require('../decorators/authorization-decorator')
const TransactionDecorator = require('../decorators/transaction-decorator')
const msgpack = require('@msgpack/msgpack')
const WebSocketQueueService = require('../services/websocket-queue-service')

const MESSAGE_TYPES = {
  STDIN: 0,
  STDOUT: 1,
  STDERR: 2,
  CONTROL: 3,
  CLOSE: 4,
  ACTIVATION: 5
}

class WebSocketServer {
  constructor () {
    this.wss = null
    this.agentSessions = new Map()
    this.userSessions = new Map()
    this.connectionLimits = new Map()
    this.rateLimits = new Map()
    this.sessionManager = new SessionManager(config.get('server.webSocket'))
    this.queueService = WebSocketQueueService
    this.pendingCloseTimeouts = new Map() // Track pending CLOSE messages in cross-replica scenarios
    this.config = {
      pingInterval: process.env.WS_PING_INTERVAL || config.get('server.webSocket.pingInterval'),
      pongTimeout: process.env.WS_PONG_TIMEOUT || config.get('server.webSocket.pongTimeout'),
      maxPayload: process.env.WS_MAX_PAYLOAD || config.get('server.webSocket.maxPayload'),
      sessionTimeout: process.env.WS_SESSION_TIMEOUT || config.get('server.webSocket.session.timeout'),
      cleanupInterval: process.env.WS_CLEANUP_INTERVAL || config.get('server.webSocket.session.cleanupInterval'),
      sessionMaxConnections: process.env.WS_SESSION_MAX_CONNECTIONS || config.get('server.webSocket.session.maxConnections'),
      closeResponseTimeout: process.env.WS_CLOSE_RESPONSE_TIMEOUT || 5000 // 5 seconds timeout for agent CLOSE response
    }

    this.ensureSocketPongHandler = (ws) => {
      if (!ws || ws._hasPingListener) {
        return
      }
      ws._hasPingListener = true
      ws.on('ping', () => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.pong()
          } catch (error) {
            logger.debug('[RELAY] Failed to respond to ping frame', { error: error.message })
          }
        }
      })
    }
  }

  // MessagePack encoding/decoding helpers with improved error handling
  encodeMessage (message) {
    try {
      // Ensure we're only encoding the actual message content
      const encoded = msgpack.encode(message)
      logger.debug('Encoded MessagePack message:' + JSON.stringify({
        type: typeof message,
        isMap: message instanceof Map,
        keys: message instanceof Map ? Array.from(message.keys()) : Object.keys(message),
        hasExecId: message instanceof Map ? message.has('execId') : 'execId' in message,
        hasMicroserviceUuid: message instanceof Map ? message.has('microserviceUuid') : 'microserviceUuid' in message,
        encodedLength: encoded.length,
        firstBytes: encoded.subarray(0, 16).toString('hex')
      }))
      return encoded
    } catch (error) {
      logger.error('Failed to encode message:' + JSON.stringify({
        error: error.message,
        message: message
      }))
      throw new WebSocketError(1008, 'Message encoding failed')
    }
  }

  decodeMessage (buffer) {
    try {
      const decoded = msgpack.decode(buffer)
      logger.debug('Decoded MessagePack message:' + JSON.stringify({
        type: typeof decoded,
        isMap: decoded instanceof Map,
        keys: decoded instanceof Map ? Array.from(decoded.keys()) : Object.keys(decoded),
        hasExecId: decoded instanceof Map ? decoded.has('execId') : 'execId' in decoded,
        hasMicroserviceUuid: decoded instanceof Map ? decoded.has('microserviceUuid') : 'microserviceUuid' in decoded,
        bufferLength: buffer.length,
        firstBytes: buffer.subarray(0, 16).toString('hex')
      }))
      return decoded
    } catch (error) {
      logger.error('Failed to decode MessagePack message:' + JSON.stringify({
        error: error.message,
        bufferLength: buffer.length,
        firstBytes: buffer.subarray(0, 16).toString('hex')
      }))
      throw error
    }
  }

  initialize (server) {
    // Strict WebSocket configuration with no extensions and RSV control
    const options = {
      server,
      maxPayload: process.env.WS_SECURITY_MAX_PAYLOAD || config.get('server.webSocket.security.maxPayload'),
      perMessageDeflate: false, // Explicitly disable compression
      clientTracking: true,
      verifyClient: this.verifyClient.bind(this),
      // Strict protocol handling
      handleProtocols: (protocols) => {
        // Accept any protocol but ensure strict mode
        return protocols[0]
      }
    }

    logger.info('Initializing WebSocket server with strict options:' + JSON.stringify(options))
    this.wss = new WebSocket.Server(options)

    // Handle WebSocket server errors
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:' + JSON.stringify({
        error: error.message,
        stack: error.stack
      }))
    })

    // Handle individual connection errors
    this.wss.on('connection', (ws, req) => {
      logger.info('New WebSocket connection established:' + JSON.stringify({
        url: req.url,
        headers: req.headers,
        remoteAddress: req.socket.remoteAddress
      }))

      // Set strict WebSocket options for this connection
      ws.binaryType = 'arraybuffer' // Force binary type to be arraybuffer

      if (ws._socket) {
        ws._socket.setNoDelay(true)
        ws._socket.setKeepAlive(true, 30000) // Enable keep-alive instead of disabling
      }

      // Add detailed frame-level logging
      ws.on('message', (data, isBinary) => {
        const buffer = Buffer.from(data)
        logger.debug('WebSocket frame received:' + JSON.stringify({
          isBinary,
          length: buffer.length,
          firstBytes: buffer.subarray(0, 16).toString('hex'),
          lastBytes: buffer.subarray(-16).toString('hex'),
          url: req.url
        }))
      })

      // Add error handler for each connection
      ws.on('error', (error) => {
        logger.error('WebSocket connection error:' + JSON.stringify({
          error: error.message,
          stack: error.stack,
          url: req.url
        }))
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.close(1002, 'Protocol error')
          } catch (closeError) {
            logger.error('Error closing WebSocket:' + JSON.stringify({
              error: closeError.message,
              originalError: error.message
            }))
          }
        }
      })

      // Wrap handleConnection in try-catch to prevent unhandled errors
      try {
        this.handleConnection(ws, req)
      } catch (error) {
        logger.error('Unhandled error in handleConnection:' + JSON.stringify({
          error: error.message,
          stack: error.stack,
          url: req.url
        }))
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.close(1002, 'Internal server error')
          } catch (closeError) {
            logger.error('Error closing WebSocket:' + JSON.stringify({
              error: closeError.message,
              originalError: error.message
            }))
          }
        }
      }
    })

    // Add global error handler for the server
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in WebSocket server:' + JSON.stringify({
        error: error.message,
        stack: error.stack
      }))
      // Don't let the error crash the process
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in WebSocket server:' + JSON.stringify({
        reason: reason,
        promise: promise
      }))
      // Don't let the error crash the process
    })

    this.sessionManager.startCleanup()
  }

  async verifyClient (info, callback) {
    try {
      // Check connection limits
      const clientIp = info.req.socket.remoteAddress
      const currentConnections = this.connectionLimits.get(clientIp) || 0
      if (currentConnections >= (process.env.WS_SECURITY_MAX_CONNECTIONS_PER_IP || config.get('server.webSocket.security.maxConnectionsPerIp'))) {
        callback(new Error('Too many connections'), false)
        return
      }

      // Check rate limits
      const now = Date.now()
      const rateLimit = this.rateLimits.get(clientIp) || { count: 0, resetTime: now + 60000 }
      if (now > rateLimit.resetTime) {
        rateLimit.count = 0
        rateLimit.resetTime = now + 60000
      }

      if (rateLimit.count >= (process.env.WS_SECURITY_MAX_REQUESTS_PER_MINUTE || config.get('server.webSocket.security.maxRequestsPerMinute'))) {
        callback(new Error('Rate limit exceeded'), false)
        return
      }

      rateLimit.count++
      this.rateLimits.set(clientIp, rateLimit)

      callback(null, true)
    } catch (error) {
      callback(new Error('Internal server error'), false)
    }
  }

  extractMicroserviceUuid (url) {
    // Match UUID pattern in the URL
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const match = url.match(uuidPattern)
    return match ? match[0] : null
  }

  handleConnection (ws, req) {
    // Add error handler for this connection
    ws.on('error', (error) => {
      logger.error('WebSocket connection error:' + JSON.stringify({
        error: error.message,
        stack: error.stack,
        url: req.url,
        headers: req.headers
      }))
      // Don't let the error crash the process
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1002, 'Protocol error')
        } catch (closeError) {
          logger.error('Error closing WebSocket:' + JSON.stringify({
            error: closeError.message,
            originalError: error.message
          }))
        }
      }
    })

    // Wrap the entire connection handling in a transaction
    TransactionDecorator.generateTransaction(async (transaction) => {
      try {
        // Check for token in Authorization header first (for agent and CLI connections)
        let token = req.headers.authorization

        // If no token in header, check query parameters (for React UI connections)
        if (!token) {
          logger.debug('Missing authentication token in header, checking query parameters')
          const url = new URL(req.url, `http://${req.headers.host}`)
          token = url.searchParams.get('token')

          // If token is found in query params, format it as Bearer token
          if (token) {
            token = `Bearer ${token}`
          }
        }

        if (!token) {
          logger.error('WebSocket connection failed: Missing authentication token neither in header nor query parameters')
          try {
            ws.close(1008, 'Missing authentication token')
          } catch (error) {
            logger.error('Error closing WebSocket:' + error.message)
          }
          return
        }

        const microserviceUuid = this.extractMicroserviceUuid(req.url)
        if (!microserviceUuid) {
          logger.error('WebSocket connection failed: Invalid endpoint - no UUID found')
          try {
            ws.close(1008, 'Invalid endpoint')
          } catch (error) {
            logger.error('Error closing WebSocket:' + error.message)
          }
          return
        }

        // Determine connection type and handle accordingly
        if (req.url.startsWith('/api/v3/agent/exec/')) {
          await this.handleAgentConnection(ws, req, token, microserviceUuid, transaction)
        } else if (req.url.startsWith('/api/v3/microservices/exec/')) {
          await this.handleUserConnection(ws, req, token, microserviceUuid, transaction)
        } else {
          logger.error('WebSocket connection failed: Invalid endpoint')
          try {
            ws.close(1008, 'Invalid endpoint')
          } catch (error) {
            logger.error('Error closing WebSocket:' + error.message)
          }
          return
        }
      } catch (error) {
        logger.error('WebSocket connection error:' + JSON.stringify({
          error: error.message,
          stack: error.stack,
          url: req.url,
          headers: req.headers
        }))

        // Handle WebSocket errors gracefully
        try {
          if (ws.readyState === ws.OPEN) {
            ws.close(1008, error.message || 'Internal server error')
            await MicroserviceExecStatusManager.update(
              { microserviceUuid: this.extractMicroserviceUuid(req.url) },
              { execSessionId: '', status: microserviceExecState.INACTIVE },
              transaction
            )
            await MicroserviceManager.update({ uuid: this.extractMicroserviceUuid(req.url) }, { execEnabled: false }, transaction)
          }
        } catch (closeError) {
          logger.error('Error closing WebSocket connection:' + JSON.stringify({
            error: closeError.message,
            originalError: error.message
          }))
        }
      }
    })().catch(error => {
      logger.error('Unhandled WebSocket transaction error:' + JSON.stringify({
        error: error.message,
        stack: error.stack
      }))
    })
  }

  async handleAgentConnection (ws, req, token, microserviceUuid, transaction) {
    try {
      this.ensureSocketPongHandler(ws)
      logger.debug('[WS-CONN] Processing agent connection:' + JSON.stringify({
        url: req.url,
        microserviceUuid,
        remoteAddress: req.socket.remoteAddress
      }))

      // Set up message handler for initial message only
      const initialMessageHandler = async (data, isBinary) => {
        logger.debug('[WS-INIT] Received initial message from agent:' + JSON.stringify({
          isBinary,
          url: req.url,
          microserviceUuid
        }))

        if (!isBinary) {
          logger.error('[WS-ERROR] Expected binary message from agent')
          ws.close(1008, 'Expected binary message')
          return
        }

        const buffer = Buffer.from(data)
        logger.debug('[WS-INIT] Processing initial message from agent:' + JSON.stringify({
          isBinary,
          length: buffer.length,
          firstBytes: buffer.subarray(0, 16).toString('hex'),
          lastBytes: buffer.subarray(-16).toString('hex')
        }))

        let execMsg
        try {
          execMsg = this.decodeMessage(buffer)
          logger.info('[WS-INIT] Decoded MessagePack from agent:' + JSON.stringify(execMsg))
        } catch (err) {
          logger.error('[WS-ERROR] Failed to decode MessagePack from agent:' + JSON.stringify({
            error: err.message,
            stack: err.stack
          }))
          ws.close(1008, 'Invalid MessagePack')
          return
        }

        const { execId, microserviceUuid: msgMicroserviceUuid } = execMsg
        if (!execId || !msgMicroserviceUuid) {
          logger.error('[WS-ERROR] Agent message missing execId or microserviceUuid:' + JSON.stringify(execMsg))
          ws.close(1008, 'Missing required fields')
          return
        }

        // Remove the initial message handler
        ws.removeListener('message', initialMessageHandler)

        // Try to activate session with the execId from the message
        const session = await this.sessionManager.tryActivateSession(msgMicroserviceUuid, execId, ws, true, transaction)
        if (session) {
          logger.info('[WS-SESSION] Session activated for agent:' + JSON.stringify({
            execId,
            microserviceUuid: msgMicroserviceUuid
          }))
          // Set up message forwarding
          logger.debug('[WS-FORWARD] Setting up message forwarding:' + JSON.stringify({
            execId,
            microserviceUuid: msgMicroserviceUuid
          }))
          await this.setupMessageForwarding(execId, transaction)
        } else {
          this.attachPendingKeepAliveHandler(ws)
          try {
            await MicroserviceExecStatusManager.update(
              { microserviceUuid: microserviceUuid },
              { execSessionId: execId, status: microserviceExecState.PENDING },
              transaction
            )
            logger.debug('[WS-SESSION] Updated microservice exec status to PENDING', {
              execId,
              microserviceUuid: microserviceUuid
            })
          } catch (error) {
            logger.error('[WS-SESSION] Failed to update microservice exec status to PENDING', {
              execId,
              microserviceUuid: microserviceUuid,
              error: error.message,
              stack: error.stack
            })
            // Continue anyway - the in-memory state is correct
          }
          // Create session with agent only and enable queue bridge for cross-replica support
          // This allows the agent to receive messages from users on other replicas via AMQP queues
          const agentOnlySession = this.sessionManager.createSession(execId, msgMicroserviceUuid, ws, null, transaction)
          try {
            // Pass cleanup callback so queue service can notify us when CLOSE is received
            await this.queueService.enableForSession(agentOnlySession, (execId) => {
              // Clear timeout if it exists (agent responded to CLOSE)
              const timeout = this.pendingCloseTimeouts.get(execId)
              if (timeout) {
                clearTimeout(timeout)
                this.pendingCloseTimeouts.delete(execId)
                logger.debug('[WS-SESSION] Cleared pending CLOSE timeout - agent responded', { execId })
              }
              this.cleanupSession(execId, transaction)
            })
            agentOnlySession.queueBridgeEnabled = true
            logger.info('[WS-SESSION] No pending user found for agent, added to pending list and enabled queue bridge for cross-replica support:' + JSON.stringify({
              execId,
              microserviceUuid: msgMicroserviceUuid
            }))
            await this.setupMessageForwarding(execId, transaction)
          } catch (error) {
            logger.warn('[WS-SESSION] Failed to enable queue bridge for pending agent, will use direct relay when user connects:', {
              execId,
              microserviceUuid: msgMicroserviceUuid,
              error: error.message
            })
            agentOnlySession.queueBridgeEnabled = false
          }
        }
      }

      // Bind the message handler BEFORE validation
      ws.on('message', initialMessageHandler)

      // Now validate the connection
      const fog = await this.validateAgentConnection(token, microserviceUuid, transaction)
      logger.debug('[WS-VALIDATE] Agent connection validated:' + JSON.stringify({
        fogUuid: fog.uuid,
        microserviceUuid,
        url: req.url
      }))

      // Handle connection close
      ws.on('close', async () => {
        for (const [execId, session] of this.sessionManager.sessions) {
          if (session.agent === ws) {
            // In cross-replica scenarios, send CLOSE message to user via queue
            // Note: session.user is null on agent's replica in cross-replica scenarios
            const queueEnabled = this.queueService.shouldUseQueue(execId)
            if (queueEnabled) {
              try {
                const closeMsg = {
                  type: MESSAGE_TYPES.CLOSE,
                  execId: execId,
                  microserviceUuid: session.microserviceUuid,
                  timestamp: Date.now(),
                  data: Buffer.from('Agent closed connection')
                }
                const encoded = this.encodeMessage(closeMsg)
                await this.queueService.publishToUser(execId, encoded, { messageType: MESSAGE_TYPES.CLOSE })
                logger.info('[WS-CLOSE] Sent CLOSE message to user via queue after agent disconnect', {
                  execId,
                  microserviceUuid: session.microserviceUuid
                })
              } catch (error) {
                logger.error('[WS-CLOSE] Failed to send CLOSE message to user via queue', {
                  execId,
                  error: error.message
                })
              }
            }
            this.cleanupSession(execId, transaction)
          }
        }
        this.sessionManager.removePendingAgent(microserviceUuid, ws)
        logger.debug('[WS-CLOSE] Agent connection closed:' + JSON.stringify({
          url: req.url,
          microserviceUuid
        }))
      })

      // Handle errors
      ws.on('error', (error) => {
        logger.error('[WS-ERROR] Agent connection error:' + JSON.stringify({
          error: error.message,
          url: req.url,
          microserviceUuid
        }))
      })
    } catch (error) {
      logger.error('[WS-ERROR] Error in handleAgentConnection:' + JSON.stringify({
        error: error.message,
        stack: error.stack,
        url: req.url,
        microserviceUuid
      }))
      if (ws.readyState === ws.OPEN) {
        ws.close(1008, error.message || 'Connection error')
      }
    }
  }

  async getPendingAgentExecIdsFromDB (microserviceUuid, transaction) {
    try {
      const pendingExecStatus = await MicroserviceExecStatusManager.findAllExcludeFields(
        {
          microserviceUuid: microserviceUuid,
          status: microserviceExecState.PENDING
        },
        transaction
      )

      const execIds = pendingExecStatus.map(status => status.execSessionId)
      logger.debug('Database query for pending agents:' + JSON.stringify({
        microserviceUuid,
        foundExecIds: execIds,
        count: execIds.length
      }))

      return execIds
    } catch (error) {
      logger.error('Failed to query database for pending agents:' + JSON.stringify({
        error: error.message,
        microserviceUuid
      }))
      return []
    }
  }

  async handleUserConnection (ws, req, token, microserviceUuid, transaction) {
    try {
      this.ensureSocketPongHandler(ws)
      await this.validateUserConnection(token, microserviceUuid, transaction)
      logger.info('User connection validated successfully for microservice:' + microserviceUuid)

      // Check if there's already an active session for this microservice
      const existingSession = Array.from(this.sessionManager.sessions.values())
        .find(session => session.microserviceUuid === microserviceUuid && session.user && session.user.readyState === WebSocket.OPEN)

      if (existingSession) {
        logger.debug('Microservice has already active exec session:' + JSON.stringify({
          microserviceUuid,
          existingExecId: existingSession.execId
        }))
        ws.close(1008, 'Microservice has already active exec session.')
        return
      }

      // Get pending agent execIds from database (multi-replica compatible)
      const pendingAgentExecIds = await this.getPendingAgentExecIdsFromDB(microserviceUuid, transaction)
      logger.info('Pending agent execIds from database:' + JSON.stringify(pendingAgentExecIds))

      // Simplified logic: find any available pending agent
      const hasPendingAgents = pendingAgentExecIds.length > 0

      if (hasPendingAgents) {
        // Find any available pending agent
        const availableExecId = pendingAgentExecIds[0]
        const pendingAgent = this.sessionManager.findPendingAgentForExecId(microserviceUuid, availableExecId)

        if (pendingAgent) {
          // Activate session using agent's execId (agent is on same replica)
          const session = this.sessionManager.tryActivateSession(microserviceUuid, availableExecId, ws, false, transaction)
          if (session) {
            logger.info('Session activated for user:', {
              execId: availableExecId,
              microserviceUuid,
              userState: ws.readyState,
              agentState: pendingAgent.readyState
            })
            await this.setupMessageForwarding(availableExecId, transaction)
            return
          }
        } else {
          // Agent is on a different replica - create session with just user and enable queue bridge
          // The AMQP queues will handle message relay between replicas
          logger.info('Found PENDING execId in DB but agent is on different replica, activating session with user only:', {
            execId: availableExecId,
            microserviceUuid
          })
          this.sessionManager.createSession(availableExecId, microserviceUuid, null, ws, transaction)
          await MicroserviceExecStatusManager.update(
            { microserviceUuid: microserviceUuid },
            { execSessionId: availableExecId, status: microserviceExecState.ACTIVE },
            transaction
          )
          await this.setupMessageForwarding(availableExecId, transaction)
          logger.info('Cross-replica session activated with user only:', {
            execId: availableExecId,
            microserviceUuid,
            userState: ws.readyState
          })
          return
        }
      }

      // If we reach here, either no pending agent or activation failed
      // Add user to pending list to wait for agent
      logger.info('No immediate agent available, adding user to pending list:' + JSON.stringify({
        microserviceUuid,
        hasPendingAgents,
        pendingAgentCount: pendingAgentExecIds.length
      }))
      this.sessionManager.addPendingUser(microserviceUuid, ws)
      this.attachPendingKeepAliveHandler(ws)

      // IMMEDIATE RE-CHECK: Look for any newly available agents after adding user (database query)
      const retryPendingAgents = await this.getPendingAgentExecIdsFromDB(microserviceUuid, transaction)
      if (retryPendingAgents.length > 0) {
        logger.info('Found available agent after adding user, attempting immediate activation:' + JSON.stringify({
          microserviceUuid,
          availableExecIds: retryPendingAgents
        }))

        // Try to activate session with first available agent
        const availableExecId = retryPendingAgents[0]
        const pendingAgent = this.sessionManager.findPendingAgentForExecId(microserviceUuid, availableExecId)

        if (pendingAgent) {
          // Remove user from pending first since we're activating
          this.sessionManager.removePendingUser(microserviceUuid, ws)
          const session = this.sessionManager.tryActivateSession(microserviceUuid, availableExecId, ws, false, transaction)
          if (session) {
            logger.info('Session activated immediately after re-check:' + JSON.stringify({
              execId: availableExecId,
              microserviceUuid,
              userState: ws.readyState,
              agentState: pendingAgent.readyState
            }))

            await this.setupMessageForwarding(availableExecId, transaction)
            return // Exit early, session activated successfully
          }
        } else {
          // Agent is on different replica - activate with user only
          logger.info('Found PENDING execId in retry but agent is on different replica, activating session with user only:', {
            execId: availableExecId,
            microserviceUuid
          })
          // Remove user from pending first
          this.sessionManager.removePendingUser(microserviceUuid, ws)
          this.sessionManager.createSession(availableExecId, microserviceUuid, null, ws, transaction)
          await MicroserviceExecStatusManager.update(
            { microserviceUuid: microserviceUuid },
            { execSessionId: availableExecId, status: microserviceExecState.ACTIVE },
            transaction
          )
          await this.setupMessageForwarding(availableExecId, transaction)
          logger.info('Cross-replica session activated with user only (retry):', {
            execId: availableExecId,
            microserviceUuid,
            userState: ws.readyState
          })
          return
        }
      }

      // Only proceed with timeout mechanism if we still couldn't activate
      logger.info('No immediate agent available after re-check, proceeding with timeout mechanism')

      // Send status message to user when added to pending using STDERR
      try {
        const statusMsg = {
          type: MESSAGE_TYPES.STDERR,
          data: Buffer.from('Waiting for agent connection. Please ensure the microservice/agent is running.\n'),
          microserviceUuid: microserviceUuid,
          execId: 'pending', // Since we don't have execSessionId anymore
          timestamp: Date.now()
        }
        const encoded = this.encodeMessage(statusMsg)
        ws.send(encoded, {
          binary: true,
          compress: false,
          mask: false,
          fin: true
        })
        logger.info('Sent waiting status message to user:' + JSON.stringify({
          microserviceUuid,
          messageType: 'STDERR',
          encodedLength: encoded.length
        }))
      } catch (error) {
        logger.warn('Failed to send status message to user:' + JSON.stringify({
          error: error.message,
          microserviceUuid
        }))
      }

      // Start periodic retry timer for pending users (every 10 seconds)
      const RETRY_INTERVAL = 10000
      const startTime = Date.now()
      const retryTimer = setInterval(async () => {
        if (this.sessionManager.isUserStillPending(microserviceUuid, ws)) {
          logger.debug('Periodic retry: checking for available agents:' + JSON.stringify({
            microserviceUuid,
            retryCount: Math.floor((Date.now() - startTime) / RETRY_INTERVAL)
          }))

          try {
            const periodicRetryExecIds = await this.getPendingAgentExecIdsFromDB(microserviceUuid, transaction)
            if (periodicRetryExecIds.length > 0) {
              logger.info('Periodic retry found available agent:' + JSON.stringify({
                microserviceUuid,
                availableExecIds: periodicRetryExecIds
              }))

              // Attempt session activation with first available agent
              const availableExecId = periodicRetryExecIds[0]
              const pendingAgent = this.sessionManager.findPendingAgentForExecId(microserviceUuid, availableExecId)

              if (pendingAgent) {
                // Remove user from pending first
                this.sessionManager.removePendingUser(microserviceUuid, ws)
                const session = this.sessionManager.tryActivateSession(microserviceUuid, availableExecId, ws, false, transaction)
                if (session) {
                  logger.info('Session activated via periodic retry:' + JSON.stringify({
                    execId: availableExecId,
                    microserviceUuid,
                    userState: ws.readyState,
                    agentState: pendingAgent.readyState
                  }))

                  await this.setupMessageForwarding(availableExecId, transaction)
                  clearInterval(retryTimer) // Stop retry timer
                  return // Exit early, session activated successfully
                }
              } else {
                // Agent is on different replica - activate with user only
                logger.info('Periodic retry found PENDING execId but agent is on different replica, activating session with user only:', {
                  execId: availableExecId,
                  microserviceUuid
                })
                // Remove user from pending first
                this.sessionManager.removePendingUser(microserviceUuid, ws)
                this.sessionManager.createSession(availableExecId, microserviceUuid, null, ws, transaction)
                await MicroserviceExecStatusManager.update(
                  { microserviceUuid: microserviceUuid },
                  { execSessionId: availableExecId, status: microserviceExecState.ACTIVE },
                  transaction
                )
                await this.setupMessageForwarding(availableExecId, transaction)
                logger.info('Cross-replica session activated with user only (periodic retry):', {
                  execId: availableExecId,
                  microserviceUuid,
                  userState: ws.readyState
                })
                clearInterval(retryTimer) // Stop retry timer
                return
              }
            }
          } catch (retryError) {
            logger.warn('Periodic retry failed:' + JSON.stringify({
              error: retryError.message,
              microserviceUuid
            }))
          }
        } else {
          // User no longer pending, clear retry timer
          clearInterval(retryTimer)
        }
      }, RETRY_INTERVAL)

      // Store timer reference for cleanup
      this.sessionManager.setUserRetryTimer(microserviceUuid, ws, retryTimer)

      // Add timeout mechanism for pending users (60 seconds)
      const PENDING_USER_TIMEOUT = 60000
      setTimeout(() => {
        if (this.sessionManager.isUserStillPending(microserviceUuid, ws)) {
          logger.warn('Pending user timeout, closing connection:' + JSON.stringify({
            microserviceUuid,
            timeout: PENDING_USER_TIMEOUT
          }))

          // Send timeout message before closing
          try {
            const timeoutMsg = {
              type: MESSAGE_TYPES.STDERR,
              data: Buffer.from('Timeout waiting for agent connection. Please try again.\n'),
              microserviceUuid: microserviceUuid,
              execId: 'pending', // Since we don't have execSessionId anymore
              timestamp: Date.now()
            }
            const encoded = this.encodeMessage(timeoutMsg)
            ws.send(encoded, {
              binary: true,
              compress: false,
              mask: false,
              fin: true
            })
            logger.info('Sent timeout message to user:' + JSON.stringify({
              microserviceUuid,
              messageType: 'STDERR',
              encodedLength: encoded.length
            }))
          } catch (timeoutError) {
            logger.warn('Failed to send timeout message to user:' + JSON.stringify({
              error: timeoutError.message,
              microserviceUuid
            }))
          }

          try {
            ws.close(1008, 'Timeout waiting for agent connection')
          } catch (closeError) {
            logger.error('Error closing timed out user connection:' + JSON.stringify({
              error: closeError.message,
              microserviceUuid
            }))
          }
          // Clear retry timer before removing user
          const retryTimer = this.sessionManager.getUserRetryTimer(microserviceUuid, ws)
          if (retryTimer) {
            clearInterval(retryTimer)
            this.sessionManager.clearUserRetryTimer(microserviceUuid, ws)
          }

          this.sessionManager.removePendingUser(microserviceUuid, ws)
        }
      }, PENDING_USER_TIMEOUT)

      ws.on('close', () => {
        for (const [execId, session] of this.sessionManager.sessions) {
          if (session.user === ws) {
            this.cleanupSession(execId, transaction)
          }
        }

        // Clear retry timer before removing user
        const retryTimer = this.sessionManager.getUserRetryTimer(microserviceUuid, ws)
        if (retryTimer) {
          clearInterval(retryTimer)
          this.sessionManager.clearUserRetryTimer(microserviceUuid, ws)
        }

        this.sessionManager.removePendingUser(microserviceUuid, ws)
        logger.info('User WebSocket disconnected:' + JSON.stringify({
          microserviceUuid,
          userState: ws.readyState
        }))
      })
    } catch (error) {
      logger.error('User connection validation failed:' + JSON.stringify({
        error: error.message,
        stack: error.stack
      }))
      // Handle error gracefully instead of throwing
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1008, error.message || 'Authentication failed')
        } catch (closeError) {
          logger.error('Error closing WebSocket:' + JSON.stringify({
            error: closeError.message,
            originalError: error.message
          }))
        }
      }
    }
  }

  // // Helper method - only filter obvious noise
  // isNoise(output) {
  //   // Filter only the most obvious noise
  //   const noisePatterns = [
  //     /^clear: command not found/,  // Clear command error
  //     /^\s*$/,                      // Empty or whitespace only
  //     /^.$/                         // Single character (usually control chars)
  //   ]
  //   return noisePatterns.some(pattern => pattern.test(output))
  // }

  async setupMessageForwarding (execId, transaction) {
    const session = this.sessionManager.getSession(execId)
    if (!session) {
      logger.error('[RELAY] Failed to setup message forwarding: No session found for execId=' + execId)
      return
    }

    const { agent, user } = session
    logger.info('[RELAY] Setting up message forwarding for session:' + JSON.stringify({
      execId,
      microserviceUuid: session.microserviceUuid,
      agentConnected: !!agent,
      userConnected: !!user,
      agentState: agent ? agent.readyState : 'N/A',
      userState: user ? user.readyState : 'N/A'
    }))
    this.detachPendingKeepAliveHandler(user)
    this.detachPendingKeepAliveHandler(agent)
    try {
      // Pass cleanup callback so queue service can notify us when CLOSE is received
      await this.queueService.enableForSession(session, (execId) => {
        // Clear timeout if it exists (agent responded to CLOSE)
        const timeout = this.pendingCloseTimeouts.get(execId)
        if (timeout) {
          clearTimeout(timeout)
          this.pendingCloseTimeouts.delete(execId)
          logger.debug('[RELAY] Cleared pending CLOSE timeout - agent responded', { execId })
        }
        const currentTransaction = session.transaction
        this.cleanupSession(execId, currentTransaction)
      })
      session.queueBridgeEnabled = true
      logger.info('[RELAY] AMQP queue bridge enabled for exec session', {
        execId,
        microserviceUuid: session.microserviceUuid
      })
    } catch (error) {
      session.queueBridgeEnabled = false
      logger.warn('[RELAY] Failed to enable AMQP queue bridge, falling back to direct WebSocket relay', {
        execId,
        error: error.message
      })
    }

    // Send activation message to agent (works for both direct WebSocket and queue-based forwarding)
    const activationMsg = {
      type: MESSAGE_TYPES.ACTIVATION,
      data: Buffer.from(JSON.stringify({
        execId: execId,
        microserviceUuid: session.microserviceUuid,
        timestamp: Date.now()
      })),
      microserviceUuid: session.microserviceUuid,
      execId: execId,
      timestamp: Date.now()
    }

    // sendMessageToAgent handles queue-based forwarding when agent is null
    this.sendMessageToAgent(session.agent, activationMsg, execId, session.microserviceUuid)
      .then(success => {
        if (success) {
          logger.info('[RELAY] Session activation complete:' + JSON.stringify({
            execId,
            microserviceUuid: session.microserviceUuid,
            agentState: session.agent ? session.agent.readyState : 'N/A (cross-replica)',
            queueEnabled: this.queueService.shouldUseQueue(execId)
          }))
        } else {
          logger.error('[RELAY] Session activation failed:' + JSON.stringify({
            execId,
            microserviceUuid: session.microserviceUuid,
            agentState: session.agent ? session.agent.readyState : 'N/A',
            queueEnabled: this.queueService.shouldUseQueue(execId)
          }))
          // Only cleanup if we have a direct agent connection (not queue-based)
          if (session.agent) {
            this.cleanupSession(execId, transaction)
          }
        }
      })
      .catch(error => {
        logger.error('[RELAY] Session activation error:' + JSON.stringify({
          execId,
          microserviceUuid: session.microserviceUuid,
          error: error.message
        }))
        // Only cleanup if we have a direct agent connection (not queue-based)
        if (session.agent) {
          this.cleanupSession(execId, transaction)
        }
      })

    // Remove any previous message handlers to avoid duplicates
    if (user) {
      logger.debug('[RELAY] Removing previous user message handlers for execId=' + execId)
      user.removeAllListeners('message')
    }
    if (agent) {
      logger.debug('[RELAY] Removing previous agent message handlers for execId=' + execId)
      agent.removeAllListeners('message')
    }

    // Forward user -> agent (works for both direct WebSocket and queue-based forwarding)
    if (user) {
      logger.debug('[RELAY] Setting up user->agent message forwarding for execId=' + execId)
      user.on('message', async (data, isBinary) => {
        logger.debug('[RELAY] User message received:' + JSON.stringify({
          execId,
          isBinary,
          dataType: typeof data,
          dataLength: data.length,
          userState: user.readyState,
          agentState: agent ? agent.readyState : 'N/A (cross-replica)',
          queueEnabled: this.queueService.shouldUseQueue(execId)
        }))

        if (!isBinary) {
          // Handle text messages from user
          const text = data.toString()
          logger.debug('[RELAY] Received text message from user:' + JSON.stringify({
            execId,
            text,
            length: text.length,
            userState: user.readyState,
            agentState: session.agent ? session.agent.readyState : 'N/A (cross-replica)',
            queueEnabled: this.queueService.shouldUseQueue(execId)
          }))

          // Convert text to binary message in agent's expected format
          const msg = {
            type: MESSAGE_TYPES.STDIN,
            data: Buffer.from(text + '\n'), // Add newline for command execution
            microserviceUuid: session.microserviceUuid,
            execId: execId,
            timestamp: Date.now()
          }

          // sendMessageToAgent handles queue-based forwarding when agent is null
          await this.sendMessageToAgent(session.agent, msg, execId, session.microserviceUuid)
          return
        }

        const buffer = Buffer.from(data)
        try {
          const msg = this.decodeMessage(buffer)
          // Ensure message has all required fields
          if (!msg.microserviceUuid) msg.microserviceUuid = session.microserviceUuid
          if (!msg.execId) msg.execId = execId
          if (!msg.timestamp) msg.timestamp = Date.now()

          if (msg.type === MESSAGE_TYPES.CLOSE) {
            logger.info(`[RELAY] User sent CLOSE for execId=${execId}`)

            const queueEnabled = this.queueService.shouldUseQueue(execId)

            // Forward CLOSE to agent first
            await this.sendMessageToAgent(session.agent, msg, execId, session.microserviceUuid)

            if (queueEnabled) {
              // Cross-replica scenario: Don't close socket immediately
              // Wait for agent's CLOSE response via queue
              // The queue service will handle closing the socket in _handleCloseMessage
              // when it receives the agent's CLOSE response
              logger.debug('[RELAY] Cross-replica CLOSE: waiting for agent response via queue', {
                execId,
                microserviceUuid: session.microserviceUuid
              })

              // Set timeout in case agent doesn't respond
              const timeout = setTimeout(() => {
                const currentSession = this.sessionManager.getSession(execId)
                if (currentSession && currentSession.user && currentSession.user.readyState === WebSocket.OPEN) {
                  logger.warn('[RELAY] Agent did not respond to CLOSE within timeout, closing user socket', {
                    execId,
                    microserviceUuid: session.microserviceUuid,
                    timeout: this.config.closeResponseTimeout
                  })
                  try {
                    currentSession.user.close(1000, 'Session closed (timeout)')
                    const currentTransaction = currentSession.transaction
                    this.cleanupSession(execId, currentTransaction)
                  } catch (error) {
                    logger.error('[RELAY] Failed to close user socket on timeout', {
                      execId,
                      error: error.message
                    })
                  }
                }
                this.pendingCloseTimeouts.delete(execId)
              }, this.config.closeResponseTimeout)

              this.pendingCloseTimeouts.set(execId, timeout)
              // Don't cleanup yet - queue service will call cleanup callback when agent responds
              return
            } else {
              // Same replica: Close immediately (existing behavior)
              // Close user WebSocket with code 1000 so client's onclose handler shows "Successfully closed"
              // The client expects code 1000 (normal closure) to display the success message
              if (user && user.readyState === WebSocket.OPEN) {
                try {
                  user.close(1000, 'Session closed')
                  logger.debug('[RELAY] Closed user WebSocket with code 1000:' + JSON.stringify({
                    execId,
                    microserviceUuid: session.microserviceUuid
                  }))
                } catch (error) {
                  logger.warn('[RELAY] Failed to close user WebSocket:' + JSON.stringify({
                    execId,
                    error: error.message
                  }))
                }
              }

              // Get current transaction from the session and cleanup
              const currentTransaction = session.transaction
              this.cleanupSession(execId, currentTransaction)
              return
            }
          }

          if (msg.type === MESSAGE_TYPES.CONTROL) {
            // Handle keep-alive messages from user
            const controlData = msg.data.toString()
            if (controlData === 'keepalive') {
              // Send keep-alive response back to user
              const keepAliveResponse = {
                type: MESSAGE_TYPES.CONTROL,
                data: Buffer.from('keepalive'),
                microserviceUuid: session.microserviceUuid,
                execId: execId,
                timestamp: Date.now()
              }
              const encoded = this.encodeMessage(keepAliveResponse)
              user.send(encoded, {
                binary: true,
                compress: false,
                mask: false,
                fin: true
              })
              logger.debug('[RELAY] Sent keep-alive response to user:' + JSON.stringify({
                execId,
                microserviceUuid: session.microserviceUuid
              }))
              return // Don't forward keep-alive to agent
            }
          }

          // sendMessageToAgent handles queue-based forwarding when agent is null
          await this.sendMessageToAgent(session.agent, msg, execId, session.microserviceUuid)
        } catch (error) {
          logger.error('[RELAY] Failed to process binary message:' + JSON.stringify({
            execId,
            error: error.message,
            stack: error.stack,
            bufferLength: buffer.length,
            userState: user.readyState,
            agentState: session.agent ? session.agent.readyState : 'N/A (cross-replica)'
          }))
        }
      })
    }

    // Forward agent -> user (works for both direct WebSocket and queue-based forwarding)
    if (agent) {
      logger.debug('[RELAY] Setting up agent->user message forwarding for execId=' + execId)
      agent.on('message', async (data, isBinary) => {
        logger.debug('[RELAY] Agent message received:' + JSON.stringify({
          execId,
          isBinary,
          dataType: typeof data,
          dataLength: data.length,
          userState: session.user ? session.user.readyState : 'N/A (cross-replica)',
          agentState: agent.readyState,
          queueEnabled: this.queueService.shouldUseQueue(execId)
        }))

        try {
          const buffer = Buffer.from(data)
          const msg = this.decodeMessage(buffer)
          logger.debug('[RELAY] Decoded agent message:' + JSON.stringify({
            execId,
            type: msg.type,
            hasData: !!msg.data,
            messageSize: buffer.length
          }))

          if (msg.type === MESSAGE_TYPES.CLOSE) {
            logger.info(`[RELAY] Agent sent CLOSE for execId=${execId}`)

            const queueEnabled = this.queueService.shouldUseQueue(execId)

            // In cross-replica scenarios, publish CLOSE to queue so user's replica can handle it
            if (queueEnabled) {
              try {
                // Pass message type so queue receiver can detect CLOSE without decoding
                await this.queueService.publishToUser(execId, buffer, { messageType: MESSAGE_TYPES.CLOSE })
                logger.debug('[RELAY] Forwarded agent CLOSE message to user via queue:' + JSON.stringify({
                  execId,
                  type: msg.type
                }))
              } catch (error) {
                logger.error('[RELAY] Failed to enqueue CLOSE message for user', {
                  execId,
                  error: error.message
                })
              }
            } else if (session.user && session.user.readyState === WebSocket.OPEN) {
              // Direct connection - close user WebSocket immediately
              session.user.close(1000, 'Agent closed connection')
            }

            // Get current transaction from the session
            const currentTransaction = session.transaction
            this.cleanupSession(execId, currentTransaction)
            return
          }

          const queueEnabled = this.queueService.shouldUseQueue(execId)
          if (queueEnabled) {
            try {
              await this.queueService.publishToUser(execId, buffer)
              logger.debug('[RELAY] Forwarded agent message to user via queue:' + JSON.stringify({
                execId,
                type: msg.type
              }))
            } catch (error) {
              logger.error('[RELAY] Failed to enqueue message for user', {
                execId,
                error: error.message
              })
            }
          } else if (session.user && session.user.readyState === WebSocket.OPEN) {
            if (msg.type === MESSAGE_TYPES.STDOUT || msg.type === MESSAGE_TYPES.STDERR) {
              if (msg.data && msg.data.length > 0) {
                // Create MessagePack message for user
                const userMsg = {
                  type: msg.type,
                  data: msg.data,
                  microserviceUuid: session.microserviceUuid,
                  execId: execId,
                  timestamp: Date.now()
                }
                // Encode and send as binary
                const encoded = this.encodeMessage(userMsg)
                session.user.send(encoded, {
                  binary: true,
                  compress: false,
                  mask: false,
                  fin: true
                })

                logger.debug('[RELAY] Forwarded agent message to user:' + JSON.stringify({
                  execId,
                  type: msg.type,
                  encodedLength: encoded.length,
                  messageType: msg.type
                }))
              }
            } else if (msg.type === MESSAGE_TYPES.CONTROL) {
              session.user.send(data, {
                binary: true,
                compress: false,
                mask: false,
                fin: true
              })
            }
          } else {
            logger.debug('[RELAY] User not available (cross-replica), message should be delivered via queue:' + JSON.stringify({
              execId,
              userState: session.user ? session.user.readyState : 'N/A',
              messageType: msg.type,
              queueEnabled
            }))
          }
        } catch (error) {
          logger.error('[RELAY] Failed to process agent message:', error)
        }
      })
    }

    logger.info('[RELAY] Message forwarding setup complete for session:' + JSON.stringify({
      execId,
      microserviceUuid: session.microserviceUuid,
      agentConnected: !!agent,
      userConnected: !!user,
      agentState: agent ? agent.readyState : 'N/A',
      userState: user ? user.readyState : 'N/A'
    }))
  }

  async validateAgentConnection (token, microserviceUuid, transaction) {
    try {
      // Use AuthDecorator to validate the token and get the fog
      let fog = {}
      const req = { headers: { authorization: token }, transaction }
      const handler = AuthDecorator.checkFogToken(async (req, fogObj) => {
        fog = fogObj
        return fogObj
      })
      await handler(req)

      if (!fog) {
        logger.error('Agent validation failed: Invalid agent token')
        throw new WebSocketError(1008, 'Invalid agent token')
      }

      // Verify microservice exists and belongs to this fog
      const microservice = await MicroserviceManager.findOne({ uuid: microserviceUuid }, transaction)
      if (!microservice || microservice.iofogUuid !== fog.uuid) {
        logger.error('Agent validation failed: Microservice not found or not associated with this agent' + JSON.stringify({
          microserviceUuid,
          fogUuid: fog.uuid,
          found: !!microservice,
          microserviceFogUuid: microservice ? microservice.iofogUuid : null
        }))
        throw new WebSocketError(1008, 'Microservice not found or not associated with this agent')
      }

      return fog
    } catch (error) {
      logger.error('Agent validation error:' + JSON.stringify({
        error: error.message,
        stack: error.stack,
        microserviceUuid
      }))
      throw error // Propagate the original error
    }
  }

  async validateUserConnection (token, microserviceUuid, transaction) {
    try {
      // 1. Authenticate user first (Keycloak) - Direct token verification
      let userRoles = []

      // Extract Bearer token
      const bearerToken = token.replace('Bearer ', '')
      if (!bearerToken) {
        throw new Errors.AuthenticationError('Missing or invalid authorization token')
      }

      // Check if we're in development mode (mock Keycloak)
      const isDevMode = process.env.SERVER_DEV_MODE || config.get('server.devMode', true)
      const hasAuthConfig = this.isAuthConfigured()

      if (!hasAuthConfig && isDevMode) {
        // Use mock roles for development
        userRoles = ['SRE', 'Developer', 'Viewer']
        logger.debug('Using mock authentication for development mode')
      } else {
        // Use real Keycloak token verification
        try {
          // Create a grant from the access token
          const grant = await keycloak.grantManager.createGrant({
            access_token: bearerToken
          })

          // Extract roles from the token - get client-specific roles
          const clientId = process.env.KC_CLIENT || config.get('auth.client.id')
          const resourceAccess = grant.access_token.content.resource_access

          if (resourceAccess && resourceAccess[clientId] && resourceAccess[clientId].roles) {
            userRoles = resourceAccess[clientId].roles
          } else {
            // Fallback to realm roles if client roles not found
            userRoles = grant.access_token.content.realm_access && grant.access_token.content.realm_access.roles
              ? grant.access_token.content.realm_access.roles
              : []
          }

          logger.debug('Token verification successful, user roles:' + JSON.stringify(userRoles))
        } catch (keycloakError) {
          logger.error('Keycloak token verification failed:' + JSON.stringify({
            error: keycloakError.message,
            stack: keycloakError.stack
          }))
          throw new Errors.AuthenticationError('Invalid or expired token')
        }
      }

      // Check if user has required roles
      const hasRequiredRole = userRoles.some(role => ['SRE', 'Developer'].includes(role))
      if (!hasRequiredRole) {
        throw new Errors.AuthenticationError('Insufficient permissions. Required roles: SRE for Node Exec or Developer for Microservice Exec')
      }

      // 2. Only now check microservice, application, etc.
      const microservice = await MicroserviceManager.findOne({ uuid: microserviceUuid }, transaction)
      if (!microservice) {
        throw new Errors.NotFoundError('Microservice not found')
      }

      const application = await ApplicationManager.findOne({ id: microservice.applicationId }, transaction)
      if (!application) {
        throw new Errors.NotFoundError('Application not found')
      }

      const statusArr = await MicroserviceStatusManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
      if (!statusArr || statusArr.length === 0) {
        throw new Errors.NotFoundError('Microservice status not found')
      }
      const status = statusArr[0]
      logger.debug('Microservice status check:' + JSON.stringify({
        status: status.status,
        expectedStatus: microserviceState.RUNNING,
        isEqual: status.status === microserviceState.RUNNING
      }))
      if (status.status !== microserviceState.RUNNING) {
        throw new Errors.ValidationError('Microservice is not running')
      }

      if (application.isSystem && !userRoles.includes('SRE')) {
        throw new Errors.AuthenticationError('Only SRE can access system microservices')
      }
      // For non-system, SRE or Developer is already checked above

      // Check if microservice exec is enabled
      if (!microservice.execEnabled) {
        throw new Errors.ValidationError('Microservice exec is not enabled')
      }

      const execStatusArr = await MicroserviceExecStatusManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
      if (!execStatusArr || execStatusArr.length === 0) {
        throw new Errors.NotFoundError('Microservice exec status not found')
      }
      const execStatus = execStatusArr[0]
      // logger.debug('Microservice exec status check:' + JSON.stringify({
      //   status: execStatus.status,
      //   expectedStatus: microserviceExecState.ACTIVE,
      //   isEqual: execStatus.status === microserviceExecState.ACTIVE
      // }))
      if (execStatus.status === microserviceExecState.ACTIVE) {
        throw new Errors.ValidationError('Microservice already has an active session')
      }

      return { success: true } // Just indicate validation passed
    } catch (error) {
      logger.error('User connection validation failed:' + JSON.stringify({ error: error.message, stack: error.stack }))
      throw error
    }
  }

  // Singleton instance
  static getInstance () {
    if (!WebSocketServer.instance) {
      WebSocketServer.instance = new WebSocketServer()
    }
    return WebSocketServer.instance
  }

  // Clean up session and close sockets
  cleanupSession (execId, transaction) {
    const session = this.sessionManager.getSession(execId)
    if (!session) return

    // Clear any pending CLOSE timeout
    const timeout = this.pendingCloseTimeouts.get(execId)
    if (timeout) {
      clearTimeout(timeout)
      this.pendingCloseTimeouts.delete(execId)
      logger.debug('[RELAY] Cleared pending CLOSE timeout during cleanup', { execId })
    }

    // Send CLOSE message to agent if it's still connected
    if (session.agent && session.agent.readyState === WebSocket.OPEN) {
      const closeMsg = {
        type: MESSAGE_TYPES.CLOSE,
        execId: execId,
        microserviceUuid: session.microserviceUuid,
        timestamp: Date.now(),
        data: Buffer.from('Session closed')
      }

      try {
        const encoded = this.encodeMessage(closeMsg)
        session.agent.send(encoded, {
          binary: true,
          compress: false,
          mask: false,
          fin: true
        })
        logger.info('[RELAY] Sent CLOSE message to agent for execId=' + execId)
      } catch (error) {
        logger.error('[RELAY] Failed to send CLOSE message to agent:' + JSON.stringify({
          execId,
          error: error.message,
          stack: error.stack
        }))
      }
    }

    // Close the connections (only if not already closed)
    // Note: User connection may already be closed if user initiated the close
    if (session.user && session.user.readyState === WebSocket.OPEN) {
      session.user.close(1000, 'Session closed')
    }
    if (session.agent && session.agent.readyState === WebSocket.OPEN) {
      session.agent.close(1000, 'Session closed')
    }

    this.sessionManager.removeSession(execId, transaction)
    logger.info('[RELAY] Session cleaned up for execId=' + execId)
    this.queueService.cleanup(execId)
      .catch(error => {
        logger.warn('[RELAY] Failed to cleanup queue bridge during session cleanup', {
          execId,
          error: error.message
        })
      })
  }

  // Utility to extract microserviceUuid from path
  extractUuidFromPath (path) {
    const match = path.match(/([a-f0-9-]{36})/i)
    return match ? match[1] : null
  }

  registerRoute (path, middleware) {
    // Store the route handler
    this.routes = this.routes || new Map()
    this.routes.set(path, middleware)

    logger.info('Registered WebSocket route: ' + path)
  }

  // Helper method for sending messages to agent
  async sendMessageToAgent (agent, message, execId, microserviceUuid) {
    try {
      const encoded = this.encodeMessage(message)
      const isQueueEnabled = this.queueService.shouldUseQueue(execId)
      const messageType = typeof message.type === 'number' ? message.type : null

      if (isQueueEnabled) {
        await this.queueService.publishToAgent(execId, encoded, { messageType })
        logger.debug('[RELAY] Queued message for agent via AMQP:' + JSON.stringify({
          execId,
          microserviceUuid,
          messageType: message.type,
          encodedLength: encoded.length
        }))
        return true
      }

      if (!agent || agent.readyState !== WebSocket.OPEN) {
        logger.error('[RELAY] Cannot send message - agent not ready:' + JSON.stringify({
          execId,
          microserviceUuid,
          agentState: agent ? agent.readyState : 'N/A',
          messageType: message.type
        }))
        return false
      }

      agent.send(encoded, {
        binary: true,
        compress: false,
        mask: false,
        fin: true
      })
      logger.debug('[RELAY] Message sent to agent:' + JSON.stringify({
        execId,
        microserviceUuid,
        messageType: message.type,
        encodedLength: encoded.length
      }))
      return true
    } catch (error) {
      logger.error('[RELAY] Failed to send message to agent:' + JSON.stringify({
        execId,
        microserviceUuid,
        messageType: message.type,
        error: error.message,
        stack: error.stack
      }))
      return false
    }
  }

  attachPendingKeepAliveHandler (ws) {
    if (!ws || ws._pendingKeepAliveHandler) {
      return
    }
    ws._pendingKeepAliveHandler = (data, isBinary) => {
      if (!isBinary) return
      let msg
      try {
        msg = this.decodeMessage(Buffer.from(data))
      } catch (error) {
        return
      }
      if (msg.type === MESSAGE_TYPES.CONTROL) {
        const controlData = msg.data ? msg.data.toString() : ''
        if (controlData === 'keepalive') {
          this._sendKeepAliveResponse(ws, msg.execId || 'pending', msg.microserviceUuid || null)
        }
      }
    }
    ws.on('message', ws._pendingKeepAliveHandler)
    ws.on('ping', () => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.pong()
        } catch (error) {
          logger.debug('[RELAY] Failed to send pong on pending connection', { error: error.message })
        }
      }
    })
  }

  detachPendingKeepAliveHandler (ws) {
    if (ws && ws._pendingKeepAliveHandler) {
      ws.removeListener('message', ws._pendingKeepAliveHandler)
      ws._pendingKeepAliveHandler = null
    }
  }

  _sendKeepAliveResponse (ws, execId, microserviceUuid) {
    try {
      const keepAliveResponse = {
        type: MESSAGE_TYPES.CONTROL,
        data: Buffer.from('keepalive'),
        microserviceUuid,
        execId,
        timestamp: Date.now()
      }
      const encoded = this.encodeMessage(keepAliveResponse)
      ws.send(encoded, {
        binary: true,
        compress: false,
        mask: false,
        fin: true
      })
    } catch (error) {
      logger.debug('[RELAY] Failed to send keepalive response', { error: error.message })
    }
  }

  // Helper method to check if auth is configured
  isAuthConfigured () {
    const requiredConfigs = [
      'auth.realm',
      'auth.realmKey',
      'auth.url',
      'auth.client.id',
      'auth.client.secret'
    ]
    return requiredConfigs.every(configKey => {
      const value = config.get(configKey)
      return value !== undefined && value !== null && value !== ''
    })
  }
}

module.exports = WebSocketServer
