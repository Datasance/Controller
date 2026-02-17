'use strict'

module.exports = (sequelize, DataTypes) => {
  const NatsAccountRule = sequelize.define('NatsAccountRule', {
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
      unique: true,
      field: 'name'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description'
    },
    infoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'info_url'
    },
    maxConnections: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_connections'
    },
    maxLeafNodeConnections: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_leaf_node_connections'
    },
    maxData: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'max_data'
    },
    maxExports: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_exports'
    },
    maxImports: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_imports'
    },
    maxMsgPayload: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_msg_payload'
    },
    maxSubscriptions: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_subscriptions'
    },
    exportsAllowWildcards: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'exports_allow_wildcards',
      defaultValue: true
    },
    disallowBearer: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'disallow_bearer'
    },
    responsePermissions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'response_permissions'
    },
    respMax: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'resp_max'
    },
    respTtl: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'resp_ttl'
    },
    imports: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'imports'
    },
    exports: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'exports'
    },
    memStorage: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'mem_storage'
    },
    diskStorage: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'disk_storage'
    },
    streams: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'streams'
    },
    consumer: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'consumer'
    },
    maxAckPending: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_ack_pending'
    },
    memMaxStreamBytes: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'mem_max_stream_bytes'
    },
    diskMaxStreamBytes: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'disk_max_stream_bytes'
    },
    maxBytesRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'max_bytes_required'
    },
    tieredLimits: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'tiered_limits'
    },
    pubAllow: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'pub_allow'
    },
    pubDeny: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'pub_deny'
    },
    subAllow: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sub_allow'
    },
    subDeny: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sub_deny'
    }
  }, {
    tableName: 'NatsAccountRules',
    timestamps: true,
    underscored: true
  })

  NatsAccountRule.associate = function (models) {
    NatsAccountRule.hasMany(models.Application, {
      foreignKey: {
        name: 'natsRuleId',
        field: 'nats_rule_id'
      },
      as: 'applications'
    })
  }

  return NatsAccountRule
}
