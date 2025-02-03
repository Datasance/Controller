'use strict'
module.exports = (sequelize, DataTypes) => {
  const MicroserviceSubTags = sequelize.define('MicroserviceSubTags', {}, {
    tableName: 'MicroserviceSubTags',
    timestamps: false,
    underscored: true
  })
  return MicroserviceSubTags
}
