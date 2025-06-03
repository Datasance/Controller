/* only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed
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

const TransactionDecorator = require('../decorators/transaction-decorator')
const MicroserviceManager = require('../data/managers/microservice-manager')
const MicroserviceStatusManager = require('../data/managers/microservice-status-manager')
const MicroserviceArgManager = require('../data/managers/microservice-arg-manager')
const MicroserviceCdiDevManager = require('../data/managers/microservice-cdi-device-manager')
const MicroserviceCapAddManager = require('../data/managers/microservice-cap-add-manager')
const MicroserviceCapDropManager = require('../data/managers/microservice-cap-drop-manager')
const MicroserviceEnvManager = require('../data/managers/microservice-env-manager')
const MicroservicePortService = require('../services/microservice-ports/microservice-port')
const CatalogItemImageManager = require('../data/managers/catalog-item-image-manager')
const RegistryManager = require('../data/managers/registry-manager')
// const RouterManager = require('../data/managers/router-manager')
const MicroserviceStates = require('../enums/microservice-state')
const VolumeMappingManager = require('../data/managers/volume-mapping-manager')
const ChangeTrackingService = require('./change-tracking-service')
const AppHelper = require('../helpers/app-helper')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const Validator = require('../schemas/index')
const ApplicationManager = require('../data/managers/application-manager')
const CatalogService = require('../services/catalog-service')
const RoutingManager = require('../data/managers/routing-manager')
const RoutingService = require('../services/routing-service')
const ServiceManager = require('../data/managers/service-manager')
const ServiceServices = require('./services-service')
const ConfigMapManager = require('../data/managers/config-map-manager')
const SecretManager = require('../data/managers/secret-manager')

const Op = require('sequelize').Op
const FogManager = require('../data/managers/iofog-manager')
const MicroserviceExtraHostManager = require('../data/managers/microservice-extra-host-manager')
const { VOLUME_MAPPING_DEFAULT } = require('../helpers/constants')
const constants = require('../helpers/constants')
const isEqual = require('lodash/isEqual')
const TagsManager = require('../data/managers/tags-manager')
const logger = require('../logger')

async function _setPubTags (microserviceModel, tagsArray, transaction) {
  if (tagsArray) {
    let tags = []
    for (const tag of tagsArray) {
      let tagModel = await TagsManager.findOne({ value: tag }, transaction)
      if (!tagModel) {
        tagModel = await TagsManager.create({ value: tag }, transaction)
      }
      tags.push(tagModel)
    }
    await microserviceModel.setPubTags(tags)
  }
}

async function _setSubTags (microserviceModel, tagsArray, transaction) {
  if (tagsArray) {
    let tags = []
    for (const tag of tagsArray) {
      let tagModel = await TagsManager.findOne({ value: tag }, transaction)
      if (!tagModel) {
        tagModel = await TagsManager.create({ value: tag }, transaction)
      }
      tags.push(tagModel)
    }
    await microserviceModel.setSubTags(tags)
  }
}

async function listMicroservicesEndPoint (opt, isCLI, transaction) {
  // API retro compatibility
  const { applicationName, flowId } = opt
  let application = await _validateApplication(applicationName, isCLI, transaction)

  if (flowId) {
    // _validateApplication wil try by ID if it fails finding by name
    application = await _validateApplication(flowId, isCLI, transaction)
  }

  const where = application ? { applicationId: application.id, delete: false } : { delete: false, applicationId: { [Op.ne]: null } }

  const microservices = await MicroserviceManager.findAllExcludeFields(where, transaction)

  const res = await Promise.all(microservices.map(async (microservice) => {
    return _buildGetMicroserviceResponse(microservice.dataValues, transaction)
  }))

  return {
    microservices: res
  }
}

async function getMicroserviceEndPoint (microserviceUuid, isCLI, transaction) {
  if (!isCLI) {
    await _validateMicroserviceOnGet(microserviceUuid, transaction)
  }

  const microservice = await MicroserviceManager.findOneExcludeFields({
    uuid: microserviceUuid, delete: false
  }, transaction)

  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  return _buildGetMicroserviceResponse(microservice.dataValues, transaction)
}

function _validateImagesAgainstCatalog (catalogItem, images) {
  const allImagesEmpty = images.reduce((result, b) => result && b.containerImage === '', true)
  if (allImagesEmpty) {
    return
  }
  for (const img of images) {
    let found = false
    for (const catalogImg of catalogItem.images) {
      if (catalogImg.fogType === img.fogType) {
        found = true
      }
      if (found === true && img.containerImage !== '' && catalogImg.containerImage !== img.containerImage) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.CATALOG_NOT_MATCH_IMAGES, `${catalogItem.id}`))
      }
    }
    if (!found) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.CATALOG_NOT_MATCH_IMAGES, `${catalogItem.id}`))
    }
  }
}

async function _validateLocalAppHostTemplate (extraHost, templateArgs, msvc, fogUuid, transaction) {
  if (templateArgs.length !== 4) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, templateArgs.join('.')))
  }
  const fog = await FogManager.findOne({ uuid: msvc.iofogUuid }, transaction)
  if (!fog) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.NOT_FOUND_HOST_TEMPLATE, templateArgs[2]))
  }
  if (fogUuid !== fog.uuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.NOT_FOUND_APPS_TEMPLATE, msvc.name))
  }

  extraHost.targetFogUuid = fog.uuid
  extraHost.value = `iofog_${msvc.uuid}`

  return extraHost
}

async function _validateAppHostTemplate (extraHost, templateArgs, fogUuid, transaction) {
  if (templateArgs.length < 4) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, templateArgs.join('.')))
  }
  const application = await ApplicationManager.findOne({ name: templateArgs[1] }, transaction)
  if (!application) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.NOT_FOUND_HOST_TEMPLATE, templateArgs[1]))
  }
  const msvc = await MicroserviceManager.findOne({ applicationId: application.id, name: templateArgs[2] }, transaction)
  if (!msvc) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.NOT_FOUND_HOST_TEMPLATE, templateArgs[2]))
  }
  extraHost.templateType = 'Apps'
  extraHost.targetMicroserviceUuid = msvc.uuid
  if (templateArgs[3] === 'local') {
    return _validateLocalAppHostTemplate(extraHost, templateArgs, msvc, fogUuid, transaction)
  }
  throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, templateArgs.join('.')))
}

async function _validateAgentHostTemplate (extraHost, templateArgs, transaction) {
  if (templateArgs.length !== 2) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, templateArgs.join('.')))
  }

  extraHost.templateType = 'Agents'
  const fog = await FogManager.findOne({ name: templateArgs[1] }, transaction)
  if (!fog) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.NOT_FOUND_HOST_TEMPLATE, templateArgs[1]))
  }
  extraHost.targetFogUuid = fog.uuid
  extraHost.value = fog.host

  return extraHost
}

async function _validateExtraHost (extraHostData, fogUuid, transaction) {
  if (extraHostData.name === 'service.local') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, 'Extra Host name cannot be service.local'))
  }
  const extraHost = {
    templateType: 'Litteral',
    name: extraHostData.name,
    template: extraHostData.address,
    value: extraHostData.address
  }
  if (!(extraHost.template.startsWith('${') && extraHost.template.endsWith('}'))) {
    return extraHost
  }
  const template = extraHost.value.slice(2, extraHost.value.length - 1)
  const templateArgs = template.split('.')
  extraHost.templateType = templateArgs[0]
  if (templateArgs[0] === 'Apps') {
    return _validateAppHostTemplate(extraHost, templateArgs, fogUuid, transaction)
  } else if (templateArgs[0] === 'Agents') {
    return _validateAgentHostTemplate(extraHost, templateArgs, transaction)
  }
  throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_HOST_TEMPLATE, template))
}

async function _validateExtraHosts (microserviceData, fogUuid, transaction) {
  if (!microserviceData.extraHosts || microserviceData.extraHosts.length === 0) {
    return []
  }
  const extraHosts = []
  for (const extraHost of microserviceData.extraHosts) {
    extraHosts.push(await _validateExtraHost(extraHost, fogUuid, transaction))
  }
  return extraHosts
}

function _validateImageFogType (microserviceData, fog, images) {
  let found = false
  for (const image of images) {
    if (image.fogTypeId === fog.fogTypeId && image.containerImage) {
      found = true
      break
    }
  }
  if (!found) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.MISSING_IMAGE, microserviceData.name))
  }
}

async function _findFog (microserviceData, isCLI, transaction) {
  const fogConditions = {}
  if (microserviceData.iofogUuid) {
    fogConditions.uuid = microserviceData.iofogUuid
  } else {
    fogConditions.name = microserviceData.agentName
  }
  return FogManager.findOne(fogConditions, transaction)
}

async function createMicroserviceEndPoint (microserviceData, isCLI, transaction) {
  // API Retro compatibility
  if (!microserviceData.application) {
    microserviceData.application = microserviceData.flowId
  }
  await Validator.validate(microserviceData, Validator.schemas.microserviceCreate)

  // find fog
  const fog = await _findFog(microserviceData, isCLI, transaction)
  if (!fog) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, microserviceData.iofogUuid || microserviceData.agentName))
  }

  // Set fog uuid for further reference
  microserviceData.iofogUuid = fog.uuid

  // validate images
  if (microserviceData.catalogItemId) {
    // validate catalog item
    const catalogItem = await CatalogService.getCatalogItem(microserviceData.catalogItemId, isCLI, transaction)
    _validateImagesAgainstCatalog(catalogItem, microserviceData.images || [])
    microserviceData.images = catalogItem.images
    _validateImageFogType(microserviceData, fog, catalogItem.images)
  } else {
    _validateImageFogType(microserviceData, fog, microserviceData.images)
  }

  if (!microserviceData.images || !microserviceData.images.length) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.MICROSERVICE_DOES_NOT_HAVE_IMAGES, microserviceData.name))
  }

  // validate extraHosts
  const extraHosts = await _validateExtraHosts(microserviceData, fog.uuid, transaction)

  await MicroservicePortService.validatePortMappings(microserviceData, transaction)

  _validateVolumeMappings(microserviceData.volumeMappings)

  const microservice = await _createMicroservice({ ...microserviceData, iofogUuid: fog.uuid }, isCLI, transaction)

  if (!microserviceData.catalogItemId) {
    await _createMicroserviceImages(microservice, microserviceData.images, transaction)
  }

  // const publicPorts = []
  // const proxyPorts = []
  if (microserviceData.ports) {
    for (const mapping of microserviceData.ports) {
      // const res = await MicroservicePortService.createPortMapping(microservice, mapping, transaction)
      await MicroservicePortService.createPortMapping(microservice, mapping, transaction)
      // if (res) {
      //   if (res.publicLinks) {
      //     publicPorts.push({
      //       internal: mapping.internal,
      //       external: mapping.external,
      //       publicLinks: res.publicLinks
      //     })
      //   } else if (res.proxy) {
      //     proxyPorts.push({
      //       internal: mapping.internal,
      //       external: mapping.external,
      //       proxy: res.proxy
      //     })
      //   }
      // }
    }
  }

  for (const extraHost of extraHosts) {
    await _createExtraHost(microservice, extraHost, transaction)
  }

  if (microserviceData.env) {
    for (const env of microserviceData.env) {
      await _createEnv(microservice, env, transaction)
    }
  }
  if (microserviceData.cmd) {
    for (const arg of microserviceData.cmd) {
      await _createArg(microservice, arg, transaction)
    }
  }
  if (microserviceData.cdiDevices) {
    for (const cdiDevices of microserviceData.cdiDevices) {
      await _createCdiDevices(microservice, cdiDevices, transaction)
    }
  }
  if (microserviceData.capAdd) {
    for (const capAdd of microserviceData.capAdd) {
      await _createCapAdd(microservice, capAdd, transaction)
    }
  }
  if (microserviceData.capDrop) {
    for (const capDrop of microserviceData.capDrop) {
      await _createCapDrop(microservice, capDrop, transaction)
    }
  }
  if (microserviceData.volumeMappings) {
    await _createVolumeMappings(microservice, microserviceData.volumeMappings, transaction)
  }

  if (microserviceData.pubTags) {
    await _setPubTags(microservice, microserviceData.pubTags, transaction)
  }

  if (microserviceData.subTags) {
    await _setSubTags(microservice, microserviceData.subTags, transaction)
    const fogsNeedUpdate = new Set()
    for (const tag of microserviceData.subTags) {
      try {
        const where = {
          delete: false,
          '$pubTags.value$': tag
        }
        // Get fog nodes with microservices for the given pubTag
        const response = await MicroserviceManager.findAllExcludeFields(where, transaction, { attributes: ['iofogUuid'] })
        if (response.length > 0) {
          response.forEach(ms => ms.iofogUuid && fogsNeedUpdate.add(ms.iofogUuid))
        }
      } catch (error) {
        logger.error(`Checking fog nodes list for pubTag "${tag.value}":`, error.message)
      }
    }
    for (const fog of fogsNeedUpdate) {
      try {
        await ChangeTrackingService.update(fog, ChangeTrackingService.events.microserviceFull, transaction)
      } catch (error) {
        logger.error(`Updating change tracking for fog "${fog.value}":`, error.message)
      }
    }
  }

  if (microserviceData.iofogUuid) {
    await _updateChangeTracking(false, microserviceData.iofogUuid, transaction)
  }

  await _createMicroserviceStatus(microservice, transaction)

  const res = {
    uuid: microservice.uuid,
    name: microservice.name
  }
  // if (publicPorts.length) {
  //   res.publicPorts = publicPorts
  // }
  // if (proxyPorts.length) {
  //   res.proxies = proxyPorts
  // }

  return res
}

function _validateVolumeMappings (volumeMappings) {
  if (volumeMappings) {
    for (const mapping of volumeMappings) {
      mapping.type = mapping.type || VOLUME_MAPPING_DEFAULT
      if (mapping.type === 'volume' && (!/^[a-zA-Z0-9_.-]/.test(mapping.hostDestination))) {
        throw new Errors.InvalidArgumentError('hostDestination includes invalid characters for a local volume name, only ' +
          '"[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use type: bind')
      }
    }
  }
}

async function _updateRelatedExtraHostTargetFog (extraHost, newFogUuid, transaction) {
  const fog = await FogManager.findOne({ uuid: newFogUuid }, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, newFogUuid))
  }
  extraHost.targetFogUuid = fog.uuid
  extraHost.value = fog.host
  await extraHost.save()
  // Update tracking change for microservice
  await MicroserviceExtraHostManager.updateOriginMicroserviceChangeTracking(extraHost, transaction)
}

async function _updateRelatedExtraHosts (updatedMicroservice, transaction) {
  const extraHosts = await MicroserviceExtraHostManager.findAll({ targetMicroserviceUuid: updatedMicroservice.uuid }, transaction)
  for (const extraHost of extraHosts) {
    // if (!extraHost.publicPort) {
    //   // Local port, update target fog and host if microservice moved
    //   if (extraHost.targetFogUuid !== updatedMicroservice.iofogUuid) {
    //     await _updateRelatedExtraHostTargetFog(extraHost, updatedMicroservice.iofogUuid, transaction)
    //   }
    // }
    // Local port, update target fog and host if microservice moved
    if (extraHost.targetFogUuid !== updatedMicroservice.iofogUuid) {
      await _updateRelatedExtraHostTargetFog(extraHost, updatedMicroservice.iofogUuid, transaction)
    }
  }
}

async function updateSystemMicroserviceEndPoint (microserviceUuid, microserviceData, isCLI, transaction, changeTrackingEnabled = true) {
  await Validator.validate(microserviceData, Validator.schemas.microserviceUpdate)
  let needStatusReset = false
  const query = isCLI
    ? {
      uuid: microserviceUuid
    }
    : {
      uuid: microserviceUuid
    }

  const newFog = await _findFog(microserviceData, isCLI, transaction) || {}
  // validate extraHosts
  const extraHosts = microserviceData.extraHosts ? await _validateExtraHosts(microserviceData, newFog.uuid, transaction) : null

  const config = _validateMicroserviceConfig(microserviceData.config)

  const annotations = _validateMicroserviceAnnotations(microserviceData.annotations)

  // const newFog = await _findFog(microserviceData, isCLI, transaction) || {}
  const microserviceToUpdate = {
    name: microserviceData.name,
    config: config,
    annotations: annotations,
    images: microserviceData.images,
    catalogItemId: microserviceData.catalogItemId,
    rebuild: microserviceData.rebuild,
    iofogUuid: newFog.uuid,
    rootHostAccess: microserviceData.rootHostAccess,
    pidMode: microserviceData.pidMode,
    ipcMode: microserviceData.ipcMode,
    cdiDevices: microserviceData.cdiDevices,
    capAdd: microserviceData.capAdd,
    capDrop: microserviceData.capDrop,
    runAsUser: microserviceData.runAsUser,
    platform: microserviceData.platform,
    runtime: microserviceData.runtime,
    logSize: (microserviceData.logSize || constants.MICROSERVICE_DEFAULT_LOG_SIZE) * 1,
    registryId: microserviceData.registryId,
    volumeMappings: microserviceData.volumeMappings,
    env: microserviceData.env,
    cmd: microserviceData.cmd,
    ports: microserviceData.ports
  }

  const microserviceDataUpdate = AppHelper.deleteUndefinedFields(microserviceToUpdate)

  const microservice = await MicroserviceManager.findOneWithCategory(query, transaction)

  const microserviceImages = await CatalogItemImageManager.findAll({
    microservice_uuid: microserviceUuid
  }, transaction)

  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }
  if (microserviceDataUpdate.registryId) {
    const registry = await RegistryManager.findOne({ id: microserviceDataUpdate.registryId }, transaction)
    if (!registry) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_REGISTRY_ID, microserviceDataUpdate.registryId))
    }
  } else {
    microserviceDataUpdate.registryId = microservice.registryId
  }

  if (microserviceDataUpdate.ports) {
    await _updateSystemPorts(microserviceDataUpdate.ports, microservice, transaction)
  }

  if (microserviceDataUpdate.iofogUuid && microservice.iofogUuid !== microserviceDataUpdate.iofogUuid) {
    // Moving to new agent
    // make sure all ports are available
    const ports = await microservice.getPorts()
    const data = {
      ports: [],
      iofogUuid: microserviceDataUpdate.iofogUuid
    }

    for (const port of ports) {
      data.ports.push({
        internal: port.portInternal,
        external: port.portExternal
      })
    }

    if (data.ports.length) {
      await MicroservicePortService.validatePortMappings(data, transaction)
    }
    needStatusReset = true
  }

  // Validate images vs catalog item

  const iofogUuid = microserviceDataUpdate.iofogUuid || microservice.iofogUuid
  if (microserviceDataUpdate.catalogItemId) {
    const catalogItem = await CatalogService.getSystemCatalogItem(microserviceDataUpdate.catalogItemId, isCLI, transaction)
    _validateImagesAgainstCatalog(catalogItem, microserviceDataUpdate.images || [])
    if (microserviceDataUpdate.catalogItemId !== undefined && microserviceDataUpdate.catalogItemId !== microservice.catalogItemId) {
      // Catalog item changed or removed, set rebuild flag
      microserviceDataUpdate.rebuild = true
      // If catalog item is set, set registry and msvc images
      if (microserviceDataUpdate.catalogItemId) {
        await _deleteImages(microserviceUuid, transaction)
        microserviceDataUpdate.registryId = catalogItem.registryId || 1
      }
    }
  } else if (!microservice.catalogItemId && microserviceDataUpdate.images && microserviceDataUpdate.images.length === 0) {
    // No catalog, and no image
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.MICROSERVICE_DOES_NOT_HAVE_IMAGES, microserviceData.name))
  } else if (microserviceDataUpdate.images && microserviceDataUpdate.images.length > 0 && !_checkIfMicroserviceImagesAreEqual(microserviceDataUpdate.images, microserviceImages)) {
    // No catalog, and images
    await _updateImages(microserviceDataUpdate.images, microserviceUuid, transaction)
    // Images updated, set rebuild flag to true
    microserviceDataUpdate.rebuild = true
  }

  if (microserviceDataUpdate.name) {
    await _checkForDuplicateName(microserviceDataUpdate.name, { id: microserviceUuid }, microservice.applicationId || microservice.application, transaction)
  }

  // validate fog node
  if (iofogUuid) {
    const fog = await FogManager.findOne({ uuid: iofogUuid }, transaction)
    if (!fog || fog.length === 0) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, iofogUuid))
    }

    // Validate image type
    let images = []
    if (microserviceDataUpdate.catalogItemId) {
      const catalogItem = await CatalogService.getSystemCatalogItem(microserviceDataUpdate.catalogItemId, isCLI, transaction)
      images = catalogItem.images
    } else if (microserviceDataUpdate.images) {
      images = microserviceDataUpdate.images
    } else if (microservice.catalogItemId) {
      const catalogItem = await CatalogService.getSystemCatalogItem(microservice.catalogItemId, isCLI, transaction)
      images = catalogItem.images
    } else {
      images = await microservice.getImages()
    }
    _validateImageFogType(microserviceData, fog, images)
  }

  // Set rebuild flag if needed
  microserviceDataUpdate.rebuild = microserviceDataUpdate.rebuild || !!(
    (microserviceDataUpdate.rootHostAccess !== undefined && microservice.rootHostAccess !== microserviceDataUpdate.rootHostAccess) ||
    microserviceDataUpdate.pidMode ||
    microserviceDataUpdate.ipcMode ||
    microserviceDataUpdate.env ||
    microserviceDataUpdate.cmd ||
    microserviceDataUpdate.cdiDevices ||
    microserviceDataUpdate.annotations ||
    microserviceDataUpdate.capAdd ||
    microserviceDataUpdate.capDrop ||
    microserviceDataUpdate.runAsUser ||
    microserviceDataUpdate.platform ||
    microserviceDataUpdate.runtime ||
    microserviceDataUpdate.volumeMappings ||
    microserviceDataUpdate.ports ||
    extraHosts
  )
  const updatedMicroservice = await MicroserviceManager.updateAndFind(query, microserviceDataUpdate, transaction)

  if (extraHosts) {
    await _updateExtraHosts(extraHosts, microserviceUuid, transaction)
  }

  // Update extra hosts that reference this microservice
  await _updateRelatedExtraHosts(updatedMicroservice, transaction)

  if (microserviceDataUpdate.volumeMappings) {
    await _updateVolumeMappings(microserviceDataUpdate.volumeMappings, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.env) {
    await _updateEnv(microserviceDataUpdate.env, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.cmd) {
    await _updateArg(microserviceDataUpdate.cmd, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.cdiDevices) {
    await _updateCdiDevices(microserviceDataUpdate.cdiDevices, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.capAdd) {
    await _updateCapAdd(microserviceDataUpdate.capAdd, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.capDrop) {
    await _updateCapDrop(microserviceDataUpdate.capDrop, microserviceUuid, transaction)
  }

  if (needStatusReset) {
    const microserviceStatus = {
      status: MicroserviceStates.QUEUED,
      operatingDuration: 0,
      startTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      containerId: '',
      percentage: 0,
      errorMessage: ''
    }
    await MicroserviceStatusManager.update({
      microserviceUuid: microservice.uuid
    }, microserviceStatus, transaction)
  }

  if (changeTrackingEnabled) {
    await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceRouting, transaction)
    await ChangeTrackingService.update(updatedMicroservice.iofogUuid, ChangeTrackingService.events.microserviceRouting, transaction)
    await _updateChangeTracking(true, microservice.iofogUuid, transaction)
    await _updateChangeTracking(true, updatedMicroservice.iofogUuid, transaction)
  } else {
    return {
      microserviceIofogUuid: microservice.iofogUuid,
      updatedMicroserviceIofogUuid: updatedMicroservice.iofogUuid
    }
  }
}

async function updateMicroserviceEndPoint (microserviceUuid, microserviceData, isCLI, transaction, changeTrackingEnabled = true) {
  await Validator.validate(microserviceData, Validator.schemas.microserviceUpdate)
  let needStatusReset = false
  const query = isCLI
    ? {
      uuid: microserviceUuid
    }
    : {
      uuid: microserviceUuid
    }

  const newFog = await _findFog(microserviceData, isCLI, transaction) || {}
  // validate extraHosts
  const extraHosts = microserviceData.extraHosts ? await _validateExtraHosts(microserviceData, newFog.uuid, transaction) : null

  const config = _validateMicroserviceConfig(microserviceData.config)

  const annotations = _validateMicroserviceAnnotations(microserviceData.annotations)

  // const newFog = await _findFog(microserviceData, isCLI, transaction) || {}
  const microserviceToUpdate = {
    name: microserviceData.name,
    config: config,
    annotations: annotations,
    images: microserviceData.images,
    catalogItemId: microserviceData.catalogItemId,
    rebuild: microserviceData.rebuild,
    iofogUuid: newFog.uuid,
    rootHostAccess: microserviceData.rootHostAccess,
    pidMode: microserviceData.pidMode,
    ipcMode: microserviceData.ipcMode,
    cdiDevices: microserviceData.cdiDevices,
    capAdd: microserviceData.capAdd,
    capDrop: microserviceData.capDrop,
    runAsUser: microserviceData.runAsUser,
    platform: microserviceData.platform,
    runtime: microserviceData.runtime,
    logSize: (microserviceData.logSize || constants.MICROSERVICE_DEFAULT_LOG_SIZE) * 1,
    registryId: microserviceData.registryId,
    volumeMappings: microserviceData.volumeMappings,
    env: microserviceData.env,
    cmd: microserviceData.cmd,
    ports: microserviceData.ports
  }

  const microserviceDataUpdate = AppHelper.deleteUndefinedFields(microserviceToUpdate)

  const microservice = await MicroserviceManager.findOneWithCategory(query, transaction)

  const microserviceImages = await CatalogItemImageManager.findAll({
    microservice_uuid: microserviceUuid
  }, transaction)

  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }
  if (microserviceDataUpdate.registryId) {
    const registry = await RegistryManager.findOne({ id: microserviceDataUpdate.registryId }, transaction)
    if (!registry) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_REGISTRY_ID, microserviceDataUpdate.registryId))
    }
  } else {
    microserviceDataUpdate.registryId = microservice.registryId
  }

  if (microserviceDataUpdate.ports) {
    await _updatePorts(microserviceDataUpdate.ports, microservice, transaction)
  }

  if (microserviceDataUpdate.iofogUuid && microservice.iofogUuid !== microserviceDataUpdate.iofogUuid) {
    // Moving to new agent
    // make sure all ports are available
    const ports = await microservice.getPorts()
    const data = {
      ports: [],
      iofogUuid: microserviceDataUpdate.iofogUuid
    }

    for (const port of ports) {
      data.ports.push({
        internal: port.portInternal,
        external: port.portExternal
      })
    }

    if (data.ports.length) {
      await MicroservicePortService.validatePortMappings(data, transaction)
    }
    needStatusReset = true
  }

  if (microservice.catalogItem && microservice.catalogItem.category === 'SYSTEM') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  }

  // Validate images vs catalog item

  const iofogUuid = microserviceDataUpdate.iofogUuid || microservice.iofogUuid
  if (microserviceDataUpdate.catalogItemId) {
    const catalogItem = await CatalogService.getCatalogItem(microserviceDataUpdate.catalogItemId, isCLI, transaction)
    _validateImagesAgainstCatalog(catalogItem, microserviceDataUpdate.images || [])
    if (microserviceDataUpdate.catalogItemId !== undefined && microserviceDataUpdate.catalogItemId !== microservice.catalogItemId) {
      // Catalog item changed or removed, set rebuild flag
      microserviceDataUpdate.rebuild = true
      // If catalog item is set, set registry and msvc images
      if (microserviceDataUpdate.catalogItemId) {
        await _deleteImages(microserviceUuid, transaction)
        microserviceDataUpdate.registryId = catalogItem.registryId || 1
      }
    }
  } else if (!microservice.catalogItemId && microserviceDataUpdate.images && microserviceDataUpdate.images.length === 0) {
    // No catalog, and no image
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.MICROSERVICE_DOES_NOT_HAVE_IMAGES, microserviceData.name))
  } else if (microserviceDataUpdate.images && microserviceDataUpdate.images.length > 0 && !_checkIfMicroserviceImagesAreEqual(microserviceDataUpdate.images, microserviceImages)) {
    // No catalog, and images
    await _updateImages(microserviceDataUpdate.images, microserviceUuid, transaction)
    // Images updated, set rebuild flag to true
    microserviceDataUpdate.rebuild = true
  }

  if (microserviceDataUpdate.name) {
    await _checkForDuplicateName(microserviceDataUpdate.name, { id: microserviceUuid }, microservice.applicationId || microservice.application, transaction)
  }

  // validate fog node
  if (iofogUuid) {
    const fog = await FogManager.findOne({ uuid: iofogUuid }, transaction)
    if (!fog || fog.length === 0) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, iofogUuid))
    }

    // Validate image type
    let images = []
    if (microserviceDataUpdate.catalogItemId) {
      const catalogItem = await CatalogService.getCatalogItem(microserviceDataUpdate.catalogItemId, isCLI, transaction)
      images = catalogItem.images
    } else if (microserviceDataUpdate.images) {
      images = microserviceDataUpdate.images
    } else if (microservice.catalogItemId) {
      const catalogItem = await CatalogService.getCatalogItem(microservice.catalogItemId, isCLI, transaction)
      images = catalogItem.images
    } else {
      images = await microservice.getImages()
    }
    _validateImageFogType(microserviceData, fog, images)
  }

  // Set rebuild flag if needed
  microserviceDataUpdate.rebuild = microserviceDataUpdate.rebuild || !!(
    (microserviceDataUpdate.rootHostAccess !== undefined && microservice.rootHostAccess !== microserviceDataUpdate.rootHostAccess) ||
    microserviceDataUpdate.pidMode ||
    microserviceDataUpdate.ipcMode ||
    microserviceDataUpdate.env ||
    microserviceDataUpdate.cmd ||
    microserviceDataUpdate.cdiDevices ||
    microserviceDataUpdate.capAdd ||
    microserviceDataUpdate.capDrop ||
    microserviceDataUpdate.annotations ||
    microserviceDataUpdate.runAsUser ||
    microserviceDataUpdate.platform ||
    microserviceDataUpdate.runtime ||
    microserviceDataUpdate.volumeMappings ||
    microserviceDataUpdate.ports ||
    extraHosts
  )
  const updatedMicroservice = await MicroserviceManager.updateAndFind(query, microserviceDataUpdate, transaction)

  if (extraHosts) {
    await _updateExtraHosts(extraHosts, microserviceUuid, transaction)
  }

  // Update extra hosts that reference this microservice
  await _updateRelatedExtraHosts(updatedMicroservice, transaction)

  if (microserviceDataUpdate.volumeMappings) {
    await _updateVolumeMappings(microserviceDataUpdate.volumeMappings, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.env) {
    await _updateEnv(microserviceDataUpdate.env, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.cmd) {
    await _updateArg(microserviceDataUpdate.cmd, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.cdiDevices) {
    await _updateCdiDevices(microserviceDataUpdate.cdiDevices, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.capAdd) {
    await _updateCapAdd(microserviceDataUpdate.capAdd, microserviceUuid, transaction)
  }

  if (microserviceDataUpdate.capDrop) {
    await _updateCapDrop(microserviceDataUpdate.capDrop, microserviceUuid, transaction)
  }
  // TODO: Implement moveServiceToNewFog
  const existingService = await ServiceManager.findOne({ type: `microservice`, resource: microservice.uuid }, transaction)
  if (microserviceDataUpdate.iofogUuid && microserviceDataUpdate.iofogUuid !== microservice.iofogUuid && existingService) {
    await ServiceServices.moveMicroserviceTcpBridgeToNewFog(existingService, microserviceDataUpdate.iofogUuid, microservice.iofogUuid, transaction)
  }

  // Update tags
  if (microserviceData.pubTags) {
    await _setPubTags(microservice, microserviceData.pubTags, transaction)
  }

  if (microserviceData.subTags) {
    await _setSubTags(microservice, microserviceData.subTags, transaction)
    const fogsNeedUpdate = new Set()
    for (const tag of microserviceData.subTags) {
      try {
        const where = {
          delete: false,
          '$pubTags.value$': tag
        }
        // Get fog nodes with microservices for the given pubTag
        const response = await MicroserviceManager.findAllExcludeFields(where, transaction, { attributes: ['iofogUuid'] })
        if (response.length > 0) {
          response.forEach(ms => ms.iofogUuid && fogsNeedUpdate.add(ms.iofogUuid))
        }
      } catch (error) {
        logger.error(`Checking fog nodes list for pubTag "${tag.value}":`, error.message)
      }
    }
    for (const fog of fogsNeedUpdate) {
      try {
        await ChangeTrackingService.update(fog, ChangeTrackingService.events.microserviceFull, transaction)
      } catch (error) {
        logger.error(`Updating change tracking for fog "${fog.value}":`, error.message)
      }
    }
  }

  if (needStatusReset) {
    const microserviceStatus = {
      status: MicroserviceStates.QUEUED,
      operatingDuration: 0,
      startTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      containerId: '',
      percentage: 0,
      errorMessage: ''
    }
    await MicroserviceStatusManager.update({
      microserviceUuid: microservice.uuid
    }, microserviceStatus, transaction)
  }

  if (changeTrackingEnabled) {
    await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceRouting, transaction)
    await ChangeTrackingService.update(updatedMicroservice.iofogUuid, ChangeTrackingService.events.microserviceRouting, transaction)
    await _updateChangeTracking(true, microservice.iofogUuid, transaction)
    await _updateChangeTracking(true, updatedMicroservice.iofogUuid, transaction)
  } else {
    return {
      microserviceIofogUuid: microservice.iofogUuid,
      updatedMicroserviceIofogUuid: updatedMicroservice.iofogUuid
    }
  }
}

async function rebuildMicroserviceEndPoint (microserviceUuid, isCLI, transaction) {
  const query = isCLI
    ? {
      uuid: microserviceUuid
    }
    : {
      uuid: microserviceUuid
    }

  const check = await MicroserviceManager.findOneWithCategory(query, transaction)
  if (check.catalogItem && check.catalogItem.category === 'SYSTEM') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  }

  const microservice = await MicroserviceManager.updateAndFind(query, { rebuild: true }, transaction)

  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }
  const iofogUuid = microservice.iofogUuid
  await ChangeTrackingService.update(iofogUuid, ChangeTrackingService.events.microserviceCommon, transaction)
  return {
    uuid: microserviceUuid,
    rebuild: true
  }
}

async function rebuildSystemMicroserviceEndPoint (microserviceUuid, isCLI, transaction) {
  const query = isCLI
    ? {
      uuid: microserviceUuid
    }
    : {
      uuid: microserviceUuid
    }

  const microservice = await MicroserviceManager.updateAndFind(query, { rebuild: true }, transaction)

  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }
  const iofogUuid = microservice.iofogUuid
  await ChangeTrackingService.update(iofogUuid, ChangeTrackingService.events.microserviceCommon, transaction)
  return {
    uuid: microserviceUuid,
    rebuild: true
  }
}

/**
 * checks if microservice image is updated
 * @param {*} microserviceDataUpdateImages
 * @param {*} catalogImages
 */
