resource "aws_dynamodb_table" "llm_usage" {
  name         = "${local.name_prefix}-llm-usage"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "player_id"
  range_key = "usage_period"

  attribute {
    name = "player_id"
    type = "S"
  }

  attribute {
    name = "usage_period"
    type = "S"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "world_state" {
  name         = "${local.name_prefix}-world-state"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "character_login_pk"
    type = "S"
  }

  attribute {
    name = "character_login_sk"
    type = "S"
  }

  attribute {
    name = "chronicle_login_pk"
    type = "S"
  }

  attribute {
    name = "chronicle_login_sk"
    type = "S"
  }

  attribute {
    name = "character_chronicle_pk"
    type = "S"
  }

  attribute {
    name = "character_chronicle_sk"
    type = "S"
  }

  attribute {
    name = "location_place_pk"
    type = "S"
  }

  attribute {
    name = "location_place_sk"
    type = "S"
  }

  global_secondary_index {
    name            = "character_login"
    hash_key        = "character_login_pk"
    range_key       = "character_login_sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "chronicle_login"
    hash_key        = "chronicle_login_pk"
    range_key       = "chronicle_login_sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "character_chronicle"
    hash_key        = "character_chronicle_pk"
    range_key       = "character_chronicle_sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "location_place"
    hash_key        = "location_place_pk"
    range_key       = "location_place_sk"
    projection_type = "ALL"
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "webservice_connections" {
  name         = "${local.name_prefix}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.tags
}
