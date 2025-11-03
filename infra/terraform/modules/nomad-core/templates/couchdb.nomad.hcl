job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "service"

  group "couchdb" {
    count = ${count}

    network {
      port "http" {
        to = 5984
      }
    }

    volume "couchdb-data" {
      type   = "host"
      source = "${volume_name}"
      read_only = false
    }

    task "couchdb" {
      driver = "docker"

      config {
        image = "${docker_image}"
        ports = ["http"]
      }

      env {
        COUCHDB_USER = "${couchdb_admin}"
        COUCHDB_PASSWORD = "${couchdb_pass}"
      }

      volume_mount {
        volume      = "couchdb-data"
        destination = "${volume_path}"
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      service {
        name = "${service_name}"
        port = "http"
        tags = ["couchdb", "persistence", "http"]
        check {
          name     = "couchdb-http"
          type     = "http"
          path     = "/_up"
          interval = "15s"
          timeout  = "3s"
        }
      }
    }
  }

  update {
    max_parallel = 1
    stagger      = "30s"
  }
}
