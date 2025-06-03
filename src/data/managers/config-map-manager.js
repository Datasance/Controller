const BaseManager = require('./base-manager')
const SecretHelper = require('../../helpers/secret-helper')
const models = require('../models')
const ConfigMap = models.ConfigMap

class ConfigMapManager extends BaseManager {
  getEntity () {
    return ConfigMap
  }

  async createConfigMap (name, immutable, data, transaction) {
    return this.create({
      name,
      immutable: immutable,
      data: data
    }, transaction)
  }

  async updateConfigMap (name, immutable, data, transaction) {
    const encryptedData = await SecretHelper.encryptSecret(data, name)
    return this.update(
      { name },
      { immutable: immutable, data: encryptedData },
      transaction
    )
  }

  async getConfigMap (name, transaction) {
    const configMap = await this.findOne({ name }, transaction)
    if (!configMap) {
      return null
    }
    return {
      ...configMap.toJSON(),
      data: configMap.data
    }
  }

  async listConfigMaps (transaction) {
    const configMaps = await this.findAll({}, transaction)
    return configMaps.map(configMap => ({
      id: configMap.id,
      name: configMap.name,
      created_at: configMap.created_at,
      updated_at: configMap.updated_at
    }))
  }

  async deleteConfigMap (name, transaction) {
    return this.delete({ name }, transaction)
  }
}

module.exports = new ConfigMapManager()
