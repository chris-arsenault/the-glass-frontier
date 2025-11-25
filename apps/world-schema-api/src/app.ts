import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { log } from '@glass-frontier/utils';
import { getWorldState } from './context';

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  log('info', 'world-schema-api request', { method: req.method, path: req.path });
  next();
});

// Lazy getter for world store - initialized on first request
const getStore = () => getWorldState().world;

const schema = z.object({
  id: z.string().min(1),
  category: z.string().optional(),
  displayName: z.string().optional(),
  defaultStatus: z.string().optional(),
  subkinds: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});

app.get('/schema', async (_req, res) => {
  try {
    const store = getStore();
    const result = await store.getWorldSchema();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load schema' });
  }
});

app.post('/kinds', async (req, res) => {
  try {
    const store = getStore();
    const input = schema.parse(req.body);
    const updated = await store.upsertKind({
      id: input.id as never,
      category: input.category ?? null,
      displayName: input.displayName ?? null,
      defaultStatus: input.defaultStatus as never,
      subkinds: input.subkinds as never,
      statuses: input.statuses as never,
    });
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert kind';
    res.status(400).json({ error: message });
  }
});

app.post('/relationship-types', async (req, res) => {
  try {
    const store = getStore();
    const parsed = z
      .object({
        id: z.string().min(1),
        description: z.string().optional(),
      })
      .parse(req.body);
    const type = await store.addRelationshipType({
      id: parsed.id,
      description: parsed.description ?? null,
    });
    res.json(type);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert relationship type';
    res.status(400).json({ error: message });
  }
});

app.post('/relationship-rules', async (req, res) => {
  try {
    const store = getStore();
    const input = z
      .object({
        relationshipId: z.string().min(1),
        srcKind: z.string().min(1),
        dstKind: z.string().min(1),
      })
      .parse(req.body);
    await store.upsertRelationshipRule({
      relationshipId: input.relationshipId,
      srcKind: input.srcKind as never,
      dstKind: input.dstKind as never,
    });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert relationship rule';
    res.status(400).json({ error: message });
  }
});

app.delete('/relationship-rules', async (req, res) => {
  try {
    const store = getStore();
    const input = z
      .object({
        relationshipId: z.string().min(1),
        srcKind: z.string().min(1),
        dstKind: z.string().min(1),
      })
      .parse(req.body);
    await store.deleteRelationshipRule({
      relationshipId: input.relationshipId,
      srcKind: input.srcKind as never,
      dstKind: input.dstKind as never,
    });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete relationship rule';
    res.status(400).json({ error: message });
  }
});

export { app };
