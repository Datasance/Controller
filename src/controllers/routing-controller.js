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

const RoutingService = require('../services/routing-service')

const createRoutingEndpoint = async function (req, user) {
  const routerData = req.body
  return RoutingService.createRouting(routerData, user, false)
}

const getRoutingsEndPoint = async function (req, user) {
  return RoutingService.getRoutings(user, false)
}

const getRoutingEndPoint = async function (req, user) {
  const routeName = req.params.name
  const appName = req.params.appName
  return RoutingService.getRouting(appName, routeName, user, false)
}

const updateRoutingEndpoint = async function (req, user) {
  const routeName = req.params.name
  const appName = req.params.appName
  const routeData = req.body
  return RoutingService.updateRouting(appName, routeName, routeData, user, false)
}

const deleteRoutingEndpoint = async function (req, user) {
  const routeName = req.params.name
  const appName = req.params.appName
  return RoutingService.deleteRouting(appName, routeName, user, false)
}

module.exports = {
  deleteRoutingEndpoint: (deleteRoutingEndpoint),
  updateRoutingEndpoint: (updateRoutingEndpoint),
  createRoutingEndpoint: (createRoutingEndpoint),
  getRoutingEndPoint: (getRoutingEndPoint),
  getRoutingsEndPoint: (getRoutingsEndPoint)
}
