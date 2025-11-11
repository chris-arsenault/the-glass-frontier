output "jobs" {
  description = "Rendered Nomad job identifiers for downstream dashboards."
  value = {
    langgraph         = nomad_job.langgraph.name
    llm_proxy         = nomad_job.llm_proxy.name
    hub_gateway       = nomad_job.hub_gateway.name
    temporal_frontend = nomad_job.temporal_frontend.name
    temporal_worker   = nomad_job.temporal_worker.name
    redis             = nomad_job.redis.name
    couchdb           = nomad_job.couchdb.name
    api_gateway       = nomad_job.api_gateway.name
  }
}
