job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "api-gateway" {
    count = ${count}

    network {
      port "http" {
        to = ${http_port}
      }
      port "ws" {
        to = 0
      }
    }

    task "api-gateway" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
      }

      env {
        ENVIRONMENT      = "${environment}"
        CONSUL_HTTP_ADDR = "${consul_http_addr}"
        VAULT_ADDR       = "${vault_addr}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["api", "gateway", "http"]
        check {
          name     = "api-gateway-http"
          type     = "http"
          path     = "/healthz"
          interval = "10s"
          timeout  = "2s"
        }
      }

%{ if enable_ws }
      service {
        name = "${service_name}-ws"
        port = "ws"
        tags = ["api", "gateway", "ws"]
        check {
          name     = "api-gateway-ws"
          type     = "tcp"
          interval = "15s"
          timeout  = "2s"
        }
      }
%{ endif }
    }
  }

  update {
    max_parallel = 1
    stagger      = "20s"
  }
}
