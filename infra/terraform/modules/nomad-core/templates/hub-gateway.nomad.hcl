job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "hub-gateway" {
    count = ${count}

    network {
      mode = "host"
      port "http" {
        to     = ${http_port}
        static = ${http_port}
      }
      port "ws" {
        to     = ${ws_port}
        static = ${ws_port}
      }
    }

    task "hub-gateway" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
      }

      env {
        ENVIRONMENT       = "${environment}"
        REDIS_STREAMS_URL = "${redis_streams}"
        VAULT_ADDR        = "${vault_addr}"
        API_BASE_URL      = "${api_base_url}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["hub", "gateway", "http"]
        check {
          name     = "hub-gateway-http"
          type     = "http"
          path     = "/healthz"
          interval = "15s"
          timeout  = "2s"
        }
      }

      service {
        name = "${service_name}-ws"
        port = "ws"
        tags = ["hub", "gateway", "ws"]
        check {
          name     = "hub-gateway-ws"
          type     = "tcp"
          port     = "ws"
          interval = "15s"
          timeout  = "2s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "25s"
  }
}
