import { log } from '@glass-frontier/utils';
import { app } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4015;

const server = app.listen(PORT, () => {
  console.log(`World Schema API listening on http://localhost:${PORT}`);
});

function shutdown(): void {
  log('info', 'Shutting down World Schema API server');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
