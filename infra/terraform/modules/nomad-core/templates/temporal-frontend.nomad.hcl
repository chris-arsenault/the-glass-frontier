job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "temporal-frontend" {
    count = ${count}

    network {
      port "grpc" {
        to = 7233
      }
      port "http" {
        to = 8233
      }
    }

    task "temporal-frontend" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["grpc", "http"]
        args  = ["temporal-server", "start", "--services", "frontend"]
      }

      env {
        TEMPORAL_BROADCAST_ADDRESS = "0.0.0.0"
        TEMPORAL_NAMESPACE         = "${temporal_domain}"
        TEMPORAL_UI_ENABLED        = "${temporal_ui}"
        VAULT_ADDR                 = "${vault_addr}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "grpc"
        tags = ["temporal", "frontend", "grpc"]
        check {
          name     = "temporal-grpc"
          type     = "tcp"
          interval = "10s"
          timeout  = "2s"
        }
      }

      service {
        name = "${service_name}-ui"
        port = "http"
        tags = ["temporal", "ui", "http"]
        check {
          name     = "temporal-ui"
          type     = "http"
          path     = "/"
          interval = "30s"
          timeout  = "3s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "30s"
  }
}
