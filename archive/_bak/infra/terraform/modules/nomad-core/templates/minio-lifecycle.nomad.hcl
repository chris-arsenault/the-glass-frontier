job "${job_name}" {
  region      = "${region}"
  datacenters = ["${datacenter}"]
  type        = "batch"

  periodic {
    cron             = "${cron_schedule}"
    prohibit_overlap = true
    time_zone        = "UTC"
  }

  group "minio-lifecycle" {
    task "apply-lifecycle" {
      driver = "docker"

      config {
        image = "${docker_image}"
        args  = ["node", "scripts/minio/applyLifecycle.js"]
      }

      env {
        ENVIRONMENT                   = "${environment}"
        CONSUL_HTTP_ADDR              = "${consul_http_addr}"
        VAULT_ADDR                    = "${vault_addr}"
        MINIO_ENDPOINT                = "${minio_endpoint}"
        MINIO_PORT                    = "${minio_port}"
        MINIO_USE_SSL                 = "${minio_use_ssl}"
        MINIO_ACCESS_KEY              = "${minio_access_key}"
        MINIO_SECRET_KEY              = "${minio_secret_key}"
        MINIO_REGION                  = "${minio_region}"
        MINIO_REMOTE_TIER             = "${minio_remote_tier}"
        MINIO_LIFECYCLE_CONFIG        = "/local/lifecycle-policies.json"
        BACKBLAZE_B2_KEY_ID           = "${b2_key_id}"
        BACKBLAZE_B2_APPLICATION_KEY  = "${b2_application_key}"
      }

      template {
        destination = "local/lifecycle-policies.json"
        change_mode = "restart"
        data        = <<EOF
${lifecycle_policy}
EOF
      }

      resources {
        cpu    = ${cpu}
        memory = ${memory}
      }

      logs {
        max_files     = 5
        max_file_size = 10
      }
    }

    restart {
      attempts = 1
      delay    = "30s"
      interval = "1h"
      mode     = "fail"
    }
  }
}