const _checkIfMicroserviceImagesAreEqual = (microserviceDataUpdateImages, catalogImages) => {
  const oldMicroservicesImages = []
  for (const images of catalogImages) {
    oldMicroservicesImages.push(images.containerImage)
  }
  const newMicroserviceImages = []
  for (const images of microserviceDataUpdateImages) {
    newMicroserviceImages.push(images.containerImage)
  }
  return isEqual(newMicroserviceImages, oldMicroservicesImages)
}

async function deleteMicroserviceEndPoint (microserviceUuid, microserviceData, isCLI, transaction) {
  const where = isCLI
    ? {
      uuid: microserviceUuid
    }
    : {
      uuid: microserviceUuid
    }

  const microservice = await MicroserviceManager.findOneWithStatusAndCategory(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }
  if (!isCLI && microservice.catalogItem && microservice.catalogItem.category === 'SYSTEM') {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_DELETE, microserviceUuid))
  }

  await deleteMicroserviceWithRoutesAndPortMappings(microservice, transaction)

  const existingService = await ServiceManager.findOne({ type: `microservice`, resource: microservice.uuid }, transaction)
  if (existingService) {
    logger.info(`Deleting service ${existingService.name}`)
    await ServiceServices.deleteServiceEndpoint(existingService.name, transaction)
  }
  await _updateChangeTracking(false, microservice.iofogUuid, transaction)
}

