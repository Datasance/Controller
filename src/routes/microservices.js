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
const MicroservicesController = require('../controllers/microservices-controller')
const ResponseDecorator = require('../decorators/response-decorator')
const Errors = require('../helpers/errors')
const logger = require('../logger')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'get',
    path: '/api/v3/microservices/public-ports',
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
        const listAllPublicPortsEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.listAllPublicPortsEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await listAllPublicPortsEndPoint(req)
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
    path: '/api/v3/microservices/',
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
        const getMicroservicesByApplicationEndPoint = ResponseDecorator.handleErrors(MicroservicesController.getMicroservicesByApplicationEndPoint,
          successCode, errorCodes)
        const responseObject = await getMicroservicesByApplicationEndPoint(req)
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
    path: '/api/v3/microservices',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createMicroservicesOnFogEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createMicroserviceOnFogEndPoint, successCode, errorCodes)
        const responseObject = await createMicroservicesOnFogEndPoint(req)
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
    path: '/api/v3/microservices/yaml',
    supportSubstitution: true,
    fileInput: 'microservice',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createMicroservicesYAMLEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createMicroserviceYAMLEndPoint, successCode, errorCodes)
        const responseObject = await createMicroservicesYAMLEndPoint(req)
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
    path: '/api/v3/microservices/:uuid',
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
        const getMicroserviceEndPoint = ResponseDecorator.handleErrors(MicroservicesController.getMicroserviceEndPoint,
          successCode, errorCodes)
        const responseObject = await getMicroserviceEndPoint(req)
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
    path: '/api/v3/microservices/:uuid',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const updateMicroserviceEndPoint = ResponseDecorator.handleErrors(MicroservicesController.updateMicroserviceEndPoint,
          successCode, errorCodes)
        const responseObject = await updateMicroserviceEndPoint(req)
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
    path: '/api/v3/microservices/system/:uuid',
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

      await keycloak.protect(['SRE'])(req, res, async () => {
        const updateSystemMicroserviceEndPoint = ResponseDecorator.handleErrors(MicroservicesController.updateSystemMicroserviceEndPoint,
          successCode, errorCodes)
        const responseObject = await updateSystemMicroserviceEndPoint(req)
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
    path: '/api/v3/microservices/yaml/:uuid',
    supportSubstitution: true,
    fileInput: 'microservice',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const updateMicroserviceYAMLEndPoint = ResponseDecorator.handleErrors(MicroservicesController.updateMicroserviceYAMLEndPoint,
          successCode, errorCodes)
        const responseObject = await updateMicroserviceYAMLEndPoint(req)
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
    path: '/api/v3/microservices/:uuid',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteMicroserviceEndPoint = ResponseDecorator.handleErrors(MicroservicesController.deleteMicroserviceEndPoint,
          successCode, errorCodes)
        const responseObject = await deleteMicroserviceEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/routes/:receiverUuid',
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
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createMicroserviceRouteEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createMicroserviceRouteEndPoint, successCode, errorCodes)
        const responseObject = await createMicroserviceRouteEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/routes/:receiverUuid',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteMicroserviceRouteEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.deleteMicroserviceRouteEndPoint, successCode, errorCodes)
        const responseObject = await deleteMicroserviceRouteEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/port-mapping',
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
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createMicroservicePortMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createMicroservicePortMappingEndPoint, successCode, errorCodes)
        const responseObject = await createMicroservicePortMappingEndPoint(req)
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
    path: '/api/v3/microservices/system/:uuid/port-mapping',
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
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE'])(req, res, async () => {
        const createSystemMicroservicePortMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createSystemMicroservicePortMappingEndPoint, successCode, errorCodes)
        const responseObject = await createSystemMicroservicePortMappingEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/port-mapping/:internalPort',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteMicroservicePortMapping = ResponseDecorator.handleErrors(
          MicroservicesController.deleteMicroservicePortMappingEndPoint, successCode, errorCodes)
        const responseObject = await deleteMicroservicePortMapping(req)
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
    path: '/api/v3/microservices/system/:uuid/port-mapping/:internalPort',
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

      await keycloak.protect(['SRE'])(req, res, async () => {
        const deleteSystemMicroservicePortMapping = ResponseDecorator.handleErrors(
          MicroservicesController.deleteSystemMicroservicePortMappingEndPoint, successCode, errorCodes)
        const responseObject = await deleteSystemMicroservicePortMapping(req)
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
    path: '/api/v3/microservices/:uuid/port-mapping',
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
        const getMicroservicePortMapping = ResponseDecorator.handleErrors(
          MicroservicesController.getMicroservicePortMappingListEndPoint, successCode, errorCodes)
        const responseObject = await getMicroservicePortMapping(req)
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
    path: '/api/v3/microservices/:uuid/volume-mapping',
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
        const listMicroserviceVolumeMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.listMicroserviceVolumeMappingsEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await listMicroserviceVolumeMappingEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/volume-mapping',
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
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const createMicroserviceVolumeMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createMicroserviceVolumeMappingEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await createMicroserviceVolumeMappingEndPoint(req)
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
    path: '/api/v3/microservices/system/:uuid/volume-mapping',
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
        },
        {
          code: constants.HTTP_CODE_NOT_FOUND,
          errors: [Errors.NotFoundError]
        }
      ]

      await keycloak.protect(['SRE'])(req, res, async () => {
        const createSystemMicroserviceVolumeMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.createSystemMicroserviceVolumeMappingEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await createSystemMicroserviceVolumeMappingEndPoint(req)
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
    path: '/api/v3/microservices/:uuid/volume-mapping/:id',
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

      await keycloak.protect(['SRE', 'Developer'])(req, res, async () => {
        const deleteMicroserviceVolumeMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.deleteMicroserviceVolumeMappingEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await deleteMicroserviceVolumeMappingEndPoint(req)
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
    path: '/api/v3/microservices/system/:uuid/volume-mapping/:id',
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

      await keycloak.protect(['SRE'])(req, res, async () => {
        const deleteSystemMicroserviceVolumeMappingEndPoint = ResponseDecorator.handleErrors(
          MicroservicesController.deleteSystemMicroserviceVolumeMappingEndPoint,
          successCode,
          errorCodes
        )
        const responseObject = await deleteSystemMicroserviceVolumeMappingEndPoint(req)
        const user = req.kauth.grant.access_token.content.preferred_username
        res
          .status(responseObject.code)
          .send(responseObject.body)

        logger.apiRes({ req: req, user: user, res: responseObject })
      })
    }
  }
]
