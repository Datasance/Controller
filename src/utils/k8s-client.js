const logger = require('../logger')
const config = require('../config')

// Only set CONTROLLER_NAMESPACE if running in Kubernetes mode
let CONTROLLER_NAMESPACE = null

function checkKubernetesEnvironment () {
  const controlPlane = process.env.CONTROL_PLANE || config.get('app.ControlPlane')
  return controlPlane && controlPlane.toLowerCase() === 'kubernetes'
}

if (checkKubernetesEnvironment()) {
  CONTROLLER_NAMESPACE = process.env.CONTROLLER_NAMESPACE

  // Validate that CONTROLLER_NAMESPACE is set when in Kubernetes mode
  if (!CONTROLLER_NAMESPACE) {
    logger.error('CONTROLLER_NAMESPACE environment variable is not set')
    throw new Error('CONTROLLER_NAMESPACE environment variable is not set')
  }
}

let k8sApi = null

async function initializeK8sClient () {
  if (!k8sApi) {
    logger.debug('Initializing Kubernetes client')
    const k8s = require('@kubernetes/client-node')
    const kubeConfig = new k8s.KubeConfig()

    // Use the in-cluster configuration
    kubeConfig.loadFromCluster()
    // kubeConfig.loadFromDefault()
    k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api)
    logger.info('Kubernetes client initialized successfully')
  }
  return k8sApi
}

