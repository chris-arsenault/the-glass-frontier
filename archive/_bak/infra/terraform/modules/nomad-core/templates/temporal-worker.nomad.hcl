job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "temporal-worker" {
    count = ${count}

    network {
      mode = "host"
      port "metrics" {
        to     = 9000
        static = 9000
      }
    }

    task "temporal-worker" {
      driver = "docker"

      config {
        image        = "${docker_image}"
        network_mode = "host"
      }

      env {
        TEMPORAL_NAMESPACE   = "${temporal_domain}"
        TEMPORAL_TASK_QUEUE  = "${task_queue}"
        METRICS_NAMESPACE    = "${metrics_namespace}"
        OTEL_EXPORTER_OTLP   = "http://localhost:4317"
        CONSUL_HTTP_ADDR     = "${consul_http_addr}"
        VAULT_ADDR           = "${vault_addr}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "metrics"
        tags = ["temporal", "worker", "metrics"]
        check {
          name     = "temporal-worker-metrics"
          type     = "http"
          path     = "/metrics"
          interval = "15s"
          timeout  = "2s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "25s"
  }
}
