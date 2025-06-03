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

const config = require('../config')
const fs = require('fs')
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
const CertificateService = require('./certificate-service')
const logger = require('../logger')
const ServiceManager = require('../data/managers/service-manager')
const FogStates = require('../enums/fog-state')

const SITE_CA_CERT = 'pot-site-ca'
const DEFAULT_ROUTER_LOCAL_CA = 'default-router-local-ca'
const SERVICE_ANNOTATION_TAG = 'service.datasance.com/tag'

async function checkKubernetesEnvironment () {
  const controlPlane = process.env.CONTROL_PLANE || config.get('app.ControlPlane')
  return controlPlane && controlPlane.toLowerCase() === 'kubernetes'
}

async function getLocalCertificateHosts (isKubernetes, namespace) {
  if (isKubernetes) {
    return `router-local,router-local.${namespace},router-local.${namespace}.svc.cluster.local`
  }
  return '127.0.0.1,localhost,host.docker.internal,host.containers.internal'
}

async function getSiteCertificateHosts (fogData, transaction) {
  const hosts = new Set()
  // Add existing hosts if isSystem
  if (fogData.isSystem) {
    if (fogData.host) hosts.add(fogData.host)
    if (fogData.ipAddress) hosts.add(fogData.ipAddress)
    if (fogData.ipAddressExternal) hosts.add(fogData.ipAddressExternal)
  }
  // Add default router host if not system
  if (!fogData.isSystem) {
    const defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)
    if (defaultRouter.host) hosts.add(defaultRouter.host)
  }
  // Add upstream router hosts
  // const upstreamRouters = (fogData.upstreamRouters || []).filter(uuid => uuid !== 'default-router')
  // if (upstreamRouters.length) {
  //   for (const uuid of upstreamRouters) {
  //     const routerHost = await FogManager.findOne({ uuid: uuid }, transaction)
  //     if (routerHost.host) hosts.add(routerHost.host)
  //     if (routerHost.ipAddress) hosts.add(routerHost.ipAddress)
  //   }
  // }
  return Array.from(hosts).join(',') || 'localhost'
}

