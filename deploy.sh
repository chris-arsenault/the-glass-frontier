#!/usr/bin/env bash
pnpm run build
cd infrastructure/terraform && terraform apply