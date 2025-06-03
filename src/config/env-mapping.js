module.exports = {
  // Application Configuration
  'APP_NAME': 'app.name',
  'CONTROL_PLANE': 'app.controlPlane',

  // Server Configuration
  'SERVER_PORT': 'server.port',
  'SERVER_DEV_MODE': 'server.devMode',

  // SSL Configuration
  'SSL_PATH_KEY': 'server.ssl.path.key',
  'SSL_PATH_CERT': 'server.ssl.path.cert',
  'SSL_PATH_INTERMEDIATE_CERT': 'server.ssl.path.intermediateCert',
  'SSL_BASE64_KEY': 'server.ssl.base64.key',
  'SSL_BASE64_CERT': 'server.ssl.base64.cert',
  'SSL_BASE64_INTERMEDIATE_CERT': 'server.ssl.base64.intermediateCert',

  // Viewer Configuration
  'VIEWER_PORT': 'viewer.port',
  'VIEWER_URL': 'viewer.url',

  // Logging Configuration
  'LOG_LEVEL': 'log.level',
  'LOG_DIRECTORY': 'log.directory',
  'LOG_FILE_SIZE': 'log.fileSize',
  'LOG_FILE_COUNT': 'log.fileCount',

  // Settings Configuration
  'FOG_STATUS_UPDATE_INTERVAL': 'settings.fogStatusUpdateInterval',
  'FOG_STATUS_UPDATE_TOLERANCE': 'settings.fogStatusUpdateTolerance',

  // Database Configuration
  'DB_PROVIDER': 'database.provider',
  // These will map to the appropriate provider based on DB_PROVIDER
  'DB_HOST': {
    path: (provider) => `database.${provider}.host`
  },
  'DB_PORT': {
    path: (provider) => `database.${provider}.port`
  },
  'DB_USERNAME': {
    path: (provider) => `database.${provider}.username`
  },
  'DB_PASSWORD': {
    path: (provider) => `database.${provider}.password`
  },
  'DB_NAME': {
    path: (provider) => `database.${provider}.databaseName`
  },

  // Auth Configuration
  'KC_REALM': 'auth.realm',
  'KC_REALM_KEY': 'auth.realmKey',
  'KC_URL': 'auth.url',
  'KC_SSL_REQ': 'auth.sslRequired',
  'KC_CLIENT': 'auth.client.id',
  'KC_CLIENT_SECRET': 'auth.client.secret',
  'KC_VIEWER_CLIENT': 'auth.viewerClient',

  // Bridge Ports Configuration
  'BRIDGE_PORTS_RANGE': 'bridgePorts.range',

  // System Images Configuration
  'ROUTER_IMAGE_1': 'systemImages.router.1',
  'ROUTER_IMAGE_2': 'systemImages.router.2',

  // Diagnostics Configuration
  'DIAGNOSTICS_DIRECTORY': 'diagnostics.directory',

  // OpenTelemetry Configuration
  'ENABLE_TELEMETRY': 'otel.enabled',
  'OTEL_SERVICE_NAME': 'otel.serviceName',
  'OTEL_EXPORTER_OTLP_ENDPOINT': 'otel.endpoint',
  'OTEL_EXPORTER_OTLP_PROTOCOL': 'otel.protocol',
  'OTEL_EXPORTER_OTLP_HEADERS': 'otel.headers',
  'OTEL_RESOURCE_ATTRIBUTES': 'otel.resourceAttributes',
  'OTEL_METRICS_EXPORTER': 'otel.metrics.exporter',
  'OTEL_METRICS_INTERVAL': 'otel.metrics.interval',
  'OTEL_LOG_LEVEL': 'otel.logs.level',
  'OTEL_PROPAGATORS': 'otel.propagators',
  'OTEL_TRACES_SAMPLER': 'otel.traces.sampler',
  'OTEL_TRACES_SAMPLER_ARG': 'otel.traces.samplerArg',
  'OTEL_BATCH_SIZE': 'otel.batch.size',
  'OTEL_BATCH_DELAY': 'otel.batch.delay'
}
