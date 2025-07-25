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

const MicroserviceManager = require('../data/managers/microservice-manager')
const MicroserviceStatusManager = require('../data/managers/microservice-status-manager')
const MicroserviceExecStatusManager = require('../data/managers/microservice-exec-status-manager')
const { microserviceState, microserviceExecState } = require('../enums/microservice-state')

const Config = require('../config')
const ApplicationManager = require('../data/managers/application-manager')

const scheduleTime = Config.get('settings.fogStatusUpdateInterval') * 1000

async function run () {
  try {
    const _updateStoppedApplicationMicroserviceStatus = TransactionDecorator.generateTransaction(updateStoppedApplicationMicroserviceStatus)
    await _updateStoppedApplicationMicroserviceStatus()
  } catch (error) {
    console.error(error)
  } finally {
    setTimeout(run, scheduleTime)
  }
}

async function updateStoppedApplicationMicroserviceStatus (transaction) {
  const stoppedMicroservices = await ApplicationManager.findApplicationMicroservices({ isActivated: false }, transaction)
  await _updateMicroserviceStatusStopped(stoppedMicroservices, transaction)
}

async function _updateMicroserviceStatusStopped (stoppedMicroservices, transaction) {
  const microserviceUuids = stoppedMicroservices.map((microservice) => microservice.uuid)
  const microservices = await MicroserviceManager.findAllWithStatuses({ uuid: microserviceUuids }, transaction)
  const microserviceStatusIds = microservices
    .filter((microservice) => microservice.microserviceStatus && (microservice.microserviceStatus.status === microserviceState.DELETED ||
       microservice.microserviceStatus.status === microserviceState.DELETING))
    .map((microservice) => microservice.microserviceStatus.id)
  const microserviceExecStatusIds = microservices
    .filter((microservice) =>
      microservice.microserviceStatus &&
      (microservice.microserviceStatus.status === microserviceState.DELETED ||
       microservice.microserviceStatus.status === microserviceState.DELETING) &&
      microservice.microserviceExecStatus
    )
    .map((microservice) => microservice.microserviceExecStatus.id)
  await MicroserviceStatusManager.update({ id: microserviceStatusIds }, { status: microserviceState.STOPPED }, transaction)
  await MicroserviceExecStatusManager.update({ id: microserviceExecStatusIds }, { execSesssionId: '', status: microserviceExecState.INACTIVE }, transaction)
  return microservices
}

module.exports = {
  run
}
