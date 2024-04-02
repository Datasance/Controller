const session = require('express-session')
const Keycloak = require('keycloak-connect')

const keycloakConfig = {
  realm: process.env.KC_REALM,
  'realm-public-key': process.env.KC_REALM_KEY,
  'auth-server-url': `${process.env.KC_URL}`,
  'ssl-required': process.env.KC_SSL_REQ,
  resource: process.env.KC_CLIENT,
  'bearer-only': true,
  'verify-token-audience': true,
  credentials: {
    secret: process.env.KC_CLIENT_SECRET
  },
  'use-resource-role-mappings': true,
  'confidential-port': 0
}

let keycloak
let memoryStore

function initKeycloak () {
  if (keycloak) {
    return keycloak
  } else {
    memoryStore = new session.MemoryStore()
    keycloak = new Keycloak({ store: memoryStore }, keycloakConfig)
    return keycloak
  }
}

function getKeycloak () {
  if (keycloak) {
    return keycloak
  }
}

function getMemoryStore () {
  if (memoryStore) {
    return memoryStore
  }
}

module.exports = {
  initKeycloak,
  getMemoryStore,
  getKeycloak
}