async function _handleRouterCertificates (fogData, uuid, isRouterModeChanged, transaction) {
  logger.debug('Starting _handleRouterCertificates for fog: ' + JSON.stringify({ uuid: uuid, host: fogData.host }))

  // Check if we're in Kubernetes environment
  const isKubernetes = await checkKubernetesEnvironment()
  const namespace = isKubernetes ? process.env.CONTROLLER_NAMESPACE : null

  // Helper to check CA existence
  async function ensureCA (name, subject) {
    logger.debug('Checking CA existence: ' + JSON.stringify({ name, subject }))
    try {
      await CertificateService.getCAEndpoint(name, transaction)
      logger.debug('CA already exists: ' + name)
      // CA exists
    } catch (err) {
      if (err.name === 'NotFoundError') {
        logger.debug('CA not found, creating new CA: ' + JSON.stringify({ name, subject }))
        await CertificateService.createCAEndpoint({
          name,
          subject: `${subject}`,
          expiration: 60, // months
          type: 'self-signed'
        }, transaction)
        logger.debug('Successfully created CA: ' + name)
      } else if (err.name === 'ConflictError') {
        logger.debug('CA already exists (conflict): ' + name)
        // Already exists, ignore
      } else {
        logger.error('Error in ensureCA - Name: ' + name + ', Subject: ' + subject + ', Error: ' + err.message + ', Type: ' + err.name + ', Code: ' + err.code)
        logger.error('Stack trace: ' + err.stack)
        throw err
      }
    }
  }

  // Helper to check cert existence
  async function ensureCert (name, subject, hosts, ca, shouldRecreate = false) {
    logger.debug('Checking certificate existence: ' + JSON.stringify({ name, subject, hosts, ca }))
    try {
      const existingCert = await CertificateService.getCertificateEndpoint(name, transaction)
      if (shouldRecreate && existingCert) {
        logger.debug('Certificate exists and needs recreation: ' + name)
        await CertificateService.deleteCertificateEndpoint(name, transaction)
        logger.debug('Deleted existing certificate: ' + name)
        // Create new certificate
        await CertificateService.createCertificateEndpoint({
          name,
          subject: `${subject}`,
          hosts,
          ca
        }, transaction)
        logger.debug('Successfully recreated certificate: ' + name)
      } else if (!existingCert) {
        logger.debug('Certificate not found, creating new certificate: ' + JSON.stringify({ name, subject, hosts, ca }))
        await CertificateService.createCertificateEndpoint({
          name,
          subject: `${subject}`,
          hosts,
          ca
        }, transaction)
        logger.debug('Successfully created certificate: ' + name)
      } else {
        logger.debug('Certificate already exists: ' + name)
      }
    } catch (err) {
      if (err.name === 'NotFoundError') {
        logger.debug('Certificate not found, creating new certificate: ' + JSON.stringify({ name, subject, hosts, ca }))
        await CertificateService.createCertificateEndpoint({
          name,
          subject: `${subject}`,
          hosts,
          ca
        }, transaction)
        logger.debug('Successfully created certificate: ' + name)
      } else if (err.name === 'ConflictError') {
        logger.debug('Certificate already exists (conflict): ' + name)
        // Already exists, ignore
      } else {
        logger.error('Error in ensureCert - Name: ' + name + ', Subject: ' + subject + ', Hosts: ' + hosts + ', CA: ' + JSON.stringify(ca) + ', Error: ' + err.message + ', Type: ' + err.name + ', Code: ' + err.code)
        logger.error('Stack trace: ' + err.stack)
        throw err
      }
    }
  }

  try {
    // Always ensure SITE_CA_CERT exists
    logger.debug('Ensuring SITE_CA_CERT exists')
    await ensureCA(SITE_CA_CERT, SITE_CA_CERT)

    // If routerMode is 'none', only ensure DEFAULT_ROUTER_LOCAL_CA and its signed certificate
    if (fogData.routerMode === 'none') {
      logger.debug('Router mode is none, ensuring DEFAULT_ROUTER_LOCAL_CA exists')
      await ensureCA(DEFAULT_ROUTER_LOCAL_CA, DEFAULT_ROUTER_LOCAL_CA)
      logger.debug('Ensuring local-agent certificate signed by DEFAULT_ROUTER_LOCAL_CA')
      const localHosts = await getLocalCertificateHosts(isKubernetes, namespace)
      await ensureCert(
        `${uuid}-local-agent`,
        `${uuid}-local-agent`,
        localHosts,
        { type: 'direct', secretName: DEFAULT_ROUTER_LOCAL_CA },
        isRouterModeChanged
      )
      logger.debug('Successfully completed _handleRouterCertificates for routerMode none')
      return
    }

    // For other router modes, ensure all other certificates
    // Always ensure site-server cert exists
    logger.debug('Ensuring site-server certificate exists')
    const siteHosts = await getSiteCertificateHosts(fogData, transaction)
    await ensureCert(
      `${uuid}-site-server`,
      `${uuid}-site-server`,
      siteHosts,
      { type: 'direct', secretName: SITE_CA_CERT },
      false
    )

    // Always ensure local-ca exists
    logger.debug('Ensuring local-ca exists')
    await ensureCA(`${uuid}-local-ca`, `${uuid}-local-ca`)

    // Always ensure local-server cert exists
    logger.debug('Ensuring local-server certificate exists')
    const localHosts = await getLocalCertificateHosts(isKubernetes, namespace)
    await ensureCert(
      `${uuid}-local-server`,
      `${uuid}-local-server`,
      localHosts,
      { type: 'direct', secretName: `${uuid}-local-ca` },
      isRouterModeChanged
    )

    // Always ensure local-agent cert exists
    logger.debug('Ensuring local-agent certificate exists')
    await ensureCert(
      `${uuid}-local-agent`,
      `${uuid}-local-agent`,
      localHosts,
      { type: 'direct', secretName: `${uuid}-local-ca` },
      isRouterModeChanged
    )

    logger.debug('Successfully completed _handleRouterCertificates')
  } catch (error) {
    logger.error('Certificate operation failed - UUID: ' + uuid + ', RouterMode: ' + fogData.routerMode + ', Error: ' + error.message + ', Type: ' + error.name + ', Code: ' + error.code)
    logger.error('Stack trace: ' + error.stack)
  }
}

