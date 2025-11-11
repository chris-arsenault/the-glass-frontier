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
        entrypoint = ["/bin/sh", "/local/bootstrap.sh"]
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
      kvstore:
        store: memberlist
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s
  wal:
    enabled: true
    dir: "${storage_path}/wal"
schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v12
      index:
        prefix: index_
        period: 24h
storage_config:
  boltdb_shipper:
    active_index_directory: "${storage_path}/index"
    cache_location: "${storage_path}/cache"
  filesystem:
    directory: "${storage_path}/chunks"
compactor:
  working_directory: "${storage_path}/compactor"
common:
  path_prefix: "${storage_path}"
limits_config:
  max_streams_per_user: 1000
  max_entries_limit_per_query: 5000
  allow_structured_metadata: false
memberlist:
  join_members:
    - "127.0.0.1"
  max_join_backoff: 1m
EOF
      }

      template {
        destination = "local/bootstrap.sh"
        perms       = "0755"
        data = <<EOF
#!/bin/sh
set -euo pipefail

mkdir -p "${storage_path}/chunks" "${storage_path}/index" "${storage_path}/cache" "${storage_path}/compactor" "${storage_path}/wal"
chown -R 10001:10001 "${storage_path}" 2>/dev/null || true

exec /usr/bin/loki -config.file /local/loki.yaml
EOF
      }

      volume_mount {
        volume      = "loki-data"
        destination = "${storage_path}"
        read_only   = false
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
