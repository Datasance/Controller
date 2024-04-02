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
const logger = require('../logger')
const config = require('../config')
const FogManager = require('../data/managers/iofog-manager')
const FogAccessTokenManager = require('../data/managers/iofog-access-token-manager')
const Errors = require('../helpers/errors')
const { isTest } = require('../helpers/app-helper')

function checkFogToken (f) {
  return async function (...fArgs) {
    if (isTest()) {
      return f.apply(this, fArgs)
    }

    const req = fArgs[0]
    const token = req.headers.authorization

    const fog = await FogManager.checkToken(token)

    if (!fog) {
      logger.error('token ' + token + ' incorrect')
      throw new Errors.AuthenticationError('authorization failed')
    }
    if (Date.now() > fog.accessToken.expirationTime) {
      logger.error('token ' + token + ' expired')
      throw new Errors.AuthenticationError('token expired')
    }

    fArgs.push(fog)

    FogAccessTokenManager.updateExpirationTime(fog.accessToken.id, fog.accessToken.expirationTime +
        config.get('Settings:FogTokenExpirationIntervalSeconds') * 1000)

    const timestamp = Date.now()
    await FogManager.updateLastActive(fog.uuid, timestamp)

    return f.apply(this, fArgs)
  }
}

module.exports = {
  checkFogToken: checkFogToken
}
