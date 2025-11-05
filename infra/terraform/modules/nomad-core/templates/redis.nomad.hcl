job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "redis" {
    count = ${count}

    volume "redis-data" {
      type   = "host"
      source = "${volume_name}"
      read_only = false
    }

    network {
      mode = "host"
      port "db" {
        to     = 6379
        static = 6379
      }
    }

    task "redis" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
      }

      volume_mount {
        volume      = "redis-data"
        destination = "${volume_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "db"
        tags = ["redis", "cache", "tcp"]
        check {
          name     = "redis-tcp"
          type     = "tcp"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
