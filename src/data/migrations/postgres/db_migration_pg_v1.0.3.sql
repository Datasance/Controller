CREATE TABLE IF NOT EXISTS "Flows" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) UNIQUE,
    description VARCHAR(255) DEFAULT '',
    is_activated BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)
);

CREATE TABLE IF NOT EXISTS "Registries" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url VARCHAR(255),
    is_public BOOLEAN,
    secure BOOLEAN,
    certificate TEXT,
    requires_cert BOOLEAN,
    user_name TEXT,
    password TEXT,
    user_email TEXT
);


CREATE TABLE IF NOT EXISTS "CatalogItems" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) UNIQUE,
    description VARCHAR(255),
    category TEXT,
    config_example VARCHAR(255) DEFAULT '{}',
    publisher TEXT,
    disk_required BIGINT DEFAULT 0,
    ram_required BIGINT DEFAULT 0,
    picture VARCHAR(255) DEFAULT 'images/shared/default.png',
    is_public BOOLEAN DEFAULT false,
    registry_id INT,
    FOREIGN KEY (registry_id) REFERENCES "Registries" (id) ON DELETE SET NULL
);

CREATE INDEX idx_catalog_item_registry_id ON "CatalogItems" (registry_id);


CREATE TABLE IF NOT EXISTS "FogTypes" (
    id INT PRIMARY KEY,
    name TEXT,
    image TEXT,
    description TEXT,
    network_catalog_item_id INT,
    hal_catalog_item_id INT,
    bluetooth_catalog_item_id INT,
    FOREIGN KEY (network_catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE,
    FOREIGN KEY (hal_catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE,
    FOREIGN KEY (bluetooth_catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE
);

CREATE INDEX idx_fog_type_network_catalog_item_id ON "FogTypes" (network_catalog_item_id);
CREATE INDEX idx_fog_type_hal_catalog_item_id ON "FogTypes" (hal_catalog_item_id);
CREATE INDEX idx_fog_type_bluetooth_catalog_item_id ON "FogTypes" (bluetooth_catalog_item_id);


CREATE TABLE IF NOT EXISTS "Fogs" (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    name VARCHAR(255) DEFAULT 'Unnamed ioFog 1',
    location TEXT,
    gps_mode TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    description TEXT,
    last_active BIGINT,
    daemon_status VARCHAR(36) DEFAULT 'NOT_PROVISIONED',
    daemon_operating_duration BIGINT DEFAULT 0,
    daemon_last_start BIGINT,
    memory_usage DOUBLE PRECISION DEFAULT 0.000,
    disk_usage DOUBLE PRECISION DEFAULT 0.000,
    cpu_usage DOUBLE PRECISION DEFAULT 0.00,
    memory_violation TEXT,
    disk_violation TEXT,
    cpu_violation TEXT,
    system_available_disk BIGINT,
    system_available_memory BIGINT,
    system_total_cpu DOUBLE PRECISION,
    security_status VARCHAR(36) DEFAULT 'OK',
    security_violation_info VARCHAR(36) DEFAULT 'No violation',
    catalog_item_status TEXT,
    repository_count BIGINT DEFAULT 0,
    repository_status TEXT,
    system_time BIGINT,
    last_status_time BIGINT,
    ip_address VARCHAR(36) DEFAULT '0.0.0.0',
    ip_address_external VARCHAR(36) DEFAULT '0.0.0.0',
    host VARCHAR(36),
    processed_messages BIGINT DEFAULT 0,
    catalog_item_message_counts TEXT,
    message_speed DOUBLE PRECISION DEFAULT 0.000,
    last_command_time BIGINT,
    network_interface VARCHAR(36) DEFAULT 'dynamic',
    docker_url VARCHAR(255) DEFAULT 'unix:///var/run/docker.sock',
    disk_limit DOUBLE PRECISION DEFAULT 50,
    disk_directory VARCHAR(255) DEFAULT '/var/lib/iofog/',
    memory_limit DOUBLE PRECISION DEFAULT 4096,
    cpu_limit DOUBLE PRECISION DEFAULT 80,
    log_limit DOUBLE PRECISION DEFAULT 10,
    log_directory VARCHAR(255) DEFAULT '/var/log/iofog/',
    bluetooth BOOLEAN DEFAULT FALSE,
    hal BOOLEAN DEFAULT FALSE,
    log_file_count BIGINT DEFAULT 10,
    version TEXT,
    is_ready_to_upgrade BOOLEAN DEFAULT TRUE,
    is_ready_to_rollback BOOLEAN DEFAULT FALSE,
    status_frequency INT DEFAULT 10,
    change_frequency INT DEFAULT 20,
    device_scan_frequency INT DEFAULT 20,
    tunnel VARCHAR(255) DEFAULT '',
    isolated_docker_container BOOLEAN DEFAULT FALSE,
    docker_pruning_freq INT DEFAULT 0,
    available_disk_threshold DOUBLE PRECISION DEFAULT 20,
    log_level VARCHAR(10) DEFAULT 'INFO',
    is_system BOOLEAN DEFAULT FALSE,
    router_id INT DEFAULT 0,
    time_zone VARCHAR(36) DEFAULT 'Etc/UTC',
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    fog_type_id INT DEFAULT 0,
    FOREIGN KEY (fog_type_id) REFERENCES "FogTypes" (id)
);

CREATE INDEX idx_fog_fog_type_id ON "Fogs" (fog_type_id);

CREATE TABLE IF NOT EXISTS "ChangeTrackings" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    microservice_config BOOLEAN DEFAULT false,
    reboot BOOLEAN DEFAULT false,
    deletenode BOOLEAN DEFAULT false,
    version BOOLEAN DEFAULT false,
    microservice_list BOOLEAN DEFAULT false,
    config BOOLEAN DEFAULT false,
    routing BOOLEAN DEFAULT false,
    registries BOOLEAN DEFAULT false,
    tunnel BOOLEAN DEFAULT false,
    diagnostics BOOLEAN DEFAULT false,
    router_changed BOOLEAN DEFAULT false,
    image_snapshot BOOLEAN DEFAULT false,
    prune BOOLEAN DEFAULT false,
    linked_edge_resources BOOLEAN DEFAULT false,
    last_updated VARCHAR(255) DEFAULT false,
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_change_tracking_iofog_uuid ON "ChangeTrackings" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "FogAccessTokens" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    expiration_time BIGINT,
    token TEXT,
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_access_tokens_iofogUuid ON "FogAccessTokens" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "FogProvisionKeys" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    provisioning_string VARCHAR(100),
    expiration_time BIGINT,
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_provision_keys_iofogUuid ON "FogProvisionKeys" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "FogVersionCommands" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    version_command VARCHAR(100),
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_version_commands_iofogUuid ON "FogVersionCommands" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "HWInfos" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    info TEXT,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_hw_infos_iofogUuid ON "HWInfos" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "USBInfos" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    info TEXT,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_usb_infos_iofogUuid ON "USBInfos" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "Tunnels" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    username TEXT,
    password TEXT,
    host TEXT,
    remote_port INT,
    local_port INT DEFAULT 22,
    rsa_key TEXT,
    closed BOOLEAN DEFAULT false,
    iofog_uuid VARCHAR(36),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_tunnels_iofogUuid ON "Tunnels" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "Microservices" (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    config TEXT,
    name VARCHAR(255) DEFAULT 'New Microservice',
    config_last_updated BIGINT,
    rebuild BOOLEAN DEFAULT false,
    root_host_access BOOLEAN DEFAULT false,
    log_size BIGINT DEFAULT 0,
    image_snapshot VARCHAR(255) DEFAULT '',
    delete BOOLEAN DEFAULT false,
    delete_with_cleanup BOOLEAN DEFAULT false,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    catalog_item_id INT,
    registry_id INT DEFAULT 1,
    iofog_uuid VARCHAR(36),
    application_id INT,
    FOREIGN KEY (catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE,
    FOREIGN KEY (registry_id) REFERENCES "Registries" (id) ON DELETE SET NULL,
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES "Flows" (id) ON DELETE CASCADE
);

CREATE INDEX idx_microservices_catalogItemId ON "Microservices" (catalog_item_id);
CREATE INDEX idx_microservices_registryId ON "Microservices" (registry_id);
CREATE INDEX idx_microservices_iofogUuid ON "Microservices" (iofog_uuid);
CREATE INDEX idx_microservices_applicationId ON "Microservices" (application_id);

CREATE TABLE IF NOT EXISTS "MicroserviceArgs" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    cmd TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_args_microserviceUuid ON "MicroserviceArgs" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "MicroserviceEnvs" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    key TEXT,
    value TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_envs_microserviceUuid ON "MicroserviceEnvs" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "MicroserviceExtraHost" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    template_type TEXT,
    name TEXT,
    public_port INT,
    template TEXT,
    value TEXT,
    microservice_uuid VARCHAR(36),
    target_microservice_uuid VARCHAR(36),
    target_fog_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (target_microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (target_fog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_extra_host_microserviceUuid ON "MicroserviceExtraHost" (microservice_uuid);
CREATE INDEX idx_microservice_extra_host_targetMicroserviceUuid ON "MicroserviceExtraHost" (target_microservice_uuid);
CREATE INDEX idx_microservice_extra_host_targetFogUuid ON "MicroserviceExtraHost" (target_fog_uuid);

CREATE TABLE IF NOT EXISTS "MicroservicePorts" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    port_internal INT,
    port_external INT,
    is_udp BOOLEAN,
    is_public BOOLEAN,
    is_proxy BOOLEAN,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_port_microserviceUuid ON "MicroservicePorts" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "MicroservicePublicPorts" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    port_id INT UNIQUE,
    host_id VARCHAR(255) UNIQUE,
    local_proxy_id TEXT,
    remote_proxy_id TEXT,
    public_port INT,
    queue_name TEXT,
    schemes VARCHAR(255) DEFAULT '["https"]',
    is_tcp BOOLEAN DEFAULT false,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    protocol VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN is_tcp THEN 'tcp' ELSE 'http' END) STORED,
    FOREIGN KEY (port_id) REFERENCES "MicroservicePorts" (id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_public_port_portId ON "MicroservicePublicPorts" (port_id);
CREATE INDEX idx_microservice_public_port_hostId ON "MicroservicePublicPorts" (host_id);


CREATE TABLE IF NOT EXISTS "MicroserviceStatuses" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    status VARCHAR(255) DEFAULT 'QUEUED',
    operating_duration BIGINT DEFAULT 0,
    start_time BIGINT DEFAULT 0,
    cpu_usage DOUBLE PRECISION DEFAULT 0.000,
    memory_usage BIGINT DEFAULT 0,
    container_id VARCHAR(255) DEFAULT '',
    percentage DOUBLE PRECISION DEFAULT 0.00,
    error_message TEXT,
    microservice_uuid VARCHAR(36),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_status_microserviceUuid ON "MicroserviceStatuses" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "StraceDiagnostics" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    strace_run BOOLEAN,
    buffer VARCHAR(255) DEFAULT '',
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_strace_diagnostics_microserviceUuid ON "StraceDiagnostics" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "VolumeMappings" (
    uuid INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    host_destination TEXT,
    container_destination TEXT,
    access_mode TEXT,
    type TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_volume_mappings_microserviceUuid ON "VolumeMappings" (microservice_uuid);


CREATE TABLE IF NOT EXISTS "CatalogItemImages" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    container_image TEXT,
    catalog_item_id INT,
    microservice_uuid VARCHAR(36),
    fog_type_id INT,
    FOREIGN KEY (catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE,
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (fog_type_id) REFERENCES "FogTypes" (id) ON DELETE CASCADE
);

CREATE INDEX idx_catalog_item_image_catalog_item_id ON "CatalogItemImages" (catalog_item_id);
CREATE INDEX idx_catalog_item_image_microservice_uuid ON "CatalogItemImages" (microservice_uuid);
CREATE INDEX idx_catalog_item_image_fog_type_id ON "CatalogItemImages" (fog_type_id);

CREATE TABLE IF NOT EXISTS "CatalogItemInputTypes" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    info_type TEXT,
    info_format TEXT,
    catalog_item_id INT,
    FOREIGN KEY (catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE
);

CREATE INDEX idx_catalog_item_input_type_catalog_item_id ON "CatalogItemInputTypes" (catalog_item_id);

CREATE TABLE IF NOT EXISTS "CatalogItemOutputTypes" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    info_type TEXT,
    info_format TEXT,
    catalog_item_id INT,
    FOREIGN KEY (catalog_item_id) REFERENCES "CatalogItems" (id) ON DELETE CASCADE
);

CREATE INDEX idx_catalog_item_output_type_catalog_item_id ON "CatalogItemOutputTypes" (catalog_item_id);


CREATE TABLE IF NOT EXISTS "Routings" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    source_microservice_uuid VARCHAR(36),
    dest_microservice_uuid VARCHAR(36),
    application_id INT,
    FOREIGN KEY (source_microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (dest_microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES "Flows" (id) ON DELETE CASCADE
);

CREATE INDEX idx_routing_sourceMicroserviceUuid ON "Routings" (source_microservice_uuid);
CREATE INDEX idx_routing_destMicroserviceUuid ON "Routings" (dest_microservice_uuid);
CREATE INDEX idx_routing_applicationId ON "Routings" (application_id);

CREATE TABLE IF NOT EXISTS "Routers" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    is_edge BOOLEAN DEFAULT true,
    messaging_port INT DEFAULT 5671,
    edge_router_port INT,
    inter_router_port INT,
    host TEXT,
    is_default BOOLEAN DEFAULT false,
    iofog_uuid VARCHAR(36),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
    
);

CREATE INDEX idx_router_iofogUuid ON "Routers" (iofog_uuid);


CREATE TABLE "RouterConnections" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_router INT,
    dest_router INT,
    created_at TIMESTAMP(0) NOT NULL,
    updated_at TIMESTAMP(0) NOT NULL,
    FOREIGN KEY (source_router) REFERENCES "Routers"(id) ON DELETE CASCADE,
    FOREIGN KEY (dest_router) REFERENCES "Routers"(id) ON DELETE CASCADE
);

CREATE INDEX idx_routerconnections_sourceRouter ON "RouterConnections" (source_router);
CREATE INDEX idx_routerconnections_destRouter ON "RouterConnections" (dest_router);



CREATE TABLE IF NOT EXISTS "Config" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    key VARCHAR(255) NOT NULL UNIQUE,
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)
);

CREATE INDEX idx_config_key ON "Config" (key);


CREATE TABLE IF NOT EXISTS "Tags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    value VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS "IofogTags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    fog_uuid VARCHAR(36),
    tag_id INT,
    FOREIGN KEY (fog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES "Tags" (id) ON DELETE CASCADE
);

CREATE INDEX idx_iofogtags_fog_uuid ON "IofogTags" (fog_uuid);
CREATE INDEX idx_iofogtags_tag_id ON "IofogTags" (tag_id);

CREATE TABLE IF NOT EXISTS "EdgeResources" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name VARCHAR(255) NOT NULL,
    version TEXT,
    description TEXT,
    display_name TEXT,
    display_color TEXT,
    display_icon TEXT,
    interface_protocol TEXT,
    interface_id INT,
    custom TEXT
);


CREATE TABLE IF NOT EXISTS "AgentEdgeResources" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    fog_uuid VARCHAR(36),
    edge_resource_id INT,
    FOREIGN KEY (fog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (edge_resource_id) REFERENCES "EdgeResources" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EdgeResourceOrchestrationTags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    edge_resource_id INT,
    tag_id INT,
    FOREIGN KEY (edge_resource_id) REFERENCES "EdgeResources" (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES "Tags" (id) ON DELETE CASCADE
);

CREATE INDEX idx_agentedgeresources_fog_id ON "AgentEdgeResources" (fog_uuid);
CREATE INDEX idx_agentedgeresources_edge_resource_id ON "AgentEdgeResources" (edge_resource_id);
CREATE INDEX idx_edgeresourceorchestrationtags_edge_resource_id ON "EdgeResourceOrchestrationTags" (edge_resource_id);
CREATE INDEX idx_edgeresourceorchestrationtags_tag_id ON "EdgeResourceOrchestrationTags" (tag_id);

CREATE TABLE IF NOT EXISTS "HTTPBasedResourceInterfaces" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    edge_resource_id INT,
    FOREIGN KEY (edge_resource_id) REFERENCES "EdgeResources" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "HTTPBasedResourceInterfaceEndpoints" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    interface_id INT,
    name TEXT,
    description TEXT,
    method TEXT,
    url TEXT,
    requestType TEXT,
    responseType TEXT,
    requestPayloadExample TEXT,
    responsePayloadExample TEXT,
    FOREIGN KEY (interface_id) REFERENCES "HTTPBasedResourceInterfaces" (id) ON DELETE CASCADE
);

CREATE INDEX idx_httpbasedresourceinterfaces_edge_resource_id ON "HTTPBasedResourceInterfaces" (edge_resource_id);
CREATE INDEX idx_httpbasedresourceinterfaceendpoints_interface_id ON "HTTPBasedResourceInterfaceEndpoints" (interface_id);


CREATE TABLE IF NOT EXISTS "ApplicationTemplates" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name VARCHAR(255) UNIQUE NOT NULL DEFAULT 'new-application',
    description VARCHAR(255) DEFAULT '',
    schema_version VARCHAR(255) DEFAULT '',
    application_json TEXT,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)

);


