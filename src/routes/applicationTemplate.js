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
const ApplicationTemplateController = require('../controllers/application-template-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const Errors = require('../helpers/errors')
const logger = require('../logger')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v1/applicationTemplates',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      const getApplicationTemplatesByUserEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.getApplicationTemplatesByUserEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const responseObject = await getApplicationTemplatesByUserEndPoint(req)
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
    path: '/api/v1/applicationTemplate',
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

      const createApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.createApplicationTemplateEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await createApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/yaml',
    fileInput: 'template',
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

      const createApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.createApplicationTemplateYAMLEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await createApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/:name',
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

      const getApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.getApplicationTemplateEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const responseObject = await getApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/:name',
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

      const patchApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.patchApplicationTemplateEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await patchApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/yaml/:name',
    fileInput: 'template',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
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

      const updateApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.updateApplicationTemplateYAMLEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await updateApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/:name',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
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

      const updateApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.updateApplicationTemplateEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await updateApplicationTemplateEndPoint(req)
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
    path: '/api/v1/applicationTemplate/:name',
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

      const deleteApplicationTemplateEndPoint = ResponseDecorator.handleErrors(ApplicationTemplateController.deleteApplicationTemplateEndPoint, successCode, errorCodes)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const responseObject = await deleteApplicationTemplateEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  }
]
