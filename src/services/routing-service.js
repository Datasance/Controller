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
const ChangeTrackingService = require('../services/change-tracking-service')
const Errors = require('../helpers/errors')
const ErrorMessages = require('../helpers/error-messages')
const MicroserviceManager = require('../data/managers/microservice-manager')
const ApplicationManager = require('../data/managers/application-manager')
const RoutingManager = require('../data/managers/routing-manager')
const TransactionDecorator = require('../decorators/transaction-decorator')
const Validator = require('../schemas')

async function getRoutings (isCLI, transaction) {
  const routes = await RoutingManager.findAllPopulated({}, transaction)
  return { routes: routes.map(r => ({
    application: r.application.name,
    name: r.name,
    from: r.sourceMicroservice.name,
    to: r.destMicroservice.name,
    // API retrocompatibility
    sourceMicroserviceUuid: r.sourceMicroservice.uuid,
    destMicroserviceUuid: r.destMicroservice.uuid
  })) }
}

async function getRouting (appName, name, isCLI, transaction) {
  const application = await ApplicationManager.findOne({ name: appName }, transaction)
  if (!application) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_NAME, appName))
  }
  const route = await RoutingManager.findOnePopulated({ name, applicationId: application.id }, transaction)
  if (!route) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTING_NAME, name))
  }
  return {
    application: route.application.name,
    name: route.name,
    from: route.sourceMicroservice.name,
    to: route.destMicroservice.name,
    // API retrocompatibility
    sourceMicroserviceUuid: route.sourceMicroservice.uuid,
    destMicroserviceUuid: route.destMicroservice.uuid
  }
}

async function _validateRouteMsvc (routingData, isCLI, transaction) {
  // Retro compatibility logic
  if (routingData.sourceMicroserviceUuid) {
    const sourceWhere = { uuid: routingData.sourceMicroserviceUuid }
    const sourceMicroservice = await MicroserviceManager.findOne(sourceWhere, transaction)
    if (!sourceMicroservice) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_SOURCE_MICROSERVICE_NAME, routingData.sourceMicroserviceUuid))
    }

    const destWhere = { uuid: routingData.destMicroserviceUuid }
    const destMicroservice = await MicroserviceManager.findOne(destWhere, transaction)
    if (!destMicroservice) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_DEST_MICROSERVICE_NAME, routingData.destMicroserviceUuid))
    }
    return { sourceMicroservice, destMicroservice }
  } else {
    const applicationWhere = isCLI ? { name: routingData.application } : { name: routingData.application }
    const application = await ApplicationManager.findOne(applicationWhere, transaction)
    if (!application) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_ID, routingData.application))
    }

    const sourceWhere = { name: routingData.from, applicationId: application.id }
    const sourceMicroservice = await MicroserviceManager.findOne(sourceWhere, transaction)
    if (!sourceMicroservice) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_SOURCE_MICROSERVICE_NAME, routingData.from))
    }

    const destWhere = { name: routingData.to, applicationId: application.id }
    const destMicroservice = await MicroserviceManager.findOne(destWhere, transaction)
    if (!destMicroservice) {
      throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_DEST_MICROSERVICE_NAME, routingData.to))
    }
    return { sourceMicroservice, destMicroservice }
  }
}

async function createRouting (routingData, isCLI, transaction) {
  await Validator.validate(routingData, Validator.schemas.routingCreate)

  const { sourceMicroservice, destMicroservice } = await _validateRouteMsvc(routingData, isCLI, transaction)

  return _createRoute(sourceMicroservice, destMicroservice, routingData, transaction)
}

