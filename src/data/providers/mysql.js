const Sequelize = require('sequelize')
const config = require('../../config')
const DatabaseProvider = require('./database-provider')
const logger = require('../../logger')
const mysql = require('mysql2/promise')

class MySqlDatabaseProvider extends DatabaseProvider {
  constructor () {
    super()

    // Get MySQL configuration from config or environment variables
    const mysqlConfig = config.get('database.mysql', {})

    // Base MySQL connection options
    const connectionOptions = {
      host: process.env.DB_HOST || mysqlConfig.host,
      port: process.env.DB_PORT || mysqlConfig.port,
      user: process.env.DB_USERNAME || mysqlConfig.username,
      password: process.env.DB_PASSWORD || mysqlConfig.password,
      database: process.env.DB_NAME || mysqlConfig.databaseName,
      connectTimeout: 10000
    }

    // Sequelize configuration
    const sequelizeConfig = {
      dialect: 'mysql',
      host: connectionOptions.host,
      port: connectionOptions.port,
      username: connectionOptions.user,
      password: connectionOptions.password,
      database: connectionOptions.database,
      dialectOptions: {
        connectTimeout: connectionOptions.connectTimeout
      },
      logging: false
    }

    this.sequelize = new Sequelize(sequelizeConfig)
    this.connectionOptions = connectionOptions
  }

  async initDB () {
    try {
      // First try to connect to the database directly
      const connection = await mysql.createConnection(this.connectionOptions)
      await connection.end()
    } catch (err) {
      if (err.code === 'ER_BAD_DB_ERROR') {
        // Database doesn't exist, try to create it
        logger.info('Database does not exist, attempting to create it...')
        const { database, ...connectionConfig } = this.connectionOptions
        const tempConnection = await mysql.createConnection(connectionConfig)
        try {
          await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``)
          logger.info(`Database ${database} created successfully`)
        } finally {
          await tempConnection.end()
        }
      } else {
        throw err
      }
    }
  }
}

module.exports = MySqlDatabaseProvider
