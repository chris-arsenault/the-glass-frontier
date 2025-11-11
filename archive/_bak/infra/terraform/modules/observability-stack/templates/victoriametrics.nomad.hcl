job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "victoriametrics" {
    count = 1

    network {
      port "http" {
        to = 8428
      }
    }

    volume "victoriametrics-data" {
      type   = "host"
      source = "victoriametrics-data"
      read_only = false
    }

    task "victoriametrics" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
        args = [
          "-selfScrapeInterval=10s",
          "-retentionPeriod=${retention_days}d",
          "-storageDataPath=${storage_path}"
        ]
      }

      volume_mount {
        volume      = "victoriametrics-data"
        destination = "${storage_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["victoriametrics", "metrics"]
        check {
          name     = "victoriametrics-http"
          type     = "http"
          path     = "/health"
          interval = "15s"
          timeout  = "3s"
        }
      }
    }
  }
}
