import express from 'express';
import { z } from 'zod';

import { resetPlaywrightFixtures } from './fixtures';

const app = express();
app.use(express.json());

const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
if (typeof connectionString !== 'string' || connectionString.trim().length === 0) {
  throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the Playwright fixture server.');
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/reset', async (req, res) => {
  try {
    const input = z
      .object({})
      .optional()
      .parse(req.body);
    await resetPlaywrightFixtures(connectionString);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to reset fixtures' });
  }
});

const port = Number(process.env.PLAYWRIGHT_PORT ?? 7800);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Playwright fixture server listening on http://localhost:${port}`);
});

export default app;
