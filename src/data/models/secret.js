'use strict'

const SecretHelper = require('../../helpers/secret-helper')

module.exports = (sequelize, DataTypes) => {
  const Secret = sequelize.define('Secret', {
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
    type: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'type',
      validate: {
        isIn: [['Opaque', 'tls']]
      }
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
    tableName: 'Secrets',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['name']
      }
    ],
    hooks: {
      beforeSave: async (secret) => {
        if (secret.changed('data')) {
          const encryptedData = await SecretHelper.encryptSecret(
            secret.data,
            secret.name
          )
          secret.data = encryptedData
        }
      },
      afterFind: async (secret) => {
        if (secret && secret.data) {
          try {
            const decryptedData = await SecretHelper.decryptSecret(
              secret.data,
              secret.name
            )
            secret.data = decryptedData
          } catch (error) {
            console.error('Error decrypting secret data:', error)
            secret.data = {}
          }
        }
      }
    }
  })

  return Secret
}