async function deleteNotRunningMicroservices (fog, transaction) {
  const microservices = await MicroserviceManager.findAllWithStatuses({ iofogUuid: fog.uuid }, transaction)
  microservices
    .filter((microservice) => microservice.delete)
    .filter((microservice) => microservice.microserviceStatus.status === MicroserviceStates.UNKNOWN ||
      microservice.microserviceStatus.status === MicroserviceStates.STOPPING ||
      microservice.microserviceStatus.status === MicroserviceStates.DELETING ||
      microservice.microserviceStatus.status === MicroserviceStates.MARKED_FOR_DELETION)
    .forEach(async (microservice) => { await deleteMicroserviceWithRoutesAndPortMappings(microservice, transaction) })
}

async function createRouteEndPoint (sourceMicroserviceUuid, destMicroserviceUuid, isCLI, transaction) {
  // Print deprecated warning
  const sourceMsvc = await MicroserviceManager.findMicroserviceOnGet({ uuid: sourceMicroserviceUuid }, transaction)
  if (!sourceMsvc) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_SOURCE_MICROSERVICE_UUID, sourceMicroserviceUuid))
  }
  const destMsvc = await MicroserviceManager.findMicroserviceOnGet({ uuid: destMicroserviceUuid }, transaction)
  if (!destMsvc) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_SOURCE_MICROSERVICE_UUID, destMsvc))
  }

  const application = await ApplicationManager.findOne({ id: sourceMsvc.applicationId }, transaction)
  if (!application) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_ID, sourceMsvc.applicationId))
  }

  return RoutingService.createRouting({ application: application.name, from: sourceMsvc.name, to: destMsvc.name, name: `r-${sourceMsvc.name}-${destMsvc.name}` }, isCLI, transaction)
}

