'use strict'
module.exports = (sequelize, DataTypes) => {
  const MicroserviceDev = sequelize.define('MicroserviceDev', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    devices: {
      type: DataTypes.TEXT,
      field: 'devices'
    }
  }, {
    tableName: 'MicroserviceDevs',
    timestamps: false,
    underscored: true
  })
  MicroserviceArg.associate = function (models) {
    MicroserviceArg.belongsTo(models.Microservice, {
      foreignKey: {
        name: 'microserviceUuid',
        field: 'microservice_uuid'
      },
      as: 'microservice',
      onDelete: 'cascade'
    })
  }
  return MicroserviceDev
}
