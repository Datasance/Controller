/*
 *  *******************************************************************************
 *  * Copyright (c) 2023 Datasance Teknoloji A.S.
 *  *
 *  * This program and the accompanying materials are made available under the
 *  * terms of the Eclipse Public License v. 2.0 which is available at
 *  * http://www.eclipse.org/legal/epl-2.0
 *  *
 *  * SPDX-License-Identifier: EPL-2.0
 *  *******************************************************************************
 *
 */

const AppHelper = require('../helpers/app-helper')
const CatalogService = require('../services/catalog-service')
const ChangeTrackingService = require('../services/change-tracking-service')
const Constants = require('../helpers/constants')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const MicroserviceManager = require('../data/managers/microservice-manager')
const MicroserviceCapAddManager = require('../data/managers/microservice-cap-add-manager')
const MicroserviceStatusManager = require('../data/managers/microservice-status-manager')
const MicroserviceExecStatusManager = require('../data/managers/microservice-exec-status-manager')
const ApplicationManager = require('../data/managers/application-manager')
const MicroservicePortManager = require('../data/managers/microservice-port-manager')
const RouterConnectionManager = require('../data/managers/router-connection-manager')
const RouterManager = require('../data/managers/router-manager')
const TransactionDecorator = require('../decorators/transaction-decorator')
const Validator = require('../schemas')
const ldifferenceWith = require('lodash/differenceWith')
const constants = require('../helpers/constants')
const MicroserviceEnvManager = require('../data/managers/microservice-env-manager')
const SecretManager = require('../data/managers/secret-manager')

const SITE_CONFIG_VERSION = 'pot'
const SITE_CONFIG_NAMESPACE = 'datasance'

async function validateAndReturnUpstreamRouters (upstreamRouterIds, isSystemFog, defaultRouter, transaction) {
  if (!upstreamRouterIds) {
    if (!defaultRouter) {
      // System fog will be created without default router already existing
      if (isSystemFog) { return [] }
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, Constants.DEFAULT_ROUTER_NAME))
    }
    return [defaultRouter]
  }

  const upstreamRouters = []
  for (const upstreamRouterId of upstreamRouterIds) {
    const upstreamRouter = upstreamRouterId === Constants.DEFAULT_ROUTER_NAME ? defaultRouter : await RouterManager.findOne({ iofogUuid: upstreamRouterId }, transaction)
    if (!upstreamRouter) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, upstreamRouterId))
    }
    if (upstreamRouter.isEdge) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_UPSTREAM_ROUTER, upstreamRouterId))
    }

    upstreamRouters.push(upstreamRouter)
  }
  return upstreamRouters
}

async function createRouterForFog (fogData, uuid, upstreamRouters, transaction) {
  const isEdge = fogData.routerMode === 'edge'
  const messagingPort = fogData.messagingPort || 5671
  // Is default router if we are on a system fog and no other default router already exists
  const isDefault = (fogData.isSystem) ? !(await RouterManager.findOne({ isDefault: true }, transaction)) : false
  const routerData = {
    isEdge,
    messagingPort: messagingPort,
    host: fogData.host,
    edgeRouterPort: !isEdge ? fogData.edgeRouterPort : null,
    interRouterPort: !isEdge ? fogData.interRouterPort : null,
    isDefault: isDefault,
    iofogUuid: uuid
  }

  const router = await RouterManager.create(routerData, transaction)

  const microserviceConfig = await _getRouterMicroserviceConfig(isEdge, uuid, messagingPort, router.interRouterPort, router.edgeRouterPort, fogData.containerEngine, transaction)

  for (const upstreamRouter of upstreamRouters) {
    await RouterConnectionManager.create({ sourceRouter: router.id, destRouter: upstreamRouter.id }, transaction)
    const connectorConfig = _getRouterConnectorConfig(isEdge, upstreamRouter, uuid)
    microserviceConfig.connectors[connectorConfig.name] = connectorConfig
  }

  const routerMicroservice = await _createRouterMicroservice(isEdge, uuid, microserviceConfig, transaction)
  await _createRouterPorts(routerMicroservice.uuid, messagingPort, transaction)
  if (!isEdge) {
    await _createRouterPorts(routerMicroservice.uuid, fogData.edgeRouterPort, transaction)
    await _createRouterPorts(routerMicroservice.uuid, fogData.interRouterPort, transaction)
  }

  return router
}

