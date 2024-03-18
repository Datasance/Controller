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

const CatalogService = require('../services/catalog-service')

const createCatalogItemEndPoint = async function (req) {
  const user = req.kauth.grant.access_token.content
  return CatalogService.createCatalogItemEndPoint(req.body, user)
}

const listCatalogItemsEndPoint = async function (req) {
  const user = req.kauth.grant.access_token.content
  return CatalogService.listCatalogItemsEndPoint(req.body, user)
}

const listCatalogItemEndPoint = async function (req, user) {
  return CatalogService.getCatalogItemEndPoint(req.params.id, user, false)
}

const deleteCatalogItemEndPoint = async function (req, user) {
  await CatalogService.deleteCatalogItemEndPoint(req.params.id, user, false)
}

const updateCatalogItemEndPoint = async function (req, user) {
  await CatalogService.updateCatalogItemEndPoint(req.params.id, req.body, user, false)
}

module.exports = {
  createCatalogItemEndPoint: (createCatalogItemEndPoint),
  listCatalogItemsEndPoint: (listCatalogItemsEndPoint),
  listCatalogItemEndPoint: (listCatalogItemEndPoint),
  deleteCatalogItemEndPoint: (deleteCatalogItemEndPoint),
  updateCatalogItemEndPoint: (updateCatalogItemEndPoint)
}