CREATE TABLE IF NOT EXISTS "ApplicationTemplateVariables" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    application_template_id INT NOT NULL,
    key TEXT,
    description VARCHAR(255) DEFAULT '',
    default_value VARCHAR(255),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (application_template_id) REFERENCES "ApplicationTemplates" (id) ON DELETE CASCADE
);

CREATE INDEX idx_applicationtemplatevariables_application_template_id ON "ApplicationTemplateVariables" (application_template_id);

CREATE TABLE IF NOT EXISTS "MicroserviceCdiDevices" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    cdi_devices TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_cdiDevices_microserviceUuid ON "MicroserviceCdiDevices" (microservice_uuid);

ALTER TABLE "Microservices"
ADD COLUMN run_as_user TEXT DEFAULT NULL,
ADD COLUMN platform TEXT DEFAULT NULL,
ADD COLUMN runtime TEXT DEFAULT NULL;


CREATE TABLE IF NOT EXISTS "MicroservicePubTags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    microservice_uuid VARCHAR(36),
    tag_id INT,
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES "Tags" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "MicroserviceSubTags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    microservice_uuid VARCHAR(36),
    tag_id INT,
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES "Tags" (id) ON DELETE CASCADE
);

CREATE INDEX idx_microservicepubtags_microservice_uuid ON "MicroservicePubTags" (microservice_uuid);
CREATE INDEX idx_microservicesubtags_microservice_uuid ON "MicroserviceSubTags" (microservice_uuid);
CREATE INDEX idx_microservicepubtags_tag_id ON "MicroservicePubTags" (tag_id);
CREATE INDEX idx_microservicesubtags_tag_id ON "MicroserviceSubTags" (tag_id);