async function updateRouter (oldRouter, newRouterData, upstreamRouters, containerEngine, transaction) {
  const routerCatalog = await CatalogService.getRouterCatalogItem(transaction)
  const routerMicroservice = await MicroserviceManager.findOne({
    catalogItemId: routerCatalog.id,
    iofogUuid: oldRouter.iofogUuid
  }, transaction)

  if (newRouterData.isEdge && !oldRouter.isEdge) {
    // Moving from internal to edge mode
    // If there are downstream routers, return error
    const downstreamRouterConnections = await RouterConnectionManager.findAll({ destRouter: oldRouter.id }, transaction)
    if (downstreamRouterConnections && downstreamRouterConnections.length) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.EDGE_ROUTER_HAS_DOWNSTREAM, oldRouter.id))
    }
    // Removing any possible connecting port
    newRouterData.edgeRouterPort = null
    newRouterData.interRouterPort = null
    await _deleteRouterPorts(routerMicroservice.uuid, oldRouter.edgeRouterPort, transaction)
    await _deleteRouterPorts(routerMicroservice.uuid, oldRouter.interRouterPort, transaction)
  } else if (!newRouterData.isEdge && oldRouter.isEdge) {
    // Moving from edge to internal
    // Nothing specific to update
    await _createRouterPorts(routerMicroservice.uuid, newRouterData.edgeRouterPort, transaction)
    await _createRouterPorts(routerMicroservice.uuid, newRouterData.interRouterPort, transaction)
  }
  newRouterData.messagingPort = newRouterData.messagingPort || 5671
  await RouterManager.update({ id: oldRouter.id }, newRouterData, transaction)

  // Update upstream routers
  const upstreamConnections = await RouterConnectionManager.findAllWithRouters({ sourceRouter: oldRouter.id }, transaction)
  const upstreamToDelete = ldifferenceWith(upstreamConnections, upstreamRouters, (connection, router) => connection.destRouter === router.id)
  for (const connectionToDelete of upstreamToDelete) {
    await RouterConnectionManager.delete({ id: connectionToDelete.id }, transaction)
  }
  const upstreamToCreate = ldifferenceWith(upstreamRouters, upstreamConnections, (router, connection) => connection.destRouter === router.id)
  await RouterConnectionManager.bulkCreate(upstreamToCreate.map(router => ({ sourceRouter: oldRouter.id, destRouter: router.id })), transaction)

  // Update proxy microservice (If port or host changed)
  // const proxyCatalog = await CatalogService.getProxyCatalogItem(transaction)
  // const existingProxy = await MicroserviceManager.findOne({ iofogUuid: oldRouter.iofogUuid, catalogItemId: proxyCatalog.id }, transaction)
  // if (existingProxy) {
  //   const config = JSON.parse(existingProxy.config || '{}')
  //   config.networkRouter = {
  //     host: newRouterData.host || oldRouter.host,
  //     port: newRouterData.messagingPort
  //   }
  //   await MicroserviceManager.updateIfChanged({ uuid: existingProxy.uuid }, { config: JSON.stringify(config) }, transaction)
  // }

  // Update config if needed
  await updateConfig(oldRouter.id, containerEngine, transaction)
  await ChangeTrackingService.update(oldRouter.iofogUuid, ChangeTrackingService.events.routerChanged, transaction)
  await ChangeTrackingService.update(oldRouter.iofogUuid, ChangeTrackingService.events.microserviceList, transaction)
  await ChangeTrackingService.update(oldRouter.iofogUuid, ChangeTrackingService.events.microserviceConfig, transaction)

  return {
    host: 'localhost',
    messagingPort: newRouterData.messagingPort
  }
}

async function _deleteRouterPorts (routerMicroserviceUuid, port, transaction) {
  if (!routerMicroserviceUuid) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER))
  }
  await MicroservicePortManager.delete({ microserviceUuid: routerMicroserviceUuid, portInternal: port }, transaction)
}

