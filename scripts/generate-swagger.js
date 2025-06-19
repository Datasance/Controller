const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

// Base Swagger configuration
const swaggerBase = {
  openapi: '3.0.0',
  info: {
    title: 'Datasance PoT Controller',
    version: '3.5.0',
    description: 'Datasance PoT Controller REST API Documentation'
  },
  servers: [
    {
      url: 'http://localhost:51121/api/v3'
    }
  ],
  tags: [
    { name: 'Controller', description: 'Manage your controller' },
    { name: 'ioFog', description: 'Manage your agents' },
    { name: 'Application', description: 'Manage your applications' },
    { name: 'Application Template', description: 'Manage your application templates' },
    { name: 'Catalog', description: 'Manage your catalog' },
    { name: 'Registries', description: 'Manage your registries' },
    { name: 'Microservices', description: 'Manage your microservices' },
    { name: 'Routing', description: 'Manage your routes' },
    { name: 'Router', description: 'Manage your Default Router' },
    { name: 'Edge Resource', description: 'Manage your Edge Resources' },
    { name: 'Diagnostics', description: 'Diagnostic your microservices' },
    { name: 'Tunnel', description: 'Manage ssh tunnels' },
    { name: 'Agent', description: 'Used by your agents to communicate with your controller' },
    { name: 'User', description: 'Manage your users' },
    { name: 'Secrets', description: 'Manage your secrets' },
    { name: 'Certificates', description: 'Manage your certificates' },
    { name: 'Services', description: 'Manage your services' },
    { name: 'VolumeMounts', description: 'Manage your volume mounts' },
    { name: 'ConfigMap', description: 'Manage your config maps' }
  ],
  components: {
    securitySchemes: {
      authToken: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for authentication (user or agent)'
      }
    },
    schemas: {}
  },
  security: [
    {
      authToken: []
    }
  ],
  paths: {}
}

// Common response headers
const commonHeaders = {
  'X-Timestamp': {
    description: 'FogController server timestamp',
    schema: {
      type: 'number'
    }
  }
}

// Map HTTP methods to response schemas
const responseSchemas = {
  get: {
    '200': {
      description: 'Success',
      headers: commonHeaders,
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
        }
      }
    },
    '401': {
      description: 'Not Authorized'
    },
    '404': {
      description: 'Not Found'
    },
    '500': {
      description: 'Internal Server Error'
    }
  },
  post: {
    '201': {
      description: 'Created',
      headers: commonHeaders,
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
        }
      }
    },
    '400': {
      description: 'Bad Request'
    },
    '401': {
      description: 'Not Authorized'
    },
    '409': {
      description: 'Duplicate Name'
    },
    '500': {
      description: 'Internal Server Error'
    }
  },
  put: {
    '200': {
      description: 'Success',
      headers: commonHeaders,
      content: {
        'application/json': {
          schema: {
            type: 'object'
          }
        }
      }
    },
    '400': {
      description: 'Bad Request'
    },
    '401': {
      description: 'Not Authorized'
    },
    '404': {
      description: 'Not Found'
    },
    '500': {
      description: 'Internal Server Error'
    }
  },
  delete: {
    '204': {
      description: 'Success',
      headers: commonHeaders
    },
    '401': {
      description: 'Not Authorized'
    },
    '404': {
      description: 'Not Found'
    },
    '500': {
      description: 'Internal Server Error'
    }
  }
}

