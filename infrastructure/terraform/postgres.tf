# RDS PostgreSQL with IAM authentication on private subnets.
resource "aws_db_subnet_group" "worldstate" {
  name       = "${local.name_prefix}-worldstate"
  subnet_ids = aws_subnet.private[*].id
  tags       = local.tags
}

resource "aws_db_instance" "worldstate" {
  allocated_storage                   = 20
  apply_immediately                   = true
  auto_minor_version_upgrade          = true
  backup_retention_period             = 7
  copy_tags_to_snapshot               = true
  db_name                             = "worldstate"
  db_subnet_group_name                = aws_db_subnet_group.worldstate.name
  deletion_protection                 = true
  engine                              = "postgres"
  engine_version                      = "18.1"
  final_snapshot_identifier           = "${var.project}-${var.environment}-worldstate-final"
  iam_database_authentication_enabled = true
  identifier                          = "${var.project}-${var.environment}-worldstate"
  instance_class                      = "db.t4g.micro"
  manage_master_user_password         = true
  max_allocated_storage               = 50
  performance_insights_enabled        = false
  publicly_accessible                 = false
  skip_final_snapshot                 = false
  storage_encrypted                   = true
  username                            = "gf_worldstate"
  vpc_security_group_ids              = [aws_security_group.rds.id]

  tags = local.tags
}
