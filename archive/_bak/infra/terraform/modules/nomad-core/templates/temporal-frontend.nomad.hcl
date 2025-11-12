job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "temporal-frontend" {
    count = ${count}

    network {
      mode = "host"
      port "grpc" {
        to     = 7233
        static = 7233
      }
      port "http" {
        to     = 8233
        static = 8233
      }
    }

    task "temporal-frontend" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
      }

      env {
        BIND_ON_IP                  = "0.0.0.0"
        TEMPORAL_BROADCAST_ADDRESS  = "$${attr.unique.network.ip-address}"
        TEMPORAL_NAMESPACE         = "${temporal_domain}"
        TEMPORAL_UI_ENABLED        = "${temporal_ui}"
        VAULT_ADDR                 = "${vault_addr}"
        DB                         = "postgres12"
        POSTGRES_SEEDS                   = "${temporal_db_host}"
        DB_PORT                   = "${temporal_db_port}"
        POSTGRES_USER                   = "${temporal_db_user}"
        POSTGRES_PWD               = "${temporal_db_password}"
        DBNAME               = "${temporal_db_name}"
        VISIBILITY_DBNAME    = "${temporal_visibility_db}"
        POSTGRES_TLS_ENABLED            = "false"
        SKIP_SCHEMA_SETUP = "false"
        SKIP_DB_CREATE = "false"
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