// Convert JSON Schema to OpenAPI Schema
function convertJsonSchemaToOpenAPI (schema) {
  if (!schema) return {}
  const openAPISchema = { ...schema }

  // Remove JSON Schema specific properties
  delete openAPISchema.id
  delete openAPISchema.$schema

  // Remove OpenAPI-incompatible properties
  delete openAPISchema.if
  delete openAPISchema.then
  delete openAPISchema.const
  delete openAPISchema.optional

  // Handle required arrays
  if (openAPISchema.required && Array.isArray(openAPISchema.required) && openAPISchema.required.length === 0) {
    delete openAPISchema.required
  }

  // Convert $ref to OpenAPI format
  if (openAPISchema.$ref) {
    const refPath = openAPISchema.$ref.replace(/^\//, '')
    // Only add #/components/schemas/ if it's not already there
    if (!refPath.startsWith('#/components/schemas/')) {
      openAPISchema.$ref = `#/components/schemas/${refPath}`
    } else {
      openAPISchema.$ref = refPath
    }
  }

  // Handle properties
  if (openAPISchema.properties) {
    Object.keys(openAPISchema.properties).forEach(key => {
      if (openAPISchema.properties[key].$ref) {
        const refPath = openAPISchema.properties[key].$ref.replace(/^\//, '')
        // Only add #/components/schemas/ if it's not already there
        if (!refPath.startsWith('#/components/schemas/')) {
          openAPISchema.properties[key].$ref = `#/components/schemas/${refPath}`
        } else {
          openAPISchema.properties[key].$ref = refPath
        }
      }
      // Remove additional properties from nested objects
      if (openAPISchema.properties[key].type === 'object') {
        delete openAPISchema.properties[key].additionalProperties
      }
      // Handle items in arrays
      if (openAPISchema.properties[key].items) {
        if (openAPISchema.properties[key].items.type === 'object') {
          delete openAPISchema.properties[key].items.additionalProperties
          // Convert key/value pairs to properties
          if (openAPISchema.properties[key].items.key && openAPISchema.properties[key].items.value) {
            openAPISchema.properties[key].items = {
              type: 'object',
              properties: {
                key: openAPISchema.properties[key].items.key,
                value: openAPISchema.properties[key].items.value
              }
            }
          }
        }
        // Handle array item references
        if (openAPISchema.properties[key].items.$ref) {
          const refPath = openAPISchema.properties[key].items.$ref.replace(/^\//, '')
          // Only add #/components/schemas/ if it's not already there
          if (!refPath.startsWith('#/components/schemas/')) {
            openAPISchema.properties[key].items = {
              $ref: `#/components/schemas/${refPath}`
            }
          } else {
            openAPISchema.properties[key].items = {
              $ref: refPath
            }
          }
        }
      }
      // Handle required arrays in properties
      if (openAPISchema.properties[key].required && Array.isArray(openAPISchema.properties[key].required)) {
        if (openAPISchema.properties[key].required.length === 0) {
          delete openAPISchema.properties[key].required
        }
      }
      // Handle intermediateCert optional property
      if (key === 'intermediateCert') {
        delete openAPISchema.properties[key].optional
      }
      // Handle microserviceDelete additionalProperties
      if (key === 'additionalProperties') {
        openAPISchema.properties[key] = {
          type: 'object',
          additionalProperties: true
        }
      }
      // Handle serviceCreate resource required
      if (key === 'resource' && openAPISchema.properties[key].required) {
        if (!Array.isArray(openAPISchema.properties[key].required)) {
          openAPISchema.properties[key].required = ['cpu', 'memory']
        }
      }
    })
  }

  // Handle array items
  if (openAPISchema.items) {
    if (openAPISchema.items.$ref) {
      const refPath = openAPISchema.items.$ref.replace(/^\//, '')
      // Only add #/components/schemas/ if it's not already there
      if (!refPath.startsWith('#/components/schemas/')) {
        openAPISchema.items.$ref = `#/components/schemas/${refPath}`
      } else {
        openAPISchema.items.$ref = refPath
      }
    }
    // Remove additional properties from array items
    if (openAPISchema.items.type === 'object') {
      delete openAPISchema.items.additionalProperties
    }
  }

  // Handle allOf/anyOf
  if (openAPISchema.allOf) {
    openAPISchema.allOf = openAPISchema.allOf.map(item => {
      const converted = convertJsonSchemaToOpenAPI(item)
      // Remove const from routerMode in anyOf/allOf
      if (converted.properties && converted.properties.routerMode) {
        delete converted.properties.routerMode.const
      }
      return converted
    })
  }
  if (openAPISchema.anyOf) {
    openAPISchema.anyOf = openAPISchema.anyOf.map(item => {
      const converted = convertJsonSchemaToOpenAPI(item)
      // Remove const from routerMode in anyOf/allOf
      if (converted.properties && converted.properties.routerMode) {
        delete converted.properties.routerMode.const
      }
      return converted
    })
  }

  // Remove additionalProperties at root level
  delete openAPISchema.additionalProperties

  return openAPISchema
}

// Convert path parameters from :param to {param} format and remove /api/v3 prefix
function convertPathParameters (path) {
  // Remove /api/v3 prefix if present
  const pathWithoutPrefix = path.replace(/^\/api\/v3/, '')
  // Convert :param to {param}
  return pathWithoutPrefix.replace(/:([^/]+)/g, '{$1}')
}

// Get response schema based on route path and method
function getResponseSchema (path, method) {
  const baseResponse = JSON.parse(JSON.stringify(responseSchemas[method] || responseSchemas.get))
  // Customize response schema based on path
  if (path.includes('/application')) {
    if (method === 'get') {
      baseResponse['200'].content['application/json'].schema = {
        type: 'object',
        properties: {
          applications: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                version: { type: 'string' },
                microservices: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      config: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } else if (path.includes('/microservices')) {
    if (method === 'get') {
      baseResponse['200'].content['application/json'].schema = {
        type: 'object',
        properties: {
          microservices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                uuid: { type: 'string' },
                name: { type: 'string' },
                config: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }
  return baseResponse
}

// Get request body schema based on route path and method
function getRequestBodySchema (path, method) {
  // Handle YAML file upload endpoints
  if (path.endsWith('/yaml')) {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              application: {
                type: 'string',
                format: 'binary'
              }
            }
          }
        }
      }
    }
  }

  // Map routes to their corresponding schemas based on service validations
  const schemaMapping = {
    // Application routes
    '/application': {
      post: 'applicationCreate',
      put: 'applicationUpdate',
      patch: 'applicationPatch'
    },
    // Microservice routes
    '/microservices': {
      post: 'microserviceCreate',
      put: 'microserviceUpdate'
    },
    // Iofog routes
    '/iofog': {
      post: 'iofogCreate',
      put: 'iofogUpdate'
    },
    // Agent routes
    '/agent': {
      post: 'agentProvision',
      put: 'updateAgentConfig'
    },
    // Routing routes
    '/routing': {
      post: 'routingCreate',
      put: 'routingUpdate'
    },
    // Secret routes
    '/secret': {
      post: 'secretCreate',
      put: 'secretUpdate'
    },
    // Service routes
    '/service': {
      post: 'serviceCreate',
      put: 'serviceUpdate'
    },
    // Certificate routes
    '/certificate': {
      post: 'certificateCreate',
      put: 'caCreate'
    },
    // Config map routes
    '/configMap': {
      post: 'configMapCreate',
      put: 'configMapUpdate'
    },
    // Volume mount routes
    '/volumeMount': {
      post: 'volumeMountCreate',
      put: 'volumeMountUpdate'
    },
    // Edge resource routes
    '/edgeResource': {
      post: 'edgeResourceCreate',
      put: 'edgeResourceUpdate'
    },
    // Application template routes
    '/applicationTemplate': {
      post: 'applicationTemplateCreate',
      put: 'applicationTemplateUpdate',
      patch: 'applicationTemplatePatch'
    },
    // User routes
    '/user': {
      post: 'login',
      put: 'refresh'
    },
    // Catalog routes
    '/catalog': {
      post: 'catalogItemCreate',
      put: 'catalogItemUpdate'
    },
    // Registry routes
    '/registry': {
      post: 'registryCreate',
      put: 'registryUpdate'
    },
    // Tunnel routes
    '/tunnel': {
      post: 'tunnelCreate'
    },
    // Config routes
    '/config': {
      put: 'configUpdate'
    }
  }

  // Find the matching schema for this path and method
  for (const [routePath, methods] of Object.entries(schemaMapping)) {
    if (path.includes(routePath) && methods[method]) {
      const schemaName = methods[method]
      return {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: `#/components/schemas/${schemaName}`
            }
          }
        }
      }
    }
  }

  // Default JSON request body
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object'
        }
      }
    }
  }
}

