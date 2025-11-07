terraform {
  required_version = ">= 1.6.0"

  required_providers {
    nomad = {
      source  = "hashicorp/nomad"
      version = "~> 2.1"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.3"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

provider "nomad" {
  address = var.nomad_address
  region  = var.nomad_region
  token   = var.nomad_token
}

provider "vault" {
  address = var.vault_address
  token   = var.vault_token
}
