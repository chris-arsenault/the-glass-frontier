import type { GraphContext, GraphNode } from './graphNode';

export class GraphOrchestrator {
  constructor(private readonly nodes: GraphNode[]) {}

  async run(initial: GraphContext): Promise<GraphContext> {
    let context = initial;
    for (const node of this.nodes) {
      // eslint-disable-next-line no-await-in-loop -- sequential execution preserves graph semantics
      context = await node.execute(context);
      if (context.failure) {
        break;
      }
    }
    return context;
  }
}
