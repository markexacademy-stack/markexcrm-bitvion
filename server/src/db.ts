import mongoose from 'mongoose';
import { getConfig } from './config';

export async function connectDb(): Promise<void> {
  const { mongodbUri } = getConfig();
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongodbUri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