async function createFogEndPoint (fogData, isCLI, transaction) {
  await Validator.validate(fogData, Validator.schemas.iofogCreate)

  let createFogData = {
    uuid: AppHelper.generateUUID(),
    name: fogData.name,
    location: fogData.location,
    latitude: fogData.latitude,
    longitude: fogData.longitude,
    gpsMode: fogData.latitude || fogData.longitude ? 'manual' : undefined,
    description: fogData.description,
    networkInterface: fogData.networkInterface,
    dockerUrl: fogData.dockerUrl,
    containerEngine: fogData.containerEngine,
    deploymentType: fogData.deploymentType,
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

  // Set tags (synchronously, as this is a simple DB op)
  await _setTags(fog, fogData.tags, transaction)

  // Return fog UUID immediately
  const res = { uuid: fog.uuid }

  // Start background orchestration
  setImmediate(() => {
    (async () => {
      try {
        // --- Begin orchestration logic (previously inside runWithRetries) ---
        await _handleRouterCertificates(fogData, createFogData.uuid, false, transaction)

        if (fogData.routerMode !== 'none') {
          if (!fogData.host && !isCLI) {
            throw new Errors.ValidationError(ErrorMessages.HOST_IS_REQUIRED)
          }
          await RouterService.createRouterForFog(fogData, fog.uuid, upstreamRouters)

          // Service Distribution Logic
          const serviceTags = await _extractServiceTags(fogData.tags)
          if (serviceTags.length > 0) {
            const services = await _findMatchingServices(serviceTags, transaction)
            if (services.length > 0) {
              const routerName = `router-${fog.uuid.toLowerCase()}`
              const routerMicroservice = await MicroserviceManager.findOne({ name: routerName }, transaction)
              if (!routerMicroservice) {
                throw new Errors.NotFoundError(`Router microservice not found: ${routerName}`)
              }
              let config = JSON.parse(routerMicroservice.config || '{}')
              for (const service of services) {
                const listenerConfig = _buildTcpListenerForFog(service, fog.uuid)
                config = _mergeTcpListener(config, listenerConfig)
              }
              await MicroserviceManager.update(
                { uuid: routerMicroservice.uuid },
                { config: JSON.stringify(config) },
                transaction
              )
              await ChangeTrackingService.update(fog.uuid, ChangeTrackingService.events.microserviceConfig, transaction)
            }
          }
        }

        await ChangeTrackingService.create(fog.uuid, transaction)
        if (fogData.abstractedHardwareEnabled) {
          await _createHalMicroserviceForFog(fog, null, transaction)
        }
        if (fogData.bluetoothEnabled) {
          await _createBluetoothMicroserviceForFog(fog, null, transaction)
        }
        await ChangeTrackingService.update(createFogData.uuid, ChangeTrackingService.events.microserviceCommon, transaction)
        // --- End orchestration logic ---
        // Set fog node as healthy
        await FogManager.update({ uuid: fog.uuid }, { warningMessage: 'HEALTHY' }, transaction)
      } catch (err) {
        logger.error('Background orchestration failed in createFogEndPoint:', err)
        // Set fog node as warning with error message
        await FogManager.update(
          { uuid: fog.uuid },
          {
            daemonStatus: FogStates.WARNING,
            warningMessage: `Background orchestration error: ${err.message}`
          },
          transaction
        )
      }
    })()
  })

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
    containerEngine: fogData.containerEngine,
    deploymentType: fogData.deploymentType,
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

  // Get all router config informations
  const router = await oldFog.getRouter()
  const host = fogData.host || lget(router, 'host')
  const upstreamRoutersConnections = router ? (await RouterConnectionManager.findAllWithRouters({ sourceRouter: router.id }, transaction) || []) : []
  const upstreamRoutersIofogUuid = fogData.upstreamRouters || await Promise.all(upstreamRoutersConnections.map(connection => connection.dest.iofogUuid))
  const routerMode = fogData.routerMode || (router ? (router.isEdge ? 'edge' : 'interior') : 'none')
  const messagingPort = fogData.messagingPort || (router ? router.messagingPort : null)
  const interRouterPort = fogData.interRouterPort || (router ? router.interRouterPort : null)
  const edgeRouterPort = fogData.edgeRouterPort || (router ? router.edgeRouterPort : null)
  let networkRouter

  const isSystem = updateFogData.isSystem === undefined ? oldFog.isSystem : updateFogData.isSystem
  if (isSystem && routerMode !== 'interior') {
    throw new Errors.ValidationError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER_MODE, fogData.routerMode))
  }

  let isRouterModeChanged = false
  const oldRouterMode = (router ? (router.isEdge ? 'edge' : 'interior') : 'none')
  if (fogData.routerMode && fogData.routerMode !== oldRouterMode) {
    if (fogData.routerMode === 'none' || oldRouterMode === 'none') {
      isRouterModeChanged = true
    }
  }

  await FogManager.update(queryFogData, updateFogData, transaction)
  await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.config, transaction)

  // Return immediately
  const res = { uuid: fogData.uuid }

  // Start background orchestration
  setImmediate(() => {
    (async () => {
      try {
        // --- Begin orchestration logic ---
        await _handleRouterCertificates(fogData, fogData.uuid, isRouterModeChanged, transaction)

        if (routerMode === 'none') {
          networkRouter = await RouterService.getNetworkRouter(fogData.networkRouter)
          if (!networkRouter) {
            throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTER, !fogData.networkRouter ? Constants.DEFAULT_ROUTER_NAME : fogData.networkRouter))
          }
          if (router) {
            await _deleteFogRouter(fogData, transaction)
          }
        } else {
          const defaultRouter = await RouterManager.findOne({ isDefault: true }, transaction)
          const upstreamRouters = await RouterService.validateAndReturnUpstreamRouters(upstreamRoutersIofogUuid, oldFog.isSystem, defaultRouter)
          if (!router) {
            networkRouter = await RouterService.createRouterForFog(fogData, oldFog.uuid, upstreamRouters)
            // --- Service Distribution Logic ---
            const serviceTags = await _extractServiceTags(fogData.tags)
            if (serviceTags.length > 0) {
              const services = await _findMatchingServices(serviceTags, transaction)
              if (services.length > 0) {
                const routerName = `router-${fogData.uuid.toLowerCase()}`
                const routerMicroservice = await MicroserviceManager.findOne({ name: routerName }, transaction)
                if (!routerMicroservice) {
                  throw new Errors.NotFoundError(`Router microservice not found: ${routerName}`)
                }
                let config = JSON.parse(routerMicroservice.config || '{}')
                for (const service of services) {
                  const listenerConfig = _buildTcpListenerForFog(service, fogData.uuid)
                  config = _mergeTcpListener(config, listenerConfig)
                }
                await MicroserviceManager.update(
                  { uuid: routerMicroservice.uuid },
                  { config: JSON.stringify(config) },
                  transaction
                )
                await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.microserviceConfig, transaction)
              }
            }
          } else {
            const existingConnectors = await _extractExistingTcpConnectors(fogData.uuid, transaction)
            networkRouter = await RouterService.updateRouter(router, {
              messagingPort, interRouterPort, edgeRouterPort, isEdge: routerMode === 'edge', host
            }, upstreamRouters, fogData.containerEngine)
            // --- Service Distribution Logic ---
            const serviceTags = await _extractServiceTags(fogData.tags)
            const routerName = `router-${fogData.uuid.toLowerCase()}`
            const routerMicroservice = await MicroserviceManager.findOne({ name: routerName }, transaction)
            if (!routerMicroservice) {
              throw new Errors.NotFoundError(`Router microservice not found: ${routerName}`)
            }
            let config = JSON.parse(routerMicroservice.config || '{}')
            if (serviceTags.length > 0) {
              const services = await _findMatchingServices(serviceTags, transaction)
              if (services.length > 0) {
                for (const service of services) {
                  const listenerConfig = _buildTcpListenerForFog(service, fogData.uuid)
                  config = _mergeTcpListener(config, listenerConfig)
                }
              }
            }
            // Merge back existing connectors if any
            if (existingConnectors && Object.keys(existingConnectors).length > 0) {
              for (const connectorName in existingConnectors) {
                const connectorObj = existingConnectors[connectorName]
                config = _mergeTcpConnector(config, connectorObj)
              }
            }
            await MicroserviceManager.update(
              { uuid: routerMicroservice.uuid },
              { config: JSON.stringify(config) },
              transaction
            )
            await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.microserviceConfig, transaction)
            await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.routerChanged, transaction)
          }
        }
        updateFogData.routerId = networkRouter.id

        // If router changed, set routerChanged flag
        if (updateFogData.routerId !== oldFog.routerId || updateFogData.routerMode !== oldFog.routerMode) {
          await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.routerChanged, transaction)
          await ChangeTrackingService.update(fogData.uuid, ChangeTrackingService.events.microserviceList, transaction)
        }

        let msChanged = false
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
        // --- End orchestration logic ---
        // Set fog node as healthy
        await FogManager.update({ uuid: fogData.uuid }, { warningMessage: 'HEALTHY' }, transaction)
      } catch (err) {
        logger.error('Background orchestration failed in updateFogEndPoint:', err)
        await FogManager.update(
          { uuid: fogData.uuid },
          {
            daemonStatus: FogStates.WARNING,
            warningMessage: `Background orchestration error: ${err.message}`
          },
          transaction
        )
      }
    })()
  })

  // Return immediately
  return res
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
        await RouterService.updateConfig(router.id, fogData.containerEngine, transaction)
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

