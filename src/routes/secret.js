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
const SecretController = require('../controllers/secret-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const logger = require('../logger')
const Errors = require('../helpers/errors')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'post',
    path: '/api/v3/secrets',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_CREATED
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
          code: constants.HTTP_CODE_CONFLICT,
          errors: [Errors.ConflictError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createSecretEndpoint = ResponseDecorator.handleErrors(SecretController.createSecretEndpoint, successCode, errorCodes)
        const responseObject = await createSecretEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  },
  {
    method: 'post',
    path: '/api/v3/secrets/yaml',
    fileInput: 'secret',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_CREATED
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
          code: constants.HTTP_CODE_CONFLICT,
          errors: [Errors.ConflictError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createSecretFromYamlEndpoint = ResponseDecorator.handleErrors(SecretController.createSecretFromYamlEndpoint, successCode, errorCodes)
        const responseObject = await createSecretFromYamlEndpoint(req)
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
    path: '/api/v3/secrets/:name',
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
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const updateSecretEndpoint = ResponseDecorator.handleErrors(SecretController.updateSecretEndpoint, successCode, errorCodes)
        const responseObject = await updateSecretEndpoint(req)
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
    path: '/api/v3/secrets/yaml/:name',
    fileInput: 'secret',
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
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const updateSecretFromYamlEndpoint = ResponseDecorator.handleErrors(SecretController.updateSecretFromYamlEndpoint, successCode, errorCodes)
        const responseObject = await updateSecretFromYamlEndpoint(req)
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
    path: '/api/v3/secrets/:name',
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

      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getSecretEndpoint = ResponseDecorator.handleErrors(SecretController.getSecretEndpoint, successCode, errorCodes)
        const responseObject = await getSecretEndpoint(req)
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
    path: '/api/v3/secrets',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const listSecretsEndpoint = ResponseDecorator.handleErrors(SecretController.listSecretsEndpoint, successCode, errorCodes)
        const responseObject = await listSecretsEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  },
  {
    method: 'delete',
    path: '/api/v3/secrets/:name',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteSecretEndpoint = ResponseDecorator.handleErrors(SecretController.deleteSecretEndpoint, successCode, errorCodes)
        const responseObject = await deleteSecretEndpoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: res, responseObject: responseObject })
      })
    }
  }
]
