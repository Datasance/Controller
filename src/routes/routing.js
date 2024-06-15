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
const Routing = require('../controllers/routing-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const logger = require('../logger')
const Errors = require('../helpers/errors')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v1/routes',
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

      // Protecting for SRE , Developer and Viewer roles
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getRouterEndpoint = ResponseDecorator.handleErrors(
          Routing.getRoutingsEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await getRouterEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'get',
    path: '/api/v1/routes/:appName/:name',
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

      // Protecting for SRE, Developer, and Viewer roles
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getRouterEndpoint = ResponseDecorator.handleErrors(
          Routing.getRoutingEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await getRouterEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'post',
    path: '/api/v1/routes',
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
        },
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.DuplicatePropertyError]
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      // Protecting for SRE and Developer roles
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createRoutingEndpoint = ResponseDecorator.handleErrors(
          Routing.createRoutingEndpoint,
          successCode,
          errorCodes
        )
        const responseObject = await createRoutingEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'patch',
    path: '/api/v1/routes/:appName/:name',
    supportSubstitution: true,
    middleware: async (req, res) => {
      logger.apiReq(req)

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
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const updateRoutingEndpoint = ResponseDecorator.handleErrors(
          Routing.updateRoutingEndpoint,
          successCode,
          errorCodes
        )
        const responseObject = await updateRoutingEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'delete',
    path: '/api/v1/routes/:appName/:name',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_NO_CONTENT
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
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteRoutingEndpoint = ResponseDecorator.handleErrors(
          Routing.deleteRoutingEndpoint,
          successCode,
          errorCodes
        )
        const responseObject = await deleteRoutingEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  }
]
