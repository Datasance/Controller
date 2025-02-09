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
const AppHelper = require('../helpers/app-helper')
const FogManager = require('../data/managers/iofog-manager')
const FogProvisionKeyManager = require('../data/managers/iofog-provision-key-manager')
const FogVersionCommandManager = require('../data/managers/iofog-version-command-manager')
const ChangeTrackingService = require('./change-tracking-service')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const Validator = require('../schemas')
const HWInfoManager = require('../data/managers/hw-info-manager')
const USBInfoManager = require('../data/managers/usb-info-manager')
const CatalogService = require('./catalog-service')
const MicroserviceManager = require('../data/managers/microservice-manager')
const ApplicationManager = require('../data/managers/application-manager')
const TagsManager = require('../data/managers/tags-manager')
const MicroserviceService = require('./microservices-service')
const EdgeResourceService = require('./edge-resource-service')
const RouterManager = require('../data/managers/router-manager')
const MicroserviceExtraHostManager = require('../data/managers/microservice-extra-host-manager')
const MicroserviceStatusManager = require('../data/managers/microservice-status-manager')
const RouterConnectionManager = require('../data/managers/router-connection-manager')
const RouterService = require('./router-service')
const Constants = require('../helpers/constants')
const Op = require('sequelize').Op
const lget = require('lodash/get')

async function createFogEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogCreate)

  let createFogData = {
    uuid: AppHelper.generateRandomString(32),
    name: fogData.name,
    location: fogData.location,
    latitude: fogData.latitude,
    longitude: fogData.longitude,
    gpsMode: fogData.latitude || fogData.longitude ? 'manual' : undefined,
    description: fogData.description,
    networkInterface: fogData.networkInterface,
    dockerUrl: fogData.dockerUrl,
    diskLimit: fogData.diskLimit,
    diskDirectory: fogData.diskDirectory,
    memoryLimit: fogData.memoryLimit,
    cpuLimit: fogData.cpuLimit,
    logLimit: fogData.logLimit,
    logDirectory: fogData.logDirectory,
    logFileCount: fogData.logFileCount,
    statusFrequency: fogData.statusFrequency,
    changeFrequency: fogData.changeFrequency,
    deviceScanFrequency: fogData.deviceScanFrequency,
    bluetoothEnabled: fogData.bluetoothEnabled,
    watchdogEnabled: fogData.watchdogEnabled,
    abstractedHardwareEnabled: fogData.abstractedHardwareEnabled,
    fogTypeId: fogData.fogType,
    logLevel: fogData.logLevel,
    dockerPruningFrequency: fogData.dockerPruningFrequency,
    availableDiskThreshold: fogData.availableDiskThreshold,
    isSystem: fogData.isSystem,
    host: fogData.host,
    routerId: null,
    timeZone: fogData.timeZone
  }
  createFogData = AppHelper.deleteUndefinedFields(createFogData)

  // Default router is edge
  fogData.routerMode = fogData.routerMode || 'edge'

  if (fogData.isSystem && fogData.routerMode !== 'interior') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER_MODE, fogData.routerMode))
  }

  if (fogData.isSystem && !!(await FogManager.findOne({ isSystem: true }, transaction))) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.DUPLICATE_SYSTEM_FOG))
  }

  const existingFog = await FogManager.findOne({ name: createFogData.name }, transaction)
  if (existingFog) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.DUPLICATE_NAME, createFogData.name))
  }

  let defaultRouter, upstreamRouters
  if (fogData.routerMode === 'none') {
    const networkRouter = await RouterService.getNetworkRouter(fogData.networkRouter)
    if (!networkRouter) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, !fogData.networkRouter ? Constants.DEFAULT_ROUTER_NAME : fogData.networkRouter))
    }
    createFogData.routerId = networkRouter.id
  } else {
    defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)
    upstreamRouters = await RouterService.validateAndReturnUpstreamRouters(fogData.upstreamRouters, fogData.isSystem, defaultRouter)
  }

  const fog = await FogManager.create(createFogData, transaction)

  // Set tags
  await _setTags(fog, fogData.tags, transaction)

  if (fogData.routerMode !== 'none') {
    if (!fogData.host && !isCLI) {
      throw new Errors.ValidationError(ErrorMessages.HOST_IS_REQUIRED)
    }

    await RouterService.createRouterForFog(fogData, fog.uuid, upstreamRouters)
  }

  const res = {
    uuid: fog.uuid
  }

  await ChangeTrackingService.create(fog.uuid, transaction)

  if (fogData.abstractedHardwareEnabled) {
    await _createHalMicroserviceForFog(fog, null, transaction)
  }

  if (fogData.bluetoothEnabled) {
    await _createBluetoothMicroserviceForFog(fog, null, transaction)
  }

  await ChangeTrackingService.update(createFogData.uuid, ChangeTrackingService.events.microserviceCommon, transaction)

  return res
}

