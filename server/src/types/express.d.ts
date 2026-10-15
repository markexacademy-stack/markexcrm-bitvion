import type { IUser } from '../models';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      csrfToken?: string;
      validatedQuery?: Record<string, unknown>;
      validatedParams?: Record<string, unknown>;
    }
  }
}

export {};