CREATE TABLE IF NOT EXISTS "MicroserviceCapAdd" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    cap_add TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_capAdd_microserviceUuid ON "MicroserviceCapAdd" (microservice_uuid);

CREATE TABLE IF NOT EXISTS "MicroserviceCapDrop" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    cap_drop TEXT,
    microservice_uuid VARCHAR(36),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_capDrop_microserviceUuid ON "MicroserviceCapDrop" (microservice_uuid);

ALTER TABLE "Microservices" 
ADD COLUMN annotations TEXT;

CREATE TABLE IF NOT EXISTS "FogPublicKeys" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    public_key TEXT,
    iofog_uuid VARCHAR(36),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_public_keys_iofogUuid ON "FogPublicKeys" (iofog_uuid);

CREATE TABLE IF NOT EXISTS "FogUsedTokens" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    jti VARCHAR(255) NOT NULL,
    iofog_uuid VARCHAR(36),
    expiry_time BIGINT NOT NULL,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (iofog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_used_tokens_iofogUuid ON "FogUsedTokens" (iofog_uuid);

ALTER TABLE "MicroserviceStatuses"
ADD COLUMN ip_address TEXT;

DROP TABLE IF EXISTS "FogAccessTokens";

CREATE TABLE IF NOT EXISTS "Secrets" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Opaque', 'tls')),
    data TEXT NOT NULL,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)
);