async function _getFogVolumeMounts (fog, transaction) {
  const volumeMountAttributes = [
    'name',
    'version',
    'configMapName',
    'secretName'
  ]
  const volumeMounts = await fog.getVolumeMounts({ attributes: volumeMountAttributes })
  return volumeMounts.map(vm => {
    return {
      name: vm.name,
      version: vm.version,
      configMapName: vm.configMapName,
      secretName: vm.secretName
    }
  })
}

async function _getFogExtraInformation (fog, transaction) {
  const routerConfig = await _getFogRouterConfig(fog, transaction)
  const edgeResources = await _getFogEdgeResources(fog, transaction)
  const volumeMounts = await _getFogVolumeMounts(fog, transaction)
  // Transform to plain JS object
  if (fog.toJSON && typeof fog.toJSON === 'function') {
    fog = fog.toJSON()
  }
  return { ...fog, tags: _mapTags(fog), ...routerConfig, edgeResources, volumeMounts }
}

// Map tags to string array
// Return plain JS object
function _mapTags (fog) {
  return fog.tags ? fog.tags.map(t => t.value) : []
}

/**
 * Extracts service-related tags from fog node tags
 * @param {Array<string>} fogTags - Array of tags from fog node
 * @returns {Array<string>} Array of service tags (e.g., ["all", "foo", "bar"])
 */
