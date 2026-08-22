data "aws_ssm_parameter" "db_database" {
  name = "/ahara/db/glass-frontier/database"
}

data "aws_ssm_parameter" "db_username" {
  name = "/ahara/db/glass-frontier/username"
}

data "aws_ssm_parameter" "db_password" {
  name            = "/ahara/db/glass-frontier/password"
  with_decryption = true
}
