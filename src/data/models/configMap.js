'use strict'

const SecretHelper = require('../../helpers/secret-helper')

module.exports = (sequelize, DataTypes) => {
  const ConfigMap = sequelize.define('ConfigMap', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'name',
      unique: true
    },
    immutable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'immutable',
      defaultValue: false
    },
    data: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'data',
      defaultValue: '{}',
      get () {
        const rawValue = this.getDataValue('data')
        return rawValue ? JSON.parse(rawValue) : {}
      },
      set (value) {
        this.setDataValue('data', JSON.stringify(value))
      }
    }
  }, {
    tableName: 'ConfigMaps',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['name']
      }
    ],
    hooks: {
      beforeSave: async (configMap) => {
        if (configMap.changed('data')) {
          const encryptedData = await SecretHelper.encryptSecret(
            configMap.data,
            configMap.name
          )
          configMap.data = encryptedData
        }
      },
      afterFind: async (configMap) => {
        if (configMap && configMap.data) {
          try {
            const decryptedData = await SecretHelper.decryptSecret(
              configMap.data,
              configMap.name
            )
            configMap.data = decryptedData
          } catch (error) {
            console.error('Error decrypting ConfigMap data:', error)
            configMap.data = {}
          }
        }
      }
    }
  })

  return ConfigMap
}