async function deleteRouteEndPoint (sourceMicroserviceUuid, destMicroserviceUuid, isCLI, transaction) {
  // Print deprecated warning

  const route = await RoutingManager.findOnePopulated({
    sourceMicroserviceUuid: sourceMicroserviceUuid,
    destMicroserviceUuid: destMicroserviceUuid
  }, transaction)
  if (!route) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.ROUTE_NOT_FOUND))
  }

  return RoutingService.deleteRouting(route.application.name, route.name, isCLI, transaction)
}

async function createPortMappingEndPoint (microserviceUuid, portMappingData, isCLI, transaction) {
  await Validator.validate(portMappingData, Validator.schemas.portsCreate)
  await _validateMicroserviceOnGet(microserviceUuid, transaction)
  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const agent = await FogManager.findOne({ uuid: microservice.iofogUuid }, transaction)
  if (!agent) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, microservice.iofogUuid))
  }
  await MicroservicePortService.validatePortMapping(agent, portMappingData, {}, transaction)

  return MicroservicePortService.createPortMapping(microservice, portMappingData, transaction)
}

async function createSystemPortMappingEndPoint (microserviceUuid, portMappingData, isCLI, transaction) {
  await Validator.validate(portMappingData, Validator.schemas.portsCreate)

  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const agent = await FogManager.findOne({ uuid: microservice.iofogUuid }, transaction)
  if (!agent) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, microservice.iofogUuid))
  }
  await MicroservicePortService.validatePortMapping(agent, portMappingData, {}, transaction)

  return MicroservicePortService.createPortMapping(microservice, portMappingData, transaction)
}

