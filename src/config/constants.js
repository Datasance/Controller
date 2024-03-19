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

module.exports = {
  'App:Name': 'iofog-controller',
  'Viewer:Port': 80,

  'Server:Port': 51121,
  'Server:DevMode': false,

  'Service:LogsDirectory': '/var/log/iofog-controller',
  'Service:LogsFileSize': 10485760,
  'Service:LogsFileCount': 10,

  'Settings:DefaultJobIntervalSeconds': 120,
  'Settings:FogTokenExpirationIntervalSeconds': 3600,
  'Settings:FogStatusUpdateIntervalSeconds': 30,
  'Settings:FogStatusUpdateTolerance': 3,

  'Diagnostics:DiagnosticDir': 'diagnostic'
}