// Find the most similar tag from the tag list
function findMostSimilarTag (path) {
  const pathSegments = path.split('/').filter(Boolean)
  if (pathSegments.length === 0) return 'Controller'

  // Get the first meaningful segment (skip empty strings)
  const firstSegment = pathSegments[0]

  // Define tag mapping for common paths
  const tagMapping = {
    'application': 'Application',
    'applications': 'Application',
    'flow': 'Application',
    'flows': 'Application',
    'template': 'Application Template',
    'templates': 'Application Template',
    'catalog': 'Catalog',
    'registry': 'Registries',
    'registries': 'Registries',
    'microservice': 'Microservices',
    'microservices': 'Microservices',
    'route': 'Routing',
    'routes': 'Routing',
    'routing': 'Routing',
    'router': 'Router',
    'edgeResource': 'Edge Resource',
    'edgeResources': 'Edge Resource',
    'edge-resource': 'Edge Resource',
    'edge-resources': 'Edge Resource',
    'edge_resource': 'Edge Resource',
    'edge_resources': 'Edge Resource',
    'diagnostic': 'Diagnostics',
    'diagnostics': 'Diagnostics',
    'tunnel': 'Tunnel',
    'tunnels': 'Tunnel',
    'agent': 'Agent',
    'agents': 'Agent',
    'user': 'User',
    'users': 'User',
    'secret': 'Secrets',
    'secrets': 'Secrets',
    'certificate': 'Certificates',
    'certificates': 'Certificates',
    'service': 'Services',
    'services': 'Services',
    'volume': 'VolumeMounts',
    'volumes': 'VolumeMounts',
    'config': 'ConfigMap',
    'configs': 'ConfigMap',
    'iofog': 'ioFog'
  }

  // Try to find an exact match first (case-insensitive)
  const lowerFirstSegment = firstSegment.toLowerCase()
  if (tagMapping[lowerFirstSegment]) {
    return tagMapping[lowerFirstSegment]
  }

  // Try to find a match with different case formats
  const possibleFormats = [
    firstSegment,
    firstSegment.toLowerCase(),
    firstSegment.toUpperCase(),
    firstSegment.replace(/([A-Z])/g, '-$1').toLowerCase(),
    firstSegment.replace(/([A-Z])/g, '_$1').toLowerCase(),
    firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
  ]

  for (const format of possibleFormats) {
    if (tagMapping[format]) {
      return tagMapping[format]
    }
  }

  // If no exact match, try to find the most similar tag
  const tagNames = swaggerBase.tags.map(tag => tag.name.toLowerCase())
  let bestMatch = 'Controller'
  let bestScore = 0

  for (const tagName of tagNames) {
    // Check if the path segment contains the tag name or vice versa
    if (lowerFirstSegment.includes(tagName) || tagName.includes(lowerFirstSegment)) {
      const score = Math.min(lowerFirstSegment.length, tagName.length)
      if (score > bestScore) {
        bestScore = score
        bestMatch = swaggerBase.tags.find(tag => tag.name.toLowerCase() === tagName).name
      }
    }
  }

  return bestMatch
}

