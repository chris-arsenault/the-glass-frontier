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

    task "alertmanager" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
        args  = [
          "--config.file=${container_config_path}/alertmanager.yml",
          "--storage.path=${storage_path}"
        ]
        volumes = [
          "${host_config_path}:${container_config_path}:ro"
        ]
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
