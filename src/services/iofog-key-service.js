/*
 * *******************************************************************************
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

const crypto = require('crypto')
const AppHelper = require('../helpers/app-helper')
const FogPublicKeyManager = require('../data/managers/iofog-public-key-manager')
const FogUsedTokenManager = require('../data/managers/fog-used-token-manager')
const jose = require('jose')

/**
 * Generate Ed25519 key pair and return as JWK strings
 * @returns {Object} Object containing publicKey and privateKey as base64 encoded JWK strings
 */
const generateKeyPair = async function (transaction) {
  // Generate Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

  // Convert to JWK format
  const publicKeyJwk = publicKey.export({ format: 'jwk' })
  const privateKeyJwk = privateKey.export({ format: 'jwk' })

  // Convert JWK to base64 encoded single line strings
  const publicKeyBase64 = Buffer.from(JSON.stringify(publicKeyJwk)).toString('base64')
  const privateKeyBase64 = Buffer.from(JSON.stringify(privateKeyJwk)).toString('base64')

  return {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64
  }
}

/**
 * Store public key for a fog node
 * @param {string} fogUuid - UUID of the fog node
 * @param {string} publicKey - Public key as base64 encoded JWK string
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise} Promise resolving to the stored public key
 */
const storePublicKey = async function (fogUuid, publicKey, transaction) {
  // Encrypt the public key using the fog UUID as salt
  const encryptedPublicKey = AppHelper.encryptText(publicKey, fogUuid)

  // Store the encrypted public key
  return FogPublicKeyManager.updateOrCreate(fogUuid, encryptedPublicKey, transaction)
}

/**
 * Get public key for a fog node
 * @param {string} fogUuid - UUID of the fog node
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<string>} Promise resolving to the public key as base64 encoded JWK string
 */
const getPublicKey = async function (fogUuid, transaction) {
  // Get the encrypted public key
  const fogPublicKey = await FogPublicKeyManager.findByFogUuid(fogUuid, transaction)

  if (!fogPublicKey) {
    return null
  }

  // Decrypt the public key using the fog UUID as salt
  return AppHelper.decryptText(fogPublicKey.publicKey, fogUuid)
}

/**
 * Verify a JWT signed by a fog node
 * @param {string} token - JWT token
 * @param {string} fogUuid - UUID of the fog node
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Promise resolving to the verified JWT payload
 */
const verifyJWT = async function (token, fogUuid, transaction) {
  try {
    // Get the public key for the fog node
    const publicKeyBase64 = await getPublicKey(fogUuid, transaction)

    if (!publicKeyBase64) {
      throw new Error('Public key not found for fog node')
    }

    // Convert base64 JWK string to JWK object
    const publicKeyJwk = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString())

    // Convert JWK to crypto key
    const publicKey = crypto.createPublicKey({
      key: publicKeyJwk,
      format: 'jwk'
    })

    // Verify the JWT using jose
    const { payload } = await jose.jwtVerify(token, publicKey, {
      algorithms: ['EdDSA']
    })

    // Check if JTI is already used
    const isUsed = await FogUsedTokenManager.isJtiUsed(payload.jti, transaction)
    if (isUsed) {
      throw new Error('JWT already used')
    }

    // Store the JTI
    await FogUsedTokenManager.storeJti(payload.jti, fogUuid, payload.exp, transaction)

    return payload
  } catch (error) {
    throw new Error(`JWT verification failed: ${error.message}`)
  }
}

async function all (transaction) {
  return FogPublicKeyManager.findAll(null, transaction)
}

module.exports = {
  generateKeyPair,
  storePublicKey,
  getPublicKey,
  verifyJWT,
  all
}
