import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { emailProviderConfigured, getConfig, sheetsConfigured, webhookConfigured } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { safeEqual } from '../lib/crypto';
import { verifyWebhookSignature } from '../lib/crypto';
import { HttpError, badRequest, unauthorized } from '../lib/http';
import { parseCsv, toCsv } from '../lib/csv';
import { DUPLICATE_POLICIES } from '../lib/constants';
import { isValidTimeZone } from '../lib/time';
import { envelope } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuditLog, CommunicationConsent, EmailEvent, EmailJob, GoogleIntegration, Student } from '../models';
import { recordAudit } from '../services/audit';
import { dashboardSummary, enrollmentBreakdown, recentActivity, registrationTrend } from '../services/dashboard';
import { processSubmission } from '../services/registration';
import { applyRegistration, currentDuplicatePolicy, resolveCourseId } from '../services/students';
import { getSettings } from '../services/settings';

const router = Router();

router.get('/dashboard/summary', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  const [summary, breakdown, activity] = await Promise.all([dashboardSummary(), enrollmentBreakdown(), recentActivity()]);
  res.json({ ...summary, ...breakdown, ...activity });
}));

router.get('/dashboard/registrations', requirePermission('students.view'), asyncHandler(async (_req, res) => {
  res.json(await registrationTrend());
}));

router.get('/dashboard/upcoming-classes', requirePermission('schedules.manage'), asyncHandler(async (_req, res) => {
  const activity = await recentActivity();
  res.json({ data: activity.classes });
}));

router.get('/reports/enrollment', requirePermission('reports.view'), asyncHandler(async (_req, res) => {
  const [breakdown, trend, summary] = await Promise.all([enrollmentBreakdown(), registrationTrend(), dashboardSummary()]);
  res.json({ ...breakdown, trend, totals: summary.totals });
}));

router.get('/reports/communications', requirePermission('reports.view'), asyncHandler(async (_req, res) => {
  const [jobs, events] = await Promise.all([
    EmailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    EmailEvent.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);
  res.json({
    jobs: jobs.map((item) => ({ status: item._id, count: item.count })),
    events: events.map((item) => ({ type: item._id, count: item.count })),
  });
}));

router.get('/settings', requirePermission('settings.manage'), asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json({
    supportEmail: settings.supportEmail,
    organizationName: settings.organizationName,
    website: settings.website,
    tagline: settings.tagline,
    timeZone: settings.timeZone,
    duplicatePolicy: settings.duplicatePolicy,
    communicationPolicy: settings.communicationPolicy,
    emailProviderConfigured: emailProviderConfigured(),
    webhookConfigured: webhookConfigured(),
    sheetsConfigured: sheetsConfigured(),
  });
}));

