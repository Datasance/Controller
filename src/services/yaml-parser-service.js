const Errors = require('../helpers/errors')
const lget = require('lodash/get')
const yaml = require('js-yaml')

async function parseAppFile (fileContent) {
  const doc = yaml.load(fileContent)
  if (doc.kind !== 'Application') {
    throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
  }
  if (doc.metadata == null || doc.spec == null) {
    throw new Errors.ValidationError('Invalid YAML format')
  }
  const application = {
    name: lget(doc, 'metadata.name', undefined),
    ...(await parseAppYAML(doc.spec))
  }
  return application
}

async function parseAppYAML (app) {
  const application = {
    ...app,
    isActivated: app.isActivated || true,
    microservices: await Promise.all((app.microservices || []).map(async (m) => parseMicroserviceYAML(m)))
  }
  return application
}

async function parseAppTemplateFile (fileContent) {
  const doc = yaml.load(fileContent)
  if (doc.kind !== 'ApplicationTemplate') {
    throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
  }
  if (doc.metadata == null || doc.spec == null) {
    throw new Errors.ValidationError('Invalid YAML format')
  }
  const appTemplate = {
    name: lget(doc, 'metadata.name', undefined),
    application: await parseAppYAML(doc.spec.application),
    description: doc.spec.description,
    variables: doc.spec.variables
  }
  _deleteUndefinedFields(appTemplate)
  return appTemplate
}

async function parseSecretFile (fileContent, options = {}) {
  try {
    const doc = yaml.load(fileContent)
    if (!doc || !doc.kind) {
      throw new Errors.ValidationError(`Invalid YAML format: missing kind field`)
    }
    if (doc.kind !== 'Secret') {
      throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
    }
    if (doc.metadata == null || doc.type == null || doc.data == null) {
      throw new Errors.ValidationError('Invalid YAML format: missing metadata or spec')
    }

    // If this is an update, validate that the name matches
    if (options.isUpdate && options.secretName) {
      if (doc.metadata.name !== options.secretName) {
        throw new Errors.ValidationError(`Secret name in YAML (${doc.metadata.name}) doesn't match endpoint path (${options.secretName})`)
      }

      // For updates, we only need the data
      return {
        data: doc.data
      }
    }

    // For creates, return full object
    return {
      name: lget(doc, 'metadata.name', undefined),
      type: doc.spec.type,
      data: doc.data
    }
  } catch (error) {
    if (error instanceof Errors.ValidationError) {
      throw error
    }
    throw new Errors.ValidationError(`Error parsing YAML: ${error.message}`)
  }
}

async function parseVolumeMountFile (fileContent, options = {}) {
  try {
    const doc = yaml.load(fileContent)
    if (!doc || !doc.kind) {
      throw new Errors.ValidationError(`Invalid YAML format: missing kind field`)
    }
    if (doc.kind !== 'VolumeMount') {
      throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
    }
    if (doc.metadata == null || doc.spec == null) {
      throw new Errors.ValidationError('Invalid YAML format: missing metadata or spec')
    }

    // Validate that either secretName or configMapName is provided, but not both
    if (doc.spec.secretName && doc.spec.configMapName) {
      throw new Errors.ValidationError('Cannot specify both secretName and configMapName')
    }
    if (!doc.spec.secretName && !doc.spec.configMapName) {
      throw new Errors.ValidationError('Must specify either secretName or configMapName')
    }

    // If this is an update, validate that the name matches
    if (options.isUpdate && options.volumeMountName) {
      if (doc.metadata.name !== options.volumeMountName) {
        throw new Errors.ValidationError(`VolumeMount name in YAML (${doc.metadata.name}) doesn't match endpoint path (${options.volumeMountName})`)
      }

      return {
        name: lget(doc, 'metadata.name', undefined),
        secretName: doc.spec.secretName,
        configMapName: doc.spec.configMapName
      }
    }

    // For creates, return full object
    return {
      name: lget(doc, 'metadata.name', undefined),
      secretName: doc.spec.secretName,
      configMapName: doc.spec.configMapName
    }
  } catch (error) {
    if (error instanceof Errors.ValidationError) {
      throw error
    }
    throw new Errors.ValidationError(`Error parsing YAML: ${error.message}`)
  }
}

