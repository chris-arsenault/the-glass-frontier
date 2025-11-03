job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  constraint {
    attribute = "${node.class}"
    value     = "app"
  }

  group "langgraph" {
    count = ${count}

    network {
      port "http" {
        to = 7000
      }
    }

    task "langgraph" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
      }

      env {
        ENVIRONMENT       = "${environment}"
        CONSUL_HTTP_ADDR  = "${consul_http_addr}"
        REDIS_URL         = "${redis_url}"
        COUCH_URL         = "${couchdb_url}"
        VAULT_ADDR        = "${vault_addr}"
      }

      template {
        destination = "secrets/llm-key"
        change_mode = "restart"
        env         = true
        data        = "{{ with secret \"llm/api\" }}LLM_API_KEY={{ .Data.data.key }}{{ end }}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["narrative", "langgraph", "http"]
        check {
          name     = "langgraph-ready"
          type     = "http"
          path     = "/health"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "30s"
  }
}
