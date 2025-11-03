job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "grafana" {
    count = 1

    network {
      port "http" {
        to = 3000
      }
    }

    volume "grafana-dashboards" {
      type   = "host"
      source = "grafana-dashboards"
      read_only = false
    }

    task "grafana" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
      }

      env {
        GF_SECURITY_ADMIN_USER     = "${admin_user}"
        GF_SECURITY_ADMIN_PASSWORD = "${admin_password}"
        GF_SERVER_ROOT_URL         = "%(protocol)s://%(domain)s/"
        GF_INSTALL_PLUGINS         = "grafana-clock-panel,grafana-piechart-panel"
      }

      template {
        destination = "local/provisioning/datasources/datasource.yaml"
        data = <<EOF
apiVersion: 1
datasources:
  - name: VictoriaMetrics
    type: prometheus
    url: "${victoria_datasource}"
    access: proxy
    isDefault: true
  - name: Loki
    type: loki
    url: "${loki_datasource}"
    access: proxy
EOF
      }

      volume_mount {
        volume      = "grafana-dashboards"
        destination = "${dashboard_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["grafana", "http"]
        check {
          name     = "grafana-http"
          type     = "http"
          path     = "/api/health"
          interval = "15s"
          timeout  = "3s"
        }
      }
    }
  }
}
