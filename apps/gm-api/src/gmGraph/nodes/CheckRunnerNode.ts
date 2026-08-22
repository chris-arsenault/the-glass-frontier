import type { SkillCheckRequest } from '@glass-frontier/dto';
import { SkillCheckResolver } from '@glass-frontier/skill-check-resolver';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

export class CheckRunnerNode implements GraphNode {
  id = 'check-runner';

  execute(context: GraphContext): GraphNodeDelta {
    const plan = context.skillCheckPlan;
    if (context.failure || plan === undefined || plan.requiresCheck !== true) {
      context.telemetry.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: this.id,
      });
      return {};
    }

    const input: SkillCheckRequest = {
      attribute: plan.attribute,
      character: context.chronicleState.character,
      checkId: randomUUID(),
      chronicleId: context.chronicleId,
      flags: [],
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      riskLevel: plan.riskLevel,
      skill: plan.skill,
    };
    if (plan.advantage === 'advantage' || plan.advantage === 'disadvantage') {
      input.flags.push(plan.advantage);
    }
    if (plan.creativeSpark === true) {
      input.flags.push('creative-spark');
    }

    const checkResult = new SkillCheckResolver(input).resolveRequest();

    return { skillCheckResult: checkResult };
  }
}
