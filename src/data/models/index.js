'use strict'

const fs = require('fs')
const path = require('path')
const Sequelize = require('sequelize')
const lget = require('lodash/get')
const constants = require('../constants')
const basename = path.basename(__filename)
const db = {}
const config = require('../../config')
const logger = require('../../logger')

const databaseProvider = require('../providers/database-factory')
const sequelize = databaseProvider.sequelize

fs
  .readdirSync(__dirname)
  .filter((file) => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js')
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
    db[model.name] = model
  })

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

db.sequelize = sequelize
db.Sequelize = Sequelize

const configureImage = async (db, name, fogTypes, images) => {
  const catalogItem = await db.CatalogItem.findOne({ where: { name, isPublic: false } })
  for (const fogType of fogTypes) {
    if (fogType.id === 0) {
      // Skip auto detect type
      continue
    }
    const image = lget(images, fogType.id, '')
    await db.CatalogItemImage.update({ containerImage: image }, { where: { fogTypeId: fogType.id, catalogItemId: catalogItem.id } })
  }
}

db.initDB = async (isStart) => {
  await databaseProvider.initDB(isStart)

  if (isStart) {
    if (databaseProvider instanceof require('../providers/sqlite')) {
      const sqliteDbPath = databaseProvider.sequelize.options.storage

      // Check if the database file exists
      if (fs.existsSync(sqliteDbPath)) {
        logger.info('Database file exists. Running migrations only...')
        await databaseProvider.runMigration(sqliteDbPath) // Ensure migration finishes before moving on
      } else {
        logger.info('Database file does not exist. Running migrations and seeders...')
        await databaseProvider.runMigration(sqliteDbPath) // Wait for migration to finish
        await databaseProvider.runSeeder(sqliteDbPath) // Wait for seeding to finish
      }
    }

    // Configure system images
    const fogTypes = await db.FogType.findAll({})
    await configureImage(db, constants.ROUTER_CATALOG_NAME, fogTypes, config.get('systemImages.router', {}))
    await configureImage(db, constants.PROXY_CATALOG_NAME, fogTypes, config.get('systemImages.proxy', {}))
  }
}

module.exports = db
