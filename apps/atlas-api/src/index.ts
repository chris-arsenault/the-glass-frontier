import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { WorldState } from '@glass-frontier/worldstate';

const app = express();
app.use(cors());
app.use(express.json());

const worldState = WorldState.create();
const world = worldState.world;

const hardStateInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.string().min(1),
  subkind: z.string().optional(),
  name: z.string().min(1),
  status: z.string().optional(),
  links: z
    .array(
      z.object({
        relationship: z.string().min(1),
        targetId: z.string().uuid(),
      })
    )
    .optional(),
});

const fragmentInput = z.object({
  id: z.string().uuid().optional(),
  entityId: z.string().uuid(),
  title: z.string().min(1),
  prose: z.string().min(1),
  chronicleId: z.string().uuid(),
  beatId: z.string().optional(),
  turnRange: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  tags: z.array(z.string()).optional(),
});

app.get('/entities', async (req, res) => {
  try {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const list = await world.listHardStates({ kind: kind as never, limit: 200 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list entities' });
  }
});

app.get('/entities/:id', async (req, res) => {
  try {
    const entity = await world.getHardState({ id: req.params.id });
    if (!entity) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const fragments = await world.listLoreFragmentsByEntity({ entityId: entity.id, limit: 200 });
    res.json({ entity, fragments });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load entity' });
  }
});

app.post('/entities', async (req, res) => {
  try {
    const input = hardStateInput.parse(req.body);
    const entity = await world.upsertHardState({
      id: input.id,
      kind: input.kind as never,
      subkind: input.subkind as never,
      name: input.name,
      status: (input.status as never) ?? null,
      links: input.links,
    });
    res.json(entity);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save entity';
    res.status(400).json({ error: message });
  }
});

app.post('/relationships', async (req, res) => {
  try {
    const input = z
      .object({
        srcId: z.string().uuid(),
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
      })
      .parse(req.body);
    await world.upsertRelationship(input);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save relationship';
    res.status(400).json({ error: message });
  }
});

app.delete('/relationships', async (req, res) => {
  try {
    const input = z
      .object({
        srcId: z.string().uuid(),
        dstId: z.string().uuid(),
        relationship: z.string().min(1),
      })
      .parse(req.body);
    await world.deleteRelationship(input);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete relationship';
    res.status(400).json({ error: message });
  }
});

app.post('/fragments', async (req, res) => {
  try {
    const input = fragmentInput.parse(req.body);
    const fragment = await world.createLoreFragment({
      id: input.id,
      entityId: input.entityId,
      title: input.title,
      prose: input.prose,
      tags: input.tags,
      source: {
        chronicleId: input.chronicleId,
        beatId: input.beatId,
        turnRange: input.turnRange,
      },
    });
    res.json(fragment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create fragment';
    res.status(400).json({ error: message });
  }
});

app.put('/fragments/:id', async (req, res) => {
  try {
    const input = fragmentInput.partial().parse({ ...req.body, id: req.params.id });
    const fragment = await world.updateLoreFragment({
      id: input.id as string,
      title: input.title,
      prose: input.prose,
      tags: input.tags,
      source: {
        chronicleId: input.chronicleId,
        beatId: input.beatId,
        turnRange: input.turnRange,
      },
    });
    res.json(fragment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update fragment';
    res.status(400).json({ error: message });
  }
});

app.delete('/fragments/:id', async (req, res) => {
  try {
    await world.deleteLoreFragment({ id: req.params.id });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete fragment';
    res.status(400).json({ error: message });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4016;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Atlas API listening on ${PORT}`);
});
