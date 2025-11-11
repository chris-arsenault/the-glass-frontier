output "nomad_jobs" {
  description = "Nomad job identifiers deployed in stage."
  value       = module.nomad_core.jobs
}

output "vault_bootstrap_script" {
  description = "Path to stage bootstrap script."
  value       = module.vault_platform.bootstrap_script_path
}

output "grafana_dashboard" {
  description = "Stage Grafana dashboard artifact."
  value       = module.observability.grafana_dashboard_path
}

output "alert_rules" {
  description = "Stage Alertmanager rules artifact."
  value       = module.observability.alert_rules_path
}
