'use strict'
module.exports = (sequelize, DataTypes) => {
  const MicroserviceHealthCheck = sequelize.define('MicroserviceHealthCheck', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    test: {
      type: DataTypes.TEXT,
      field: 'test'
    },
    interval: {
      type: DataTypes.BIGINT,
      field: 'interval'
    },
    timeout: {
      type: DataTypes.BIGINT,
      field: 'timeout'
    },
    startPeriod: {
      type: DataTypes.BIGINT,
      field: 'start_period'
    },
    startInterval: {
      type: DataTypes.BIGINT,
      field: 'start_interval'
    },
    retries: {
      type: DataTypes.INTEGER,
      field: 'retries'
    }
  }, {
    tableName: 'MicroserviceHealthChecks',
    // add the timestamp attributes (updatedAt, createdAt)
    timestamps: true,
    underscored: true
  })
  MicroserviceHealthCheck.associate = function (models) {
    MicroserviceHealthCheck.belongsTo(models.Microservice, {
      foreignKey: {
        name: 'microserviceUuid',
        field: 'microservice_uuid'
      },
      as: 'microservice',
      onDelete: 'cascade'
    })
  }
  return MicroserviceHealthCheck
}
