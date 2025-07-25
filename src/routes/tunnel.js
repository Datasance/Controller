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
const TunnelController = require('../controllers/tunnel-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const Errors = require('../helpers/errors')
const logger = require('../logger')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'patch',
    path: '/api/v3/iofog/:id/tunnel',
    middleware: async (req, res) => {
      logger.apiReq('POST /api/v3/iofog/:id/tunnel') // don't use req as arg, because password not encrypted

      const successCode = constants.HTTP_CODE_NO_CONTENT
      const errorCodes = [
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        },
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      // Protecting for SRE and Developer roles
      await keycloak.protect(['SRE'])(req, res, async () => {
        const tunnelEndPoint = ResponseDecorator.handleErrors(
          TunnelController.manageTunnelEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await tunnelEndPoint(req)
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
    path: '/api/v3/iofog/:id/tunnel',
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

      // Protecting for SRE and Developer roles
      await keycloak.protect(['SRE'])(req, res, async () => {
        const tunnelEndPoint = ResponseDecorator.handleErrors(
          TunnelController.getTunnelEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await tunnelEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  }
]
