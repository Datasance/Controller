'use strict'
module.exports = (sequelize, DataTypes) => {
  const Tags = sequelize.define('Tags', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    value: {
      type: DataTypes.TEXT,
      unique: true,
      allowNull: false,
      field: 'value'
    }
  }, {
    tableName: 'Tags',
    timestamps: false,
    underscored: true
  })
  Tags.associate = function (models) {
    Tags.belongsToMany(models.Fog, { through: 'IofogTags', as: 'iofogs' })
    Tags.belongsToMany(models.EdgeResource, { through: 'EdgeResourceOrchestrationTags', as: 'edgeResources' })
    Tags.belongsToMany(models.Microservice, { through: 'MicroservicePubTags', as: 'pubMicroservices' })
    Tags.belongsToMany(models.Microservice, { through: 'MicroserviceSubTags', as: 'subMicroservices' })
    Tags.belongsToMany(models.Service, { through: 'ServiceTags', as: 'services' })
  }
  return Tags
}