async function _createExtraHost (microservice, extraHostData, transaction) {
  const msExtraHostData = {
    ...extraHostData,
    microserviceUuid: microservice.uuid
  }

  await MicroserviceExtraHostManager.create(msExtraHostData, transaction)
}

async function _createEnv (microservice, envData, transaction) {
  if (!microservice.iofogUuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.REQUIRED_FOG_NODE))
  }

  const msEnvData = {
    key: envData.key,
    value: envData.value,
    microserviceUuid: microservice.uuid
  }

  // Handle valueFromSecret
  if (envData.valueFromSecret) {
    const [secretName, dataKey] = envData.valueFromSecret.split('/')
    if (!secretName || !dataKey) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_SECRET_REFERENCE, envData.valueFromSecret))
    }
    const secret = await SecretManager.getSecret(secretName, transaction)
    if (!secret) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SECRET_NOT_FOUND, secretName))
    }
    if (!secret.data[dataKey]) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SECRET_KEY_NOT_FOUND, dataKey, secretName))
    }
    // If it's a TLS secret, decode the base64 value
    if (secret.type === 'tls') {
      try {
        msEnvData.value = Buffer.from(secret.data[dataKey], 'base64').toString('utf-8')
      } catch (error) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_BASE64_VALUE, dataKey, secretName))
      }
    } else {
      msEnvData.value = secret.data[dataKey]
    }
    msEnvData.valueFromSecret = envData.valueFromSecret
  }

  // Handle valueFromConfigMap
  if (envData.valueFromConfigMap) {
    const [configMapName, dataKey] = envData.valueFromConfigMap.split('/')
    if (!configMapName || !dataKey) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_CONFIGMAP_REFERENCE, envData.valueFromConfigMap))
    }
    const configMap = await ConfigMapManager.getConfigMap(configMapName, transaction)
    if (!configMap) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_NOT_FOUND, configMapName))
    }
    if (!configMap.data[dataKey]) {
      throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_KEY_NOT_FOUND, dataKey, configMapName))
    }
    msEnvData.value = configMap.data[dataKey]
    msEnvData.valueFromConfigMap = envData.valueFromConfigMap
  }

  await MicroserviceEnvManager.create(msEnvData, transaction)
  await MicroservicePortService.switchOnUpdateFlagsForMicroservicesForPortMapping(microservice, transaction)
}

async function _createArg (microservice, arg, transaction) {
  if (!microservice.iofogUuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.REQUIRED_FOG_NODE))
  }

  const msArgData = {
    cmd: arg,
    microserviceUuid: microservice.uuid
  }

  await MicroserviceArgManager.create(msArgData, transaction)
  await MicroservicePortService.switchOnUpdateFlagsForMicroservicesForPortMapping(microservice, transaction)
}

async function _createCdiDevices (microservice, cdiDevices, transaction) {
  if (!microservice.iofogUuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.REQUIRED_FOG_NODE))
  }

  const msCdiDevicesData = {
    cdiDevices: cdiDevices,
    microserviceUuid: microservice.uuid
  }

  await MicroserviceCdiDevManager.create(msCdiDevicesData, transaction)
  await MicroservicePortService.switchOnUpdateFlagsForMicroservicesForPortMapping(microservice, transaction)
}

async function _createCapAdd (microservice, capAdd, transaction) {
  if (!microservice.iofogUuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.REQUIRED_FOG_NODE))
  }

  const msCapAddData = {
    capAdd: capAdd,
    microserviceUuid: microservice.uuid
  }

  await MicroserviceCapAddManager.create(msCapAddData, transaction)
  await MicroservicePortService.switchOnUpdateFlagsForMicroservicesForPortMapping(microservice, transaction)
}

async function _createCapDrop (microservice, capDrop, transaction) {
  if (!microservice.iofogUuid) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.REQUIRED_FOG_NODE))
  }

  const msCapDropData = {
    capDrop: capDrop,
    microserviceUuid: microservice.uuid
  }

  await MicroserviceCapDropManager.create(msCapDropData, transaction)
  await MicroservicePortService.switchOnUpdateFlagsForMicroservicesForPortMapping(microservice, transaction)
}

async function deletePortMappingEndPoint (microserviceUuid, internalPort, isCLI, transaction) {
  return MicroservicePortService.deletePortMapping(microserviceUuid, internalPort, isCLI, transaction)
}

async function deleteSystemPortMappingEndPoint (microserviceUuid, internalPort, isCLI, transaction) {
  return MicroservicePortService.deleteSystemPortMapping(microserviceUuid, internalPort, isCLI, transaction)
}

async function listPortMappingsEndPoint (microserviceUuid, isCLI, transaction) {
  return MicroservicePortService.listPortMappings(microserviceUuid, isCLI, transaction)
}