async function parseConfigMapFile (fileContent, options = {}) {
  try {
    const doc = yaml.load(fileContent)
    if (!doc || !doc.kind) {
      throw new Errors.ValidationError(`Invalid YAML format: missing kind field`)
    }
    if (doc.kind !== 'ConfigMap') {
      throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
    }
    if (doc.metadata == null || doc.data == null) {
      throw new Errors.ValidationError('Invalid YAML format: missing metadata or spec')
    }

    // If this is an update, validate that the name matches
    if (options.isUpdate && options.configMapName) {
      if (doc.metadata.name !== options.configMapName) {
        throw new Errors.ValidationError(`ConfigMap name in YAML (${doc.metadata.name}) doesn't match endpoint path (${options.configMapName})`)
      }

      // For updates, we only need the data
      return {
        data: doc.data
      }
    }

    // For creates, return full object
    return {
      name: lget(doc, 'metadata.name', undefined),
      data: doc.data,
      immutable: doc.spec.immutable
    }
  } catch (error) {
    if (error instanceof Errors.ValidationError) {
      throw error
    }
    throw new Errors.ValidationError(`Error parsing YAML: ${error.message}`)
  }
}

async function parseServiceFile (fileContent, options = {}) {
  try {
    const doc = yaml.load(fileContent)
    if (!doc || !doc.kind) {
      throw new Errors.ValidationError(`Invalid YAML format: missing kind field`)
    }
    if (doc.kind !== 'Service') {
      throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
    }
    if (doc.metadata == null || doc.spec == null) {
      throw new Errors.ValidationError('Invalid YAML format: missing metadata or spec')
    }

    // If this is an update, validate that the name matches
    if (options.isUpdate && options.serviceName) {
      if (doc.metadata.name !== options.serviceName) {
        throw new Errors.ValidationError(`Service name in YAML (${doc.metadata.name}) doesn't match endpoint path (${options.serviceName})`)
      }

      // For updates, we only need the spec and tags fields
      return {
        name: lget(doc, 'metadata.name', undefined),
        tags: lget(doc, 'metadata.tags', []),
        type: doc.spec.type,
        resource: doc.spec.resource,
        targetPort: doc.spec.targetPort,
        defaultBridge: doc.spec.defaultBridge,
        servicePort: doc.spec.servicePort,
        k8sType: doc.spec.k8sType
      }
    }

    // For creates, return full object
    return {
      name: lget(doc, 'metadata.name', undefined),
      tags: lget(doc, 'metadata.tags', []),
      type: doc.spec.type,
      resource: doc.spec.resource,
      targetPort: doc.spec.targetPort,
      defaultBridge: doc.spec.defaultBridge,
      servicePort: doc.spec.servicePort,
      k8sType: doc.spec.k8sType
    }
  } catch (error) {
    if (error instanceof Errors.ValidationError) {
      throw error
    }
    throw new Errors.ValidationError(`Error parsing YAML: ${error.message}`)
  }
}

const mapImages = (images) => {
  const imgs = []
  if (images.x86 != null) {
    imgs.push({
      fogTypeId: 1,
      containerImage: images.x86
    })
  }
  if (images.arm != null) {
    imgs.push({
      fogTypeId: 2,
      containerImage: images.arm
    })
  }
  return imgs
}

const parseMicroserviceImages = async (fileImages) => {
  // Could be undefined if patch call
  if (!fileImages) {
    return { registryId: undefined, images: undefined, catalogItemId: undefined }
  }
  if (fileImages.catalogId > 0) {
    return { registryId: undefined, images: undefined, catalogItemId: fileImages.catalogId }
  }
  const registryByName = {
    remote: 1,
    local: 2
  }
  const images = mapImages(fileImages)
  const registryId = fileImages.registry != null ? registryByName[fileImages.registry] || Number(fileImages.registry) : 1
  return { registryId, catalogItemId: undefined, images }
}

