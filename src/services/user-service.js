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
      totp: credentials.totp,
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
      data,
      httpsAgent: agent
    }

    // Make a POST request to Keycloak token endpoint
    const response = await axios.request(config)

    // Extract the access token from the response
    const accessToken = response.data.access_token
    const refreshToken = response.data.refresh_token
    return {
      accessToken,
      refreshToken
    }
  } catch (error) {
    console.error('Error during login:', error)
    throw new Errors.InvalidCredentialsError()
  }
}

const refresh = async function (credentials, isCLI, transaction) {
  try {
    const data = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
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
      data,
      httpsAgent: agent
    }

    // Make a POST request to Keycloak token endpoint
    const response = await axios.request(config)

    // Extract the access token from the response
    const accessToken = response.data.access_token
    const refreshToken = response.data.refresh_token
    return {
      accessToken,
      refreshToken
    }
  } catch (error) {
    console.error('Error during login:', error)
    throw new Errors.InvalidCredentialsError()
  }
}

const profile = async function (req, isCLI, transaction) {
  try {
    const accessToken = req.headers.authorization.replace('Bearer ', '')
    const agent = new https.Agent({
      // Ignore SSL certificate errors
      rejectUnauthorized: false
    })

    const profileconfig = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${process.env.KC_URL}realms/${process.env.KC_REALM}/protocol/openid-connect/userinfo`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`
      },
      httpsAgent: agent
    }

    // Make the request using async/await
    const response = await axios.request(profileconfig)

    // Return the userinfo data
    return response.data
  } catch (error) {
    console.error('Error during profile retrieval:', error)
    throw new Errors.InvalidCredentialsError()
  }
}

const logout = async function (req, isCLI, transaction) {
  try {
    const accessToken = req.headers.authorization.replace('Bearer ', '')
    const agent = new https.Agent({
      // Ignore SSL certificate errors
      rejectUnauthorized: false
    })

    const logoutconfig = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${process.env.KC_URL}realms/${process.env.KC_REALM}/protocol/openid-connect/logout`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`
      },
      httpsAgent: agent
    }

    // Make the request using async/await
    const response = await axios.request(logoutconfig)

    // Return the userinfo data
    return response.data
  } catch (error) {
    console.error('Error during logout:', error)
    throw new Errors.InvalidCredentialsError()
  }
}

module.exports = {
  login: TransactionDecorator.generateTransaction(login),
  refresh: TransactionDecorator.generateTransaction(refresh),
  profile: TransactionDecorator.generateTransaction(profile),
  logout: TransactionDecorator.generateTransaction(logout)
}
