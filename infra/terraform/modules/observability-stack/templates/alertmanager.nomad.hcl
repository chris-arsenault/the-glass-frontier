job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "alertmanager" {
    count = 1

    network {
      port "http" {
        to = 9093
      }
    }

    volume "alertmanager-config" {
      type   = "host"
      source = "alertmanager-config"
      read_only = false
    }

    task "alertmanager" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
        args  = [
          "--config.file=${config_path}/alertmanager.yml",
          "--storage.path=${config_path}/data"
        ]
      }

      volume_mount {
        volume      = "alertmanager-config"
        destination = "${config_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["alertmanager", "alerts"]
        check {
          name     = "alertmanager-http"
          type     = "http"
          path     = "/-/ready"
          interval = "15s"
          timeout  = "3s"
        }
      }
    }
  }
}