CREATE INDEX idx_secrets_name ON "Secrets" (name);

CREATE TABLE IF NOT EXISTS "Certificates" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    is_ca BOOLEAN DEFAULT false,
    signed_by_id INT,
    hosts TEXT,
    valid_from TIMESTAMP(0) NOT NULL,
    valid_to TIMESTAMP(0) NOT NULL,
    serial_number TEXT NOT NULL,
    secret_id INT,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (signed_by_id) REFERENCES "Certificates" (id) ON DELETE SET NULL,
    FOREIGN KEY (secret_id) REFERENCES "Secrets" (id) ON DELETE CASCADE
);

CREATE INDEX idx_certificates_name ON "Certificates" (name);
CREATE INDEX idx_certificates_valid_to ON "Certificates" (valid_to);
CREATE INDEX idx_certificates_is_ca ON "Certificates" (is_ca);
CREATE INDEX idx_certificates_signed_by_id ON "Certificates" (signed_by_id);
CREATE INDEX idx_certificates_secret_id ON "Certificates" (secret_id);

CREATE TABLE IF NOT EXISTS "Services" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    resource TEXT NOT NULL,
    target_port INTEGER NOT NULL,
    service_port INTEGER,
    k8s_type TEXT,
    bridge_port INTEGER,
    default_bridge TEXT,
    service_endpoint TEXT,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)
);