async function _setTags (fogModel, tagsArray, transaction) {
  if (tagsArray) {
    let tags = []
    for (const tag of tagsArray) {
      let tagModel = await TagsManager.findOne({ value: tag }, transaction)
      if (!tagModel) {
        tagModel = await TagsManager.create({ value: tag }, transaction)
      }
      tags.push(tagModel)
    }
    await fogModel.setTags(tags)
  }
}

async function updateFogEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogUpdate)

  const queryFogData = { uuid: fogData.uuid }

  let updateFogData = {
    name: fogData.name,
    location: fogData.location,
    latitude: fogData.latitude,
    longitude: fogData.longitude,
    gpsMode: fogData.latitude || fogData.longitude ? 'manual' : undefined,
    description: fogData.description,
    networkInterface: fogData.networkInterface,
    dockerUrl: fogData.dockerUrl,
    diskLimit: fogData.diskLimit,
    diskDirectory: fogData.diskDirectory,
    memoryLimit: fogData.memoryLimit,
    cpuLimit: fogData.cpuLimit,
    logLimit: fogData.logLimit,
    logDirectory: fogData.logDirectory,
    logFileCount: fogData.logFileCount,
    statusFrequency: fogData.statusFrequency,
    changeFrequency: fogData.changeFrequency,
    deviceScanFrequency: fogData.deviceScanFrequency,
    bluetoothEnabled: fogData.bluetoothEnabled,
    watchdogEnabled: fogData.watchdogEnabled,
    isSystem: fogData.isSystem,
    abstractedHardwareEnabled: fogData.abstractedHardwareEnabled,
    fogTypeId: fogData.fogType,
    logLevel: fogData.logLevel,
    dockerPruningFrequency: fogData.dockerPruningFrequency,
    host: fogData.host,
    availableDiskThreshold: fogData.availableDiskThreshold,
    timeZone: fogData.timeZone
  }
  updateFogData = AppHelper.deleteUndefinedFields(updateFogData)

  const oldFog = await FogManager.findOne(queryFogData, transaction)
  if (!oldFog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  // Update tags
  await _setTags(oldFog, fogData.tags, transaction)

  if (updateFogData.name) {
    const conflictQuery = isCLI
      ? { name: updateFogData.name, uuid: { [Op.not]: fogData.uuid } }
      : { name: updateFogData.name, uuid: { [Op.not]: fogData.uuid } }
    const conflict = await FogManager.findOne(conflictQuery, transaction)
    if (conflict) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.DUPLICATE_NAME, updateFogData.name))
    }
  }

  // Update router
  // Get all router config informations
  const router = await oldFog.getRouter()
  const host = fogData.host || lget(router, 'host')
  const upstreamRoutersConnections = router ? (await RouterConnectionManager.findAllWithRouters({ sourceRouter: router.id }, transaction) || []) : []
  const upstreamRoutersIofogUuid = fogData.upstreamRouters || await Promise.all(upstreamRoutersConnections.map(connection => connection.dest.iofogUuid))
  const routerMode = fogData.routerMode || (router ? (router.isEdge ? 'edge' : 'interior') : 'none')
  const messagingPort = fogData.messagingPort || (router ? router.messagingPort : null)
  const interRouterPort = fogData.interRouterPort || (router ? router.interRouterPort : null)
  const edgeRouterPort = fogData.edgeRouterPort || (router ? router.edgeRouterPort : null)
  const requireSsl = fogData.requireSsl || (router ? router.requireSsl : null)
  const sslProfile = fogData.sslProfile || (router ? router.sslProfile : null)
  const saslMechanisms = fogData.saslMechanisms || (router ? router.saslMechanisms : null)
  const authenticatePeer = fogData.authenticatePeer || (router ? router.authenticatePeer : null)
  const caCert = fogData.caCert || (router ? router.caCert : null)
  const tlsCert = fogData.tlsCert || (router ? router.tlsCert : null)
  const tlsKey = fogData.tlsKey || (router ? router.tlsKey : null)
  let networkRouter

  // const isSystem = updateFogData.isSystem === undefined ? oldFog.isSystem : updateFogData.isSystem
  // if (isSystem && routerMode !== 'interior') {
  //   throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER_MODE, fogData.routerMode))
  // }

  if (routerMode === 'none') {
    networkRouter = await RouterService.getNetworkRouter(fogData.networkRouter)
    if (!networkRouter) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, !fogData.networkRouter ? Constants.DEFAULT_ROUTER_NAME : fogData.networkRouter))
    }
    // Only delete previous router if there is a network router
    if (router) {
      // New router mode is none, delete existing router
      await _deleteFogRouter(fogData, transaction)
    }
  } else {
    const defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)
    const upstreamRouters = await RouterService.validateAndReturnUpstreamRouters(upstreamRoutersIofogUuid, oldFog.isSystem, defaultRouter)
    if (!router) {
      // Router does not exist yet
      networkRouter = await RouterService.createRouterForFog(fogData, oldFog.uuid, upstreamRouters)
    } else {
      // Update existing router
      networkRouter = await RouterService.updateRouter(router, {
        messagingPort, interRouterPort, edgeRouterPort, isEdge: routerMode === 'edge', host, requireSsl, sslProfile, saslMechanisms, authenticatePeer, caCert, tlsCert, tlsKey
      }, upstreamRouters)
      await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.routerChanged, transaction)
    }
  }
  updateFogData.routerId = networkRouter.id

  // If router changed, set routerChanged flag
  if (updateFogData.routerId !== oldFog.routerId || updateFogData.routerMode !== oldFog.routerMode) {
    await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.routerChanged, transaction)
    await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.microserviceList, transaction)
  }

  await FogManager.update(queryFogData, updateFogData, transaction)
  await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.config, transaction)

  let msChanged = false

  // Update Microservice extra hosts
  if (updateFogData.host && updateFogData.host !== oldFog.host) {
    await _updateMicroserviceExtraHosts(fogData.uuid, updateFogData.host, transaction)
  }

  if (oldFog.abstractedHardwareEnabled === true && fogData.abstractedHardwareEnabled === false) {
    await _deleteHalMicroserviceByFog(fogData, transaction)
    msChanged = true
  }
  if (oldFog.abstractedHardwareEnabled === false && fogData.abstractedHardwareEnabled === true) {
    await _createHalMicroserviceForFog(fogData, oldFog, transaction)
    msChanged = true
  }

  if (oldFog.bluetoothEnabled === true && fogData.bluetoothEnabled === false) {
    await _deleteBluetoothMicroserviceByFog(fogData, transaction)
    msChanged = true
  }
  if (oldFog.bluetoothEnabled === false && fogData.bluetoothEnabled === true) {
    await _createBluetoothMicroserviceForFog(fogData, oldFog, transaction)
    msChanged = true
  }

  if (msChanged) {
    await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.microserviceCommon, transaction)
  }
}

