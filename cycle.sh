#!/usr/bin/env bash
# Simple autonomous Codex loop
# Requires: git, codex CLI

sessionNum=$(cat .session || echo 1)

while true; do
  branch="v3-s${sessionNum}"
  echo "=== Starting ${branch} ==="

  # Create and switch to new branch
  git checkout -b "$branch" || git checkout "$branch"

  # Run Codex autonomous development
  COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and use result to plan and execute an autonomous development cycle"
  if (( sessionNum % 10 == 1 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. Do not complete any development work, only do backlog grooming. Analyze GROOMING.md and follow the instructions in it in addition to AGENTS.md"
  fi
  if (( sessionNum < 32 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. You are just starting the implementation phase of this project. Analyze GROOMING.md and follow the instructions in it in addition to AGENTS.md. This is the first grooming after the initial phase 0 research and design, so focus on creation of features and PBIs based on output of DESIGN/RESEARCH/NARRATIVE phases."
  fi
  if (( sessionNum < 31 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. You are in the narrative phase of this project. Analyze NARRATIVE.md and follow the instructions in it in addition to AGENTS.md"
  fi
  if (( sessionNum < 21 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. You are in the design phase of this project. Analyze DESIGN.md and follow the instructions in it in addition to AGENTS.md"
  fi
  if (( sessionNum < 11 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. You are in the research phase of this project. Analyze RESEARCH.md and follow the instructions in it in addition to AGENTS.md"
  fi
  codex --yolo --search exec "$COMMAND"
  sleep 15

  # Commit and push results
  git add -A
  git commit -m "Autonomous dev cycle ${branch}"
  git push -u origin "$branch"

  # Increment session number
  ((sessionNum++))
  echo $sessionNum > .session

  shouldPause=$(cat .pause || echo 1)
  if (( shouldPause % 2 == 0 )); then
    exit
  fi
  # Delay before next cycle (adjust as needed)
  sleep 15
done
