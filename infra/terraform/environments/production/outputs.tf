output "nomad_jobs" {
  description = "Nomad job identifiers deployed in production."
  value       = module.nomad_core.jobs
}

output "vault_bootstrap_script" {
  description = "Path to production bootstrap script."
  value       = module.vault_platform.bootstrap_script_path
}

output "grafana_dashboard" {
  description = "Production Grafana dashboard artifact."
  value       = module.observability.grafana_dashboard_path
}

output "alert_rules" {
  description = "Production Alertmanager rules artifact."
  value       = module.observability.alert_rules_path
}
