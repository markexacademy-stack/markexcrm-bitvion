import { z, type ZodTypeAny } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
export const emailField = z.string().trim().email('Enter a valid email address.').max(320);
export const passwordField = z.string().min(10, 'Use at least 10 characters.').max(200).regex(/[A-Za-z]/, 'Include a letter.').regex(/[0-9]/, 'Include a number.');

export const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional().default(''),
};

export function envelope(shape: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return z.object({
    body: shape.body ?? z.object({}).passthrough(),
    query: shape.query ?? z.object({}).passthrough(),
    params: shape.params ?? z.object({}).passthrough(),
  });
}
