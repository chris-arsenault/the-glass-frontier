resource "null_resource" "artifacts_dir" {
  provisioner "local-exec" {
    command = "mkdir -p ${local.artifacts_dir}"
  }
}

data "archive_file" "narrative_lambda" {
  type        = "zip"
  source_dir  = local.narrative_dist_dir
  output_path = "${local.artifacts_dir}/narrative.zip"

  depends_on  = [null_resource.artifacts_dir]
}

data "archive_file" "llm_lambda" {
  type        = "zip"
  source_dir  = local.llm_dist_dir
  output_path = "${local.artifacts_dir}/llm-proxy.zip"

  depends_on  = [null_resource.artifacts_dir]
}

data "archive_file" "webservice_lambda" {
  type        = "zip"
  source_dir  = local.webservice_dist_dir
  output_path = "${local.artifacts_dir}/webservice.zip"

  depends_on  = [null_resource.artifacts_dir]
}