router.patch('/settings', requirePermission('settings.manage'), validate(envelope({
  body: z.object({
    supportEmail: z.string().trim().email().or(z.literal('')).optional(),
    organizationName: z.string().trim().min(2).max(160).optional(),
    website: z.string().trim().url().optional(),
    tagline: z.string().trim().max(160).optional(),
    timeZone: z.string().trim().optional(),
    duplicatePolicy: z.enum(DUPLICATE_POLICIES).optional(),
    communicationPolicy: z.enum(['operational_allowed', 'require_consent']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  if (req.body.timeZone && !isValidTimeZone(req.body.timeZone)) throw badRequest('Choose a valid time zone.');
  const settings = await getSettings();
  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined) (settings as unknown as Record<string, unknown>)[key] = value;
  }
  await settings.save();
  await recordAudit({ req, action: 'settings.updated', category: 'admin', entityType: 'ApplicationSettings', entityId: settings._id.toString() });
  res.json({ ok: true });
}));

router.get('/google-integration', requirePermission('integrations.manage'), asyncHandler(async (_req, res) => {
  const integration = await GoogleIntegration.findOne({ key: 'default' });
  res.json({
    syncMethod: integration?.syncMethod || 'apps_script',
    lastWebhookAt: integration?.lastWebhookAt || null,
    setupNotes: integration?.setupNotes || '',
    webhookConfigured: webhookConfigured(),
    sheetsConfigured: sheetsConfigured(),
    emailProviderConfigured: emailProviderConfigured(),
  });
}));

router.patch('/google-integration', requirePermission('integrations.manage'), validate(envelope({
  body: z.object({
    syncMethod: z.enum(['apps_script', 'sheets_api']).optional(),
    setupNotes: z.string().max(4000).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const integration = await GoogleIntegration.findOneAndUpdate({ key: 'default' }, { $set: req.body, $setOnInsert: { key: 'default' } }, { upsert: true, new: true });
  await recordAudit({ req, action: 'integration.updated', category: 'admin', entityType: 'GoogleIntegration', entityId: integration._id.toString() });
  res.json({ syncMethod: integration.syncMethod, setupNotes: integration.setupNotes || '' });
}));

router.get('/audit-logs', requirePermission('audit.view'), validate(envelope({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    category: z.enum(['communication', 'admin', 'security']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { page: number; pageSize: number; category?: string };
  const page = query.page;
  const pageSize = query.pageSize;
  const filter = query.category ? { category: query.category } : {};
  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).populate('actorId', 'name email'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ data, page, pageSize, total });
}));

router.post('/import/students', requirePermission('students.import'), validate(envelope({
  body: z.object({ csv: z.string().min(1).max(2_000_000), sendWelcomeEmail: z.boolean().optional() }),
})), asyncHandler(async (req, res) => {
  const rows = parseCsv(req.body.csv);
  if (rows.length < 2) throw badRequest('The CSV needs a header row and at least one student.');
  if (rows.length > 1001) throw badRequest('Import up to 1000 students at a time.');
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);
  if (index('fullname') < 0 && index('full name') < 0) throw badRequest('Include a fullName column.');
  if (index('email') < 0) throw badRequest('Include an email column.');
  const nameIndex = index('fullname') >= 0 ? index('fullname') : index('full name');
  const policy = await currentDuplicatePolicy();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const resolved = await resolveCourseId(row[index('course')] || '');
      const result = await applyRegistration({
        fullName: row[nameIndex] || '',
        email: row[index('email')] || '',
        phone: row[index('phone')] || '',
        courseId: resolved.courseId,
        courseInterest: row[index('course')] || '',
        source: 'import',
        marketingConsent: ['yes', 'true'].includes((row[index('marketingconsent')] || row[index('marketing consent')] || '').toLowerCase()),
        consentStatus: 'unknown',
        registrationDate: new Date(),
        policy,
        mismatch: false,
      });
      if (result.created) created += 1;
      else if (result.skipped || result.flagged) skipped += 1;
      else updated += 1;
      if (result.created && req.body.sendWelcomeEmail) {
        const { getTemplateBySlug, queueEmail, templateVars } = await import('../services/email');
        const { formatDateInTimeZone } = await import('../lib/time');
        const settings = await getSettings();
        await queueEmail({
          idempotencyKey: `welcome:${result.student._id.toString()}`,
          to: result.student.email,
          template: await getTemplateBySlug('registration-confirmation'),
          vars: await templateVars({
            student_name: result.student.fullName,
            student_id: result.student.studentId,
            course_name: resolved.courseName || 'To be confirmed',
            registration_date: formatDateInTimeZone(result.student.registrationDate, settings.timeZone),
          }),
          studentId: result.student._id.toString(),
          actorId: req.user!._id.toString(),
          auditAction: 'welcome_email.queued',
        });
      }
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'could not be imported'}`);
    }
  }
  await recordAudit({ req, action: 'students.imported', category: 'admin', entityType: 'Student', metadata: { created, updated, skipped } });
  res.json({ created, updated, skipped, errors });
}));

router.get('/export/students', requirePermission('exports.sensitive'), asyncHandler(async (req, res) => {
  const students = await Student.find({ archivedAt: null }).sort({ registrationDate: -1 }).limit(20000).populate('courseId', 'name').populate('batchId', 'name');
  const rows = [['studentId', 'fullName', 'email', 'phone', 'course', 'batch', 'registrationDate', 'source', 'enrollmentStatus', 'consentStatus']];
  for (const student of students) {
    const course = student.courseId as unknown as { name?: string } | null;
    const batch = student.batchId as unknown as { name?: string } | null;
    rows.push([
      student.studentId,
      student.fullName,
      student.email,
      student.phone || '',
      course?.name || student.courseInterest || '',
      batch?.name || '',
      student.registrationDate.toISOString(),
      student.registrationSource,
      student.enrollmentStatus,
      student.consentStatus,
    ]);
  }
  await recordAudit({ req, action: 'students.exported', category: 'admin', entityType: 'Student', metadata: { count: students.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="markex-students.csv"');
  res.send(toCsv(rows));
}));

export default router;

export const publicRouter = Router();

publicRouter.get('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const consent = await CommunicationConsent.findOne({ unsubscribeToken: req.params.token });
  res.json({ valid: Boolean(consent) });
}));

publicRouter.post('/unsubscribe/:token', validate(envelope({
  params: z.object({ token: z.string().min(20).max(200) }),
  body: z.object({ scope: z.enum(['marketing', 'all']) }),
})), asyncHandler(async (req, res) => {
  const consent = await CommunicationConsent.findOne({ unsubscribeToken: req.params.token });
  if (!consent) {
    res.json({ ok: true });
    return;
  }
  if (req.body.scope === 'marketing') consent.marketing = false;
  else {
    consent.unsubscribedAll = true;
    consent.marketing = false;
    consent.operational = false;
    if (consent.studentId) await Student.updateOne({ _id: consent.studentId }, { $set: { unsubscribedAll: true, marketingConsent: false } });
  }
  await consent.save();
  await recordAudit({ action: 'student.unsubscribed', category: 'communication', entityType: 'CommunicationConsent', entityId: consent._id.toString(), studentId: consent.studentId?.toString(), metadata: { scope: req.body.scope } });
  res.json({ ok: true });
}));

export const webhookRouter = Router();

function assertWebhook(req: { get(name: string): string | undefined }, raw: string) {
  if (!webhookConfigured()) throw new HttpError(503, 'Webhook authentication is not configured.', 'NOT_CONFIGURED');
  const secret = getConfig().webhookSecret;
  const signature = req.get('x-markex-signature');
  const timestamp = req.get('x-markex-timestamp');
  if (signature && timestamp) {
    if (!verifyWebhookSignature(secret, timestamp, raw, signature)) throw unauthorized('Webhook signature was rejected.');
    const skew = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(Number(timestamp)) || skew > 10 * 60 * 1000) throw unauthorized('Webhook timestamp is outside the allowed window.');
    return;
  }
  const header = req.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token || !safeEqual(token, secret)) throw unauthorized('Webhook authentication was rejected.');
}

const submissionSchema = z.object({
  eventId: z.string().min(8).max(300),
  googleFormId: z.string().min(3).max(200),
  responseTimestamp: z.string().max(80).optional(),
  timestamp: z.number().int(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.boolean()])).optional().default({}),
});

webhookRouter.post('/google-form', asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  assertWebhook(req, raw);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw badRequest('Webhook body must be JSON.');
  }
  const parsed = submissionSchema.safeParse(json);
  if (!parsed.success) throw badRequest('The form submission payload is not valid.', parsed.error.flatten());
  const skew = Math.abs(Date.now() - parsed.data.timestamp * 1000);
  if (skew > 10 * 60 * 1000) throw unauthorized('The submission timestamp is outside the allowed window.');
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data.answers)) {
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    answers[key.slice(0, 200)] = text.slice(0, 5000);
  }
  const result = await processSubmission({
    eventId: parsed.data.eventId,
    googleFormId: parsed.data.googleFormId,
    responseTimestamp: parsed.data.responseTimestamp,
    answers,
    source: 'webhook',
  });
  res.json({ ok: true, ...result });
}));

function verifySvix(secret: string, raw: string, id?: string, timestamp?: string, signature?: string): boolean {
  if (!id || !timestamp || !signature) return false;
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || skew > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return signature.split(' ').some((part) => {
    const value = part.split(',')[1];
    return Boolean(value) && safeEqual(value, expected);
  });
}

webhookRouter.post('/email-provider', asyncHandler(async (req, res) => {
  const secret = getConfig().resendWebhookSecret;
  if (!secret) throw new HttpError(503, 'The email provider webhook secret is not configured.', 'NOT_CONFIGURED');
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const verified = verifySvix(secret, raw, req.get('svix-id'), req.get('svix-timestamp'), req.get('svix-signature'));
  if (!verified) throw unauthorized('Email provider signature was rejected.');
  const payload = JSON.parse(raw) as { type?: string; data?: { email_id?: string } };
  const eventId = req.get('svix-id') || '';
  const typeMap: Record<string, 'sent' | 'delivered' | 'bounced' | 'complained' | 'delayed' | 'failed'> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.delivery_delayed': 'delayed',
    'email.failed': 'failed',
  };
  const type = typeMap[payload.type || ''];
  if (!type) {
    res.json({ ok: true, ignored: true });
    return;
  }
  if (await EmailEvent.exists({ providerEventId: eventId })) {
    res.json({ ok: true, duplicate: true });
    return;
  }
  const job = payload.data?.email_id ? await EmailJob.findOne({ providerMessageId: payload.data.email_id }) : null;
  await EmailEvent.create({ jobId: job?._id, providerEventId: eventId, type, payload: { type: payload.type, emailId: payload.data?.email_id || null } });
  if (job && (type === 'bounced' || type === 'complained' || type === 'failed')) {
    job.status = 'failed';
    job.lastError = `Provider reported ${type}.`;
    await job.save();
    const consent = await CommunicationConsent.findOne({ email: job.to });
    if (consent && (type === 'bounced' || type === 'complained')) {
      consent.suppressed = true;
      consent.suppressedReason = type;
      await consent.save();
    }
    await recordAudit({ action: 'email.bounced', category: 'communication', entityType: 'EmailJob', entityId: job._id.toString(), studentId: job.studentId?.toString(), metadata: { type } });
  }
  res.json({ ok: true });
}));
