import {GraphNode} from "./graphNode";
import {GraphContext} from "../../types";
import type { SkillCheckRequest } from "@glass-frontier/dto";
import { SkillCheckResolver } from "@glass-frontier/skill-check-resolver";
import {randomUUID} from "node:crypto";

export class CheckRunnerNode implements GraphNode {
  id = 'check-runner';

  constructor(
  ) {
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure
      || !context.skillCheckPlan
      || !context.skillCheckPlan.requiresCheck
      || !context.chronicleState.character) {
      context.telemetry?.recordToolNotRun?.({
        chronicleId: context.chronicleId,
        operation: this.id,
      });
      return context;
    }

    const input: SkillCheckRequest = {
      attribute: context.skillCheckPlan.attribute,
      character: context.chronicleState.character,
      checkId: randomUUID(),
      chronicleId: context.chronicleId,
      flags: [],
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      riskLevel: context.skillCheckPlan.riskLevel,
      skill: context.skillCheckPlan.skill,
    };
    if (context.skillCheckPlan.creativeSpark) {
      input.flags.push('creative-spark');
    }

    const checkResult =  new SkillCheckResolver(input).resolveRequest();

    return {
      ...context,
      skillCheckResult: checkResult
    }
  }
}