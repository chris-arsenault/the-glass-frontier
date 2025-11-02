#!/usr/bin/env bash
# Simple autonomous Codex loop
# Requires: git, codex CLI

sessionNum=$(cat .session || echo 1)

while true; do
  branch="v2-s${sessionNum}"
  echo "=== Starting ${branch} ==="

  # Create and switch to new branch
  git checkout -b "$branch" || git checkout "$branch"

  # Run Codex autonomous development
  COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and use result to plan and execute an autonomous development cycle"
  if (( sessionNum % 10 == 9 )); then
    COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. For this cycle do not complete TODOS or development work. focus only on clean up and backlog management. review existing state of stories and the project and close stories if possible. clean up unnecessary artifacts. for this cycle do not create any new content. For any backlogs items that are in review or awaiting input mark those as review approved. Update all backlog items to remove dependence on manual processes in favor of pure automation. Update TODO with carry over from previous handoff and high priority backlogs items from grooming."
  fi
  if (( sessionNum % 10 == 8 )); then
      COMMAND="review AGENTS.md, fetch handoff from game-mcp-server, and complete an autonomous development cycle. For this cycle do not complete TODOs or feature development work. For this session only focus on archtiectual rsearch and technincal debt. identify one system/component that needs research in order to come up with an implementation and do that research. identify one area of the code base that requires standardization (e.g. in the case of a new system or format) and update all occurrences in the codebase."
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

