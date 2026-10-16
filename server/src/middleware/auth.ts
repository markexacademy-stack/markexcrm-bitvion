import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { forbidden, unauthorized } from '../lib/http';
import type { Permission } from '../lib/constants';
import { hasPermission } from '../lib/constants';
import { User } from '../models';

interface TokenPayload {
  sub: string;
  csrf: string;
}

export function signSession(userId: string, csrf: string): string {
  return jwt.sign({ sub: userId, csrf }, getConfig().jwtSecret, { expiresIn: '12h' });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.markex_session as string | undefined;
    if (!token) {
      next(unauthorized());
      return;
    }
    const payload = jwt.verify(token, getConfig().jwtSecret) as TokenPayload;
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      next(unauthorized('This session is no longer valid.'));
      return;
    }
    req.user = user;
    req.csrfToken = payload.csrf;
    next();
  } catch {
    next(unauthorized('Sign in again to continue.'));
  }
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const header = req.get('x-csrf-token') || '';
  if (!req.csrfToken || header !== req.csrfToken) {
    next(forbidden('The request could not be verified. Refresh the page and try again.'));
    return;
  }
  next();
}

export function requireAnyPermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (req.user.role === 'admin' || required.some((permission) => req.user!.permissions.includes(permission))) {
      next();
      return;
    }
    next(forbidden());
  };
}

export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    const allowed = required.every((permission) => hasPermission(req.user!.role, req.user!.permissions, permission));
    if (!allowed) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function sessionCookieOptions() {
  const config = getConfig();
  const secure = config.nodeEnv === 'production' || Boolean(process.env.NETLIFY);
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}
