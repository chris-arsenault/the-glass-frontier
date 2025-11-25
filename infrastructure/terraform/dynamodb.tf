# NOTE: world_index and location_graph_index DynamoDB tables removed - data migrated to PostgreSQL

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