CREATE INDEX idx_services_name ON "Services" (name);
CREATE INDEX idx_services_id ON "Services" (id);

CREATE TABLE IF NOT EXISTS "ServiceTags" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    service_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (service_id) REFERENCES "Services" (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES "Tags" (id) ON DELETE CASCADE
);

CREATE INDEX idx_service_tags_service_id ON "ServiceTags" (service_id);
CREATE INDEX idx_service_tags_tag_id ON "ServiceTags" (tag_id);


ALTER TABLE "Fogs" ADD COLUMN container_engine VARCHAR(36);
ALTER TABLE "Fogs" ADD COLUMN deployment_type VARCHAR(36);

ALTER TABLE "MicroserviceExtraHost" DROP COLUMN IF EXISTS public_port;
ALTER TABLE "MicroservicePorts" DROP COLUMN IF EXISTS is_public;
ALTER TABLE "MicroservicePorts" DROP COLUMN IF EXISTS is_proxy;

DROP TABLE IF EXISTS "MicroservicePublicPorts";

ALTER TABLE "MicroserviceEnvs" ADD COLUMN value_from_secret TEXT;
ALTER TABLE "MicroserviceEnvs" ADD COLUMN value_from_config_map TEXT;

CREATE TABLE IF NOT EXISTS "ConfigMaps" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    name VARCHAR(255) UNIQUE NOT NULL,
    immutable BOOLEAN DEFAULT false,
    data TEXT NOT NULL,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0)
);

