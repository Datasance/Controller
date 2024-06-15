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
const ApplicationController = require('../controllers/application-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const Errors = require('../helpers/errors')
const logger = require('../logger')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v1/application',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      const getApplicationsByUserEndPoint = ResponseDecorator.handleErrors(ApplicationController.getApplicationsByUserEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const responseObject = await getApplicationsByUserEndPoint(req)
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
    path: '/api/v1/application',
    supportSubstitution: true,
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_CREATED
      const errorCodes = [
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        },
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      const createApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.createApplicationEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await createApplicationEndPoint(req)
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
    path: '/api/v1/application/yaml',
    fileInput: 'application',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_CREATED
      const errorCodes = [
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        },
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      const createApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.createApplicationYAMLEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await createApplicationEndPoint(req)
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
    path: '/api/v1/application/:name',
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

      const getApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.getApplicationEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const responseObject = await getApplicationEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
        return null
      })
    }
  },
  {
    method: 'patch',
    path: '/api/v1/application/:name',
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

      const updateApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.patchApplicationEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await updateApplicationEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'put',
    path: '/api/v1/application/yaml/:name',
    fileInput: 'application',
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

      const updateApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.updateApplicationYAMLEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await updateApplicationEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  },
  {
    method: 'put',
    path: '/api/v1/application/:name',
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

      const updateApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.updateApplicationEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await updateApplicationEndPoint(req)
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
    path: '/api/v1/application/:name',
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

      const deleteApplicationEndPoint = ResponseDecorator.handleErrors(ApplicationController.deleteApplicationEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await deleteApplicationEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  }
]
