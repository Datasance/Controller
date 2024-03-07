const config = require('../../config')

const ControlPlaneConfig = config.get('ControlPlane:Config', {})

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.Insert('ControlPlane', [
      {
        namespace: ControlPlaneConfig.namespace,
        orgName: ControlPlaneConfig.orgName,
        entitlementId: ControlPlaneConfig.entitlementID
      }
    ])
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.Delete('ControlPlane', null, {})
  }
}
