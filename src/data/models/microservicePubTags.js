'use strict'
module.exports = (sequelize, DataTypes) => {
  const MicroservicePubTags = sequelize.define('MicroservicePubTags', {}, {
    tableName: 'MicroservicePubTags',
    timestamps: false,
    underscored: true
  })
  return MicroservicePubTags
}