async function getReceiverMicroservices (microservice, transaction) {
  // 1. Get existing routes (app-level routing)
  const routes = await RoutingManager.findAll({ sourceMicroserviceUuid: microservice.uuid }, transaction)

  let receiverMicroservices = routes.map(route => route.destMicroserviceUuid)

  // 2. Check if the microservice has pubTags and fetch microservices associated with those tags
  if (microservice.pubTags) {
    for (const tag of microservice.pubTags) {
      try {
        const where = {
          delete: false,
          '$subTags.value$': tag.value
        }
        // Get microservices for the given pubTag
        const response = await MicroserviceManager.findAllExcludeFields(where, transaction, { attributes: ['uuid'] })
        if (response.length > 0) {
          const tagMicroservices = response.map(ms => ms.uuid)
          // Add the microservices' UUIDs to the receiver list (filtering duplicates and removing the current microservice's UUID)
          receiverMicroservices = [
            ...new Set([
              ...receiverMicroservices,
              ...tagMicroservices.filter(uuid => uuid !== microservice.uuid) // Remove the current microservice's UUID
            ])
          ]
        }
      } catch (error) {
        logger.error(`Checking microservices for pubTag "${tag.value}":`, error.message)
      }
    }
  }
  return receiverMicroservices
}

async function isMicroserviceConsumer (microservice, transaction) {
  // Step 1: App-level routing check
  const routes = await RoutingManager.findAll({ destMicroserviceUuid: microservice.uuid }, transaction)

  if (routes.length > 0) {
    return true
  }

  // Step 2: Subtag-based routing check
  if (microservice.subTags) {
    for (const tag of microservice.subTags) {
      try {
        const where = {
          delete: false,
          '$pubTags.value$': tag.value
        }
        const result = await MicroserviceManager.findAllExcludeFields(where, transaction, { attributes: ['uuid'] })

        if (result.length > 0) {
          return true
        }
      } catch (error) {
        logger.error(`Checking microservices for subTag "${tag.value}":`, error.message)
      }
    }
  }
  return false
}

async function isMicroserviceRouter (microservice, transaction) {
  if (microservice.name === `router-${microservice.iofogUuid.toLowerCase()}`) {
    const app = await ApplicationManager.findOne({ id: microservice.applicationId }, transaction)
    if (app.isSystem === true) {
      return true
    }
  }
  return false
}

async function createVolumeMappingEndPoint (microserviceUuid, volumeMappingData, isCLI, transaction) {
  await Validator.validate(volumeMappingData, Validator.schemas.volumeMappings)

  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findMicroserviceOnGet(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const type = volumeMappingData.type || VOLUME_MAPPING_DEFAULT

  const volumeMapping = await VolumeMappingManager.findOne({
    microserviceUuid: microserviceUuid,
    hostDestination: volumeMappingData.hostDestination,
    containerDestination: volumeMappingData.containerDestination,
    type
  }, transaction)
  if (volumeMapping) {
    throw new Errors.ValidationError(ErrorMessages.VOLUME_MAPPING_ALREADY_EXISTS)
  }

  _validateVolumeMappings([volumeMappingData])

  const volumeMappingObj = {
    microserviceUuid: microserviceUuid,
    hostDestination: volumeMappingData.hostDestination,
    containerDestination: volumeMappingData.containerDestination,
    accessMode: volumeMappingData.accessMode,
    type
  }

  return VolumeMappingManager.create(volumeMappingObj, transaction)
}

async function createSystemVolumeMappingEndPoint (microserviceUuid, volumeMappingData, isCLI, transaction) {
  await Validator.validate(volumeMappingData, Validator.schemas.volumeMappings)

  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const type = volumeMappingData.type || VOLUME_MAPPING_DEFAULT

  const volumeMapping = await VolumeMappingManager.findOne({
    microserviceUuid: microserviceUuid,
    hostDestination: volumeMappingData.hostDestination,
    containerDestination: volumeMappingData.containerDestination,
    type
  }, transaction)
  if (volumeMapping) {
    throw new Errors.ValidationError(ErrorMessages.VOLUME_MAPPING_ALREADY_EXISTS)
  }

  _validateVolumeMappings([volumeMappingData])

  const volumeMappingObj = {
    microserviceUuid: microserviceUuid,
    hostDestination: volumeMappingData.hostDestination,
    containerDestination: volumeMappingData.containerDestination,
    accessMode: volumeMappingData.accessMode,
    type
  }

  return VolumeMappingManager.create(volumeMappingObj, transaction)
}

async function deleteVolumeMappingEndPoint (microserviceUuid, volumeMappingUuid, isCLI, transaction) {
  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const volumeMappingWhere = {
    uuid: volumeMappingUuid,
    microserviceUuid: microserviceUuid
  }

  const affectedRows = await VolumeMappingManager.delete(volumeMappingWhere, transaction)
  if (affectedRows === 0) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_VOLUME_MAPPING_UUID, volumeMappingUuid))
  }
}

async function deleteSystemVolumeMappingEndPoint (microserviceUuid, volumeMappingUuid, isCLI, transaction) {
  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }

  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const volumeMappingWhere = {
    uuid: volumeMappingUuid,
    microserviceUuid: microserviceUuid
  }

  const affectedRows = await VolumeMappingManager.delete(volumeMappingWhere, transaction)
  if (affectedRows === 0) {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_VOLUME_MAPPING_UUID, volumeMappingUuid))
  }
}

async function listVolumeMappingsEndPoint (microserviceUuid, isCLI, transaction) {
  const where = isCLI
    ? { uuid: microserviceUuid }
    : { uuid: microserviceUuid }
  const microservice = await MicroserviceManager.findOne(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_MICROSERVICE_UUID, microserviceUuid))
  }

  const volumeMappingWhere = {
    microserviceUuid: microserviceUuid
  }
  return VolumeMappingManager.findAll(volumeMappingWhere, transaction)
}

// this function works with escape and unescape config, in case of unescaped config, the first split will not work,
// but the second will work
function _validateMicroserviceConfig (config) {
  let result
  if (config) {
    result = config.split('\\"').join('"').split('"').join('\"') // eslint-disable-line no-useless-escape
  }
  return result
}

function _validateMicroserviceAnnotations (annotations) {
  let result
  if (annotations) {
    result = annotations.split('\\"').join('"').split('"').join('\"') // eslint-disable-line no-useless-escape
  }
  return result
}

async function _createMicroservice (microserviceData, isCLI, transaction) {
  const config = _validateMicroserviceConfig(microserviceData.config)
  const annotations = _validateMicroserviceAnnotations(microserviceData.annotations)

  let newMicroservice = {
    uuid: AppHelper.generateUUID(),
    name: microserviceData.name,
    config: config,
    annotations: annotations,
    catalogItemId: microserviceData.catalogItemId,
    iofogUuid: microserviceData.iofogUuid,
    rootHostAccess: microserviceData.rootHostAccess,
    pidMode: microserviceData.pidMode,
    ipcMode: microserviceData.ipcMode,
    cdiDevices: microserviceData.cdiDevices,
    capAdd: microserviceData.capAdd,
    capDrop: microserviceData.capDrop,
    runAsUser: microserviceData.runAsUser,
    platform: microserviceData.platform,
    runtime: microserviceData.runtime,
    registryId: microserviceData.registryId || 1,
    logSize: (microserviceData.logSize || constants.MICROSERVICE_DEFAULT_LOG_SIZE) * 1
  }

  newMicroservice = AppHelper.deleteUndefinedFields(newMicroservice)

  if (newMicroservice.registryId) {
    const registry = await RegistryManager.findOne({ id: newMicroservice.registryId }, transaction)
    if (!registry) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_REGISTRY_ID, newMicroservice.registryId))
    }
  }

  // validate application
  const application = await _validateApplication(microserviceData.application, isCLI, transaction)
  newMicroservice.applicationId = application.id

  await _checkForDuplicateName(newMicroservice.name, {}, newMicroservice.applicationId, transaction)

  // validate fog node
  if (newMicroservice.iofogUuid) {
    const fog = await FogManager.findOne({ uuid: newMicroservice.iofogUuid }, transaction)
    if (!fog || fog.length === 0) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, newMicroservice.iofogUuid))
    }
  }

  return MicroserviceManager.create(newMicroservice, transaction)
}

async function _validateApplication (name, isCLI, transaction) {
  if (!name) {
    return null
  }

  // Force name conversion to string for PG
  const where = isCLI
    ? { name: name.toString(), isSystem: false }
    : { name: name.toString(), isSystem: false }

  const application = await ApplicationManager.findOne(where, transaction)
  if (!application) {
    // Try with id
    const where = isCLI
      ? { id: name, isSystem: false }
      : { id: name, isSystem: false }

    const application = await ApplicationManager.findOne(where, transaction)
    if (!application) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_ID, name))
    }
    return application
  }
  return application
}

async function _createMicroserviceStatus (microservice, transaction) {
  return MicroserviceStatusManager.create({
    microserviceUuid: microservice.uuid
  }, transaction)
}

