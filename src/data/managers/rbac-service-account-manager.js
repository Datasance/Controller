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

const BaseManager = require('./base-manager')
const models = require('../models')
const RbacServiceAccount = models.RbacServiceAccount
const RbacRoleManager = require('./rbac-role-manager')
const Errors = require('../../helpers/errors')
const RbacCacheVersionManager = require('./rbac-cache-version-manager')

class RbacServiceAccountManager extends BaseManager {
  getEntity () {
    return RbacServiceAccount
  }

  /**
   * Create a ServiceAccount
   * roleRef is required
   */
  async createServiceAccount (saData, transaction) {
    // Check if ServiceAccount already exists
    const existingServiceAccount = await this.findOne({ name: saData.name }, transaction)
    if (existingServiceAccount) {
      throw new Errors.ConflictError(`ServiceAccount '${saData.name}' already exists`)
    }

    // Validate roleRef is provided
    if (!saData.roleRef || !saData.roleRef.name) {
      throw new Errors.ValidationError('ServiceAccount must have a roleRef with a name.')
    }

    // Validate role reference exists - use findOne to get the actual model with id
    // System roles don't exist in DB, so we can't set roleId for them
    const role = await RbacRoleManager.findOne({ name: saData.roleRef.name }, transaction)
    if (!role) {
      // Check if it's a system role
      const roleWithRules = await RbacRoleManager.getRoleWithRules(saData.roleRef.name, transaction)
      if (!roleWithRules) {
        throw new Errors.ValidationError(`Referenced role '${saData.roleRef.name}' does not exist`)
      }
      // System role - roleId will be null (system roles don't have DB ids)
    }

    let serviceAccount
    try {
      serviceAccount = await this.create({
        name: saData.name,
        // namespace removed (controller manages single namespace)
        roleRef: saData.roleRef,
        roleId: role ? role.id : null
      }, transaction)
    } catch (error) {
      // Handle SequelizeUniqueConstraintError as a safety net
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new Errors.ConflictError(`ServiceAccount '${saData.name}' already exists`)
      }
      throw error
    }

    // Increment cache version to invalidate caches on all instances
    await RbacCacheVersionManager.incrementVersion(transaction)

    return serviceAccount
  }

  /**
   * Update a ServiceAccount
   */
  async updateServiceAccount (name, saData, transaction) {
    const sa = await this.findOne({ name }, transaction)
    if (!sa) {
      throw new Errors.NotFoundError(`ServiceAccount '${name}' not found`)
    }

    // Validate roleRef is provided if updating and get role ID
    let roleId = null
    if (saData.roleRef !== undefined) {
      if (!saData.roleRef || !saData.roleRef.name) {
        throw new Errors.ValidationError('ServiceAccount roleRef must have a name.')
      }

      // Validate role reference exists - use findOne to get the actual model with id
      const role = await RbacRoleManager.findOne({ name: saData.roleRef.name }, transaction)
      if (!role) {
        // Check if it's a system role
        const roleWithRules = await RbacRoleManager.getRoleWithRules(saData.roleRef.name, transaction)
        if (!roleWithRules) {
          throw new Errors.ValidationError(`Referenced role '${saData.roleRef.name}' does not exist`)
        }
        // System role - roleId will be null (system roles don't have DB ids)
      } else {
        roleId = role.id
      }
    } else {
      // If roleRef is not provided, keep existing roleId
      const existingRoleRef = sa.roleRef
      if (existingRoleRef && existingRoleRef.name) {
        const role = await RbacRoleManager.findOne({ name: existingRoleRef.name }, transaction)
        if (role) {
          roleId = role.id
        }
        // If not found in DB, it might be a system role - keep roleId as null
      }
    }

    const updateData = {}
    if (saData.name) updateData.name = saData.name
    // namespace removed (not stored in database)
    if (saData.roleRef !== undefined) updateData.roleRef = saData.roleRef
    if (roleId !== null) updateData.roleId = roleId

    await this.update({ name }, updateData, transaction)

    // Increment cache version to invalidate caches on all instances
    await RbacCacheVersionManager.incrementVersion(transaction)

    return this.findOne({ name: saData.name || name }, transaction)
  }

  /**
   * Delete a ServiceAccount
   */
  async deleteServiceAccount (name, transaction) {
    const sa = await this.findOne({ name }, transaction)
    if (!sa) {
      throw new Errors.NotFoundError(`ServiceAccount '${name}' not found`)
    }

    await this.delete({ name }, transaction)

    // Increment cache version to invalidate caches on all instances
    await RbacCacheVersionManager.incrementVersion(transaction)

    return { message: `ServiceAccount '${name}' deleted successfully` }
  }

  /**
   * Get a ServiceAccount by name
   */
  async getServiceAccount (name, transaction) {
    return this.findOne({ name }, transaction)
  }

  /**
   * List all ServiceAccounts
   */
  async listServiceAccounts (transaction) {
    return this.findAll({}, transaction)
  }
}

module.exports = new RbacServiceAccountManager()
