/*
 * *******************************************************************************
 *  * Copyright (c) 2023 Datasance Teknoloji A.S.
 *  *
 *  * This program and the accompanying materials are made available under the
 *  * terms of the Eclipse Public License v. 2.0 which is available at
 *  * http://www.eclipse.org/legal/epl-2.0
 *  *
 *  * SPDX-License-Identifier: EPL-2.0
 *  *******************************************************************************
 *
 */

const models = require('../models')
const logger = require('../../logger')
const { Op } = require('sequelize')

class FogUsedTokenManager {
  /**
   * Store a JTI (JWT ID) to mark it as used
   * @param {string} jti - The JWT ID
   * @param {string} fogUuid - The UUID of the fog node
   * @param {number} exp - The expiration timestamp
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<void>}
   */
  static async storeJti (jti, fogUuid, exp, transaction) {
    try {
      if (!transaction || transaction.fakeTransaction) {
        // If no transaction or fake transaction, create a new one
        await models.FogUsedToken.create({
          jti,
          iofogUuid: fogUuid,
          expiryTime: exp
        })
      } else {
        // Use the provided transaction
        await models.FogUsedToken.create({
          jti,
          iofogUuid: fogUuid,
          expiryTime: exp
        }, { transaction })
      }
    } catch (error) {
      logger.error(`Failed to store JTI: ${error.message}`)
      throw error
    }
  }

  /**
   * Check if a JTI has already been used
   * @param {string} jti - The JWT ID to check
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<boolean>} True if the JTI has been used, false otherwise
   */
  static async isJtiUsed (jti, transaction) {
    try {
      let token
      if (!transaction || transaction.fakeTransaction) {
        // If no transaction or fake transaction, query without transaction
        token = await models.FogUsedToken.findOne({
          where: { jti }
        })
      } else {
        // Use the provided transaction
        token = await models.FogUsedToken.findOne({
          where: { jti },
          transaction
        })
      }
      return !!token
    } catch (error) {
      logger.error(`Failed to check JTI: ${error.message}`)
      throw error
    }
  }

  /**
   * Clean up expired JTIs
   * @returns {Promise<number>} Number of deleted tokens
   */
  static async cleanupExpiredJtis () {
    try {
      const now = new Date().getTime() / 1000 // Convert to Unix timestamp
      const result = await models.FogUsedToken.destroy({
        where: {
          expiryTime: {
            [Op.lt]: now
          }
        }
      })
      logger.debug(`Cleaned up ${result} expired JTIs`)
      return result
    } catch (error) {
      logger.error(`Failed to cleanup expired JTIs: ${error.message}`)
      throw error
    }
  }
}

module.exports = FogUsedTokenManager