async function _updateRouterPorts (routerMicroserviceUuid, router, transaction) {
  await MicroservicePortManager.delete({ microserviceUuid: routerMicroserviceUuid }, transaction)
  await _createRouterPorts(routerMicroserviceUuid, router.messagingPort, transaction)
  if (!router.isEdge) {
    await _createRouterPorts(routerMicroserviceUuid, router.edgeRouterPort, transaction)
    await _createRouterPorts(routerMicroserviceUuid, router.interRouterPort, transaction)
  }
}

async function updateConfig (routerID, containerEngine, transaction) {
  const router = await RouterManager.findOne({ id: routerID }, transaction)
  if (!router) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, routerID))
  }

  // Get current configuration
  const routerCatalog = await CatalogService.getRouterCatalogItem(transaction)
  const routerMicroservice = await MicroserviceManager.findOne({
    catalogItemId: routerCatalog.id,
    iofogUuid: router.iofogUuid
  }, transaction)

  if (!routerMicroservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, router.id))
  }

  const currentConfig = JSON.parse(routerMicroservice.config || '{}')

  // Generate new configuration
  const newConfig = await _getRouterMicroserviceConfig(
    router.isEdge,
    router.iofogUuid,
    router.messagingPort,
    router.interRouterPort,
    router.edgeRouterPort,
    containerEngine,
    transaction
  )

  // Add connectors for upstream routers
  const upstreamRoutersConnections = await RouterConnectionManager.findAllWithRouters(
    { sourceRouter: router.id },
    transaction
  )

  for (const upstreamRouterConnection of upstreamRoutersConnections) {
    const connectorConfig = _getRouterConnectorConfig(
      router.isEdge,
      upstreamRouterConnection.dest,
      router.iofogUuid
    )
    newConfig.connectors[connectorConfig.name] = connectorConfig
  }

  // Check if configuration needs update
  if (JSON.stringify(currentConfig) !== JSON.stringify(newConfig)) {
    await MicroserviceManager.update(
      { uuid: routerMicroservice.uuid },
      { config: JSON.stringify(newConfig) },
      transaction
    )

    // Check if listeners changed
    if (_listenersChanged(currentConfig.listeners, newConfig.listeners)) {
      await _updateRouterPorts(routerMicroservice.uuid, router, transaction)
      await MicroserviceManager.update(
        { uuid: routerMicroservice.uuid },
        { rebuild: true },
        transaction
      )
      await ChangeTrackingService.update(
        router.iofogUuid,
        ChangeTrackingService.events.microserviceList,
        transaction
      )
    } else {
      // await MicroserviceManager.update(
      //   { uuid: routerMicroservice.uuid },
      //   { rebuild: true },
      //   transaction
      // )
      await ChangeTrackingService.update(
        router.iofogUuid,
        ChangeTrackingService.events.microserviceConfig,
        transaction
      )
    }
  }
}

function _listenersChanged (currentListeners, newListeners) {
  if (!currentListeners || !newListeners) {
    return true
  }

  // Convert to arrays if they're objects
  const currentArray = Object.values(currentListeners)
  const newArray = Object.values(newListeners)

  if (currentArray.length !== newArray.length) {
    return true
  }

  // Compare only port property
  for (const currentListener of currentArray) {
    const matchingListener = newArray.find(l => l.port === currentListener.port)
    if (!matchingListener) {
      return true
    }
  }

  return false
}

function _createRouterPorts (routerMicroserviceUuid, port, transaction) {
  // Skip port mapping for default AMQP listener (5672)
  if (port === 5672) {
    return Promise.resolve()
  }

  const mappingData = {
    // isPublic: false,
    portInternal: port,
    portExternal: port,
    microserviceUuid: routerMicroserviceUuid
  }

  return MicroservicePortManager.create(mappingData, transaction)
}

