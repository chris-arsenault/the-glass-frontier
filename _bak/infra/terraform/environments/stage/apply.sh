terraform init
export NOMAD_TOKEN=$(cat /opt/hashistack/credentials/nomad-server.token)
export VAULT_TOKEN=$(cat /opt/hashistack/credentials/vault-root.token)
terraform apply --var-file stage.tfvars --var vault_token=${VAULT_TOKEN} --var nomad_token=${NOMAD_TOKEN}