async function _updateMicroserviceExtraHosts (fogUuid, host, transaction) {
  const microserviceExtraHosts = await MicroserviceExtraHostManager.findAll({ targetFogUuid: fogUuid }, transaction)
  for (const extraHost of microserviceExtraHosts) {
    extraHost.value = host
    await extraHost.save()
    // Update tracking change for microservice
    await MicroserviceExtraHostManager.updateOriginMicroserviceChangeTracking(extraHost, transaction)
  }
}

async function _updateProxyRouters (fogId, router, transaction) {
  const proxyCatalog = await CatalogService.getProxyCatalogItem(transaction)
  const proxyMicroservices = await MicroserviceManager.findAll({ catalogItemId: proxyCatalog.id, iofogUuid: fogId }, transaction)
  for (const proxyMicroservice of proxyMicroservices) {
    const config = JSON.parse(proxyMicroservice.config || '{}')
    config.networkRouter = {
      host: router.host,
      port: router.messagingPort
    }
    await MicroserviceManager.updateIfChanged({ uuid: proxyMicroservice.uuid }, { config: JSON.stringify(config) }, transaction)
    await ChangeTrackingService.update(fogId, ChangeTrackingService.events.microserviceConfig, transaction)
  }
}

async function _deleteFogRouter (fogData, transaction) {
  const router = await RouterManager.findOne({ iofogUuid: fogData.uuid }, transaction)
  const defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)

  // If agent had a router, delete router and update linked routers
  if (!router) {
    // Router mode is none, there is nothing to do
    return
  }

  const routerId = router.id
  const routerConnections = await RouterConnectionManager.findAllWithRouters({ [Op.or]: [{ destRouter: routerId }, { sourceRouter: routerId }] }, transaction)
  // Delete all router connections, and set routerChanged flag for linked routers
  if (routerConnections) {
    for (const connection of routerConnections) {
      const router = connection.source.id === routerId ? connection.dest : connection.source
      // Delete router connection
      await RouterConnectionManager.delete({ id: connection.id }, transaction)
      // Update config for downstream routers
      if (connection.dest.id === routerId) {
        // in order to keep downstream routers in the network, we connect them to default router
        if (defaultRouter) {
          await RouterConnectionManager.create({ sourceRouter: router.id, destRouter: defaultRouter.id }, transaction)
        }

        // Update router config
        await RouterService.updateConfig(router.id, transaction)
        // Set routerChanged flag
        await ChangeTrackingService.update(router.iofogUuid, ChangeTrackingService.events.routerChanged, transaction)
      }
    }
  }

  // Connect the agents to default router
  if (defaultRouter) {
    const connectedAgents = await FogManager.findAll({ routerId }, transaction)
    for (const connectedAgent of connectedAgents) {
      await FogManager.update({ uuid: connectedAgent.uuid }, { routerId: defaultRouter.id }, transaction)
      await _updateProxyRouters(connectedAgent.uuid, defaultRouter, transaction)
      await ChangeTrackingService.update(connectedAgent.uuid, ChangeTrackingService.events.routerChanged, transaction)
    }
  }
  // Delete router
  await RouterManager.delete({ iofogUuid: fogData.uuid }, transaction)
  // Delete router msvc
  const routerCatalog = await CatalogService.getRouterCatalogItem(transaction)
  await MicroserviceManager.delete({ catalogItemId: routerCatalog.id, iofogUuid: fogData.uuid }, transaction)
  await ApplicationManager.delete({ name: `system-${fogData.uuid.toLowerCase()}` }, transaction)
}

