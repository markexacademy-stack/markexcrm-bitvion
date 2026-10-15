import { Router } from 'express';
import { z } from 'zod';
import { emailProviderConfigured } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { notFound } from '../lib/http';
import { envelope, objectId } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { EmailJob, Expense, Student } from '../models';
import { recordAudit } from '../services/audit';
import { getSettings } from '../services/settings';

const router = Router();

const money = z.coerce.number().min(0).max(1000000000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.');

router.get('/finance/overview', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  const [studentTotals, spendingTotals, recentStudents, recentExpenses, emailsQueued, emailsSent] = await Promise.all([
    Student.aggregate<{ collected: number; pending: number; count: number }>([
      { $match: { archivedAt: null } },
      { $group: { _id: null, collected: { $sum: '$amountCollected' }, pending: { $sum: '$pendingAmount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Student.find({ archivedAt: null }).sort({ createdAt: -1 }).limit(8).select('fullName place amountCollected pendingAmount collectedDate email'),
    Expense.find().sort({ spentOn: -1, createdAt: -1 }).limit(8),
    EmailJob.countDocuments({ status: 'queued' }),
    EmailJob.countDocuments({ status: 'sent' }),
  ]);
  const totalRevenue = studentTotals[0]?.collected || 0;
  const totalPending = studentTotals[0]?.pending || 0;
  const totalSpending = spendingTotals[0]?.total || 0;
  const totalAssets = settings.totalAssets || 0;
  res.json({
    students: studentTotals[0]?.count || 0,
    totalRevenue,
    totalPending,
    totalSpending,
    totalAssets,
    assetsAfterSpending: totalAssets - totalSpending,
    emailsQueued,
    emailsSent,
    emailProviderConfigured: emailProviderConfigured(),
    recentStudents,
    recentExpenses,
  });
}));

router.get('/finance', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  const spending = await Expense.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
  const totalSpending = spending[0]?.total || 0;
  res.json({
    totalAssets: settings.totalAssets || 0,
    totalSpending,
    assetsAfterSpending: (settings.totalAssets || 0) - totalSpending,
  });
}));

router.patch('/finance', requirePermission('settings.manage'), validate(envelope({
  body: z.object({ totalAssets: money }),
})), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  settings.totalAssets = req.body.totalAssets;
  await settings.save();
  await recordAudit({ req, action: 'assets.updated', category: 'admin', entityType: 'ApplicationSettings', entityId: settings._id.toString(), metadata: { totalAssets: settings.totalAssets } });
  const spending = await Expense.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
  const totalSpending = spending[0]?.total || 0;
  res.json({ totalAssets: settings.totalAssets, totalSpending, assetsAfterSpending: settings.totalAssets - totalSpending });
}));

router.get('/expenses', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const data = await Expense.find().sort({ spentOn: -1, createdAt: -1 });
  res.json({ data });
}));

router.post('/expenses', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    purpose: z.string().trim().min(2).max(160),
    amount: money,
    spentOn: day,
  }),
})), asyncHandler(async (req, res) => {
  const expense = await Expense.create({
    purpose: req.body.purpose,
    amount: req.body.amount,
    spentOn: new Date(`${req.body.spentOn}T00:00:00.000Z`),
  });
  await recordAudit({ req, action: 'expense.created', category: 'admin', entityType: 'Expense', entityId: expense._id.toString(), metadata: { purpose: expense.purpose, amount: expense.amount } });
  res.status(201).json(expense);
}));

router.patch('/expenses/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    purpose: z.string().trim().min(2).max(160).optional(),
    amount: money.optional(),
    spentOn: day.optional(),
  }),
})), asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw notFound('That spending record was not found.');
  if (req.body.purpose) expense.purpose = req.body.purpose;
  if (req.body.amount !== undefined) expense.amount = req.body.amount;
  if (req.body.spentOn) expense.spentOn = new Date(`${req.body.spentOn}T00:00:00.000Z`);
  await expense.save();
  res.json(expense);
}));

router.delete('/expenses/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
})), asyncHandler(async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) throw notFound('That spending record was not found.');
  await recordAudit({ req, action: 'expense.deleted', category: 'admin', entityType: 'Expense', entityId: String(req.params.id) });
  res.status(204).end();
}));

export default router;
