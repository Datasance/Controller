const { isSqliteBusyError } = require('./db-busy-retry')
const CODES = require('./agent-auth-error-codes')
const {
  AgentAuthenticationError,
  ServiceUnavailableError,
  TransactionTimeoutError,
  QueueBackpressureError
} = require('./errors')

function isVaultInfrastructureError (error) {
  if (!error || !error.message) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('vault') ||
    message.includes('failed to retrieve secret from vault') ||
    message.includes('failed to connect to hashicorp vault')
}

function isDatabaseInfrastructureError (error) {
  if (!error) {
    return false
  }
  if (error instanceof TransactionTimeoutError || error instanceof QueueBackpressureError) {
    return true
  }
  if (isSqliteBusyError(error)) {
    return true
  }
  const name = error.name || ''
  if (name.startsWith('Sequelize')) {
    return true
  }
  const message = error.message || ''
  return message.includes('SQLITE_') ||
    message.includes('ECONNREFUSED') ||
    message.includes('connection') ||
    message.includes('database')
}

function classifyVerifyJwtFailure (error) {
  const message = (error && error.message) || String(error)
  const errorName = (error && error.name) || ''

  if (message.includes('Public key not found')) {
    return new AgentAuthenticationError(CODES.AGENT_PUBLIC_KEY_NOT_FOUND, 'Agent public key not found')
  }
  if (message.includes('JWT already used') || message.includes('JWT token already used')) {
    return new AgentAuthenticationError(CODES.AGENT_JWT_ALREADY_USED, 'Agent JWT already used')
  }
  if (errorName === 'JWTExpired' || message.includes('"exp" claim timestamp check failed') || message.includes('expired')) {
    return new AgentAuthenticationError(CODES.AGENT_JWT_EXPIRED, 'Agent JWT expired')
  }
  if (errorName === 'JWSSignatureVerificationFailed' || message.includes('signature verification failed') || message.includes('invalid signature')) {
    return new AgentAuthenticationError(CODES.AGENT_JWT_SIGNATURE_INVALID, 'Agent JWT signature invalid')
  }
  if (errorName === 'JWTClaimValidationFailed' &&
      (message.includes('"nbf" claim timestamp check failed') || message.includes('"iat" claim timestamp check failed'))) {
    // The agent signs every request with nbf = iat = its own clock, and the
    // controller verifies with a 10 s tolerance, so this means the agent's
    // clock runs ahead of the controller's. Deliberately reported as a
    // retryable ServiceUnavailableError, not as a 401: an agent that gets
    // non-retryable auth failures deprovisions itself after 5 attempts over
    // 60 s (edgelet internal/fieldagent/status_auth_gate.go), which would
    // turn a few seconds of clock drift into a node that has to be
    // bootstrapped again. Retrying is right; only the diagnosis was missing.
    return new ServiceUnavailableError(
      CODES.CONTROLLER_AGENT_CLOCK_SKEW,
      `Agent clock is ahead of the controller: ${message}`
    )
  }
  if (isVaultInfrastructureError(error)) {
    return new ServiceUnavailableError(CODES.CONTROLLER_VAULT_UNAVAILABLE, 'Vault temporarily unavailable')
  }
  if (isDatabaseInfrastructureError(error)) {
    const code = isSqliteBusyError(error) ? CODES.CONTROLLER_DB_BUSY : CODES.CONTROLLER_DB_UNAVAILABLE
    return new ServiceUnavailableError(code, 'Database temporarily unavailable')
  }

  return new ServiceUnavailableError(
    CODES.CONTROLLER_AUTH_VERIFICATION_FAILED,
    'Agent authentication verification temporarily unavailable'
  )
}

function classifyCheckFogTokenFailure (error) {
  if (error instanceof AgentAuthenticationError || error instanceof ServiceUnavailableError) {
    return error
  }

  if (isDatabaseInfrastructureError(error)) {
    const code = isSqliteBusyError(error) ? CODES.CONTROLLER_DB_BUSY : CODES.CONTROLLER_DB_UNAVAILABLE
    return new ServiceUnavailableError(code, 'Database temporarily unavailable')
  }
  if (isVaultInfrastructureError(error)) {
    return new ServiceUnavailableError(CODES.CONTROLLER_VAULT_UNAVAILABLE, 'Vault temporarily unavailable')
  }

  return classifyVerifyJwtFailure(error)
}

module.exports = {
  classifyCheckFogTokenFailure,
  classifyVerifyJwtFailure,
  isDatabaseInfrastructureError,
  isVaultInfrastructureError
}