async function deleteFogEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogDelete)

  const queryFogData = { uuid: fogData.uuid }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  await _deleteFogRouter(fogData, transaction)

  await _processDeleteCommand(fog, transaction)
}

function _getRouterUuid (router, defaultRouter) {
  return (defaultRouter && (router.id === defaultRouter.id)) ? Constants.DEFAULT_ROUTER_NAME : router.iofogUuid
}

async function _getFogRouterConfig (fog, transaction) {
  // Get fog router config
  const defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)
  const router = await fog.getRouter()
  const routerConfig = {

  }
  // Router mode is either interior or edge
  if (router) {
    routerConfig.routerMode = router.isEdge ? 'edge' : 'interior'
    routerConfig.messagingPort = router.messagingPort
    if (routerConfig.routerMode === 'interior') {
      routerConfig.interRouterPort = router.interRouterPort
      routerConfig.edgeRouterPort = router.edgeRouterPort
    }
    // Get upstream routers
    const upstreamRoutersConnections = await RouterConnectionManager.findAllWithRouters({ sourceRouter: router.id }, transaction)
    routerConfig.upstreamRouters = upstreamRoutersConnections ? upstreamRoutersConnections.map(r => _getRouterUuid(r.dest, defaultRouter)) : []
  } else {
    routerConfig.routerMode = 'none'
    const networkRouter = await RouterManager.findOne({ id: fog.routerId }, transaction)
    if (networkRouter) {
      routerConfig.networkRouter = _getRouterUuid(networkRouter, defaultRouter)
    }
  }

  return routerConfig
}

