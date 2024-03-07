'use strict'
//deleted
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('Routings', 'name', {
      type: Sequelize.STRING(255),
      allowNull: false,
      defaultValue: 'route'
    }).then(() => queryInterface.addIndex('Routings', ['name'], {
      indicesType: 'UNIQUE'
    }))
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('Routings', 'name')
  }
}
