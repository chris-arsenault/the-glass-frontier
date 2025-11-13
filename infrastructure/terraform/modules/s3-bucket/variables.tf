variable "name" {
  description = "Fully-qualified bucket name."
  type        = string
}

variable "tags" {
  description = "Tags applied to the bucket."
  type        = map(string)
  default     = {}
}

variable "enable_versioning" {
  description = "Enable object versioning."
  type        = bool
  default     = false
}

variable "enable_encryption" {
  description = "Enable AES256 server-side encryption."
  type        = bool
  default     = false
}

variable "public_access_block" {
  description = "Optional public access block configuration."
  type = object({
    block_public_acls       = bool
    block_public_policy     = bool
    ignore_public_acls      = bool
    restrict_public_buckets = bool
  })
  default = null
}

variable "expiration_days" {
  description = "Optional lifecycle expiration in days."
  type        = number
  default     = null
}
