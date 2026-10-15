import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { captureException } from '../config';
import { HttpError } from '../lib/http';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details ?? null } });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'The submitted data is not valid.', details: error.message } });
    return;
  }
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'A record id was not valid.', details: null } });
    return;
  }
  const mongoCode = (error as { code?: number }).code;
  if (mongoCode === 11000) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these details already exists.', details: null } });
    return;
  }
  captureException(error);
  const message = process.env.NODE_ENV === 'production' ? 'Something went wrong. The error has been recorded.' : error instanceof Error ? error.message : 'Unexpected error';
  res.status(500).json({ error: { code: 'INTERNAL', message, details: null } });
}