const parseMicroserviceYAML = async (microservice) => {
  const { registryId, catalogItemId, images } = await parseMicroserviceImages(microservice.images)
  const container = microservice.container || {}
  const microserviceData = {
    config: microservice.config != null ? JSON.stringify(microservice.config) : undefined,
    name: microservice.name,
    catalogItemId,
    agentName: lget(microservice, 'agent.name'),
    registryId,
    ...container,
    rootHostAccess: lget(microservice, 'rootHostAccess', false),
    pidMode: lget(microservice, 'pidMode', ''),
    ipcMode: lget(microservice, 'ipcMode', ''),
    annotations: container.annotations != null ? JSON.stringify(container.annotations) : undefined,
    capAdd: lget(microservice, 'container.capAdd', []),
    capDrop: lget(microservice, 'container.capDrop', []),
    ports: (lget(microservice, 'container.ports', [])),
    volumeMappings: lget(microservice, 'container.volumes', []),
    cmd: lget(microservice, 'container.commands', []),
    env: (lget(microservice, 'container.env', [])).map(e => ({ key: e.key.toString(), value: e.value.toString() })),
    images,
    extraHosts: lget(microservice, 'container.extraHosts', []),
    ...microservice.msRoutes,
    pubTags: lget(microservice, 'msRoutes.pubTags', []),
    subTags: lget(microservice, 'msRoutes.subTags', []),
    application: microservice.application
  }
  _deleteUndefinedFields(microserviceData)
  return microserviceData
}

async function parseMicroserviceFile (fileContent) {
  const doc = yaml.load(fileContent)
  if (doc.kind !== 'Microservice') {
    throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
  }
  if (doc.metadata == null || doc.spec == null) {
    throw new Errors.ValidationError('Invalid YAML format')
  }
  const microservice = {
    name: lget(doc, 'metadata.name', undefined),
    ...(await parseMicroserviceYAML(doc.spec))
  }
  // Name could be FQName: <app_name>/<msvc_name>
  if (microservice.name) {
    const splittedName = microservice.name.split('/')
    switch (splittedName.length) {
      case 1: {
        microservice.name = splittedName[0]
        break
      }
      case 2: {
        microservice.name = splittedName[1]
        microservice.application = splittedName[0]
        break
      }
      default: {
        throw new Errors.ValidationError(`Invalid name ${microservice.name}`)
      }
    }
  }
  return microservice
}

const _deleteUndefinedFields = (obj) => Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key])

async function parseCertificateFile (fileContent) {
  try {
    const doc = yaml.load(fileContent)
    if (!doc || !doc.kind) {
      throw new Errors.ValidationError(`Invalid YAML format: missing kind field`)
    }
    if (doc.kind !== 'Certificate' && doc.kind !== 'CertificateAuthority') {
      throw new Errors.ValidationError(`Invalid kind ${doc.kind}`)
    }
    if (doc.metadata == null || doc.spec == null) {
      throw new Errors.ValidationError('Invalid YAML format: missing metadata or spec')
    }

    const result = {
      name: lget(doc, 'metadata.name', undefined),
      ...doc.spec
    }

    if (doc.kind === 'CertificateAuthority') {
      result.isCA = true
    }

    return result
  } catch (error) {
    if (error instanceof Errors.ValidationError) {
      throw error
    }
    throw new Errors.ValidationError(`Error parsing YAML: ${error.message}`)
  }
}

module.exports = {
  parseAppTemplateFile: parseAppTemplateFile,
  parseAppFile: parseAppFile,
  parseMicroserviceFile: parseMicroserviceFile,
  parseSecretFile: parseSecretFile,
  parseVolumeMountFile: parseVolumeMountFile,
  parseConfigMapFile: parseConfigMapFile,
  parseCertificateFile: parseCertificateFile,
  parseServiceFile: parseServiceFile
}
