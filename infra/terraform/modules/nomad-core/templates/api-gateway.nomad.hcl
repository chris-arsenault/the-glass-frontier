job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "api-gateway" {
    count = ${count}

    network {
      mode = "host"
      port "http" {
        to     = ${http_port}
        static = ${http_port}
      }
    }

    task "api-gateway" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
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
          path     = "/health"
          interval = "10s"
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