async function updateRouting (appName, routeName, routeData, isCLI, transaction) {
  await Validator.validate(routeData, Validator.schemas.routingUpdate)
  const application = await ApplicationManager.findOne({ name: appName }, transaction)
  if (!application) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_NAME, appName))
  }

  const oldRoute = await RoutingManager.findOnePopulated({ name: routeName, applicationId: application.id }, transaction)
  if (!oldRoute) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_ROUTING_NAME, routeName))
  }

  const { sourceMicroservice, destMicroservice } = await _validateRouteMsvc({ ...routeData, application: oldRoute.application.name }, isCLI, transaction)

  const updateRebuildMs = {
    rebuild: true
  }

  const updateRouteData = {
    name: routeData.name || oldRoute.name,
    sourceMicroserviceUuid: sourceMicroservice.uuid,
    destMicroserviceUuid: destMicroservice.uuid
  }

  if (sourceMicroservice.uuid !== oldRoute.sourceMicroserviceUuid) {
    // Update change tracking of oldMsvc
    await ChangeTrackingService.update(oldRoute.sourceMicroservice.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)

    // Update new source msvc
    await MicroserviceManager.update({ uuid: sourceMicroservice.uuid }, updateRebuildMs, transaction)
    await ChangeTrackingService.update(sourceMicroservice.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
  }
  if (destMicroservice.uuid !== oldRoute.destMicroserviceUuid) {
    // Update change tracking of oldMsvc
    await ChangeTrackingService.update(oldRoute.destMicroserviceUuid.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)

    // Update new dest msvc
    await MicroserviceManager.update({ uuid: destMicroservice.uuid }, updateRebuildMs, transaction)
    await ChangeTrackingService.update(destMicroservice.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
  }

  await RoutingManager.update({ id: oldRoute.id }, updateRouteData, transaction)
}

async function _createRoute (sourceMicroservice, destMicroservice, routeData, transaction) {
  if (!sourceMicroservice.iofogUuid || !destMicroservice.iofogUuid) {
    throw new Errors.ValidationError('fog not set')
  }
  if (sourceMicroservice.applicationId !== destMicroservice.applicationId) {
    throw new Errors.ValidationError('microservices on different applications')
  }

  const route = await RoutingManager.findOne({
    sourceMicroserviceUuid: sourceMicroservice.uuid,
    destMicroserviceUuid: destMicroservice.uuid
  }, transaction)
  if (route) {
    throw new Errors.DuplicatePropertyError('route already exists')
  }

  return _createSimpleRoute(sourceMicroservice, destMicroservice, routeData, transaction)
}

async function deleteRouting (appName, name, isCLI, transaction) {
  const application = await ApplicationManager.findOne({ name: appName }, transaction)
  if (!application) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.INVALID_FLOW_NAME, appName))
  }
  const route = await RoutingManager.findOne({ name, applicationId: application.id }, transaction)
  if (!route) {
    throw new Errors.NotFoundError(AppHelper.formatMessage(ErrorMessages.ROUTE_NOT_FOUND))
  }

  await _deleteSimpleRoute(route, transaction)
}

async function _createSimpleRoute (sourceMicroservice, destMicroservice, routeData, transaction) {
  // create new route
  const createRouteData = {
    ...routeData,
    sourceMicroserviceUuid: sourceMicroservice.uuid,
    destMicroserviceUuid: destMicroservice.uuid,
    applicationId: sourceMicroservice.applicationId
  }

  const newRoute = await RoutingManager.create(createRouteData, transaction)
  await _switchOnUpdateFlagsForMicroservicesInRoute(sourceMicroservice, destMicroservice, transaction)
  return newRoute
}

async function _deleteSimpleRoute (route, transaction) {
  await RoutingManager.delete({ id: route.id }, transaction)

  const sourceMsvc = await MicroserviceManager.findOne({ uuid: route.sourceMicroserviceUuid }, transaction)
  const destMsvc = await MicroserviceManager.findOne({ uuid: route.destMicroserviceUuid }, transaction)

  await ChangeTrackingService.update(sourceMsvc.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
  await ChangeTrackingService.update(destMsvc.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
}

async function _switchOnUpdateFlagsForMicroservicesInRoute (sourceMicroservice, destMicroservice, transaction) {
  const updateRebuildMs = {
    rebuild: true
  }
  await MicroserviceManager.update({ uuid: sourceMicroservice.uuid }, updateRebuildMs, transaction)
  await MicroserviceManager.update({ uuid: destMicroservice.uuid }, updateRebuildMs, transaction)

  await ChangeTrackingService.update(sourceMicroservice.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
  await ChangeTrackingService.update(destMicroservice.iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
}

module.exports = {
  getRouting: TransactionDecorator.generateTransaction(getRouting),
  getRoutings: TransactionDecorator.generateTransaction(getRoutings),
  createRouting: TransactionDecorator.generateTransaction(createRouting),
  updateRouting: TransactionDecorator.generateTransaction(updateRouting),
  deleteRouting: TransactionDecorator.generateTransaction(deleteRouting)
}
