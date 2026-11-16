import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { envelope } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { PortfolioDesk, PortfolioMonth, PortfolioSleeve } from '../models';
import { recordAudit } from '../services/audit';

const router = Router();

const money = z.coerce.number().min(0).max(100000000000);
const percent = z.coerce.number().min(-100).max(1000);
const ratio = z.coerce.number().min(-10).max(100);

const defaultSleeves = [
  { name: 'Index Momentum', style: 'Nifty / Bank Nifty trend', allocationPercent: 28, capital: 56000000, returnPercent: 21.4, accuracyPercent: 86.2, status: 'active' as const, note: 'Core trend book with tight risk bands.', sortOrder: 1 },
  { name: 'Options Income', style: 'Defined-risk premium', allocationPercent: 22, capital: 44000000, returnPercent: 16.8, accuracyPercent: 89.1, status: 'active' as const, note: 'Weekly credit spreads and iron condors.', sortOrder: 2 },
  { name: 'Swing Positional', style: 'Multi-day equity swings', allocationPercent: 20, capital: 40000000, returnPercent: 19.5, accuracyPercent: 84.7, status: 'active' as const, note: 'High-conviction swing setups only.', sortOrder: 3 },
  { name: 'Intraday Scalp', style: 'Liquidity bursts', allocationPercent: 18, capital: 36000000, returnPercent: 14.2, accuracyPercent: 91.3, status: 'active' as const, note: 'High-accuracy short-hold executions.', sortOrder: 4 },
  { name: 'Cash & Hedge', style: 'Liquidity reserve', allocationPercent: 12, capital: 24000000, returnPercent: 3.1, accuracyPercent: 100, status: 'active' as const, note: 'Dry powder and protective hedges.', sortOrder: 5 },
];

const defaultMonths = [
  { label: 'Jun 2026', monthDate: '2026-06-01', aum: 176400000, returnPercent: 2.1, profit: 3600000, accuracyPercent: 85.2 },
  { label: 'Jul 2026', monthDate: '2026-07-01', aum: 181200000, returnPercent: 2.7, profit: 4800000, accuracyPercent: 86.4 },
  { label: 'Aug 2026', monthDate: '2026-08-01', aum: 186800000, returnPercent: 3.1, profit: 5600000, accuracyPercent: 87.1 },
  { label: 'Sep 2026', monthDate: '2026-09-01', aum: 191600000, returnPercent: 2.6, profit: 4800000, accuracyPercent: 86.8 },
  { label: 'Oct 2026', monthDate: '2026-10-01', aum: 196400000, returnPercent: 2.5, profit: 4800000, accuracyPercent: 88.2 },
  { label: 'Nov 2026', monthDate: '2026-11-01', aum: 200000000, returnPercent: 1.8, profit: 3600000, accuracyPercent: 87.4 },
];

async function ensurePortfolio() {
  let desk = await PortfolioDesk.findOne({ key: 'default' });
  if (!desk) {
    desk = await PortfolioDesk.create({ key: 'default' });
  }
  const sleeveCount = await PortfolioSleeve.countDocuments();
  if (sleeveCount === 0) {
    await PortfolioSleeve.insertMany(defaultSleeves);
  }
  const monthCount = await PortfolioMonth.countDocuments();
  if (monthCount === 0) {
    await PortfolioMonth.insertMany(defaultMonths.map((item) => ({
      ...item,
      monthDate: new Date(`${item.monthDate}T00:00:00.000Z`),
    })));
  }
  return desk;
}

router.get('/portfolio/overview', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const desk = await ensurePortfolio();
  const [sleeves, months] = await Promise.all([
    PortfolioSleeve.find().sort({ sortOrder: 1, createdAt: 1 }),
    PortfolioMonth.find().sort({ monthDate: 1 }),
  ]);
  const allocated = sleeves.reduce((sum, item) => sum + item.capital, 0);
  const weightedAccuracy = sleeves.length
    ? sleeves.reduce((sum, item) => sum + item.accuracyPercent * item.allocationPercent, 0) / Math.max(1, sleeves.reduce((sum, item) => sum + item.allocationPercent, 0))
    : desk.accuracyPercent;
  res.json({
    desk,
    totals: {
      allocated,
      cashReserve: Math.max(0, desk.aum - allocated),
      sleeveCount: sleeves.length,
      weightedAccuracy: Math.round((weightedAccuracy + Number.EPSILON) * 10) / 10,
      peakAum: Math.max(desk.aum, ...months.map((item) => item.aum)),
    },
    sleeves,
    months,
  });
}));

router.patch('/portfolio/desk', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    deskName: z.string().trim().min(2).max(160).optional(),
    aum: money.optional(),
    netProfit: money.optional(),
    ytdReturnPercent: percent.optional(),
    accuracyPercent: percent.optional(),
    winRatePercent: percent.optional(),
    profitFactor: ratio.optional(),
    sharpeRatio: ratio.optional(),
    maxDrawdownPercent: percent.optional(),
    activeStrategies: z.coerce.number().int().min(0).max(100).optional(),
    tradesThisMonth: z.coerce.number().int().min(0).max(100000).optional(),
    bestMonthPercent: percent.optional(),
    riskProfile: z.string().trim().max(120).optional(),
    mandate: z.string().trim().max(1000).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const desk = await ensurePortfolio();
  if (req.body.deskName !== undefined) desk.deskName = req.body.deskName;
  if (req.body.aum !== undefined) desk.aum = req.body.aum;
  if (req.body.netProfit !== undefined) desk.netProfit = req.body.netProfit;
  if (req.body.ytdReturnPercent !== undefined) desk.ytdReturnPercent = req.body.ytdReturnPercent;
  if (req.body.accuracyPercent !== undefined) desk.accuracyPercent = req.body.accuracyPercent;
  if (req.body.winRatePercent !== undefined) desk.winRatePercent = req.body.winRatePercent;
  if (req.body.profitFactor !== undefined) desk.profitFactor = req.body.profitFactor;
  if (req.body.sharpeRatio !== undefined) desk.sharpeRatio = req.body.sharpeRatio;
  if (req.body.maxDrawdownPercent !== undefined) desk.maxDrawdownPercent = req.body.maxDrawdownPercent;
  if (req.body.activeStrategies !== undefined) desk.activeStrategies = req.body.activeStrategies;
  if (req.body.tradesThisMonth !== undefined) desk.tradesThisMonth = req.body.tradesThisMonth;
  if (req.body.bestMonthPercent !== undefined) desk.bestMonthPercent = req.body.bestMonthPercent;
  if (req.body.riskProfile !== undefined) desk.riskProfile = req.body.riskProfile;
  if (req.body.mandate !== undefined) desk.mandate = req.body.mandate;
  await desk.save();
  await recordAudit({ req, action: 'portfolio.desk_updated', category: 'admin', entityType: 'PortfolioDesk', entityId: desk._id.toString() });
  res.json(desk);
}));

export default router;
