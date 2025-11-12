job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "otel-collector" {
    count = ${replica_count}

    network {
      port "grpc" {
        to = 4317
      }
      port "http" {
        to = 4318
      }
    }

    task "otel-collector" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["grpc", "http"]
        args  = ["--config=/local/collector-config.yaml"]
      }

      template {
        destination = "local/collector-config.yaml"
        data = <<EOF
receivers:
  otlp:
    protocols:
      grpc:
      http:
processors:
  resource:
    attributes:
      - key: deployment.environment
        value: "${environment}"
        action: upsert
      - key: service.name
        value: "${service_name}"
        action: upsert
  batch:
exporters:
  otlphttp:
    endpoint: "${victoria_remote}"
  loki:
    endpoint: "${loki_remote}"
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [otlphttp]
    logs:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [loki]
EOF
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "grpc"
        tags = ["otel", "grpc", "metrics"]
        check {
          name     = "otel-grpc"
          type     = "tcp"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "20s"
  }
}
