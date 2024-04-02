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
const EdgeResourceController = require('../controllers/edge-resource-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const logger = require('../logger')
const Errors = require('../helpers/errors')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v1/edgeResources',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_SUCCESS
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getEdgeResourcesEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.listEdgeResourcesEndpoint, successCode, errorCodes)
        const responseObject = await getEdgeResourcesEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'get',
    path: '/api/v1/edgeResource/:name/:version',
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

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.getEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await getEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'get',
    path: '/api/v1/edgeResource/:name',
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

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        const getEdgeResourceAllVersionsEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.getEdgeResourceAllVersionsEndpoint, successCode, errorCodes)
        const responseObject = await getEdgeResourceAllVersionsEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'put',
    path: '/api/v1/edgeResource/:name/:version',
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
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        },
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE'])(req, res, async () => {
        const updateEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.updateEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await updateEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'delete',
    path: '/api/v1/edgeResource/:name/:version',
    middleware: async (req, res) => {
      logger.apiReq(req)

      const successCode = constants.HTTP_CODE_ACCEPTED
      const errorCodes = [
        {
          code: constants.HTTP_CODE_UNAUTHORIZED,
          errors: [Errors.AuthenticationError]
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        },
        {
          code: constants.HTTP_CODE_BAD_REQUEST,
          errors: [Errors.ValidationError]
        }
      ]

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE'])(req, res, async () => {
        const deleteEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.deleteEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await deleteEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'post',
    path: '/api/v1/edgeResource',
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

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE'])(req, res, async () => {
        const createEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.createEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await createEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'post',
    path: '/api/v1/edgeResource/:name/:version/link',
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

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE'])(req, res, async () => {
        const linkEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.linkEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await linkEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  },
  {
    method: 'delete',
    path: '/api/v1/edgeResource/:name/:version/link',
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

      // Add keycloak.protect() middleware to protect the route for SRE role
      await keycloak.protect(['SRE'])(req, res, async () => {
        const unlinkEdgeResourceEndpoint = ResponseDecorator.handleErrors(EdgeResourceController.unlinkEdgeResourceEndpoint, successCode, errorCodes)
        const responseObject = await unlinkEdgeResourceEndpoint(req)

        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, res: responseObject })
      })
    }
  }
]