async function _getFogEdgeResources (fog, transaction) {
  const resourceAttributes = [
    'name',
    'version',
    'description',
    'interfaceProtocol',
    'displayName',
    'displayIcon',
    'displayColor'
  ]
  const resources = await fog.getEdgeResources({ attributes: resourceAttributes })
  return resources.map(EdgeResourceService.buildGetObject)
}

async function _getFogExtraInformation (fog, transaction) {
  const routerConfig = await _getFogRouterConfig(fog, transaction)
  const edgeResources = await _getFogEdgeResources(fog, transaction)
  // Transform to plain JS object
  if (fog.toJSON && typeof fog.toJSON === 'function') {
    fog = fog.toJSON()
  }
  return { ...fog, tags: _mapTags(fog), ...routerConfig, edgeResources }
}

// Map tags to string array
// Return plain JS object
function _mapTags (fog) {
  return fog.tags ? fog.tags.map(t => t.value) : []
}

async function getFog (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogGet)

  const queryFogData = fogData.uuid ? { uuid: fogData.uuid } : { name: fogData.name }

  const fog = await FogManager.findOneWithTags(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  return _getFogExtraInformation(fog, transaction)
}

async function getFogEndPoint (fogData, isCLI, transaction) {
  return getFog(fogData, isCLI, transaction)
}

async function getFogListEndPoint (filters, isCLI, isSystem, transaction) {
  await Validator.validate(filters, Validator.schemas.iofogFilters)

  // // If listing system agent through REST API, make sure user is authenticated
  // if (isSystem && !isCLI && !lget('id')) {
  //   throw new Errors.AuthenticationError('Unauthorized')
  // }

  const queryFogData = isSystem ? { isSystem } : (isCLI ? {} : { isSystem: false })

  let fogs = await FogManager.findAllWithTags(queryFogData, transaction)
  fogs = _filterFogs(fogs, filters)

  // Map all tags
  // Get router config info for all fogs
  fogs = await Promise.all(fogs.map(async (fog) => _getFogExtraInformation(fog, transaction)))
  return {
    fogs
  }
}

async function generateProvisioningKeyEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogGenerateProvision)

  const queryFogData = { uuid: fogData.uuid }

  const newProvision = {
    iofogUuid: fogData.uuid,
    provisionKey: AppHelper.generateRandomString(8),
    expirationTime: new Date().getTime() + (20 * 60 * 1000)
  }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  const provisioningKeyData = await FogProvisionKeyManager.updateOrCreate({ iofogUuid: fogData.uuid }, newProvision, transaction)

  return {
    key: provisioningKeyData.provisionKey,
    expirationTime: provisioningKeyData.expirationTime
  }
}

