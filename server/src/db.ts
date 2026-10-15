import mongoose from 'mongoose';
import { getConfig } from './config';

let connection: Promise<typeof mongoose> | null = null;

export function connectDb(): Promise<typeof mongoose> {
  if (connection) return connection;
  const { mongodbUri } = getConfig();
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);
  connection = mongoose.connect(mongodbUri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 20000,
    maxIdleTimeMS: 60000,
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

export async function disconnectDb(): Promise<void> {
  connection = null;
  await mongoose.disconnect();
}
