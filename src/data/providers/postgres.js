const Sequelize = require('sequelize')

const config = require('../../config')
const DatabaseProvider = require('./database-provider')

class PostgresDatabaseProvider extends DatabaseProvider {
  constructor () {
    super()

    const postgresConfig = config.get('Database:Config:postgre', {})
    postgresConfig.dialect = 'postgres'
    postgresConfig.host = process.env.DB_HOST || postgresConfig.host
    postgresConfig.port = process.env.DB_PORT || postgresConfig.port
    postgresConfig.username = process.env.DB_USERNAME || postgresConfig.username
    postgresConfig.password = process.env.DB_PASSWORD || postgresConfig.password
    postgresConfig.databaseName = process.env.DB_NAME || postgresConfig.database

    this.sequelize = new Sequelize(postgresConfig.databaseName, postgresConfig.username, postgresConfig.password, postgresConfig)
  }

  async initDB () {
  }
}

module.exports = PostgresDatabaseProvider