async function _createRouterMicroservice (isEdge, uuid, microserviceConfig, transaction) {
  const routerCatalog = await CatalogService.getRouterCatalogItem(transaction)

  const routerApplicationData = {
    name: `system-${uuid.toLowerCase()}`,
    isActivated: true,
    isSystem: true
  }
  const routerMicroserviceData = {
    uuid: AppHelper.generateUUID(),
    name: `router-${uuid.toLowerCase()}`,
    config: JSON.stringify(microserviceConfig),
    catalogItemId: routerCatalog.id,
    iofogUuid: uuid,
    rootHostAccess: false,
    logSize: constants.MICROSERVICE_DEFAULT_LOG_SIZE,
    schedule: 0,
    configLastUpdated: Date.now(),
    env: [
      {
        key: 'QDROUTERD_CONF',
        value: '/home/runner/skupper-router-certs/skrouterd.json'
      },
      {
        key: 'QDROUTERD_CONF_TYPE',
        value: 'json'
      },
      {
        key: 'SKUPPER_SITE_ID',
        value: uuid
      }
    ]
  }

  const capAddValues = [
    { capAdd: 'NET_RAW' }
  ]
  let application = await ApplicationManager.findOne({ name: routerApplicationData.name }, transaction)
  if (!application) {
    application = await ApplicationManager.create(routerApplicationData, transaction)
  }
  routerMicroserviceData.applicationId = application.id
  const routerMicroservice = await MicroserviceManager.create(routerMicroserviceData, transaction)
  await MicroserviceStatusManager.create({ microserviceUuid: routerMicroserviceData.uuid }, transaction)
  await MicroserviceExecStatusManager.create({ microserviceUuid: routerMicroserviceData.uuid }, transaction)
  for (const capAdd of capAddValues) {
    await MicroserviceCapAddManager.create({
      microserviceUuid: routerMicroserviceData.uuid,
      capAdd: capAdd.capAdd
    }, transaction)
  }

  // Create environment variables
  for (const env of routerMicroserviceData.env) {
    await MicroserviceEnvManager.create({
      microserviceUuid: routerMicroserviceData.uuid,
      key: env.key,
      value: env.value
    }, transaction)
  }

  return routerMicroservice
}

function _getRouterConnectorConfig (isEdge, dest, uuid) {
  const config = {
    name: dest.iofogUuid || Constants.DEFAULT_ROUTER_NAME,
    role: isEdge ? 'edge' : 'inter-router',
    host: dest.host,
    port: (isEdge ? dest.edgeRouterPort : dest.interRouterPort).toString(),
    sslProfile: `${uuid}-site-server`
  }

  return config
}