CREATE INDEX idx_config_maps_name ON "ConfigMaps" (name);

CREATE TABLE IF NOT EXISTS "VolumeMounts" (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    name VARCHAR(255) NOT NULL,
    config_map_name VARCHAR(255),
    secret_name VARCHAR(255),
    version INT DEFAULT 1,
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (config_map_name) REFERENCES "ConfigMaps" (name) ON DELETE CASCADE,
    FOREIGN KEY (secret_name) REFERENCES "Secrets" (name) ON DELETE CASCADE    
);

CREATE INDEX idx_volume_mounts_uuid ON "VolumeMounts" (uuid);
CREATE INDEX idx_volume_mounts_config_map_name ON "VolumeMounts" (config_map_name);
CREATE INDEX idx_volume_mounts_secret_name ON "VolumeMounts" (secret_name);

CREATE TABLE IF NOT EXISTS "FogVolumeMounts" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    fog_uuid VARCHAR(36),
    volume_mount_uuid VARCHAR(36),
    FOREIGN KEY (fog_uuid) REFERENCES "Fogs" (uuid) ON DELETE CASCADE,
    FOREIGN KEY (volume_mount_uuid) REFERENCES "VolumeMounts" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_fog_volume_mounts_fog_uuid ON "FogVolumeMounts" (fog_uuid);
