/*
 *  *******************************************************************************
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

const RbacRoleManager = require('../data/managers/rbac-role-manager')
const RbacRoleBindingManager = require('../data/managers/rbac-role-binding-manager')
const RbacServiceAccountManager = require('../data/managers/rbac-service-account-manager')
const MicroserviceManager = require('../data/managers/microservice-manager')
const TransactionDecorator = require('../decorators/transaction-decorator')
const Errors = require('../helpers/errors')
const Validator = require('../schemas/index')
const ChangeTrackingService = require('./change-tracking-service')
const logger = require('../logger')

/**
 * Validate that role name does not match a system role
 * @param {string} roleName - Role name to validate
 * @throws {Errors.ValidationError} If role name matches a system role
 */
function validateNotSystemRole (roleName) {
  if (RbacRoleManager.isSystemRole(roleName)) {
    throw new Errors.ValidationError(`Cannot use role name '${roleName}'. '${roleName}' is a system role and cannot be created or used.`)
  }
}

/**
 * Helper function to notify microservices when a service account is updated
 * Finds all microservices linked to the service account and triggers change tracking
 * @param {number} serviceAccountId - ID of the updated service account
 * @param {object} transaction - Database transaction
 */
async function _notifyMicroservicesForServiceAccountUpdate (serviceAccountId, transaction) {
  try {
    const microservices = await MicroserviceManager.findAll({
      serviceAccountId: serviceAccountId
    }, transaction)

    if (microservices && microservices.length > 0) {
      const iofogUuids = microservices
        .map(ms => ms.iofogUuid)
        .filter(uuid => uuid !== null && uuid !== undefined)

      for (const iofogUuid of iofogUuids) {
        try {
          await ChangeTrackingService.update(iofogUuid, ChangeTrackingService.events.microserviceFull, transaction)
        } catch (error) {
          logger.error(`Failed to update change tracking for fog ${iofogUuid} after service account update:`, error.message)
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to notify microservices for service account update (ID: ${serviceAccountId}):`, error.message)
  }
}

// Role Management
async function listRolesEndpoint (transaction) {
  const roles = await RbacRoleManager.listRoles(transaction)
  return {
    roles: roles
  }
}

async function getRoleEndpoint (name, transaction) {
  const role = await RbacRoleManager.getRoleWithRules(name, transaction)
  if (!role) {
    throw new Errors.NotFoundError(`Role '${name}' not found`)
  }
  return {
    role: role
  }
}

async function createRoleEndpoint (roleData, transaction) {
  // Validate schema
  await Validator.validate(roleData, Validator.schemas.roleCreate)

  // Validate role name does not match system role
  validateNotSystemRole(roleData.name)

  const role = await RbacRoleManager.createRole(roleData, transaction)
  return {
    role: role
  }
}

async function updateRoleEndpoint (name, roleData, transaction) {
  // Validate schema
  await Validator.validate(roleData, Validator.schemas.roleUpdate)

  // Prevent updating system roles
  if (RbacRoleManager.isSystemRole(name)) {
    throw new Errors.ValidationError(`Cannot update role '${name}'. '${name}' is a system role and cannot be modified.`)
  }

  // Prevent renaming to system role names
  if (roleData.name) {
    validateNotSystemRole(roleData.name)
  }

  // Get the role before update to get its ID - use findOne to get actual database model
  const oldRole = await RbacRoleManager.findOne({ name }, transaction)
  if (!oldRole) {
    throw new Errors.NotFoundError(`Role '${name}' not found`)
  }

  const role = await RbacRoleManager.updateRole(name, roleData, transaction)
  // Get the updated role to get its ID (in case name changed) - use findOne to get actual database model
  const updatedRoleName = roleData.name || name
  const updatedRole = await RbacRoleManager.findOne({ name: updatedRoleName }, transaction)
  if (!updatedRole) {
    throw new Errors.NotFoundError(`Role '${updatedRoleName}' not found after update`)
  }

  const roleId = updatedRole.id

  // Only query for bindings/service accounts if we have a valid roleId
  // System roles don't have database IDs, but we already prevent updating system roles above
  if (roleId != null) {
    // Find all role bindings that reference this role using roleId for efficient querying
    const bindings = await RbacRoleBindingManager.findAll({ roleId: roleId }, transaction)
    for (const binding of bindings) {
      // Trigger update to refresh cache and ensure roleId is set
      await RbacRoleBindingManager.updateRoleBinding(binding.name, {
        roleRef: binding.roleRef
      }, transaction)
    }

    // Find all service accounts that reference this role using roleId for efficient querying
    const serviceAccounts = await RbacServiceAccountManager.findAll({ roleId: roleId }, transaction)
    for (const sa of serviceAccounts) {
      // Trigger update to refresh cache and ensure roleId is set
      await RbacServiceAccountManager.updateServiceAccount(sa.name, {
        roleRef: sa.roleRef
      }, transaction)
      // Notify linked microservices
      await _notifyMicroservicesForServiceAccountUpdate(sa.id, transaction)
    }
  }

  return {
    role: role
  }
}

async function deleteRoleEndpoint (name, transaction) {
  await RbacRoleManager.deleteRole(name, transaction)
  return {
    message: `Role '${name}' deleted successfully`
  }
}

// RoleBinding Management
async function listRoleBindingsEndpoint (transaction) {
  const bindings = await RbacRoleBindingManager.listRoleBindings(transaction)
  return {
    bindings: bindings
  }
}

async function getRoleBindingEndpoint (name, transaction) {
  const binding = await RbacRoleBindingManager.getRoleBinding(name, transaction)
  if (!binding) {
    throw new Errors.NotFoundError(`RoleBinding '${name}' not found`)
  }
  return {
    binding: binding
  }
}

async function createRoleBindingEndpoint (bindingData, transaction) {
  // Validate schema
  await Validator.validate(bindingData, Validator.schemas.roleBindingCreate)

  const binding = await RbacRoleBindingManager.createRoleBinding(bindingData, transaction)
  return {
    binding: binding
  }
}

async function updateRoleBindingEndpoint (name, bindingData, transaction) {
  // Validate schema
  await Validator.validate(bindingData, Validator.schemas.roleBindingUpdate)

  const binding = await RbacRoleBindingManager.updateRoleBinding(name, bindingData, transaction)
  return {
    binding: binding
  }
}

async function deleteRoleBindingEndpoint (name, transaction) {
  await RbacRoleBindingManager.deleteRoleBinding(name, transaction)
  return {
    message: `RoleBinding '${name}' deleted successfully`
  }
}

// ServiceAccount Management
async function listServiceAccountsEndpoint (transaction) {
  const serviceAccounts = await RbacServiceAccountManager.listServiceAccounts(transaction)
  return {
    serviceAccounts: serviceAccounts
  }
}

async function getServiceAccountEndpoint (name, transaction) {
  const sa = await RbacServiceAccountManager.getServiceAccount(name, transaction)
  if (!sa) {
    throw new Errors.NotFoundError(`ServiceAccount '${name}' not found`)
  }
  return {
    serviceAccount: sa
  }
}

async function createServiceAccountEndpoint (saData, transaction) {
  // Validate schema
  await Validator.validate(saData, Validator.schemas.serviceAccountCreate)

  const sa = await RbacServiceAccountManager.createServiceAccount(saData, transaction)
  return {
    serviceAccount: sa
  }
}

async function updateServiceAccountEndpoint (name, saData, transaction) {
  // Validate schema
  await Validator.validate(saData, Validator.schemas.serviceAccountUpdate)

  const sa = await RbacServiceAccountManager.updateServiceAccount(name, saData, transaction)

  // Notify linked microservices about the service account update
  await _notifyMicroservicesForServiceAccountUpdate(sa.id, transaction)

  return {
    serviceAccount: sa
  }
}

async function deleteServiceAccountEndpoint (name, transaction) {
  // Get service account first to check if it exists and get its ID
  const sa = await RbacServiceAccountManager.getServiceAccount(name, transaction)
  if (!sa) {
    throw new Errors.NotFoundError(`ServiceAccount '${name}' not found`)
  }

  // Check if any microservice is referencing this service account
  const referencingMicroservice = await MicroserviceManager.findOne({
    serviceAccountId: sa.id
  }, transaction)

  if (referencingMicroservice) {
    throw new Errors.ConflictError(
      `Cannot delete ServiceAccount '${name}' because it is referenced by microservice '${referencingMicroservice.name}' (uuid: ${referencingMicroservice.uuid}). Please delete or update the microservice first.`
    )
  }

  await RbacServiceAccountManager.deleteServiceAccount(name, transaction)
  return {
    message: `ServiceAccount '${name}' deleted successfully`
  }
}

module.exports = {
  // Role endpoints
  listRolesEndpoint: TransactionDecorator.generateTransaction(listRolesEndpoint),
  getRoleEndpoint: TransactionDecorator.generateTransaction(getRoleEndpoint),
  createRoleEndpoint: TransactionDecorator.generateTransaction(createRoleEndpoint),
  updateRoleEndpoint: TransactionDecorator.generateTransaction(updateRoleEndpoint),
  deleteRoleEndpoint: TransactionDecorator.generateTransaction(deleteRoleEndpoint),
  // RoleBinding endpoints
  listRoleBindingsEndpoint: TransactionDecorator.generateTransaction(listRoleBindingsEndpoint),
  getRoleBindingEndpoint: TransactionDecorator.generateTransaction(getRoleBindingEndpoint),
  createRoleBindingEndpoint: TransactionDecorator.generateTransaction(createRoleBindingEndpoint),
  updateRoleBindingEndpoint: TransactionDecorator.generateTransaction(updateRoleBindingEndpoint),
  deleteRoleBindingEndpoint,
  // ServiceAccount endpoints
  listServiceAccountsEndpoint: TransactionDecorator.generateTransaction(listServiceAccountsEndpoint),
  getServiceAccountEndpoint: TransactionDecorator.generateTransaction(getServiceAccountEndpoint),
  createServiceAccountEndpoint: TransactionDecorator.generateTransaction(createServiceAccountEndpoint),
  updateServiceAccountEndpoint: TransactionDecorator.generateTransaction(updateServiceAccountEndpoint),
  deleteServiceAccountEndpoint: TransactionDecorator.generateTransaction(deleteServiceAccountEndpoint)
}
