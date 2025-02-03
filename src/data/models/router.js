'use strict'

module.exports = (sequelize, DataTypes) => {
  const Router = sequelize.define('Router', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    isEdge: {
      type: DataTypes.BOOLEAN,
      field: 'is_edge',
      defaultValue: true
    },
    messagingPort: {
      type: DataTypes.INTEGER,
      field: 'messaging_port',
      defaultValue: 5672
    },
    edgeRouterPort: {
      type: DataTypes.INTEGER,
      field: 'edge_router_port'
    },
    interRouterPort: {
      type: DataTypes.INTEGER,
      field: 'inter_router_port'
    },
    host: {
      type: DataTypes.TEXT,
      field: 'host'
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      field: 'is_default',
      defaultValue: false
    },
    requireSsl: {
      type: DataTypes.TEXT,
      field: 'require_ssl'
    },
    sslProfile: {
      type: DataTypes.TEXT,
      field: 'ssl_profile'
    },
    saslMechanisms: {
      type: DataTypes.TEXT,
      field: 'sasl_mechanisms'
    },
    authenticatePeer: {
      type: DataTypes.TEXT,
      field: 'authenticate_peer'
    },
    caCert: {
      type: DataTypes.TEXT,
      field: 'ca_cert'
    },
    tlsCert: {
      type: DataTypes.TEXT,
      field: 'tls_cert'
    },
    tlsKey: {
      type: DataTypes.TEXT,
      field: 'tls_key'
    }
  }, {
    tableName: 'Routers',
    timestamps: true,
    underscored: true
  })
  Router.associate = function (models) {
    Router.belongsTo(models.Fog, {
      foreignKey: {
        name: 'iofogUuid',
        field: 'iofog_uuid'
      },
      as: 'iofog',
      onDelete: 'cascade'
    })

    Router.hasMany(models.RouterConnection, {
      foreignKey: 'source_router',
      as: 'upstreamRouters'
    })
  }

  return Router
}
