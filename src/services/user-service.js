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

const Errors = require('../helpers/errors')
const TransactionDecorator = require('../decorators/transaction-decorator')
const axios = require('axios')
const qs = require('qs')
const https = require('https')

const login = async function (credentials, isCLI, transaction) {
  try {
    const data = qs.stringify({
      grant_type: 'password',
      username: credentials.email,
      password: credentials.password,
      client_id: process.env.KC_CLIENT,
      client_secret: process.env.KC_CLIENT_SECRET
    })

    const agent = new https.Agent({
      rejectUnauthorized: false // Ignore SSL certificate errors
    })

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${process.env.KC_URL}realms/${process.env.KC_REALM}/protocol/openid-connect/token`,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data,
      httpsAgent: agent
    }

    // Make a POST request to Keycloak token endpoint
    const response = await axios.request(config)

    // Extract the access token from the response
    const accessToken = response.data.access_token
    return {
      accessToken: accessToken
    }
  } catch (error) {
    console.error('Error during login:', error)
    throw new Errors.InvalidCredentialsError()
  }
}

module.exports = {
  login: TransactionDecorator.generateTransaction(login)
}