async function getSecret (secretName) {
  logger.debug(`Getting secret: ${secretName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.readNamespacedSecret(secretName, CONTROLLER_NAMESPACE)
    logger.info(`Successfully retrieved secret: ${secretName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to get secret ${secretName}: ${error.message}`)
    throw error
  }
}

async function getService (serviceName) {
  logger.debug(`Getting service: ${serviceName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.readNamespacedService(serviceName, CONTROLLER_NAMESPACE)
    logger.info(`Successfully retrieved service: ${serviceName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to get service ${serviceName}: ${error.message}`)
    throw error
  }
}

// ConfigMap methods
async function getConfigMap (configMapName) {
  logger.debug(`Getting ConfigMap: ${configMapName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.readNamespacedConfigMap(configMapName, CONTROLLER_NAMESPACE)
    logger.info(`Successfully retrieved ConfigMap: ${configMapName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to get ConfigMap ${configMapName}: ${error.message}`)
    throw error
  }
}

async function patchConfigMap (configMapName, patchData) {
  logger.debug(`Patching ConfigMap: ${configMapName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()

    // Create JSON Patch operation with formatted JSON
    const patch = [
      {
        op: 'replace',
        path: '/data/skrouterd.json',
        value: typeof patchData.data['skrouterd.json'] === 'string'
          ? JSON.stringify(JSON.parse(patchData.data['skrouterd.json']), null, 2)
          : JSON.stringify(patchData.data['skrouterd.json'], null, 2)
      }
    ]

    const { body: configMap } = await api.patchNamespacedConfigMap(
      configMapName,
      CONTROLLER_NAMESPACE,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'content-type': 'application/json-patch+json' } }
    )
    logger.info(`Successfully patched ConfigMap: ${configMapName}`)
    return configMap
  } catch (error) {
    logger.error(`Failed to patch ConfigMap ${configMapName}: ${error.message}`)
    if (error.response) {
      logger.error(`Response status: ${error.response.status}`)
      logger.error(`Response body: ${JSON.stringify(error.response.body)}`)
    }
    throw error
  }
}

// Service methods
async function getNamespacedServices () {
  logger.debug(`Listing services in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.listNamespacedService(CONTROLLER_NAMESPACE)
    logger.info(`Successfully retrieved ${response.body.items.length} services in namespace: ${CONTROLLER_NAMESPACE}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to list services in namespace ${CONTROLLER_NAMESPACE}: ${error.message}`)
    throw error
  }
}

async function createService (serviceSpec) {
  logger.debug(`Creating service in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.createNamespacedService(CONTROLLER_NAMESPACE, serviceSpec)
    logger.info(`Successfully created service: ${response.body.metadata.name} in namespace: ${CONTROLLER_NAMESPACE}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to create service in namespace ${CONTROLLER_NAMESPACE}: ${error.message}`)
    if (error.response) {
      logger.error(`Response status: ${error.response.status}`)
      logger.error(`Response body: ${JSON.stringify(error.response.body)}`)
    }
    throw error
  }
}

async function deleteService (serviceName) {
  logger.debug(`Deleting service: ${serviceName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.deleteNamespacedService(serviceName, CONTROLLER_NAMESPACE)
    logger.info(`Successfully deleted service: ${serviceName} from namespace: ${CONTROLLER_NAMESPACE}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to delete service ${serviceName}: ${error.message}`)
    throw error
  }
}

/**
 * Updates a service using strategic merge patch
 * @param {string} serviceName - The name of the service to update
 * @param {Object} patchData - The patch data to apply to the service
 * @returns {Promise<Object>} The updated service object
 */
async function updateService (serviceName, patchData) {
  logger.debug(`Updating service: ${serviceName} in namespace: ${CONTROLLER_NAMESPACE}`)
  try {
    const api = await initializeK8sClient()

    // For strategic merge patch, we send the data as a map
    const patch = {
      spec: patchData.spec,
      metadata: patchData.metadata
    }

    const response = await api.patchNamespacedService(
      serviceName,
      CONTROLLER_NAMESPACE,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/json-patch+json' } }
    )
    logger.info(`Successfully updated service: ${serviceName} in namespace: ${CONTROLLER_NAMESPACE}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to update service ${serviceName}: ${error.message}`)
    if (error.response) {
      logger.error(`Response status: ${error.response.status}`)
      logger.error(`Response body: ${JSON.stringify(error.response.body)}`)
    }
    throw error
  }
}

/**
 * Gets the LoadBalancer IP for a service if it exists
 * @param {string} serviceName - The name of the service
 * @param {number} maxRetries - Maximum number of retries (default: 30)
 * @param {number} retryInterval - Interval between retries in milliseconds (default: 2000)
 * @returns {Promise<string|null>} The LoadBalancer IP or null if not available after timeout
 */
async function watchLoadBalancerIP (serviceName, maxRetries = 10, retryInterval = 2000) {
  logger.debug(`Checking LoadBalancer IP for service: ${serviceName} in namespace: ${CONTROLLER_NAMESPACE}`)
  const api = await initializeK8sClient()

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await api.readNamespacedService(serviceName, CONTROLLER_NAMESPACE)
      const service = response.body

      // Check if the service type is LoadBalancer
      if (service.spec && service.spec.type === 'LoadBalancer') {
        // Check if the LoadBalancer IP exists
        if (service.status &&
            service.status.loadBalancer &&
            service.status.loadBalancer.ingress &&
            service.status.loadBalancer.ingress.length > 0) {
          const ingress = service.status.loadBalancer.ingress[0]
          if (ingress.ip) {
            logger.info(`Found LoadBalancer IP: ${ingress.ip} for service: ${serviceName}`)
            return ingress.ip
          } else if (ingress.hostname) {
            logger.info(`Found LoadBalancer hostname: ${ingress.hostname} for service: ${serviceName}`)
            return ingress.hostname
          }
        }
        logger.info(`Service ${serviceName} is LoadBalancer type but IP not yet assigned (attempt ${attempt + 1}/${maxRetries})`)
      } else {
        const serviceType = service.spec && service.spec.type ? service.spec.type : 'unknown'
        logger.info(`Service ${serviceName} is not of type LoadBalancer (type: ${serviceType})`)
        return null
      }

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, retryInterval))
    } catch (error) {
      logger.error(`Error getting LoadBalancer IP for service ${serviceName}: ${error.message}`)
      // Wait before next retry even if there's an error
      await new Promise(resolve => setTimeout(resolve, retryInterval))
    }
  }

  logger.warn(`LoadBalancer IP not assigned for service ${serviceName} after ${maxRetries} attempts`)
  return null
}

module.exports = {
  getSecret,
  getService,
  getConfigMap,
  patchConfigMap,
  getNamespacedServices,
  createService,
  deleteService,
  updateService,
  watchLoadBalancerIP,
  checkKubernetesEnvironment
}
