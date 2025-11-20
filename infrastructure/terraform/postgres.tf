data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_password" "worldstate" {
  length  = 16
  special = false
}

resource "aws_security_group" "worldstate" {
  name        = "${local.name_prefix}-worldstate"
  description = "Access for worldstate Postgres"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Postgres access"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = local.tags
}

resource "aws_db_subnet_group" "worldstate" {
  name       = "${local.name_prefix}-worldstate"
  subnet_ids = data.aws_subnets.default.ids
  tags       = local.tags
}

resource "aws_db_instance" "worldstate" {
  identifier              = "${var.project}-${var.environment}-worldstate"
  allocated_storage       = 20
  max_allocated_storage   = 50
  engine                  = "postgres"
  engine_version          = "16.3"
  instance_class          = "db.t4g.micro"
  username                = "gf_worldstate"
  password                = random_password.worldstate.result
  db_name                 = "worldstate"
  publicly_accessible     = true
  vpc_security_group_ids  = [aws_security_group.worldstate.id]
  db_subnet_group_name    = aws_db_subnet_group.worldstate.name
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0
  apply_immediately       = true
  performance_insights_enabled = false

  tags = local.tags
}
