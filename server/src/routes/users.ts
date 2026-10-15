import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { PERMISSIONS } from '../lib/constants';
import { normalizeEmail } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/http';
import { emailField, envelope, objectId, passwordField } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { User } from '../models';
import { recordAudit } from '../services/audit';

const router = Router();
router.use(requirePermission('users.manage'));

router.get('/', asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ data: users.map((user) => ({ id: user._id, email: user.email, name: user.name, role: user.role, permissions: user.permissions, isActive: user.isActive, lastLoginAt: user.lastLoginAt || null })) });
}));

router.post('/', validate(envelope({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    email: emailField,
    password: passwordField,
    role: z.enum(['admin', 'staff']),
    permissions: z.array(z.enum(PERMISSIONS)).default([]),
  }),
})), asyncHandler(async (req, res) => {
  if (req.user!.role !== 'admin') throw badRequest('Only an administrator can create users.');
  const email = normalizeEmail(req.body.email);
  if (await User.exists({ email })) throw conflict('A user with this email already exists.');
  const user = await User.create({
    name: req.body.name,
    email,
    passwordHash: await bcrypt.hash(req.body.password, 12),
    role: req.body.role,
    permissions: req.body.role === 'admin' ? [] : req.body.permissions,
    isActive: true,
  });
  await recordAudit({ req, action: 'user.created', category: 'admin', entityType: 'User', entityId: user._id.toString(), metadata: { role: user.role } });
  res.status(201).json({ id: user._id });
}));

router.patch('/:id', validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(['admin', 'staff']).optional(),
    permissions: z.array(z.enum(PERMISSIONS)).optional(),
    isActive: z.boolean().optional(),
    password: passwordField.optional(),
  }),
})), asyncHandler(async (req, res) => {
  if (req.user!.role !== 'admin') throw badRequest('Only an administrator can update users.');
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw notFound('User not found.');
  if (req.body.isActive === false && user._id.equals(req.user!._id)) throw badRequest('You cannot deactivate your own account.');
  if (req.body.name) user.name = req.body.name;
  if (req.body.role) user.role = req.body.role;
  if (req.body.permissions && user.role === 'staff') user.permissions = req.body.permissions;
  if (user.role === 'admin') user.permissions = [];
  if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;
  if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 12);
  await user.save();
  await recordAudit({ req, action: 'user.updated', category: 'admin', entityType: 'User', entityId: user._id.toString() });
  res.json({ ok: true });
}));

export default router;
