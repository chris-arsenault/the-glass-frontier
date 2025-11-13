resource "null_resource" "artifacts_dir" {
  provisioner "local-exec" {
    command = "mkdir -p ${local.artifacts_dir}"
  }
}

data "archive_file" "chronicle_lambda" {
  type        = "zip"
  source_dir  = local.chronicle_dist_dir
  output_path = "${local.artifacts_dir}/chronicle-api.zip"

  depends_on  = [null_resource.artifacts_dir]
}

data "archive_file" "prompt_api_lambda" {
  type        = "zip"
  source_dir  = local.prompt_api_dist_dir
  output_path = "${local.artifacts_dir}/prompt-api.zip"

  depends_on = [null_resource.artifacts_dir]
}

data "archive_file" "location_api_lambda" {
  type        = "zip"
  source_dir  = local.location_api_dist_dir
  output_path = "${local.artifacts_dir}/location-api.zip"

  depends_on = [null_resource.artifacts_dir]
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