async function _createMicroserviceImages (microservice, images, transaction) {
  const newImages = []
  for (const img of images) {
    const newImg = Object.assign({}, img)
    newImg.microserviceUuid = microservice.uuid
    newImages.push(newImg)
  }
  return CatalogItemImageManager.bulkCreate(newImages, transaction)
}

async function _createVolumeMappings (microservice, volumeMappings, transaction) {
  const mappings = []
  for (const volumeMapping of volumeMappings) {
    const mapping = Object.assign({}, volumeMapping)
    mapping.microserviceUuid = microservice.uuid
    mappings.push(mapping)
  }

  await VolumeMappingManager.bulkCreate(mappings, transaction)
}

async function _updateVolumeMappings (volumeMappings, microserviceUuid, transaction) {
  _validateVolumeMappings(volumeMappings)

  await VolumeMappingManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)

  for (const volumeMapping of volumeMappings) {
    const type = volumeMapping.type || VOLUME_MAPPING_DEFAULT
    const volumeMappingObj = {
      microserviceUuid: microserviceUuid,
      hostDestination: volumeMapping.hostDestination,
      containerDestination: volumeMapping.containerDestination,
      accessMode: volumeMapping.accessMode,
      type
    }

    await VolumeMappingManager.create(volumeMappingObj, transaction)
  }
}

async function _updateImages (images, microserviceUuid, transaction) {
  await CatalogItemImageManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  return _createMicroserviceImages({ uuid: microserviceUuid }, images, transaction)
}

async function _deleteImages (microserviceUuid, transaction) {
  await CatalogItemImageManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
}

async function _updateExtraHosts (extraHosts, microserviceUuid, transaction) {
  await MicroserviceExtraHostManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const extraHost of extraHosts) {
    await _createExtraHost({ uuid: microserviceUuid }, extraHost, transaction)
  }
}

async function _updateEnv (env, microserviceUuid, transaction) {
  await MicroserviceEnvManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const envData of env) {
    const envObj = {
      microserviceUuid: microserviceUuid,
      key: envData.key,
      value: envData.value
    }

    // Handle valueFromSecret
    if (envData.valueFromSecret) {
      const [secretName, dataKey] = envData.valueFromSecret.split('/')
      if (!secretName || !dataKey) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_SECRET_REFERENCE, envData.valueFromSecret))
      }
      const secret = await SecretManager.getSecret(secretName, transaction)
      if (!secret) {
        throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.SECRET_NOT_FOUND, secretName))
      }
      if (!secret.data[dataKey]) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SECRET_KEY_NOT_FOUND, dataKey, secretName))
      }
      // If it's a TLS secret, decode the base64 value
      if (secret.type === 'tls') {
        try {
          envObj.value = Buffer.from(secret.data[dataKey], 'base64').toString('utf-8')
        } catch (error) {
          throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_BASE64_VALUE, dataKey, secretName))
        }
      } else {
        envObj.value = secret.data[dataKey]
      }
      envObj.valueFromSecret = envData.valueFromSecret
    }

    // Handle valueFromConfigMap
    if (envData.valueFromConfigMap) {
      const [configMapName, dataKey] = envData.valueFromConfigMap.split('/')
      if (!configMapName || !dataKey) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_CONFIGMAP_REFERENCE, envData.valueFromConfigMap))
      }
      const configMap = await ConfigMapManager.getConfigMap(configMapName, transaction)
      if (!configMap) {
        throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_NOT_FOUND, configMapName))
      }
      if (!configMap.data[dataKey]) {
        throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.CONFIGMAP_KEY_NOT_FOUND, dataKey, configMapName))
      }
      envObj.value = configMap.data[dataKey]
      envObj.valueFromConfigMap = envData.valueFromConfigMap
    }

    await MicroserviceEnvManager.create(envObj, transaction)
  }
}

async function _updateArg (arg, microserviceUuid, transaction) {
  await MicroserviceArgManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const argData of arg) {
    const envObj = {
      microserviceUuid: microserviceUuid,
      cmd: argData
    }

    await MicroserviceArgManager.create(envObj, transaction)
  }
}

async function _updateCdiDevices (cdiDevices, microserviceUuid, transaction) {
  await MicroserviceCdiDevManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const cdiDevicesData of cdiDevices) {
    const envObj = {
      microserviceUuid: microserviceUuid,
      cdiDevices: cdiDevicesData
    }

    await MicroserviceCdiDevManager.create(envObj, transaction)
  }
}

async function _updateCapAdd (capAdd, microserviceUuid, transaction) {
  await MicroserviceCapAddManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const capAddData of capAdd) {
    const envObj = {
      microserviceUuid: microserviceUuid,
      capAdd: capAddData
    }

    await MicroserviceCapAddManager.create(envObj, transaction)
  }
}

async function _updateCapDrop (capDrop, microserviceUuid, transaction) {
  await MicroserviceCapDropManager.delete({
    microserviceUuid: microserviceUuid
  }, transaction)
  for (const capDropData of capDrop) {
    const envObj = {
      microserviceUuid: microserviceUuid,
      capDrop: capDropData
    }

    await MicroserviceCapDropManager.create(envObj, transaction)
  }
}

async function _updatePorts (newPortMappings, microservice, transaction) {
  await MicroservicePortService.deletePortMappings(microservice, transaction)
  for (const portMapping of newPortMappings) {
    await createPortMappingEndPoint(microservice.uuid, portMapping, false, transaction)
  }
}

async function _updateSystemPorts (newPortMappings, microservice, transaction) {
  await MicroservicePortService.deletePortMappings(microservice, transaction)
  for (const portMapping of newPortMappings) {
    await createSystemPortMappingEndPoint(microservice.uuid, portMapping, false, transaction)
  }
}

async function _updateChangeTracking (configUpdated, fogNodeUuid, transaction) {
  if (configUpdated) {
    await ChangeTrackingService.update(fogNodeUuid, ChangeTrackingService.events.microserviceCommon, transaction)
  } else {
    await ChangeTrackingService.update(fogNodeUuid, ChangeTrackingService.events.microserviceList, transaction)
  }
}

async function _checkForDuplicateName (name, item, applicationId, transaction) {
  if (name) {
    const where = item.id
      ? {
        name: name,
        uuid: { [Op.ne]: item.id },
        delete: false,
        applicationId
      }
      : {
        name: name,
        applicationId,
        delete: false
      }

    const result = await MicroserviceManager.findOne(where, transaction)
    if (result) {
      throw new Errors.DuplicatePropertyError(AppHelper.formatMessage(ErrorMessages.DUPLICATE_NAME, name))
    }
  }
}

async function _validateMicroserviceOnGet (microserviceUuid, transaction) {
  const where = {
    uuid: microserviceUuid
  }
  const microservice = await MicroserviceManager.findMicroserviceOnGet(where, transaction)
  if (!microservice) {
    throw new Errors.NotFoundError(ErrorMessages.INVALID_MICROSERVICE_USER)
  }
}

async function _getLogicalRoutesByMicroservice (microserviceUuid, transaction) {
  const res = []
  const query = {
    [Op.or]:
      [
        {
          sourceMicroserviceUuid: microserviceUuid
        },
        {
          destMicroserviceUuid: microserviceUuid
        }
      ]
  }
  const routes = await RoutingManager.findAllPopulated(query, transaction)
  for (const route of routes) {
    if (route.sourceMicroserviceUuid && route.destMicroserviceUuid) {
      res.push(route)
    }
  }
  return res
}

async function deleteMicroserviceWithRoutesAndPortMappings (microservice, transaction) {
  const routes = await _getLogicalRoutesByMicroservice(microservice.uuid, transaction)
  for (const route of routes) {
    await RoutingService.deleteRouting(route.application.name, route.name, false, transaction)
  }

  await MicroservicePortService.deletePortMappings(microservice, transaction)

  await MicroserviceManager.delete({
    uuid: microservice.uuid
  }, transaction)
}

