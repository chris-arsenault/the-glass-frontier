output "kv_mount_path" {
  description = "Mount path for the platform KV engine."
  value       = vault_mount.kv.path
}

output "transit_mount_path" {
  description = "Mount path for the transit engine."
  value       = vault_mount.transit.path
}

output "database_mount_path" {
  description = "Mount path for the database engine, when enabled."
  value       = var.enable_database_engine ? vault_mount.database[0].path : null
}

output "approle_path" {
  description = "Auth mount path for AppRole logins."
  value       = vault_auth_backend.approle.path
}
