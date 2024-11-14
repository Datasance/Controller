'use strict'
module.exports = (sequelize, DataTypes) => {
  const Routing = sequelize.define('Routing', {
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
      field: 'name'
    }
  }, {
    tableName: 'Routings',
    timestamps: false,
    underscored: true
  })
  Routing.associate = function (models) {
    Routing.belongsTo(models.Microservice, {
      foreignKey: {
        name: 'sourceMicroserviceUuid',
        field: 'source_microservice_uuid'
      },
      as: 'sourceMicroservice',
      onDelete: 'cascade'
    })

    Routing.belongsTo(models.Microservice, {
      foreignKey: {
        name: 'destMicroserviceUuid',
        field: 'dest_microservice_uuid'
      },
      as: 'destMicroservice',
      onDelete: 'cascade'
    })

    Routing.belongsTo(models.Application, {
      foreignKey: {
        name: 'applicationId',
        field: 'application_id'
      },
      as: 'application',
      onDelete: 'cascade'
    })
  }
  return Routing
}
