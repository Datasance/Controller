const Sequelize = require('sequelize')
const mysql = require('mysql')

const config = require('../../config')
const DatabaseProvider = require('./database-provider')

class MySqlDatabaseProvider extends DatabaseProvider {
  constructor () {
    super()

    const mysqlConfig = config.get('Database:Config', {})
    mysqlConfig.dialect = 'mysql'
    mysqlConfig.host = process.env.DB_HOST || mysqlConfig.host
    mysqlConfig.port = process.env.DB_PORT || mysqlConfig.port
    mysqlConfig.user = process.env.DB_USERNAME || mysqlConfig.user
    mysqlConfig.password = process.env.DB_PASSWORD || mysqlConfig.password
    mysqlConfig.databaseName = process.env.DB_NAME || mysqlConfig.database
    if (!mysqlConfig.database.endsWith('.sql')) {
      mysqlConfig.database += '.sql'
    }
    if (config.use_env_variable) {
      this.sequelize = new Sequelize(process.env[config.use_env_variable], mysqlConfig)
    } else {
      this.sequelize = new Sequelize(mysqlConfig)
    }
    this.connection = mysql.createConnection({
      host: mysqlConfig.host,
      port: mysqlConfig.port,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: mysqlConfig.databaseName
    })
    this.connection.connect()
  }

  async initDB () {
    // Implement initialization logic here
  }
}

module.exports = MySqlDatabaseProvider
