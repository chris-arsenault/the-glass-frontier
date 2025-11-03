job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "loki" {
    count = 1

    network {
      port "http" {
        to = 3100
      }
    }

    volume "loki-data" {
      type   = "host"
      source = "loki-data"
      read_only = false
    }

    task "loki" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
        args  = ["-config.file=/etc/loki/loki.yaml"]
      }

      template {
        destination = "local/loki.yaml"
        data = <<EOF
server:
  http_listen_port: 3100
  log_level: info
ingester:
  lifecycler:
    ring:
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s
schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
storage_config:
  boltdb_shipper:
    active_index_directory: "${storage_path}/index"
    cache_location: "${storage_path}/cache"
  filesystem:
    directory: "${storage_path}/chunks"
limits_config:
  max_streams_per_user: 1000
  max_entries_limit_per_query: 5000
EOF
      }

      volume_mount {
        volume      = "loki-data"
        destination = "${storage_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["loki", "logs"]
        check {
          name     = "loki-http"
          type     = "http"
          path     = "/ready"
          interval = "15s"
          timeout  = "3s"
        }
      }
    }
  }
}