async function _getRouterMicroserviceConfig (isEdge, uuid, messagingPort, interRouterPort, edgeRouterPort, containerEngine, transaction) {
  let platform = 'docker'
  if (containerEngine === 'podman') {
    platform = 'podman'
  }

  let namespace = SITE_CONFIG_NAMESPACE
  if (process.env.CONTROLLER_NAMESPACE) {
    namespace = process.env.CONTROLLER_NAMESPACE
  }
  const config = {
    addresses: {
      mc: {
        prefix: 'mc',
        distribution: 'multicast'
      }
    },
    bridges: {
      tcpConnectors: {},
      tcpListeners: {}
    },
    connectors: {},
    listeners: {},
    logConfig: {
      ROUTER_CORE: {
        enable: 'error+',
        module: 'ROUTER_CORE'
      }
    },
    metadata: {
      helloMaxAgeSeconds: '3',
      id: uuid,
      mode: isEdge ? 'edge' : 'interior'
    },
    siteConfig: {
      name: uuid,
      namespace: namespace,
      platform: platform,
      version: SITE_CONFIG_VERSION
    },
    sslProfiles: {}
  }

  // Get SSL secrets for all profiles
  const siteServerSecret = await SecretManager.getSecret(`${uuid}-site-server`, transaction)
  const localServerSecret = await SecretManager.getSecret(`${uuid}-local-server`, transaction)
  const localAgentSecret = await SecretManager.getSecret(`${uuid}-local-agent`, transaction)

  // Add SSL profiles
  if (siteServerSecret) {
    config.sslProfiles[`${uuid}-site-server`] = {
      CaCert: siteServerSecret.data['ca.crt'],
      TlsCert: siteServerSecret.data['tls.crt'],
      TlsKey: siteServerSecret.data['tls.key'],
      name: `${uuid}-site-server`
    }
  }

  if (localServerSecret) {
    config.sslProfiles[`${uuid}-local-server`] = {
      CaCert: localServerSecret.data['ca.crt'],
      TlsCert: localServerSecret.data['tls.crt'],
      TlsKey: localServerSecret.data['tls.key'],
      name: `${uuid}-local-server`
    }
  }

  if (localAgentSecret) {
    config.sslProfiles[`${uuid}-local-agent`] = {
      CaCert: localAgentSecret.data['ca.crt'],
      TlsCert: localAgentSecret.data['tls.crt'],
      TlsKey: localAgentSecret.data['tls.key'],
      name: `${uuid}-local-agent`
    }
  }

  // Add default AMQP listener (internal)
  config.listeners[`${uuid}-amqp`] = {
    host: '0.0.0.0',
    name: `${uuid}-amqp`,
    port: 5672,
    role: 'normal'
  }

  // Add AMQPS listener
  const amqpsListener = {
    host: '0.0.0.0',
    name: `${uuid}-amqps`,
    port: messagingPort,
    role: 'normal',
    authenticatePeer: true,
    saslMechanisms: 'EXTERNAL',
    sslProfile: `${uuid}-local-server`
  }
  config.listeners[`${uuid}-amqps`] = amqpsListener

  if (!isEdge) {
    // Add inter-router listener
    const interRouterListener = {
      host: '0.0.0.0',
      name: `${uuid}-inter-router`,
      port: interRouterPort,
      role: 'inter-router',
      authenticatePeer: true,
      saslMechanisms: 'EXTERNAL',
      sslProfile: `${uuid}-site-server`
    }
    config.listeners[`${uuid}-inter-router`] = interRouterListener

    // Add edge listener
    const edgeListener = {
      host: '0.0.0.0',
      name: `${uuid}-edge`,
      port: edgeRouterPort,
      role: 'edge',
      authenticatePeer: true,
      saslMechanisms: 'EXTERNAL',
      sslProfile: `${uuid}-site-server`
    }
    config.listeners[`${uuid}-edge`] = edgeListener
  }

  return config
}

async function getNetworkRouter (networkRouterId, transaction) {
  const query = {}
  if (!networkRouterId) {
    query.isDefault = true
  } else {
    query.iofogUuid = networkRouterId
  }
  return RouterManager.findOne(query, transaction)
}

async function getDefaultRouter (transaction) {
  const defaultRouter = await getNetworkRouter(null, transaction)
  if (!defaultRouter) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, Constants.DEFAULT_ROUTER_NAME))
  }

  return {
    host: defaultRouter.host,
    messagingPort: defaultRouter.messagingPort,
    edgeRouterPort: defaultRouter.edgeRouterPort,
    interRouterPort: defaultRouter.interRouterPort
  }
}

async function upsertDefaultRouter (routerData, transaction) {
  await Validator.validate(routerData, Validator.schemas.defaultRouterCreate)

  const createRouterData = {
    isEdge: false,
    messagingPort: routerData.messagingPort || 5671,
    host: routerData.host,
    edgeRouterPort: routerData.edgeRouterPort || 45671,
    interRouterPort: routerData.interRouterPort || 55671,
    isDefault: true
  }

  return RouterManager.updateOrCreate({ isDefault: true }, createRouterData, transaction)
}

async function findOne (option, transaction) {
  return RouterManager.findOne(option, transaction)
}

module.exports = {
  createRouterForFog: TransactionDecorator.generateTransaction(createRouterForFog),
  updateConfig: TransactionDecorator.generateTransaction(updateConfig),
  updateRouter: TransactionDecorator.generateTransaction(updateRouter),
  getDefaultRouter: TransactionDecorator.generateTransaction(getDefaultRouter),
  getNetworkRouter: TransactionDecorator.generateTransaction(getNetworkRouter),
  upsertDefaultRouter: TransactionDecorator.generateTransaction(upsertDefaultRouter),
  validateAndReturnUpstreamRouters: TransactionDecorator.generateTransaction(validateAndReturnUpstreamRouters),
  findOne: TransactionDecorator.generateTransaction(findOne)
}