async function _extractServiceTags (fogTags) {
  if (!fogTags || !Array.isArray(fogTags)) {
    return []
  }

  // Filter tags that start with SERVICE_ANNOTATION_TAG
  const serviceTags = fogTags
    .filter(tag => tag.startsWith(SERVICE_ANNOTATION_TAG))
    .map(tag => {
      // Extract the value after the colon
      const parts = tag.split(':')
      return parts.length > 1 ? parts[1].trim() : ''
    })
    .filter(tag => tag !== '') // Remove empty tags

  // If we have "all" tag, return just that
  if (serviceTags.includes('all')) {
    return ['all']
  }

  return serviceTags
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

// async function getFogListEndPoint (filters, isCLI, isSystem, transaction) {
async function getFogListEndPoint (filters, isCLI, transaction) {
  await Validator.validate(filters, Validator.schemas.iofogFilters)

  // // If listing system agent through REST API, make sure user is authenticated
  // if (isSystem && !isCLI && !lget('id')) {
  //   throw new Errors.AuthenticationError('Unauthorized')
  // }

  // const queryFogData = isSystem ? { isSystem } : (isCLI ? {} : { isSystem: false })
  const queryFogData = {}

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
    provisionKey: AppHelper.generateRandomString(16),
    expirationTime: new Date().getTime() + (10 * 60 * 1000)
  }

  const fog = await FogManager.findOne(queryFogData, transaction)
  if (!fog) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_IOFOG_UUID, fogData.uuid))
  }

  const provisioningKeyData = await FogProvisionKeyManager.updateOrCreate({ iofogUuid: fogData.uuid }, newProvision, transaction)

  const devMode = process.env.DEV_MODE || config.get('server.devMode')
  const sslCert = process.env.SSL_CERT || config.get('server.ssl.path.cert')
  const intermedKey = process.env.INTERMEDIATE_CERT || config.get('server.ssl.path.intermediateCert')
  const sslCertBase64 = config.get('server.ssl.base64.cert')
  const intermedKeyBase64 = config.get('server.ssl.base64.intermediateCert')
  const hasFileBasedSSL = !devMode && sslCert
  const hasBase64SSL = !devMode && sslCertBase64
  let caCert = ''

  if (!devMode) {
    if (hasFileBasedSSL) {
      try {
        if (intermedKey) {
          const certData = fs.readFileSync(intermedKey)
          caCert = Buffer.from(certData).toString('base64')
        } else {
          const certData = fs.readFileSync(sslCert)
          caCert = Buffer.from(certData).toString('base64')
        }
      } catch (error) {
        throw new Errors.ValidationError('Failed to read SSL certificate file')
      }
    }
    if (hasBase64SSL) {
      if (intermedKeyBase64) {
        caCert = intermedKeyBase64
      } else if (sslCertBase64) {
        caCert = sslCertBase64
      }
    }
  }
  return {
    key: provisioningKeyData.provisionKey,
    expirationTime: provisioningKeyData.expirationTime,
    caCert: caCert
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
    uuid: AppHelper.generateUUID(),
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
    uuid: AppHelper.generateUUID(),
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

/**
 * Finds services that match the fog node's service tags
 * @param {Array<string>} serviceTags - Array of service tags from fog node
 * @param {Object} transaction - Database transaction
 * @returns {Promise<Array<Object>>} Array of matching services
 */
async function _findMatchingServices (serviceTags, transaction) {
  if (!serviceTags || serviceTags.length === 0) {
    return []
  }

  // If 'all' tag is present, get all services
  if (serviceTags.includes('all')) {
    return ServiceManager.findAllWithTags({}, transaction)
  }

  // For each service tag, find matching services
  const servicesPromises = serviceTags.map(async (tag) => {
    const queryData = {
      '$tags.value$': `${tag}`
    }
    return ServiceManager.findAllWithTags(queryData, transaction)
  })

  // Wait for all queries to complete
  const servicesArrays = await Promise.all(servicesPromises)

  // Flatten arrays and remove duplicates based on service name
  const seen = new Set()
  const uniqueServices = servicesArrays
    .flat()
    .filter(service => {
      if (seen.has(service.name)) {
        return false
      }
      seen.add(service.name)
      return true
    })

  return uniqueServices
}

/**
 * Builds TCP listener configuration for a service on a specific fog node
 * @param {Object} service - Service object containing name and bridgePort
 * @param {string} fogNodeUuid - UUID of the fog node
 * @returns {Object} TCP listener configuration
 */
function _buildTcpListenerForFog (service, fogNodeUuid) {
  return {
    name: `${service.name}-listener`,
    port: service.bridgePort.toString(),
    address: service.name,
    siteId: fogNodeUuid
  }
}

/**
 * Gets the router microservice configuration for a fog node
 * @param {string} fogNodeUuid - UUID of the fog node
 * @param {Object} transaction - Database transaction
 * @returns {Promise<Object>} Router microservice configuration
 */
async function _getRouterMicroserviceConfig (fogNodeUuid, transaction) {
  const routerName = `router-${fogNodeUuid.toLowerCase()}`
  const routerMicroservice = await MicroserviceManager.findOne({ name: routerName }, transaction)
  if (!routerMicroservice) {
    throw new Errors.NotFoundError(`Router microservice not found: ${routerName}`)
  }
  const routerConfig = JSON.parse(routerMicroservice.config || '{}')
  return routerConfig
}

/**
 * Extracts existing TCP connectors from router configuration
 * @param {string} fogNodeUuid - UUID of the fog node
 * @param {Object} transaction - Database transaction
 * @returns {Promise<Object>} Object containing TCP connectors
 */
async function _extractExistingTcpConnectors (fogNodeUuid, transaction) {
  const routerConfig = await _getRouterMicroserviceConfig(fogNodeUuid, transaction)
  // Return empty object if no bridges or tcpConnectors exist
  if (!routerConfig.bridges || !routerConfig.bridges.tcpConnectors) {
    return {}
  }

  return routerConfig.bridges.tcpConnectors
}

/**
 * Merges a single TCP connector into router configuration
 * @param {Object} routerConfig - Base router configuration
 * @param {Object} connectorObj - TCP connector object (must have 'name' property)
 * @returns {Object} Updated router configuration
 */
function _mergeTcpConnector (routerConfig, connectorObj) {
  if (!connectorObj || !connectorObj.name) {
    throw new Error('Connector object must have a name property')
  }
  if (!routerConfig.bridges) {
    routerConfig.bridges = {}
  }
  if (!routerConfig.bridges.tcpConnectors) {
    routerConfig.bridges.tcpConnectors = {}
  }
  routerConfig.bridges.tcpConnectors[connectorObj.name] = connectorObj
  return routerConfig
}

/**
 * Merges a single TCP listener into router configuration
 * @param {Object} routerConfig - Base router configuration
 * @param {Object} listenerObj - TCP listener object (must have 'name' property)
 * @returns {Object} Updated router configuration
 */
function _mergeTcpListener (routerConfig, listenerObj) {
  if (!listenerObj || !listenerObj.name) {
    throw new Error('Listener object must have a name property')
  }
  if (!routerConfig.bridges) {
    routerConfig.bridges = {}
  }
  if (!routerConfig.bridges.tcpListeners) {
    routerConfig.bridges.tcpListeners = {}
  }
  routerConfig.bridges.tcpListeners[listenerObj.name] = listenerObj
  return routerConfig
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
  setFogPruneCommandEndPoint: TransactionDecorator.generateTransaction(setFogPruneCommandEndPoint),
  _extractServiceTags,
  _findMatchingServices: TransactionDecorator.generateTransaction(_findMatchingServices),
  _buildTcpListenerForFog,
  _getRouterMicroserviceConfig: TransactionDecorator.generateTransaction(_getRouterMicroserviceConfig),
  _extractExistingTcpConnectors: TransactionDecorator.generateTransaction(_extractExistingTcpConnectors),
  _mergeTcpConnector,
  _mergeTcpListener,
  checkKubernetesEnvironment,
  _handleRouterCertificates: TransactionDecorator.generateTransaction(_handleRouterCertificates)
}
