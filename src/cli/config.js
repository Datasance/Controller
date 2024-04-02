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

const BaseCLIHandler = require('./base-cli-handler')
const config = require('../config')
const constants = require('../helpers/constants')
const AppHelper = require('../helpers/app-helper')
const ErrorMessages = require('../helpers/error-messages')
const Validator = require('../schemas')
const logger = require('../logger')
const CliDataTypes = require('./cli-data-types')

class Config extends BaseCLIHandler {
  constructor () {
    super()

    this.name = constants.CMD_CONFIG
    this.commandDefinitions = [
      {
        name: 'command',
        defaultOption: true,
        group: constants.CMD
      },
      {
        name: 'port',
        alias: 'p',
        type: CliDataTypes.Integer,
        description: 'Port',
        group: constants.CMD_ADD
      },
      {
        name: 'ssl-cert',
        alias: 'c',
        type: String,
        description: 'Path to SSL certificate file',
        group: constants.CMD_ADD
      },
      {
        name: 'ssl-key',
        alias: 'k',
        type: String,
        description: 'Path to SSL key file',
        group: constants.CMD_ADD
      },
      {
        name: 'intermediate-cert',
        alias: 'i',
        type: String,
        description: 'Path to SSL intermediate certificate file',
        group: constants.CMD_ADD
      },
      {
        name: 'log-dir',
        alias: 'd',
        type: String,
        description: 'Path to log files directory',
        group: constants.CMD_ADD
      },
      {
        name: 'log-size',
        alias: 'z',
        type: CliDataTypes.Integer,
        description: 'Log files size (MB)',
        group: constants.CMD_ADD
      },
      {
        name: 'log-file-count',
        alias: 'g',
        type: CliDataTypes.Integer,
        description: 'Log files count',
        group: constants.CMD_ADD
      }
    ]
    this.commands = {
      [constants.CMD_ADD]: 'Add a new config value.',
      [constants.CMD_LIST]: 'Display current config.',
      [constants.CMD_DEV_MODE]: 'Dev mode config.'
    }
  }

  async run (args) {
    try {
      const configCommand = this.parseCommandLineArgs(this.commandDefinitions, { argv: args.argv, partial: false })

      const command = configCommand.command.command

      this.validateParameters(command, this.commandDefinitions, args.argv)

      switch (command) {
        case constants.CMD_ADD:
          await _executeCase(configCommand, constants.CMD_ADD, _addConfigOption)
          break
        case constants.CMD_LIST:
          await _executeCase(configCommand, constants.CMD_LIST, _listConfigOptions)
          break
        case constants.CMD_DEV_MODE:
          await _executeCase(configCommand, constants.CMD_DEV_MODE, _changeDevModeState)
          break
        case constants.CMD_HELP:
        default:
          return this.help([], true, false)
      }
    } catch (error) {
      this.handleCLIError(error, args.argv)
    }
  }
}

const _executeCase = async function (catalogCommand, commandName, f) {
  try {
    const item = catalogCommand[commandName]
    await f(item)
  } catch (error) {
    logger.error(error.message)
  }
}

const _addConfigOption = async function (options) {
  await Validator.validate(options, Validator.schemas.configUpdate)

  await updateConfig(options.port, 'port', 'Server:Port', async (onSuccess) => {
    const port = options.port
    const status = await AppHelper.checkPortAvailability(port)
    if (status === 'closed') {
      config.set('Server:Port', port)
      onSuccess()
    } else {
      logger.error(AppHelper.formatMessage(ErrorMessages.PORT_NOT_AVAILABLE, port))
    }
  })

  await updateConfig(options.sslCert, 'ssl-cert', 'Server:SslCert', (onSuccess) => {
    const sslCert = options.sslCert
    if (!AppHelper.isFileExists(sslCert)) {
      logger.error(ErrorMessages.INVALID_FILE_PATH)
      return
    }
    config.set('Server:SslCert', sslCert)
    onSuccess()
  })

  await updateConfig(options.sslKey, 'ssl-key', 'Server:SslKey', (onSuccess) => {
    const sslKey = options.sslKey
    if (!AppHelper.isFileExists(sslKey)) {
      logger.error(ErrorMessages.INVALID_FILE_PATH)
      return
    }
    config.set('Server:SslKey', sslKey)
    onSuccess()
  })

  await updateConfig(options.intermediateCert, 'intermediate-cert', 'Server:IntermediateCert', (onSuccess) => {
    const intermediateCert = options.intermediateCert
    if (!AppHelper.isFileExists(intermediateCert)) {
      logger.error(ErrorMessages.INVALID_FILE_PATH)
      return
    }
    config.set('Server:IntermediateCert', intermediateCert)
    onSuccess()
  })

  await updateConfig(options.logDir, 'log-dir', 'Service:LogsDirectory', (onSuccess) => {
    config.set('Service:LogsDirectory', options.logDir)
    onSuccess()
  })

  await updateConfig(options.logSize, 'log-size', 'Service:LogsFileSize', (onSuccess) => {
    config.set('Service:LogsFileSize', options.logSize * 1024)
    onSuccess()
  })

  await updateConfig(options.logSize, 'log-file-counr', 'Service:LogsFileCount', (onSuccess) => {
    config.set('Service:LogsFileCount', options.logFileCount)
    onSuccess()
  })
}

const updateConfig = async function (newConfigValue, cliConfigName, configName, fn) {
  if (newConfigValue) {
    const oldConfigValue = config.get(configName)
    if (newConfigValue !== oldConfigValue) {
      await fn(function () {
        const currentConfigValue = config.get(configName)
        logger.cliRes(`Config option ${cliConfigName} has been set to ${currentConfigValue}`)
      })
    } else {
      logger.cliRes(`Config option ${cliConfigName} is already set to ${newConfigValue}`)
    }
  }
}

const _listConfigOptions = function () {
  const configuration = {
    'Port': config.get('Server:Port'),
    'SSL key directory': config.get('Server:SslKey'),
    'SSL certificate directory': config.get('Server:SslCert'),
    'Intermediate key directory': config.get('Server:IntermediateCert'),
    'Log files directory': config.get('Service:LogsDirectory'),
    'Log files size': config.get('Service:LogsFileSize'),
    'Log files count': config.get('Service:LogsFileCount'),
    'Dev mode': config.get('Server:DevMode')
  }

  const result = Object.keys(configuration)
    .filter((key) => configuration[key] != null)
    .map((key) => `${key}: ${configuration[key]}`)
    .join('\n')
  console.log(result)
}

const _changeDevModeState = async function (options) {
  const enableDevMode = AppHelper.validateBooleanCliOptions(options.on, options.off)
  config.set('Server:DevMode', enableDevMode)
  logger.cliRes('Dev mode state updated successfully.')
}

module.exports = new Config()
