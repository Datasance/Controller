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

const BaseManager = require('./base-manager')
const models = require('../models')
const ControlPlane = models.ControlPlane

class ControlPlaneManager extends BaseManager {
  getEntity () {
    return ControlPlane
  }

  // no transaction required here, used by cli decorator
  findByUuid (uuid) {
    return ControlPlane.findOne({ where: { uuid } })
  }

  updateDetails (controlPlane, updateObject, transaction) {
    return this.update({
      id: controlPlane.uuid
    }, updateObject, transaction)
  }
}

const instance = new ControlPlaneManager()
module.exports = instance
