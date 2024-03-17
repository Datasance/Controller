'use strict'

const { convertToInt } = require('../../helpers/app-helper')

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('FogAccessTokens', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        field: 'id'
      },
      expirationTime: {
        type: Sequelize.BIGINT,
        get () {
          return convertToInt(this.getDataValue('expirationTime'))
        },
        field: 'expiration_time'
      },
      token: {
        type: Sequelize.TEXT,
        field: 'token'
      },
      iofogUuid: {
        type: Sequelize.STRING(32),
        field: 'iofog_uuid',
        references: { model: 'Fogs', key: 'uuid' },
        onDelete: 'cascade'
      }
    })
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('FogAccessTokens')
  }
}
