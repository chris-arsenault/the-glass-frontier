# RDS PostgreSQL with IAM Authentication (no RDS Proxy)
#
# Architecture:
#   Lambda → (IAM auth over public internet) → RDS
#
# This provides:
#   - No credentials in Lambda code (uses IAM tokens)
#   - Simple, cost-effective setup
#   - Lambda not in VPC (can access external APIs directly)

# DB subnet group using public subnets
resource "aws_db_subnet_group" "worldstate" {
  name       = "${local.name_prefix}-worldstate"
  subnet_ids = aws_subnet.public[*].id
  tags       = local.tags
}

# RDS PostgreSQL instance
resource "aws_db_instance" "worldstate" {
  identifier              = "${var.project}-${var.environment}-worldstate"
  allocated_storage       = 20
  max_allocated_storage   = 50
  engine                  = "postgres"
  engine_version          = "18.1"
  instance_class          = "db.t4g.micro"
  username                = "gf_worldstate"
  manage_master_user_password = true  # AWS manages password in Secrets Manager
  db_name                 = "worldstate"
  publicly_accessible     = true  # Required for Lambda outside VPC
  vpc_security_group_ids  = [aws_security_group.rds.id]
  db_subnet_group_name    = aws_db_subnet_group.worldstate.name
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 1
  apply_immediately       = true

  # Enable IAM authentication
  iam_database_authentication_enabled = true

  performance_insights_enabled = false

  tags = local.tags
}
