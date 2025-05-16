const logger = require('../logger')
let k8sApi = null

async function initializeK8sClient () {
  if (!k8sApi) {
    logger.debug('Initializing Kubernetes client')
    const k8s = require('@kubernetes/client-node')
    const kubeConfig = new k8s.KubeConfig()

    // Use the in-cluster configuration
    kubeConfig.loadFromCluster()
    k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api)
    logger.info('Kubernetes client initialized successfully')
  }
  return k8sApi
}

async function getSecret (secretName, namespace) {
  logger.debug(`Getting secret: ${secretName} in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.readNamespacedSecret(secretName, namespace)
    logger.info(`Successfully retrieved secret: ${secretName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to get secret ${secretName}: ${error.message}`)
    throw error
  }
}

// ConfigMap methods
async function getConfigMap (configMapName, namespace) {
  logger.debug(`Getting ConfigMap: ${configMapName} in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.readNamespacedConfigMap(configMapName, namespace)
    logger.info(`Successfully retrieved ConfigMap: ${configMapName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to get ConfigMap ${configMapName}: ${error.message}`)
    throw error
  }
}

async function patchConfigMap (configMapName, namespace, patchData) {
  logger.debug(`Patching ConfigMap: ${configMapName} in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    // Pass all options in one object - much cleaner than multiple undefined parameters
    const response = await api.patchNamespacedConfigMap(
      configMapName,
      namespace,
      patchData,
      {
        headers: { 'Content-Type': 'application/strategic-merge-patch+json' }
      }
    )
    logger.info(`Successfully patched ConfigMap: ${configMapName}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to patch ConfigMap ${configMapName}: ${error.message}`)
    throw error
  }
}

// Service methods
async function getNamespacedServices (namespace) {
  logger.debug(`Listing services in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.listNamespacedService(namespace)
    logger.info(`Successfully retrieved ${response.body.items.length} services in namespace: ${namespace}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to list services in namespace ${namespace}: ${error.message}`)
    throw error
  }
}

async function createService (namespace, serviceSpec) {
  logger.debug(`Creating service in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.createNamespacedService(namespace, serviceSpec)
    logger.info(`Successfully created service: ${response.body.metadata.name} in namespace: ${namespace}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to create service in namespace ${namespace}: ${error.message}`)
    throw error
  }
}

async function deleteService (serviceName, namespace) {
  logger.debug(`Deleting service: ${serviceName} in namespace: ${namespace}`)
  try {
    const api = await initializeK8sClient()
    const response = await api.deleteNamespacedService(serviceName, namespace)
    logger.info(`Successfully deleted service: ${serviceName} from namespace: ${namespace}`)
    return response.body
  } catch (error) {
    logger.error(`Failed to delete service ${serviceName}: ${error.message}`)
    throw error
  }
}

/**
 * Gets the LoadBalancer IP for a service if it exists
 * @param {string} serviceName - The name of the service
 * @param {string} namespace - The namespace of the service
 * @returns {Promise<string|null>} The LoadBalancer IP or null if not available
 */
async function watchLoadBalancerIP (serviceName, namespace) {
  logger.debug(`Checking LoadBalancer IP for service: ${serviceName} in namespace: ${namespace}`)
  const api = await initializeK8sClient()
  try {
    const response = await api.readNamespacedService(serviceName, namespace)
    const service = response.body

    // Check if the service type is LoadBalancer
    if (service.spec && service.spec.type === 'LoadBalancer') {
      // Check if the LoadBalancer IP exists
      if (service.status &&
          service.status.loadBalancer &&
          service.status.loadBalancer.ingress &&
          service.status.loadBalancer.ingress.length > 0) {
        const ip = service.status.loadBalancer.ingress[0].ip
        if (ip) {
          logger.info(`Found LoadBalancer IP: ${ip} for service: ${serviceName}`)
          return ip
        }
      }
      logger.info(`Service ${serviceName} is LoadBalancer type but IP not yet assigned`)
    } else {
      const serviceType = service.spec && service.spec.type ? service.spec.type : 'unknown'
      logger.info(`Service ${serviceName} is not of type LoadBalancer (type: ${serviceType})`)
    }
    // Return null if the service is not a LoadBalancer or IP is not yet assigned
    return null
  } catch (error) {
    logger.error(`Error getting LoadBalancer IP for service ${serviceName}: ${error.message}`)
    return null
  }
}

module.exports = {
  getSecret,
  getConfigMap,
  patchConfigMap,
  getNamespacedServices,
  createService,
  deleteService,
  watchLoadBalancerIP
}
