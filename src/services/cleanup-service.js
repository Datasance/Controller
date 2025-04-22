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

const schedule = require('node-schedule')
const FogUsedTokenManager = require('../data/managers/fog-used-token-manager')
const logger = require('../logger')

class CleanupService {
  start () {
    // Run every 5 minutes to ensure we catch all expired tokens
    // (since tokens are valid for 10 minutes)
    schedule.scheduleJob('*/5 * * * *', async () => {
      try {
        logger.debug('Starting cleanup of expired JTIs')
        const count = await FogUsedTokenManager.cleanupExpiredJtis()
        logger.debug(`Cleaned up ${count} expired JTIs`)
      } catch (error) {
        logger.error('Error during JTI cleanup:', error)
      }
    })
  }
}

module.exports = new CleanupService()
