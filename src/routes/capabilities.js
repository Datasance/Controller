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
const logger = require('../logger')
const keycloak = require('../config/keycloak.js').initKeycloak()

module.exports = [
  {
    method: 'head',
    path: '/api/v3/capabilities/edgeResources',
    middleware: async (req, res) => {
      logger.apiReq(req)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        res.sendStatus(204)
      })
    }
  },
  {
    method: 'head',
    path: '/api/v3/capabilities/applicationTemplates',
    middleware: async (req, res) => {
      logger.apiReq(req)

      // Add keycloak.protect() middleware to protect the route
      await keycloak.protect(['SRE', 'Developer', 'Viewer'])(req, res, async () => {
        res.sendStatus(204)
      })
    }
  }
]
