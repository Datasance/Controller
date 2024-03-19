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

const UserService = require('../services/user-service')
const Validator = require('../schemas')

const userLoginEndPoint = async function (req) {
  const user = req.body

  await Validator.validate(user, Validator.schemas.login)

  const credentials = {
    email: user.email,
    password: user.password
  }

  return UserService.login(credentials, false)
}

const getUserProfileEndPoint = async function (req) {
  return UserService.profile(req, false)
}

module.exports = {
  userLoginEndPoint: userLoginEndPoint,
  getUserProfileEndPoint: getUserProfileEndPoint
}
