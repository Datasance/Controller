const path = require('path')
const fs = require('fs')
const sqlite3 = require('sqlite3').verbose()

class DatabaseProvider {
  constructor () {
    this.basename = path.basename(__filename)
  }

  // Async function for the migration process
  async runMigration (dbName) {
    const migrationSqlPath = path.resolve(__dirname, '../migrations/db_migration_v1.0.2.sql')

    if (!fs.existsSync(migrationSqlPath)) {
      console.error(`Migration file not found: ${migrationSqlPath}`)
      throw new Error('Migration file not found')
    }

    const migrationSql = fs.readFileSync(migrationSqlPath).toString()
    const dataArr = migrationSql.split(';') // Split by semicolon

    let db = new sqlite3.Database(dbName, (err) => {
      if (err) {
        console.error(err.message)
        throw err
      }
      console.log('Connected to the SQLite database for migration.')
    })

    try {
      db.serialize(() => {
        db.run('PRAGMA foreign_keys=OFF;') // Disable foreign key checks during migration
        db.run('BEGIN TRANSACTION;') // Start transaction
      })

      for (let query of dataArr) {
        if (query.trim()) {
          query = query.trim() + ';' // Ensure semicolon is added back

          // Run each query sequentially
          await new Promise((resolve, reject) => {
            db.run(query, (err) => {
              if (err) {
                if (
                  err.message.includes('already exists') ||
                  err.message.includes('duplicate')
                ) {
                  console.warn(`Ignored error: ${err.message}`)
                  resolve() // Ignore specific errors
                } else {
                  db.run('ROLLBACK;') // Rollback transaction on error
                  reject(err) // Reject on other errors
                }
              } else {
                resolve()
              }
            })
          })
        }
      }

      // Commit the transaction if all queries succeed
      db.run('COMMIT;')
      console.log('Migration completed successfully.')
    } catch (err) {
      console.error('Migration failed:', err)
      throw err
    } finally {
      db.close((err) => {
        if (err) {
          console.error('Error closing database connection:', err.message)
        } else {
          console.log('Database connection closed after migration.')
        }
      })
    }
  }

  // Async function for the seeding process
  async runSeeder (dbName) {
    const seederSqlPath = path.resolve(__dirname, '../seeders/db_seeder_v1.0.1.sql')

    if (!fs.existsSync(seederSqlPath)) {
      console.error(`Seeder file not found: ${seederSqlPath}`)
      throw new Error('Seeder file not found')
    }

    const seederSql = fs.readFileSync(seederSqlPath).toString()
    const dataArr = seederSql.split(';') // Split by semicolon

    let db = new sqlite3.Database(dbName, (err) => {
      if (err) {
        console.error(err.message)
        throw err
      }
      console.log('Connected to the SQLite database for seeding.')
    })

    try {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION;') // Start transaction
      })

      for (let query of dataArr) {
        if (query.trim()) {
          query = query.trim() + ';' // Ensure semicolon is added back

          // Run each query sequentially
          await new Promise((resolve, reject) => {
            db.run(query, (err) => {
              if (err) {
                if (
                  err.message.includes('already exists') ||
                  err.message.includes('duplicate')
                ) {
                  console.warn(`Ignored error: ${err.message}`)
                  resolve() // Ignore specific errors
                } else {
                  db.run('ROLLBACK;') // Rollback transaction on error
                  reject(err) // Reject on other errors
                }
              } else {
                resolve()
              }
            })
          })
        }
      }

      // Commit the transaction if all queries succeed
      db.run('COMMIT;')
      console.log('Seeding completed successfully.')
    } catch (err) {
      console.error('Seeding failed:', err)
      throw err
    } finally {
      db.close((err) => {
        if (err) {
          console.error('Error closing database connection:', err.message)
        } else {
          console.log('Database connection closed after seeding.')
        }
      })
    }
  }
}

module.exports = DatabaseProvider
