import serverless from 'serverless-http';
import { createApp } from '../../server/src/app';
import { connectDb } from '../../server/src/db';
import { ensureSeed } from '../../server/src/services/seed';

type NetlifyEvent = {
  path?: string;
  rawUrl?: string;
};

type NetlifyContext = {
  callbackWaitsForEmptyEventLoop: boolean;
};

let booted: Promise<void> | null = null;
let handle: ReturnType<typeof serverless> | null = null;

function boot(): Promise<void> {
  if (!booted) {
    booted = (async () => {
      await connectDb();
      await ensureSeed();
    })().catch((error) => {
      booted = null;
      throw error;
    });
  }
  return booted;
}

export const handler = async (event: NetlifyEvent, context: NetlifyContext) => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (event.path?.includes('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api') || '/api';
  }
  if (event.rawUrl?.includes('/.netlify/functions/api')) {
    event.rawUrl = event.rawUrl.replace('/.netlify/functions/api', '/api');
  }
  try {
    await boot();
    if (!handle) handle = serverless(createApp());
    return handle(event, context);
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    const message = /JWT_SECRET/i.test(raw)
      ? 'Sign-in is not configured. Set JWT_SECRET in the host environment.'
      : /Server selection|ECONNREFUSED|Mongo/i.test(raw)
        ? 'The database is not connected. Set MONGODB_URI to a hosted MongoDB address.'
        : 'The CRM API could not start.';
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message, details: null } }),
    };
  }
};
