terraform {
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.3"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

resource "vault_mount" "kv" {
  path        = var.kv_mount_path
  type        = "kv-v2"
  description = "Platform secrets for narrative services"

  options = {
    version = 2
  }
}

resource "vault_mount" "transit" {
  path        = var.transit_mount_path
  type        = "transit"
  description = "Transit engine for signing, encryption, and checksum operations"
}

resource "vault_mount" "database" {
  count       = var.enable_database_engine ? 1 : 0
  path        = var.database_mount_path
  type        = "database"
  description = "Dynamic credentials for PostgreSQL workloads"
}

resource "vault_auth_backend" "approle" {
  type        = "approle"
  path        = var.approle_mount_path
  description = "AppRole auth backend for platform services"
}

locals {
  base_template_context = {
    kv_mount_path      = vault_mount.kv.path
    transit_mount_path = vault_mount.transit.path
    namespace          = var.namespace
  }
}

resource "vault_policy" "langgraph" {
  name   = "${var.namespace}-langgraph"
  policy = templatefile("${path.module}/templates/langgraph-policy.hcl.tmpl", local.base_template_context)
}

resource "vault_policy" "llm_proxy" {
  name   = "${var.namespace}-llm-proxy"
  policy = templatefile("${path.module}/templates/llm-proxy-policy.hcl.tmpl", local.base_template_context)
}

resource "vault_policy" "temporal_worker" {
  name   = "${var.namespace}-temporal-worker"
  policy = templatefile("${path.module}/templates/temporal-worker-policy.hcl.tmpl", merge(local.base_template_context, {
    temporal_task_queue = var.temporal_task_queue
  }))
}

resource "vault_policy" "hub_gateway" {
  name   = "${var.namespace}-hub-gateway"
  policy = templatefile("${path.module}/templates/hub-gateway-policy.hcl.tmpl", local.base_template_context)
}

resource "vault_policy" "api_gateway" {
  name   = "${var.namespace}-api-gateway"
  policy = templatefile("${path.module}/templates/api-gateway-policy.hcl.tmpl", local.base_template_context)
}

resource "vault_approle_auth_backend_role" "langgraph" {
  backend   = vault_auth_backend.approle.path
  role_name = "${var.namespace}-langgraph"

  token_policies = [
    vault_policy.langgraph.name
  ]

  token_ttl          = var.token_default_ttl
  token_max_ttl      = var.token_max_ttl
  secret_id_ttl      = var.secret_id_ttl
  secret_id_num_uses = 0
}

resource "vault_approle_auth_backend_role" "llm_proxy" {
  backend   = vault_auth_backend.approle.path
  role_name = "${var.namespace}-llm-proxy"

  token_policies = [
    vault_policy.llm_proxy.name
  ]

  token_ttl          = var.token_default_ttl
  token_max_ttl      = var.token_max_ttl
  secret_id_ttl      = var.secret_id_ttl
  secret_id_num_uses = 0
}

resource "vault_approle_auth_backend_role" "temporal_worker" {
  backend   = vault_auth_backend.approle.path
  role_name = "${var.namespace}-temporal-worker"

  token_policies = [
    vault_policy.temporal_worker.name
  ]

  token_ttl          = var.token_default_ttl
  token_max_ttl      = var.token_max_ttl
  secret_id_ttl      = var.secret_id_ttl
  secret_id_num_uses = 0
}

resource "vault_approle_auth_backend_role" "hub_gateway" {
  backend   = vault_auth_backend.approle.path
  role_name = "${var.namespace}-hub-gateway"

  token_policies = [
    vault_policy.hub_gateway.name
  ]

  token_ttl          = var.token_default_ttl
  token_max_ttl      = var.token_max_ttl
  secret_id_ttl      = var.secret_id_ttl
  secret_id_num_uses = 0
}

resource "vault_approle_auth_backend_role" "api_gateway" {
  backend   = vault_auth_backend.approle.path
  role_name = "${var.namespace}-api-gateway"

  token_policies = [
    vault_policy.api_gateway.name
  ]

  token_ttl          = var.token_default_ttl
  token_max_ttl      = var.token_max_ttl
  secret_id_ttl      = var.secret_id_ttl
  secret_id_num_uses = 0
}

resource "vault_kv_secret_v2" "bootstrap_secrets" {
  for_each = var.bootstrap_secrets

  mount     = vault_mount.kv.path
  name      = each.key
  data_json = jsonencode(each.value)

  lifecycle {
    ignore_changes = [data_json]
  }
}

resource "vault_kv_secret_v2" "temporal_admin" {
  mount     = vault_mount.kv.path
  name      = "${var.namespace}/temporal/admin"
  data_json = jsonencode({
    username = var.temporal_admin_username
    password = var.temporal_admin_password
  })
}

resource "vault_transit_secret_backend_key" "story_signing" {
  name                  = "${var.namespace}-story-signing"
  backend               = vault_mount.transit.path
  deletion_allowed      = false
  derived               = true
  convergent_encryption = true
}

resource "vault_database_secret_backend_connection" "temporal" {
  count      = var.enable_database_engine ? 1 : 0
  backend    = vault_mount.database[0].path
  name       = "${var.namespace}-temporal"
  plugin_name = "postgresql-database-plugin"
  allowed_roles = ["${var.namespace}-temporal"]

  postgresql {
    connection_url = var.postgres_connection_url
      username       = var.postgres_admin_username
      password       = var.postgres_admin_password
  }

  verify_connection = false
}

resource "vault_database_secret_backend_role" "temporal" {
  count   = var.enable_database_engine ? 1 : 0
  backend = vault_mount.database[0].path
  name    = "${var.namespace}-temporal"
  db_name = vault_database_secret_backend_connection.temporal[0].name

  creation_statements = [
    <<EOT
CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT CONNECT ON DATABASE temporal TO "{{name}}";
GRANT USAGE ON SCHEMA public TO "{{name}}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{{name}}";
EOT
  ]

  default_ttl = var.rotation_default_hours * 60 * 60
  max_ttl     = var.rotation_max_hours * 60 * 60
}

locals {
  approle_manifest = [
    {
      name     = vault_approle_auth_backend_role.langgraph.role_name
      policy   = vault_policy.langgraph.name
      secret   = "langgraph"
    },
    {
      name     = vault_approle_auth_backend_role.llm_proxy.role_name
      policy   = vault_policy.llm_proxy.name
      secret   = "llm-proxy"
    },
    {
      name     = vault_approle_auth_backend_role.temporal_worker.role_name
      policy   = vault_policy.temporal_worker.name
      secret   = "temporal-worker"
    },
    {
      name     = vault_approle_auth_backend_role.hub_gateway.role_name
      policy   = vault_policy.hub_gateway.name
      secret   = "hub-gateway"
    },
    {
      name     = vault_approle_auth_backend_role.api_gateway.role_name
      policy   = vault_policy.api_gateway.name
      secret   = "api-gateway"
    }
  ]
}

resource "local_file" "bootstrap_script" {
  content = templatefile("${path.module}/templates/bootstrap.sh.tmpl", {
    approle_path   = vault_auth_backend.approle.path
    output_dir     = var.bootstrap_output_path
    namespace      = var.namespace
    manifest       = local.approle_manifest
    rotate_cron    = var.rotate_cron_spec
    kv_mount_path  = vault_mount.kv.path
  })

  filename        = "${var.bootstrap_output_path}/vault-bootstrap-${var.namespace}.sh"
  file_permission = var.bootstrap_file_mode
}

output "approle_roles" {
  description = "Rendered AppRole role names for downstream automation."
  value       = [for entry in local.approle_manifest : entry.name]
}

output "bootstrap_script_path" {
  description = "Path to the generated bootstrap script that seeds Vault secrets."
  value       = local_file.bootstrap_script.filename
}
