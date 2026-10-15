import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../lib/http';

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({
      body: req.body ?? {},
      query: req.query ?? {},
      params: req.params ?? {},
    });
    if (!parsed.success) {
      next(badRequest('Check the highlighted fields and try again.', parsed.error.flatten()));
      return;
    }
    const data = parsed.data as { body?: unknown; query?: unknown; params?: unknown };
    if (data.body !== undefined) req.body = data.body;
    req.validatedQuery = (data.query ?? {}) as Record<string, unknown>;
    req.validatedParams = (data.params ?? {}) as Record<string, unknown>;
    next();
  };
}
