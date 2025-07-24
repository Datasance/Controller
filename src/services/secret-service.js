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

const TransactionDecorator = require('../decorators/transaction-decorator')
const SecretManager = require('../data/managers/secret-manager')
const AppHelper = require('../helpers/app-helper')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const Validator = require('../schemas/index')
const VolumeMountService = require('./volume-mount-service')
const VolumeMountingManager = require('../data/managers/volume-mounting-manager')

function validateBase64 (value) {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8')
    const reencoded = Buffer.from(decoded).toString('base64')
    return reencoded === value
  } catch (error) {
    return false
  }
}

function validateSecretData (type, data) {
  if (type === 'tls') {
    const invalidKeys = Object.entries(data)
      .filter(([_, value]) => !validateBase64(value))
      .map(([key]) => key)

    if (invalidKeys.length > 0) {
      throw new Errors.ValidationError(
        `Invalid base64 encoding for keys: ${invalidKeys.join(', ')}`
      )
    }
  }
}

async function createSecretEndpoint (secretData, transaction) {
  const validation = await Validator.validate(secretData, Validator.schemas.secretCreate)
  if (!validation.valid) {
    throw new Errors.ValidationError(validation.error)
  }

  validateSecretData(secretData.type, secretData.data)

  const existingSecret = await SecretManager.findOne({ name: secretData.name }, transaction)
  if (existingSecret) {
    throw new Errors.ConflictError(AppHelper.formatMessage(ErrorMessages.SECRET_ALREADY_EXISTS, secretData.name))
  }

  const secret = await SecretManager.createSecret(secretData.name, secretData.type, secretData.data, transaction)
  return {
    id: secret.id,
    name: secret.name,
    type: secret.type,
    created_at: secret.created_at,
    updated_at: secret.updated_at
  }
}

async function updateSecretEndpoint (secretName, secretData, transaction) {
  const validation = await Validator.validate(secretData, Validator.schemas.secretUpdate)
  if (!validation.valid) {
    throw new Errors.ValidationError(validation.error)
  }

  const existingSecret = await SecretManager.findOne({ name: secretName }, transaction)
  if (!existingSecret) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SECRET_NOT_FOUND, secretName))
  }

  validateSecretData(existingSecret.type, secretData.data)

  const secret = await SecretManager.updateSecret(secretName, secretData.data, transaction)
  await _updateChangeTrackingForFogs(secretName, transaction)
  return {
    id: secret.id,
    name: secret.name,
    type: secret.type,
    created_at: secret.created_at,
    updated_at: secret.updated_at
  }
}

async function getSecretEndpoint (secretName, transaction) {
  const secret = await SecretManager.getSecret(secretName, transaction)
  if (!secret) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SECRET_NOT_FOUND, secretName))
  }

  return {
    id: secret.id,
    name: secret.name,
    type: secret.type,
    data: secret.data,
    created_at: secret.created_at,
    updated_at: secret.updated_at
  }
}

async function listSecretsEndpoint (transaction) {
  const secrets = await SecretManager.listSecrets(transaction)
  return {
    secrets: secrets.map(secret => ({
      id: secret.id,
      name: secret.name,
      type: secret.type,
      created_at: secret.created_at,
      updated_at: secret.updated_at
    }))
  }
}

async function deleteSecretEndpoint (secretName, transaction) {
  const existingSecret = await SecretManager.findOne({ name: secretName }, transaction)
  if (!existingSecret) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SECRET_NOT_FOUND, secretName))
  }

  await SecretManager.deleteSecret(secretName, transaction)
  return {}
}

async function _updateChangeTrackingForFogs (secretName, transaction) {
  const secretVolumeMounts = await VolumeMountingManager.findAll({ secretName: secretName }, transaction)
  if (secretVolumeMounts.length > 0) {
    for (const secretVolumeMount of secretVolumeMounts) {
      const volumeMountObj = {
        name: secretVolumeMount.name,
        secretName: secretName
      }
      await VolumeMountService.updateVolumeMountEndpoint(secretVolumeMount.name, volumeMountObj, transaction)
    }
  }
}

module.exports = {
  createSecretEndpoint: TransactionDecorator.generateTransaction(createSecretEndpoint),
  updateSecretEndpoint: TransactionDecorator.generateTransaction(updateSecretEndpoint),
  getSecretEndpoint: TransactionDecorator.generateTransaction(getSecretEndpoint),
  listSecretsEndpoint: TransactionDecorator.generateTransaction(listSecretsEndpoint),
  deleteSecretEndpoint: TransactionDecorator.generateTransaction(deleteSecretEndpoint)
}
