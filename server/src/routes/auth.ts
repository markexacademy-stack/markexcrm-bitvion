import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { newId } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { normalizeEmail } from '../lib/crypto';
import { unauthorized } from '../lib/http';
import { envelope, passwordField } from '../lib/schema';
import { requireAuth, requireCsrf, sessionCookieOptions, signSession } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { User } from '../models';
import { recordAudit } from '../services/audit';

const router = Router();
const dummyHash = bcrypt.hashSync('markex-dummy-password', 8);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.', details: null } },
});

function presentUser(user: { _id: unknown; email: string; name: string; role: string; permissions: string[]; isActive: boolean; lastLoginAt?: Date }) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt || null,
  };
}

router.post('/login', loginLimiter, validate(envelope({
  body: z.object({ email: z.string().trim().min(1).max(320), password: z.string().min(1).max(200) }),
})), asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({ email }).select('+passwordHash');
  const match = await bcrypt.compare(req.body.password, user?.passwordHash || dummyHash);
  if (!user || !user.isActive || !match) {
    await recordAudit({ req, action: 'login.failed', category: 'security', entityType: 'User', metadata: { email } });
    throw unauthorized('Invalid username or password.');
  }
  const csrfToken = newId(16);
  user.lastLoginAt = new Date();
  await user.save();
  res.cookie('markex_session', signSession(user._id.toString(), csrfToken), sessionCookieOptions());
  await recordAudit({ req, actorId: user._id.toString(), action: 'login.succeeded', category: 'security', entityType: 'User', entityId: user._id.toString() });
  res.json({ user: presentUser(user), csrfToken });
}));

router.post('/logout', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  res.clearCookie('markex_session', { path: '/' });
  await recordAudit({ req, action: 'logout', category: 'security', entityType: 'User', entityId: req.user?._id.toString() });
  res.json({ ok: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: presentUser(req.user!), csrfToken: req.csrfToken });
}));

router.post('/change-password', requireAuth, requireCsrf, validate(envelope({
  body: z.object({ currentPassword: z.string().min(1), newPassword: passwordField }),
})), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!._id).select('+passwordHash');
  if (!user?.passwordHash || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw unauthorized('The current password is not correct.');
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  await recordAudit({ req, action: 'password.changed', category: 'security', entityType: 'User', entityId: user._id.toString() });
  res.json({ ok: true });
}));

export default router;