async function _buildGetMicroserviceResponse (microservice, transaction) {
  const microserviceUuid = microservice.uuid

  // get additional data
  const portMappings = await MicroservicePortService.getPortMappings(microserviceUuid, transaction)
  const application = await ApplicationManager.findOne({ id: microservice.applicationId }, transaction)
  const extraHosts = await MicroserviceExtraHostManager.findAll({ microserviceUuid: microserviceUuid }, transaction)
  const images = await CatalogItemImageManager.findAll({ microserviceUuid: microserviceUuid }, transaction)
  const volumeMappings = await VolumeMappingManager.findAll({ microserviceUuid: microserviceUuid }, transaction)
  const routes = await getReceiverMicroservices(microservice, transaction)
  const env = await MicroserviceEnvManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  const cmd = await MicroserviceArgManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  const arg = cmd.map((it) => it.cmd)
  const cdiDevices = await MicroserviceCdiDevManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  const cdiDevs = cdiDevices.map((it) => it.cdiDevices)
  const capAdd = await MicroserviceCapAddManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  const capAdds = capAdd.map((it) => it.capAdd)
  const capDrop = await MicroserviceCapDropManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  const capDrops = capDrop.map((it) => it.capDrop)
  const pubTags = microservice.pubTags ? microservice.pubTags.map(t => t.value) : []
  const subTags = microservice.subTags ? microservice.subTags.map(t => t.value) : []
  const status = await MicroserviceStatusManager.findAllExcludeFields({ microserviceUuid: microserviceUuid }, transaction)
  // build microservice response
  const res = Object.assign({}, microservice)
  res.ports = []
  for (const pm of portMappings) {
    const mapping = { internal: pm.portInternal, external: pm.portExternal, protocol: pm.isUdp ? 'udp' : 'tcp' }
    // await MicroservicePortService.buildPublicPortMapping(pm, mapping, transaction)
    res.ports.push(mapping)
  }
  res.volumeMappings = volumeMappings.map((vm) => vm.dataValues)
  res.routes = routes
  res.env = env
  res.cmd = arg
  res.cdiDevices = cdiDevs
  res.capAdd = capAdds
  res.capDrop = capDrops
  res.extraHosts = extraHosts.map(eH => ({ name: eH.name, address: eH.template, value: eH.value }))
  res.images = images.map(i => ({ containerImage: i.containerImage, fogTypeId: i.fogTypeId }))
  if (status && status.length) {
    res.status = status[0]
  }
  res.pubTags = pubTags
  res.subTags = subTags

  res.logSize *= 1

  res.application = (application || { name: '' }).name

  // API retrocompatibility
  res.flowId = res.applicationId

  return res
}

async function listMicroserviceByPubTagEndPoint (pubTag, transaction) {
  const where = {
    delete: false,
    '$pubTags.value$': pubTag
  }

  const microservices = await MicroserviceManager.findAllExcludeFields(where, transaction)

  const res = await Promise.all(microservices.map(async (microservice) => {
    return _buildGetMicroserviceResponse(microservice.dataValues, transaction)
  }))

  return {
    microservices: res
  }
}

async function listMicroserviceBySubTagEndPoint (subTag, transaction) {
  const where = {
    delete: false,
    '$subTags.value$': subTag
  }

  const microservices = await MicroserviceManager.findAllExcludeFields(where, transaction)

  const res = await Promise.all(microservices.map(async (microservice) => {
    return _buildGetMicroserviceResponse(microservice.dataValues, transaction)
  }))

  return {
    microservices: res
  }
}

async function createExecEndPoint (microserviceUuid, transaction) {
  const microservice = await MicroserviceManager.findOneWithCategory({ uuid: microserviceUuid }, transaction)
  if (microservice.catalogItem && microservice.catalogItem.category === 'SYSTEM') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  }
  if (!microservice) {
    throw new Errors.NotFoundError(ErrorMessages.INVALID_MICROSERVICE_USER)
  }

  await MicroserviceManager.update({ uuid: microservice.uuid }, { execEnabled: true }, transaction)
  await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceExecSessions, transaction)

  const updatedMicroservice = await MicroserviceManager.findOneWithCategory({ uuid: microservice.uuid }, transaction)

  return {
    uuid: microservice.uuid,
    execEnabled: updatedMicroservice.execEnabled
  }
}

async function deleteExecEndPoint (microserviceUuid, transaction) {
  const microservice = await MicroserviceManager.findOneWithCategory({ uuid: microserviceUuid }, transaction)
  if (microservice.catalogItem && microservice.catalogItem.category === 'SYSTEM') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  }
  if (!microservice) {
    throw new Errors.NotFoundError(ErrorMessages.INVALID_MICROSERVICE_USER)
  }

  await MicroserviceManager.update({ uuid: microservice.uuid }, { execEnabled: false }, transaction)
  await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceExecSessions, transaction)

  const updatedMicroservice = await MicroserviceManager.findOneWithCategory({ uuid: microservice.uuid }, transaction)

  return {
    uuid: microservice.uuid,
    execEnabled: updatedMicroservice.execEnabled
  }
}

async function createSystemExecEndPoint (microserviceUuid, isCLI, transaction) {
  const microservice = await MicroserviceManager.findOneWithCategory({ uuid: microserviceUuid }, transaction)
  // if (microservice.catalogItem && microservice.catalogItem.category !== 'SYSTEM') {
  //   throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  // }
  if (!microservice) {
    throw new Errors.NotFoundError(ErrorMessages.INVALID_MICROSERVICE_USER)
  }
  await MicroserviceManager.update({ uuid: microservice.uuid }, { execEnabled: true }, transaction)
  await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceExecSessions, transaction)

  const updatedMicroservice = await MicroserviceManager.findOneWithCategory({ uuid: microservice.uuid }, transaction)

  return {
    uuid: microservice.uuid,
    execEnabled: updatedMicroservice.execEnabled
  }
}

async function deleteSystemExecEndPoint (microserviceUuid, isCLI, transaction) {
  const microservice = await MicroserviceManager.findOneWithCategory({ uuid: microserviceUuid }, transaction)
  // if (microservice.catalogItem && microservice.catalogItem.category !== 'SYSTEM') {
  //   throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.SYSTEM_MICROSERVICE_UPDATE, microserviceUuid))
  // }
  if (!microservice) {
    throw new Errors.NotFoundError(ErrorMessages.INVALID_MICROSERVICE_USER)
  }

  await MicroserviceManager.update({ uuid: microservice.uuid }, { execEnabled: false }, transaction)
  await ChangeTrackingService.update(microservice.iofogUuid, ChangeTrackingService.events.microserviceExecSessions, transaction)

  const updatedMicroservice = await MicroserviceManager.findOneWithCategory({ uuid: microservice.uuid }, transaction)

  return {
    uuid: microservice.uuid,
    execEnabled: updatedMicroservice.execEnabled
  }
}

module.exports = {
  createMicroserviceEndPoint: TransactionDecorator.generateTransaction(createMicroserviceEndPoint),
  createPortMappingEndPoint: TransactionDecorator.generateTransaction(createPortMappingEndPoint),
  createSystemPortMappingEndPoint: TransactionDecorator.generateTransaction(createSystemPortMappingEndPoint),
  createRouteEndPoint: TransactionDecorator.generateTransaction(createRouteEndPoint),
  createVolumeMappingEndPoint: TransactionDecorator.generateTransaction(createVolumeMappingEndPoint),
  createSystemVolumeMappingEndPoint: TransactionDecorator.generateTransaction(createSystemVolumeMappingEndPoint),
  deleteMicroserviceEndPoint: TransactionDecorator.generateTransaction(deleteMicroserviceEndPoint),
  deleteMicroserviceWithRoutesAndPortMappings: deleteMicroserviceWithRoutesAndPortMappings,
  deleteNotRunningMicroservices: deleteNotRunningMicroservices,
  deletePortMappingEndPoint: TransactionDecorator.generateTransaction(deletePortMappingEndPoint),
  deleteSystemPortMappingEndPoint: TransactionDecorator.generateTransaction(deleteSystemPortMappingEndPoint),
  deleteRouteEndPoint: TransactionDecorator.generateTransaction(deleteRouteEndPoint),
  deleteVolumeMappingEndPoint: TransactionDecorator.generateTransaction(deleteVolumeMappingEndPoint),
  deleteSystemVolumeMappingEndPoint: TransactionDecorator.generateTransaction(deleteSystemVolumeMappingEndPoint),
  getMicroserviceEndPoint: TransactionDecorator.generateTransaction(getMicroserviceEndPoint),
  getReceiverMicroservices,
  isMicroserviceConsumer,
  isMicroserviceRouter,
  listMicroservicePortMappingsEndPoint: TransactionDecorator.generateTransaction(listPortMappingsEndPoint),
  listMicroservicesEndPoint: TransactionDecorator.generateTransaction(listMicroservicesEndPoint),
  listVolumeMappingsEndPoint: TransactionDecorator.generateTransaction(listVolumeMappingsEndPoint),
  updateMicroserviceEndPoint: TransactionDecorator.generateTransaction(updateMicroserviceEndPoint),
  updateSystemMicroserviceEndPoint: TransactionDecorator.generateTransaction(updateSystemMicroserviceEndPoint),
  rebuildMicroserviceEndPoint: TransactionDecorator.generateTransaction(rebuildMicroserviceEndPoint),
  rebuildSystemMicroserviceEndPoint: TransactionDecorator.generateTransaction(rebuildSystemMicroserviceEndPoint),
  buildGetMicroserviceResponse: _buildGetMicroserviceResponse,
  updateChangeTracking: _updateChangeTracking,
  listMicroserviceByPubTagEndPoint: TransactionDecorator.generateTransaction(listMicroserviceByPubTagEndPoint),
  listMicroserviceBySubTagEndPoint: TransactionDecorator.generateTransaction(listMicroserviceBySubTagEndPoint),
  createExecEndPoint: TransactionDecorator.generateTransaction(createExecEndPoint),
  deleteExecEndPoint: TransactionDecorator.generateTransaction(deleteExecEndPoint),
  createSystemExecEndPoint: TransactionDecorator.generateTransaction(createSystemExecEndPoint),
  deleteSystemExecEndPoint: TransactionDecorator.generateTransaction(deleteSystemExecEndPoint)
}
