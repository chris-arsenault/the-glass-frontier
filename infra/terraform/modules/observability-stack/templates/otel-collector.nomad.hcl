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
        args  = ["--config=/etc/otel/collector-config.yaml"]
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
  batch:
exporters:
  otlphttp:
    endpoint: "${victoria_remote}"
  loki:
    endpoint: "${loki_remote}"
    labels:
      environment: "${environment}"
      service: "${service_name}"
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]
    logs:
      receivers: [otlp]
      processors: [batch]
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
