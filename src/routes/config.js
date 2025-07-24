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
const constants = require('../helpers/constants')
const ConfigController = require('../controllers/config-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const logger = require('../logger')
const Errors = require('../helpers/errors')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v3/config',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getConfigEndpoint = ResponseDecorator.handleErrors(ConfigController.listConfigEndpoint, successCode, errorCodes)
        const responseObject = await getConfigEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  },
  {
    method: 'get',
    path: '/api/v3/config/:key',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getConfigEndpoint = ResponseDecorator.handleErrors(ConfigController.getConfigEndpoint, successCode, errorCodes)
        const responseObject = await getConfigEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  },
  {
    method: 'put',
    path: '/api/v3/config',
    supportSubstitution: true,
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        },
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const upsertConfigElementEndpoint = ResponseDecorator.handleErrors(ConfigController.upsertConfigElementEndpoint, successCode, errorCodes)
        const responseObject = await upsertConfigElementEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  }
]
