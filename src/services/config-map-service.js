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
const ConfigMapManager = require('../data/managers/config-map-manager')
const AppHelper = require('../helpers/app-helper')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const Validator = require('../schemas/index')
const VolumeMountService = require('./volume-mount-service')
const VolumeMountingManager = require('../data/managers/volume-mounting-manager')

async function createConfigMapEndpoint (configMapData, transaction) {
  const validation = await Validator.validate(configMapData, Validator.schemas.configMapCreate)
  if (!validation.valid) {
    throw new Errors.ValidationError(validation.error)
  }

  const existingConfigMap = await ConfigMapManager.findOne({ name: configMapData.name }, transaction)
  if (existingConfigMap) {
    throw new Errors.ConflictError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_ALREADY_EXISTS, configMapData.name))
  }

  const configMap = await ConfigMapManager.createConfigMap(configMapData.name, configMapData.immutable, configMapData.data, transaction)
  return {
    id: configMap.id,
    name: configMap.name,
    immutable: configMap.immutable,
    created_at: configMap.created_at,
    updated_at: configMap.updated_at
  }
}

async function updateConfigMapEndpoint (configMapName, configMapData, transaction) {
  const validation = await Validator.validate(configMapData, Validator.schemas.configMapUpdate)
  if (!validation.valid) {
    throw new Errors.ValidationError(validation.error)
  }

  const existingConfigMap = await ConfigMapManager.findOne({ name: configMapName }, transaction)
  if (!existingConfigMap) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_NOT_FOUND, configMapName))
  }

  if (existingConfigMap.immutable === true) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_IMMUTABLE, configMapName))
  }

  const configMap = await ConfigMapManager.updateConfigMap(configMapName, configMapData.immutable, configMapData.data, transaction)
  await _updateChangeTrackingForFogs(configMapName, transaction)
  return {
    id: configMap.id,
    name: configMap.name,
    created_at: configMap.created_at,
    updated_at: configMap.updated_at
  }
}

async function getConfigMapEndpoint (configMapName, transaction) {
  const configMap = await ConfigMapManager.getConfigMap(configMapName, transaction)
  if (!configMap) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_NOT_FOUND, configMapName))
  }

  return {
    id: configMap.id,
    name: configMap.name,
    data: configMap.data,
    immutable: configMap.immutable,
    created_at: configMap.created_at,
    updated_at: configMap.updated_at
  }
}

async function listConfigMapsEndpoint (transaction) {
  const configMaps = await ConfigMapManager.listConfigMaps(transaction)
  return {
    configMaps: configMaps.map(configMap => ({
      id: configMap.id,
      name: configMap.name,
      immutable: configMap.immutable,
      created_at: configMap.created_at,
      updated_at: configMap.updated_at
    }))
  }
}

async function deleteConfigMapEndpoint (configMapName, transaction) {
  const existingConfigMap = await ConfigMapManager.findOne({ name: configMapName }, transaction)
  if (!existingConfigMap) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_NOT_FOUND, configMapName))
  }

  await ConfigMapManager.deleteConfigMap(configMapName, transaction)
  return {}
}

async function _updateChangeTrackingForFogs (configMapName, transaction) {
  const configMapVolumeMounts = await VolumeMountingManager.findAll({ configMapName: configMapName }, transaction)
  if (configMapVolumeMounts.length > 0) {
    for (const configMapVolumeMount of configMapVolumeMounts) {
      const volumeMountObj = {
        name: configMapVolumeMount.name,
        configMapName: configMapName
      }
      await VolumeMountService.updateVolumeMountEndpoint(configMapVolumeMount.name, volumeMountObj, transaction)
    }
  }
}

module.exports = {
  createConfigMapEndpoint: TransactionDecorator.generateTransaction(createConfigMapEndpoint),
  updateConfigMapEndpoint: TransactionDecorator.generateTransaction(updateConfigMapEndpoint),
  getConfigMapEndpoint: TransactionDecorator.generateTransaction(getConfigMapEndpoint),
  listConfigMapsEndpoint: TransactionDecorator.generateTransaction(listConfigMapsEndpoint),
  deleteConfigMapEndpoint: TransactionDecorator.generateTransaction(deleteConfigMapEndpoint)
}
