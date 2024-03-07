'use strict'
module.exports = (sequelize, DataTypes) => {
  const ControlPlane = sequelize.define('ControlPlane', {
    uuid: {
      type: DataTypes.STRING(32),
      primaryKey: true,
      allowNull: false,
      field: 'uuid'
    },
    namespace: {
      /* eslint-disable new-cap */
      type: DataTypes.STRING(100),
      field: 'namespace',
      defaultValue: ''
    },
    orgName: {
      /* eslint-disable new-cap */
      type: DataTypes.STRING(100),
      field: 'orgn_name',
      defaultValue: ''
    },
    entitlementId: {
      /* eslint-disable new-cap */
      type: DataTypes.STRING(100),
      field: 'entitlement_id'
    }
  }, {
    tableName: 'ControlPlane',
    timestamps: false,
    underscored: true
  })
  ControlPlane.associate = function (models) {
    ControlPlane.hasMany(models.User, {
      foreignKey: {
        name: 'controlPlaneUuid',
        field: 'controlPlane_uuid'
      },
      as: 'user'
    })

    ControlPlane.hasMany(models.Application, {
      foreignKey: {
        name: 'controlPlaneUuid',
        field: 'controlPlane_uuid'
      },
      as: 'application'
    })

    ControlPlane.hasMany(models.Fog, {
      foreignKey: {
        name: 'controlPlaneUuid',
        field: 'controlPlane_uuid'
      },
      as: 'fog'
    })

    ControlPlane.hasMany(models.Microservice, {
      foreignKey: {
        name: 'controlPlaneUuid',
        field: 'controlPlane_uuid'
      },
      as: 'microservice'
    })
  }
  return ControlPlane
}