// Process route file
function processRouteFile (filePath) {
  const routeFile = require(filePath)
  const paths = {}
  routeFile.forEach(route => {
    // Skip WebSocket endpoints
    if (route.method.toLowerCase() === 'ws') {
      return
    }

    const originalPath = route.path
    const path = convertPathParameters(originalPath)
    const method = route.method.toLowerCase()
    if (!paths[path]) {
      paths[path] = {}
    }
    // Extract parameters from path
    const pathParams = []
    const pathRegex = /{([^}]+)}/g
    let match
    while ((match = pathRegex.exec(path)) !== null) {
      pathParams.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: {
          type: 'string'
        }
      })
    }
    // Create path object
    paths[path][method] = {
      tags: [findMostSimilarTag(path)],
      summary: `${method.toUpperCase()} ${originalPath}`,
      security: [{ authToken: [] }],
      parameters: pathParams,
      responses: getResponseSchema(path, method)
    }
    // Add request body for POST/PUT/PATCH
    if (['post', 'put', 'patch'].includes(method)) {
      paths[path][method].requestBody = getRequestBodySchema(path, method)
    }
  })
  return paths
}

// Process schema file
function processSchemaFile (filePath) {
  const schemaFile = require(filePath)
  const schemas = {}

  // Process all inner schemas first
  if (schemaFile.innerSchemas) {
    schemaFile.innerSchemas.forEach(schema => {
      if (schema.id) {
        const schemaName = schema.id.replace(/^\//, '')
        schemas[schemaName] = convertJsonSchemaToOpenAPI(schema)
      }
    })
  }

  // Then process main schemas
  if (schemaFile.mainSchemas) {
    schemaFile.mainSchemas.forEach(schema => {
      if (schema.id) {
        const schemaName = schema.id.replace(/^\//, '')
        schemas[schemaName] = convertJsonSchemaToOpenAPI(schema)
      }
    })
  }

  // Handle direct schema exports
  Object.keys(schemaFile).forEach(key => {
    if (typeof schemaFile[key] === 'object' && schemaFile[key].type) {
      const schemaName = key
      schemas[schemaName] = convertJsonSchemaToOpenAPI(schemaFile[key])
    }
  })

  return schemas
}

// Main function
function generateSwagger () {
  const routesDir = path.join(__dirname, '../src/routes')
  const schemasDir = path.join(__dirname, '../src/schemas')

  // First, add base schemas that are commonly referenced
  const baseSchemas = {
    image: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        registry: { type: 'string' }
      },
      required: ['name']
    },
    volumeMappings: {
      type: 'object',
      properties: {
        hostDestination: { type: 'string' },
        containerDestination: { type: 'string' },
        accessMode: { type: 'string' },
        type: { type: 'string', enum: ['volume', 'bind'] }
      },
      required: ['hostDestination', 'containerDestination', 'accessMode']
    },
    ports: {
      type: 'object',
      properties: {
        internal: { type: 'integer' },
        external: { type: 'integer' },
        protocol: { type: 'string', enum: ['tcp', 'udp'] }
      },
      required: ['internal', 'external']
    },
    extraHosts: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { type: 'string' }
      },
      required: ['name', 'address']
    },
    env: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
        valueFromSecret: { type: 'string' },
        valueFromConfigMap: { type: 'string' }
      },
      required: ['key'],
      oneOf: [
        { required: ['value'] },
        { required: ['valueFromSecret'] },
        { required: ['valueFromConfigMap'] }
      ]
    }
  }

  // Initialize schemas with base schemas
  const allSchemas = { ...baseSchemas }

  // Process all schema files
  fs.readdirSync(schemasDir)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      const schemaDefinitions = processSchemaFile(path.join(schemasDir, file))
      Object.assign(allSchemas, schemaDefinitions)
    })

  // Add all schemas to the OpenAPI document
  swaggerBase.components.schemas = allSchemas

  // Process all route files
  fs.readdirSync(routesDir)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      const routePaths = processRouteFile(path.join(routesDir, file))
      Object.assign(swaggerBase.paths, routePaths)
    })

  // Write to YAML file
  const yamlStr = yaml.dump(swaggerBase, {
    noRefs: true, // Disable YAML anchors and references
    lineWidth: -1, // Disable line wrapping
    noCompatMode: true // Use modern YAML features
  })
  fs.writeFileSync(path.join(__dirname, '../docs/swagger-test.yaml'), yamlStr)
  console.log('Swagger YAML generated successfully!')
}

generateSwagger()
