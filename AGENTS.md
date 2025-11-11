# Agent Guardrails

- Never revert user-authored tweaks unless explicitly asked; prefer additive fixes.  When a diff results in unexpected diffs assume the user made them. Flag in output but do not adjust code.