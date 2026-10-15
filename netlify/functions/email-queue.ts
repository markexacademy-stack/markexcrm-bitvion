import { connectDb } from '../../server/src/db';
import { processEmailQueue } from '../../server/src/services/jobs';

export default async () => {
  await connectDb();
  await processEmailQueue();
  return new Response('ok');
};

export const config = {
  schedule: '*/10 * * * *',
};
