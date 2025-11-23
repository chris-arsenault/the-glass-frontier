import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { WorldState } from '@glass-frontier/worldstate';
import { log } from '@glass-frontier/utils';

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  log('info', 'atlas-api request', { method: req.method, path: req.path });
  next();
});

const worldState = WorldState.create();
const world = worldState.world;

const hardStateInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.string().min(1),
  subkind: z.string().optional(),
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  status: z.string().optional(),
  prominence: z.enum(['forgotten', 'marginal', 'recognized', 'renowned', 'mythic']).optional(),
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
  chronicleId: z.string().uuid().optional(),
  beatId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

app.get('/entities', async (req, res) => {
  try {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const prominenceSchema = z.enum(['forgotten', 'marginal', 'recognized', 'renowned', 'mythic']);
    const minProminence = prominenceSchema.safeParse(req.query.minProminence).success
      ? (req.query.minProminence as string)
      : undefined;
    const maxProminence = prominenceSchema.safeParse(req.query.maxProminence).success
      ? (req.query.maxProminence as string)
      : undefined;
    const list = await world.listEntities({
      kind: kind as never,
      limit: 200,
      minProminence: minProminence as never,
      maxProminence: maxProminence as never,
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list entities' });
  }
});

app.get('/entities/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const entity = await world.getEntityBySlug({ slug });
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
    const entity = await world.upsertEntity({
      id: input.id,
      kind: input.kind as never,
      subkind: input.subkind as never,
      name: input.name,
      description: input.description ?? undefined,
      prominence: (input.prominence as never) ?? undefined,
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

app.post('/chronicles', async (req, res) => {
  try {
    const input = z
      .object({
        playerId: z.string().min(1),
        title: z.string().min(1),
        locationSlug: z.string().min(1).optional(),
        anchorSlug: z.string().min(1),
        characterId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const anchor = await world.getEntityBySlug({ slug: input.anchorSlug });
    if (!anchor) {
      res.status(404).json({ error: 'Anchor not found' });
      return;
    }

    // If locationSlug not provided, auto-select nearest location neighbor
    let location;
    if (input.locationSlug) {
      location = await world.getEntityBySlug({ slug: input.locationSlug });
      if (!location || location.kind !== 'location') {
        res.status(400).json({ error: 'Location not found or invalid kind' });
        return;
      }
    } else {
      // Auto-select first location neighbor from anchor entity
      const linkedIds = anchor.links.map((link) => link.targetId);
      for (const linkedId of linkedIds) {
        const entity = await world.getEntity({ id: linkedId });
        if (entity && entity.kind === 'location') {
          location = entity;
          break;
        }
      }
      if (!location) {
        res.status(400).json({ error: 'No location neighbors found for anchor entity' });
        return;
      }
    }

    const chronicle = await worldState.chronicles.ensureChronicle({
      playerId: input.playerId,
      locationId: location.id,
      characterId: input.characterId,
      title: input.title,
      anchorEntityId: anchor.id,
    });
    res.json(chronicle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create chronicle';
    res.status(400).json({ error: message });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4016;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Atlas API listening on ${PORT}`);
});
