job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "llm-proxy" {
    count = ${count}

    network {
      mode = "host"
      port "http" {
        to     = 8082
        static = 8082
      }
    }

    task "llm-proxy" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
      }

      env {
        ENVIRONMENT      = "${environment}"
        VAULT_ADDR       = "${vault_addr}"
        CONSUL_HTTP_ADDR = "${consul_http_addr}"
        LLM_PROXY_PROVIDER = "openai"
      }

      template {
        destination = "secrets/api-keys"
        change_mode = "restart"
        env         = true
        data        = <<EOF
{{ with secret "platform-kv/data/providers/openai" -}}
OPENAI_API_KEY={{ .Data.data.key }}
{{ end -}}
{{ with secret "platform-kv/data/providers/anthropic" -}}
ANTHROPIC_API_KEY={{ .Data.data.key }}
{{ end -}}
EOF
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["proxy", "llm", "http"]
        check {
          name     = "llm-proxy-ready"
          type     = "http"
          path     = "/healthz"
          interval = "15s"
          timeout  = "2s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "20s"
  }
}