CREATE INDEX idx_fog_volume_mounts_volume_mount_uuid ON "FogVolumeMounts" (volume_mount_uuid);

ALTER TABLE "Fogs" ADD COLUMN active_volume_mounts BIGINT DEFAULT 0;
ALTER TABLE "Fogs" ADD COLUMN volume_mount_last_update BIGINT DEFAULT 0;

ALTER TABLE "ChangeTrackings" ADD COLUMN volume_mounts BOOLEAN DEFAULT false;
ALTER TABLE "ChangeTrackings" ADD COLUMN exec_sessions BOOLEAN DEFAULT false;

ALTER TABLE "Services" ADD COLUMN provisioning_status VARCHAR(36) DEFAULT 'pending';
ALTER TABLE "Services" ADD COLUMN provisioning_error TEXT;

ALTER TABLE "Fogs" ADD COLUMN warning_message TEXT DEFAULT 'HEALTHY';
ALTER TABLE "Fogs" ADD COLUMN gps_device VARCHAR(36);
ALTER TABLE "Fogs" ADD COLUMN gps_scan_frequency INT DEFAULT 60;
ALTER TABLE "Fogs" ADD COLUMN edge_guard_frequency INT DEFAULT 0;

ALTER TABLE "Microservices" ADD COLUMN pid_mode VARCHAR(36);
ALTER TABLE "Microservices" ADD COLUMN ipc_mode VARCHAR(36);
ALTER TABLE "Microservices" ADD COLUMN exec_enabled BOOLEAN DEFAULT false;

ALTER TABLE "MicroserviceStatuses" ADD COLUMN exec_session_ids TEXT;

ALTER TABLE "Microservices" ADD COLUMN schedule INT DEFAULT 50;

CREATE TABLE IF NOT EXISTS "MicroserviceExecStatuses" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    status VARCHAR(255) DEFAULT 'INACTIVE',
    exec_session_id VARCHAR(255),
    microservice_uuid VARCHAR(36),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_exec_status_microservice_uuid ON "MicroserviceExecStatuses" (microservice_uuid);

ALTER TABLE "Fogs" ADD COLUMN gps_status VARCHAR(32);

ALTER TABLE "Microservices" ADD COLUMN cpu_set_cpus TEXT;
ALTER TABLE "Microservices" ADD COLUMN memory_limit DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "MicroserviceHealthChecks" (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
    test TEXT,
    interval DOUBLE PRECISION,
    timeout DOUBLE PRECISION,
    start_period DOUBLE PRECISION,
    start_interval DOUBLE PRECISION,
    retries INT,
    microservice_uuid VARCHAR(36),
    created_at TIMESTAMP(0),
    updated_at TIMESTAMP(0),
    FOREIGN KEY (microservice_uuid) REFERENCES "Microservices" (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_microservice_health_check_microservice_uuid ON "MicroserviceHealthChecks" (microservice_uuid);

ALTER TABLE "MicroserviceStatuses" ADD COLUMN health_status TEXT;