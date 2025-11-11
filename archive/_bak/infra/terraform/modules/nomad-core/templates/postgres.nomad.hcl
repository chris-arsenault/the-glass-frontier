job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "postgres" {
    count = 1

    network {
      mode = "host"
      port "db" {
        to     = 5432
        static = 5432
      }
    }

    volume "postgres-data" {
      type   = "host"
      source = "${volume_name}"
      read_only = false
    }

    task "postgres" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
        volumes = [
          "local/docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d"
        ]
      }

      env {
        POSTGRES_USER     = "${admin_user}"
        POSTGRES_PASSWORD = "${admin_password}"
        POSTGRES_DB       = "${database_name}"
      }

      template {
        destination = "local/docker-entrypoint-initdb.d/init-temporal.sql"
        perms       = "0644"
        change_mode = "restart"
        data = <<EOF
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${temporal_user}') THEN
      EXECUTE format('CREATE ROLE "%s" WITH LOGIN CREATEDB PASSWORD %L', '${temporal_user}', '${temporal_password}');
   ELSE
      EXECUTE format('ALTER ROLE "%s" WITH LOGIN CREATEDB PASSWORD %L', '${temporal_user}', '${temporal_password}');
   END IF;
END
$$;

EOF
      }

      volume_mount {
        volume      = "postgres-data"
        destination = "${volume_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "db"
        tags = ["postgres", "database"]
        check {
          name     = "postgres-tcp"
          type     = "tcp"
          interval = "15s"
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
