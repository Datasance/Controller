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

const AuthDecorator = require('../decorators/authorization-decorator')

const getControlPlaneProfileEndPoint = async function (req, controlPlane) {
  return {
    namespace: controlPlane.namespace,
    OrgName: controlPlane.OrgName,
    entitlementId: controlPlane.entitlementId
  }
}

module.exports = {
  getControlPlaneProfileEndPoint: AuthDecorator.checkAuthToken(getControlPlaneProfileEndPoint)
}
