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

    if (config.use_env_variable) {
      this.sequelize = new Sequelize(process.env[config.use_env_variable], mysqlConfig)
    } else {
      this.sequelize = new Sequelize(mysqlConfig.databaseName, mysqlConfig.username, mysqlConfig.password, mysqlConfig)
    }
    this.sequelize.authenticate().then(() => {
      console.log('Connection has been established successfully.')
    }).catch((error) => {
      console.error('Unable to connect to the database: ', error)
    })
  }

  async initDB () {
    // Implement initialization logic here
  }
}

module.exports = MySqlDatabaseProvider
