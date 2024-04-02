const Sequelize = require('sequelize')

const config = require('../../config')
const DatabaseProvider = require('./database-provider')

class MySqlDatabaseProvider extends DatabaseProvider {
  constructor () {
    super()

    const mysqlConfig = config.get('Database:Config:mysql', {})
    mysqlConfig.dialect = 'mysql'
    mysqlConfig.host = process.env.DB_HOST || mysqlConfig.host
    mysqlConfig.port = process.env.DB_PORT || mysqlConfig.port
    mysqlConfig.username = process.env.DB_USERNAME || mysqlConfig.username
    mysqlConfig.password = process.env.DB_PASSWORD || mysqlConfig.password
    mysqlConfig.databaseName = process.env.DB_NAME || mysqlConfig.database

    this.sequelize = new Sequelize(mysqlConfig.databaseName, mysqlConfig.username, mysqlConfig.password, mysqlConfig)
  }

  async initDB () {
  }
}

module.exports = MySqlDatabaseProvider
