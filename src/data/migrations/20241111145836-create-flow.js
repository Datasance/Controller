'use strict'
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('Flows', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        field: 'id'

      },
      name: {
        type: Sequelize.TEXT,
        field: 'name',
        defaultValue: 'New Application'
      },
      description: {
        type: Sequelize.TEXT,
        field: 'description',
        defaultValue: ''
      },
      isActivated: {
        type: Sequelize.BOOLEAN,
        field: 'is_activated',
        defaultValue: false
      },
      isSystem: {
        type: Sequelize.BOOLEAN,
        field: 'is_system',
        defaultValue: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'created_at'
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'updated_at'
      }
    })
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('Flows')
  }
}
