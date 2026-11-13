import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { badRequest, notFound } from '../lib/http';
import { envelope, objectId } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { TradingInvestor, TradingPayout, TradingProfit, TradingSettings, type TradingPeriod } from '../models';
import { recordAudit } from '../services/audit';

const router = Router();

const money = z.coerce.number().min(0).max(1000000000);
const percent = z.coerce.number().min(0).max(100);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.');
const period = z.enum(['weekly', 'monthly', 'quarterly']);

async function getTradingSettings() {
  const existing = await TradingSettings.findOne({ key: 'default' });
  if (existing) return existing;
  return TradingSettings.create({
    key: 'default',
    weeklyInvestorPercent: 50,
    monthlyInvestorPercent: 50,
    quarterlyInvestorPercent: 10,
  });
}

function investorPercentFor(settings: { weeklyInvestorPercent: number; monthlyInvestorPercent: number; quarterlyInvestorPercent: number }, kind: TradingPeriod) {
  if (kind === 'weekly') return settings.weeklyInvestorPercent;
  if (kind === 'monthly') return settings.monthlyInvestorPercent;
  return settings.quarterlyInvestorPercent;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

router.get('/trading/overview', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const settings = await getTradingSettings();
  const [investors, profits, payouts] = await Promise.all([
    TradingInvestor.find().sort({ createdAt: -1 }),
    TradingProfit.find().sort({ periodDate: -1, createdAt: -1 }).limit(40),
    TradingPayout.find().sort({ periodDate: -1, createdAt: -1 }).limit(80),
  ]);
  const active = investors.filter((item) => item.active);
  const totalCapital = active.reduce((sum, item) => sum + item.capital, 0);
  const companyProfit = profits.reduce((sum, item) => sum + item.companyProfit, 0);
  const investorPaid = payouts.reduce((sum, item) => sum + item.amount, 0);
  const grossProfit = profits.reduce((sum, item) => sum + item.grossProfit, 0);
  res.json({
    settings: {
      weeklyInvestorPercent: settings.weeklyInvestorPercent,
      monthlyInvestorPercent: settings.monthlyInvestorPercent,
      quarterlyInvestorPercent: settings.quarterlyInvestorPercent,
    },
    totals: {
      investors: investors.length,
      activeInvestors: active.length,
      totalCapital,
      grossProfit,
      companyProfit,
      investorPayouts: investorPaid,
    },
    investors,
    profits,
    payouts,
  });
}));

router.patch('/trading/settings', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    weeklyInvestorPercent: percent.optional(),
    monthlyInvestorPercent: percent.optional(),
    quarterlyInvestorPercent: percent.optional(),
  }),
})), asyncHandler(async (req, res) => {
  const settings = await getTradingSettings();
  if (req.body.weeklyInvestorPercent !== undefined) settings.weeklyInvestorPercent = req.body.weeklyInvestorPercent;
  if (req.body.monthlyInvestorPercent !== undefined) settings.monthlyInvestorPercent = req.body.monthlyInvestorPercent;
  if (req.body.quarterlyInvestorPercent !== undefined) settings.quarterlyInvestorPercent = req.body.quarterlyInvestorPercent;
  await settings.save();
  await recordAudit({ req, action: 'trading.settings_updated', category: 'admin', entityType: 'TradingSettings', entityId: settings._id.toString() });
  res.json({
    weeklyInvestorPercent: settings.weeklyInvestorPercent,
    monthlyInvestorPercent: settings.monthlyInvestorPercent,
    quarterlyInvestorPercent: settings.quarterlyInvestorPercent,
  });
}));

router.post('/trading/investors', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    fullName: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(40).optional().default(''),
    email: z.string().trim().max(320).optional().default(''),
    capital: money,
    joinedOn: day,
    notes: z.string().trim().max(1000).optional().default(''),
    active: z.boolean().optional().default(true),
  }),
})), asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.');
  const investor = await TradingInvestor.create({
    fullName: req.body.fullName,
    phone: req.body.phone || undefined,
    email: email || undefined,
    capital: req.body.capital,
    joinedOn: new Date(`${req.body.joinedOn}T00:00:00.000Z`),
    notes: req.body.notes || '',
    active: req.body.active !== false,
  });
  await recordAudit({ req, action: 'trading.investor_created', category: 'admin', entityType: 'TradingInvestor', entityId: investor._id.toString() });
  res.status(201).json(investor);
}));