async function setFogVersionCommandEndPoint (fogVersionData, isCLI, transaction) {
  await Validator.validate(fogVersionData, Validator.schemas.iofogSetVersionCommand)

  const queryFogData = { uuid: fogVersionData.uuid }

  const newVersionCommand = {
    iofogUuid: fogVersionData.uuid,
    versionCommand: fogVersionData.versionCommand
  }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, queryFogData.uuid))
  }

  if (!fog.isReadyToRollback && fogVersionData.versionCommand === 'rollback') {
    throw new Errors.ValidationError(ErrorMessages.INVALID_VERSION_COMMAND_ROLLBACK)
  }
  if (!fog.isReadyToUpgrade && fogVersionData.versionCommand === 'upgrade') {
    throw new Errors.ValidationError(ErrorMessages.INVALID_VERSION_COMMAND_UPGRADE)
  }

  await generateProvisioningKeyEndPoint({ uuid: fogVersionData.uuid }, isCLI, transaction)
  await FogVersionCommandManager.updateOrCreate({ iofogUuid: fogVersionData.uuid }, newVersionCommand, transaction)
  await ChangeTrackingService.update(fogVersionData.uuid, ChangeTrackingService.events.version, transaction)
}

async function setFogRebootCommandEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogReboot)

  const queryFogData = { uuid: fogData.uuid }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.reboot, transaction)
}

async function getHalHardwareInfoEndPoint (uuidObj, isCLI, transaction) {
  await Validator.validate(uuidObj, Validator.schemas.halGet)

  const fog = await FogManager.findOne({
    uuid: uuidObj.uuid
  }, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, uuidObj.uuid))
  }

  return HWInfoManager.findOne({
    iofogUuid: uuidObj.uuid
  }, transaction)
}

async function getHalUsbInfoEndPoint (uuidObj, isCLI, transaction) {
  await Validator.validate(uuidObj, Validator.schemas.halGet)

  const fog = await FogManager.findOne({
    uuid: uuidObj.uuid
  }, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, uuidObj.uuid))
  }

  return USBInfoManager.findOne({
    iofogUuid: uuidObj.uuid
  }, transaction)
}

function _filterFogs (fogs, filters) {
  if (!filters) {
    return fogs
  }

  const filtered = []
  fogs.forEach((fog) => {
    let isMatchFog = true
    filters.some((filter) => {
      const fld = filter.key
      const val = filter.value
      const condition = filter.condition
      const isMatchField = (condition === 'equals' && fog[fld] && fog[fld] === val) ||
        (condition === 'has' && fog[fld] && fog[fld].includes(val))
      if (!isMatchField) {
        isMatchFog = false
        return false
      }
    })
    if (isMatchFog) {
      filtered.push(fog)
    }
  })
  return filtered
}

async function _processDeleteCommand (fog, transaction) {
  const microservices = await MicroserviceManager.findAll({ iofogUuid: fog.uuid }, transaction)
  for (const microservice of microservices) {
    await MicroserviceService.deleteMicroserviceWithRoutesAndPortMappings(microservice, transaction)
  }

  await ChangeTrackingService.update(fog.uuid, ChangeTrackingService.events.deleteNode, transaction)
  await FogManager.delete({ uuid: fog.uuid }, transaction)
}

async function _createHalMicroserviceForFog (fogData, oldFog, transaction) {
  const halItem = await CatalogService.getHalCatalogItem(transaction)

  const halMicroserviceData = {
    uuid: AppHelper.generateRandomString(32),
    name: `hal-${fogData.uuid.toLowerCase()}`,
    config: '{}',
    catalogItemId: halItem.id,
    iofogUuid: fogData.uuid,
    rootHostAccess: true,
    logSize: Constants.MICROSERVICE_DEFAULT_LOG_SIZE,
    configLastUpdated: Date.now()
  }

  const application = await ApplicationManager.findOne({ name: `system-${fogData.uuid.toLowerCase()}` }, transaction)
  halMicroserviceData.applicationId = application.id
  await MicroserviceManager.create(halMicroserviceData, transaction)
  await MicroserviceStatusManager.create({ microserviceUuid: halMicroserviceData.uuid }, transaction)
}

