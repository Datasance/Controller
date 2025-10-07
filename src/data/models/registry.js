'use strict'
module.exports = (sequelize, DataTypes) => {
  const Registry = sequelize.define('Registry', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    url: {
      type: DataTypes.TEXT,
      field: 'url'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      field: 'is_public'
    },
    username: {
      type: DataTypes.TEXT,
      field: 'user_name'
    },
    password: {
      type: DataTypes.TEXT,
      field: 'password'
    },
    userEmail: {
      type: DataTypes.TEXT,
      field: 'user_email'
    }
  }, {
    tableName: 'Registries',
    timestamps: false,
    underscored: true
  })
  return Registry
}
