import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
import { createApp } from './app';
import { getConfig } from './config';
import { connectDb } from './db';
import { ensureSeed } from './services/seed';
import { startJobWorker, stopJobWorker } from './services/jobs';

async function main() {
  const config = getConfig();
  await connectDb();
  await ensureSeed();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`MARKEX CRM API listening on port ${config.port}`);
  });
  startJobWorker();

  const shutdown = () => {
    stopJobWorker();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