async function _deleteHalMicroserviceByFog (fogData, transaction) {
  const halItem = await CatalogService.getHalCatalogItem(transaction)
  const deleteHalMicroserviceData = {
    iofogUuid: fogData.uuid,
    catalogItemId: halItem.id
  }

  const application = await ApplicationManager.findOne({ name: `system-${fogData.uuid.toLowerCase()}` }, transaction)
  deleteHalMicroserviceData.applicationId = application.id
  await MicroserviceManager.delete(deleteHalMicroserviceData, transaction)
}

async function _createBluetoothMicroserviceForFog (fogData, oldFog, transaction) {
  const bluetoothItem = await CatalogService.getBluetoothCatalogItem(transaction)

  const bluetoothMicroserviceData = {
    uuid: AppHelper.generateRandomString(32),
    name: `ble-${fogData.uuid.toLowerCase()}`,
    config: '{}',
    catalogItemId: bluetoothItem.id,
    iofogUuid: fogData.uuid,
    rootHostAccess: true,
    logSize: Constants.MICROSERVICE_DEFAULT_LOG_SIZE,
    configLastUpdated: Date.now()
  }

  const application = await ApplicationManager.findOne({ name: `system-${fogData.uuid.toLowerCase()}` }, transaction)
  bluetoothMicroserviceData.applicationId = application.id
  await MicroserviceManager.create(bluetoothMicroserviceData, transaction)
  await MicroserviceStatusManager.create({ microserviceUuid: bluetoothMicroserviceData.uuid }, transaction)
}

async function _deleteBluetoothMicroserviceByFog (fogData, transaction) {
  const bluetoothItem = await CatalogService.getBluetoothCatalogItem(transaction)
  const deleteBluetoothMicroserviceData = {
    iofogUuid: fogData.uuid,
    catalogItemId: bluetoothItem.id
  }
  const application = await ApplicationManager.findOne({ name: `system-${fogData.uuid.toLowerCase()}` }, transaction)
  deleteBluetoothMicroserviceData.applicationId = application.id

  await MicroserviceManager.delete(deleteBluetoothMicroserviceData, transaction)
}

async function setFogPruneCommandEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogPrune)

  const queryFogData = { uuid: fogData.uuid }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.prune, transaction)
}

module.exports = {
  createFogEndPoint: TransactionDecorator.generateTransaction(createFogEndPoint),
  updateFogEndPoint: TransactionDecorator.generateTransaction(updateFogEndPoint),
  deleteFogEndPoint: TransactionDecorator.generateTransaction(deleteFogEndPoint),
  getFogEndPoint: TransactionDecorator.generateTransaction(getFogEndPoint),
  getFogListEndPoint: TransactionDecorator.generateTransaction(getFogListEndPoint),
  generateProvisioningKeyEndPoint: TransactionDecorator.generateTransaction(generateProvisioningKeyEndPoint),
  setFogVersionCommandEndPoint: TransactionDecorator.generateTransaction(setFogVersionCommandEndPoint),
  setFogRebootCommandEndPoint: TransactionDecorator.generateTransaction(setFogRebootCommandEndPoint),
  getHalHardwareInfoEndPoint: TransactionDecorator.generateTransaction(getHalHardwareInfoEndPoint),
  getHalUsbInfoEndPoint: TransactionDecorator.generateTransaction(getHalUsbInfoEndPoint),
  getFog: getFog,
  setFogPruneCommandEndPoint: TransactionDecorator.generateTransaction(setFogPruneCommandEndPoint)
}
