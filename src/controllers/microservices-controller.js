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

const MicroservicesService = require('../services/microservices-service')
const YAMLParserService = require('../services/yaml-parser-service')
const { rvaluesVarSubstition } = require('../helpers/template-helper')

const createMicroserviceOnFogEndPoint = async function (req) {
  const microservice = req.body
  return MicroservicesService.createMicroserviceEndPoint(microservice, false)
}

const createMicroserviceYAMLEndPoint = async function (req) {
  const fileContent = req.file.buffer.toString()
  const microservice = await YAMLParserService.parseMicroserviceFile(fileContent)
  await rvaluesVarSubstition(microservice, { self: microservice })
  return MicroservicesService.createMicroserviceEndPoint(microservice, false)
}

const getMicroserviceEndPoint = async function (req) {
  const microserviceUuid = req.params.uuid
  return MicroservicesService.getMicroserviceEndPoint(microserviceUuid, false)
}

const updateMicroserviceEndPoint = async function (req) {
  const microservice = req.body
  const microserviceUuid = req.params.uuid
  return MicroservicesService.updateMicroserviceEndPoint(microserviceUuid, microservice, false)
}

const updateMicroserviceYAMLEndPoint = async function (req) {
  const microserviceUuid = req.params.uuid
  const fileContent = req.file.buffer.toString()
  const microservice = await YAMLParserService.parseMicroserviceFile(fileContent)
  await rvaluesVarSubstition(microservice, { self: microservice })
  return MicroservicesService.updateMicroserviceEndPoint(microserviceUuid, microservice, false)
}

const deleteMicroserviceEndPoint = async function (req) {
  const microserviceUuid = req.params.uuid
  const microserviceData = req.body || {}
  return MicroservicesService.deleteMicroserviceEndPoint(microserviceUuid, microserviceData, false)
}

const getMicroservicesByApplicationEndPoint = async function (req) {
  // API Retro compatibility
  const flowId = req.query.flowId

  const applicationName = req.query.application
  return MicroservicesService.listMicroservicesEndPoint({ applicationName, flowId }, false)
}

const createMicroserviceRouteEndPoint = async function (req) {
  const sourceUuid = req.params.uuid
  const destUuid = req.params.receiverUuid
  return MicroservicesService.createRouteEndPoint(sourceUuid, destUuid, false)
}

const deleteMicroserviceRouteEndPoint = async function (req) {
  const sourceUuid = req.params.uuid
  const destUuid = req.params.receiverUuid
  return MicroservicesService.deleteRouteEndPoint(sourceUuid, destUuid, false)
}

const createMicroservicePortMappingEndPoint = async function (req) {
  const uuid = req.params.uuid
  const portMappingData = req.body
  return MicroservicesService.createPortMappingEndPoint(uuid, portMappingData, false)
}

const deleteMicroservicePortMappingEndPoint = async function (req) {
  const uuid = req.params.uuid
  const internalPort = req.params.internalPort
  return MicroservicesService.deletePortMappingEndPoint(uuid, internalPort, false)
}

const listMicroservicePortMappingsEndPoint = async function (req) {
  const uuid = req.params.uuid
  const ports = await MicroservicesService.listMicroservicePortMappingsEndPoint(uuid, false)
  return {
    ports: ports
  }
}

const createMicroserviceVolumeMappingEndPoint = async function (req) {
  const microserviceUuid = req.params.uuid
  const volumeMappingData = req.body
  const volumeMapping = await MicroservicesService.createVolumeMappingEndPoint(microserviceUuid, volumeMappingData, false)
  return {
    id: volumeMapping.id
  }
}

const listMicroserviceVolumeMappingsEndPoint = async function (req) {
  const uuid = req.params.uuid
  const volumeMappings = await MicroservicesService.listVolumeMappingsEndPoint(uuid, false)
  return {
    volumeMappings: volumeMappings
  }
}

const deleteMicroserviceVolumeMappingEndPoint = async function (req) {
  const uuid = req.params.uuid
  const id = req.params.id
  return MicroservicesService.deleteVolumeMappingEndPoint(uuid, id, false)
}

const listAllPublicPortsEndPoint = async function (req) {
  return MicroservicesService.listAllPublicPortsEndPoint()
}

module.exports = {
  createMicroserviceOnFogEndPoint: (createMicroserviceOnFogEndPoint),
  getMicroserviceEndPoint: (getMicroserviceEndPoint),
  updateMicroserviceEndPoint: (updateMicroserviceEndPoint),
  deleteMicroserviceEndPoint: (deleteMicroserviceEndPoint),
  getMicroservicesByApplicationEndPoint: (getMicroservicesByApplicationEndPoint),
  createMicroserviceRouteEndPoint: (createMicroserviceRouteEndPoint),
  deleteMicroserviceRouteEndPoint: (deleteMicroserviceRouteEndPoint),
  createMicroservicePortMappingEndPoint: (createMicroservicePortMappingEndPoint),
  deleteMicroservicePortMappingEndPoint: (deleteMicroservicePortMappingEndPoint),
  getMicroservicePortMappingListEndPoint: (listMicroservicePortMappingsEndPoint),
  createMicroserviceVolumeMappingEndPoint: (createMicroserviceVolumeMappingEndPoint),
  listMicroserviceVolumeMappingsEndPoint: (listMicroserviceVolumeMappingsEndPoint),
  deleteMicroserviceVolumeMappingEndPoint: (deleteMicroserviceVolumeMappingEndPoint),
  listAllPublicPortsEndPoint: (listAllPublicPortsEndPoint),
  createMicroserviceYAMLEndPoint: (createMicroserviceYAMLEndPoint),
  updateMicroserviceYAMLEndPoint: (updateMicroserviceYAMLEndPoint)
}