router.patch('/trading/investors/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().max(320).optional(),
    capital: money.optional(),
    joinedOn: day.optional(),
    notes: z.string().trim().max(1000).optional(),
    active: z.boolean().optional(),
  }),
})), asyncHandler(async (req, res) => {
  const investor = await TradingInvestor.findById(req.params.id);
  if (!investor) throw notFound('Investor not found.');
  if (req.body.fullName) investor.fullName = req.body.fullName;
  if (req.body.phone !== undefined) investor.phone = req.body.phone || undefined;
  if (req.body.email !== undefined) {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.');
    investor.email = email || undefined;
  }
  if (req.body.capital !== undefined) investor.capital = req.body.capital;
  if (req.body.joinedOn) investor.joinedOn = new Date(`${req.body.joinedOn}T00:00:00.000Z`);
  if (req.body.notes !== undefined) investor.notes = req.body.notes;
  if (req.body.active !== undefined) investor.active = req.body.active;
  await investor.save();
  res.json(investor);
}));

router.delete('/trading/investors/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
})), asyncHandler(async (req, res) => {
  const investor = await TradingInvestor.findByIdAndDelete(req.params.id);
  if (!investor) throw notFound('Investor not found.');
  await recordAudit({ req, action: 'trading.investor_deleted', category: 'admin', entityType: 'TradingInvestor', entityId: String(req.params.id) });
  res.status(204).end();
}));

router.post('/trading/profits', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    period: period,
    periodDate: day,
    label: z.string().trim().min(2).max(160).optional(),
    grossProfit: money,
    note: z.string().trim().max(1000).optional().default(''),
  }),
})), asyncHandler(async (req, res) => {
  const settings = await getTradingSettings();
  const kind = req.body.period as TradingPeriod;
  const investorSharePercent = investorPercentFor(settings, kind);
  const companySharePercent = roundMoney(100 - investorSharePercent);
  const grossProfit = req.body.grossProfit;
  const investorPool = roundMoney((grossProfit * investorSharePercent) / 100);
  const companyProfit = roundMoney(grossProfit - investorPool);
  const periodDate = new Date(`${req.body.periodDate}T00:00:00.000Z`);
  const label = req.body.label || `${kind[0].toUpperCase()}${kind.slice(1)} profit`;

  const investors = await TradingInvestor.find({ active: true });
  const totalCapital = investors.reduce((sum, item) => sum + item.capital, 0);
  if (investorPool > 0 && totalCapital <= 0) {
    throw badRequest('Add at least one active investor with capital before recording investor payouts.');
  }

  const profit = await TradingProfit.create({
    period: kind,
    periodDate,
    label,
    grossProfit,
    investorSharePercent,
    companySharePercent,
    investorPool,
    companyProfit,
    note: req.body.note || '',
  });

  const payouts = [];
  if (investorPool > 0 && totalCapital > 0) {
    let allocated = 0;
    for (let index = 0; index < investors.length; index += 1) {
      const investor = investors[index];
      const share = index === investors.length - 1
        ? roundMoney(investorPool - allocated)
        : roundMoney((investorPool * investor.capital) / totalCapital);
      allocated = roundMoney(allocated + share);
      if (share <= 0) continue;
      payouts.push(await TradingPayout.create({
        profitId: profit._id,
        investorId: investor._id,
        investorName: investor.fullName,
        period: kind,
        periodDate,
        capitalAtPayout: investor.capital,
        amount: share,
        status: 'recorded',
      }));
    }
  }

  await recordAudit({
    req,
    action: 'trading.profit_recorded',
    category: 'admin',
    entityType: 'TradingProfit',
    entityId: profit._id.toString(),
    metadata: { period: kind, grossProfit, investorPool, companyProfit },
  });
  res.status(201).json({ profit, payouts });
}));

router.delete('/trading/profits/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
})), asyncHandler(async (req, res) => {
  const profit = await TradingProfit.findByIdAndDelete(req.params.id);
  if (!profit) throw notFound('Profit record not found.');
  await TradingPayout.deleteMany({ profitId: profit._id });
  await recordAudit({ req, action: 'trading.profit_deleted', category: 'admin', entityType: 'TradingProfit', entityId: String(req.params.id) });
  res.status(204).end();
}));

router.patch('/trading/payouts/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ status: z.enum(['recorded', 'paid']) }),
})), asyncHandler(async (req, res) => {
  const payout = await TradingPayout.findById(req.params.id);
  if (!payout) throw notFound('Payout not found.');
  payout.status = req.body.status;
  await payout.save();
  res.json(payout);
}));

export default router;
