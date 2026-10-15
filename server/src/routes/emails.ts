import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { emailProviderConfigured, getConfig, smtpConfigured } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { isValidEmail, normalizeEmail } from '../lib/crypto';
import { badRequest, notFound } from '../lib/http';
import { FROM_NAME, RECEIPT_SUBJECT, WELCOME_SUBJECT, redactSecrets } from '../lib/mailPolicy';
import { getPage, pageResult } from '../lib/time';
import { envelope, objectId } from '../lib/schema';
import { requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { EmailCampaign, EmailEvent, EmailJob, EmailTemplate } from '../models';
import { recordAudit } from '../services/audit';
import { previewTemplate, queueEmail, sendDiagnosticMessage, templateVars, testSmtpConnection } from '../services/email';
import { createQueuedCampaign, resolveRecipients } from '../services/sharing';

const router = Router();

router.get('/email-templates', requireAnyPermission('templates.manage', 'communications.send', 'forms.share'), asyncHandler(async (_req, res) => {
  const data = await EmailTemplate.find().sort({ isSystem: -1, name: 1 });
  res.json({ data });
}));

router.post('/email-templates', requirePermission('templates.manage'), validate(envelope({
  body: z.object({
    name: z.string().trim().min(2).max(160),
    slug: z.string().trim().regex(/^[a-z0-9-]+$/),
    subject: z.string().trim().min(2).max(200),
    htmlBody: z.string().min(2).max(100000),
    textBody: z.string().min(2).max(100000),
    category: z.enum(['operational', 'marketing']),
  }),
})), asyncHandler(async (req, res) => {
  const template = await EmailTemplate.create(req.body);
  res.status(201).json(template);
}));

router.patch('/email-templates/:id', requirePermission('templates.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(160).optional(),
    subject: z.string().trim().min(2).max(200).optional(),
    htmlBody: z.string().min(2).max(100000).optional(),
    textBody: z.string().min(2).max(100000).optional(),
    category: z.enum(['operational', 'marketing']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!template) throw notFound('Email template not found.');
  res.json(template);
}));

router.post('/email-templates/:id/preview', requireAnyPermission('templates.manage', 'communications.send', 'forms.share'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ variables: z.record(z.string(), z.string().max(2000)).optional().default({}) }),
})), asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findById(req.params.id);
  if (!template) throw notFound('Email template not found.');
  res.json(await previewTemplate(template, req.body.variables));
}));

router.post('/email-templates/:id/test', requirePermission('communications.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ to: z.string().trim().email(), variables: z.record(z.string(), z.string().max(2000)).optional().default({}) }),
})), asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findById(req.params.id);
  if (!template) throw notFound('Email template not found.');
  const job = await queueEmail({
    idempotencyKey: `template-test:${template._id.toString()}:${req.body.to.toLowerCase()}:${Date.now()}`,
    to: req.body.to,
    template,
    vars: await templateVars(req.body.variables),
    test: true,
    actorId: req.user!._id.toString(),
  });
  res.status(202).json({ jobId: job._id, status: job.status, error: job.lastError || null });
}));

router.get('/email-campaigns', requirePermission('campaigns.send'), validate(envelope({
  query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { page: number; pageSize: number };
  const { page, pageSize, skip } = getPage(query);
  const [data, total] = await Promise.all([
    EmailCampaign.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize).populate('templateId', 'name subject category'),
    EmailCampaign.countDocuments(),
  ]);
  res.json(pageResult(data, total, page, pageSize));
}));

router.post('/email-campaigns', requirePermission('campaigns.send'), validate(envelope({
  body: z.object({
    name: z.string().trim().min(2).max(160),
    templateId: objectId,
    studentIds: z.array(objectId).max(1000).optional().default([]),
    importEmails: z.array(z.string()).max(1000).optional().default([]),
    courseId: objectId.optional(),
    enrollmentStatus: z.string().max(80).optional(),
    scheduledFor: z.string().datetime().optional(),
    confirm: z.boolean().optional().default(false),
    confirmPermittedImports: z.boolean().optional().default(false),
    variables: z.record(z.string(), z.string().max(2000)).optional().default({}),
  }),
})), asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findById(req.body.templateId);
  if (!template) throw notFound('Email template not found.');
  const resolved = await resolveRecipients({
    studentIds: req.body.studentIds,
    importEmails: req.body.importEmails,
    courseId: req.body.courseId,
    enrollmentStatus: req.body.enrollmentStatus,
    category: template.category,
    confirmPermittedImports: req.body.confirmPermittedImports,
  });
  if (!req.body.confirm) {
    res.json({ dryRun: true, eligibleCount: resolved.eligible.length, excluded: resolved.excluded });
    return;
  }
  const campaign = await createQueuedCampaign({
    name: req.body.name,
    template,
    createdBy: req.user!._id.toString(),
    scheduledFor: req.body.scheduledFor ? new Date(req.body.scheduledFor) : undefined,
    confirmPermittedImports: req.body.confirmPermittedImports,
    recipients: resolved.eligible,
    excludedCount: resolved.excluded.length,
    filters: { courseId: req.body.courseId, enrollmentStatus: req.body.enrollmentStatus },
    auditAction: 'campaign.queued',
    varsFor: async (recipient) => templateVars({ ...req.body.variables, student_name: recipient.name }),
  });
  res.status(202).json(campaign);
}));

router.get('/email-campaigns/:id', requirePermission('campaigns.send'), asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id).populate('templateId', 'name subject category');
  if (!campaign) throw notFound('Campaign not found.');
  const jobs = await EmailJob.find({ campaignId: campaign._id }).select('-html -text').sort({ createdAt: -1 }).limit(200);
  res.json({ campaign, jobs });
}));

router.post('/email-campaigns/:id/send', requirePermission('campaigns.send'), asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id);
  if (!campaign) throw notFound('Campaign not found.');
  if (campaign.status !== 'scheduled' && campaign.status !== 'draft') throw badRequest('This campaign can no longer be sent immediately.');
  await EmailJob.updateMany({ campaignId: campaign._id, status: 'queued' }, { $set: { scheduledFor: new Date() } });
  campaign.status = 'sending';
  campaign.scheduledAt = new Date();
  await campaign.save();
  res.status(202).json({ status: campaign.status });
}));

router.post('/email-campaigns/:id/schedule', requirePermission('campaigns.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ scheduledFor: z.string().datetime() }),
})), asyncHandler(async (req, res) => {
  const when = new Date(req.body.scheduledFor);
  if (when.getTime() < Date.now() - 60_000) throw badRequest('Choose a future time.');
  const campaign = await EmailCampaign.findById(req.params.id);
  if (!campaign || !['draft', 'scheduled'].includes(campaign.status)) throw badRequest('This campaign cannot be rescheduled.');
  campaign.scheduledAt = when;
  campaign.status = 'scheduled';
  await campaign.save();
  await EmailJob.updateMany({ campaignId: campaign._id, status: 'queued' }, { $set: { scheduledFor: when } });
  res.json(campaign);
}));

router.post('/email-campaigns/:id/cancel', requirePermission('campaigns.send'), asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id);
  if (!campaign) throw notFound('Campaign not found.');
  if (campaign.status === 'sent') throw badRequest('Sent campaigns cannot be cancelled.');
  campaign.status = 'cancelled';
  await campaign.save();
  await EmailJob.updateMany({ campaignId: campaign._id, status: 'queued' }, { $set: { status: 'cancelled', lastError: 'Cancelled before sending.' } });
  await recordAudit({ req, action: 'campaign.cancelled', category: 'admin', entityType: 'EmailCampaign', entityId: campaign._id.toString() });
  res.json(campaign);
}));

router.get('/email-jobs', requirePermission('communications.send'), validate(envelope({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['queued', 'sending', 'sent', 'failed', 'suppressed', 'cancelled']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { page: number; pageSize: number; status?: string };
  const { page, pageSize, skip } = getPage(query);
  const filter = query.status ? { status: query.status } : {};
  const [data, total] = await Promise.all([
    EmailJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).select('-html -text'),
    EmailJob.countDocuments(filter),
  ]);
  res.json(pageResult(data, total, page, pageSize));
}));

const diagnosticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many email checks. Try again in a few minutes.', details: null } },
});

router.get('/email-diagnostics', requirePermission('settings.manage'), asyncHandler(async (_req, res) => {
  const config = getConfig();
  const [receipt, welcome, lastAccepted, recent, bounceCount] = await Promise.all([
    EmailTemplate.findOne({ slug: 'payment-receipt' }).select('subject htmlBody textBody'),
    EmailTemplate.findOne({ slug: 'registration-confirmation' }).select('subject htmlBody textBody'),
    EmailJob.findOne({ status: 'sent' }).sort({ sentAt: -1 }).select('sentAt subject'),
    EmailJob.find({ lastError: { $exists: true, $ne: '' } }).sort({ updatedAt: -1 }).limit(8).select('status attempts lastError scheduledFor updatedAt'),
    EmailEvent.countDocuments({ type: 'bounced' }),
  ]);
  const secrets = [config.smtpPass, config.jwtSecret, config.resendApiKey].filter((value) => value.length >= 4);
  res.json({
    sender: config.smtpUser || null,
    fromName: FROM_NAME,
    replyTo: config.smtpUser || null,
    method: smtpConfigured() ? 'gmail-smtp' : config.resendApiKey ? 'resend' : 'not-configured',
    host: smtpConfigured() ? config.smtpHost : null,
    port: smtpConfigured() ? config.smtpPort : null,
    encryption: !smtpConfigured() ? null : config.smtpPort === 465 ? 'tls' : 'starttls',
    providerReady: emailProviderConfigured(),
    configuration: {
      smtpUserSet: Boolean(config.smtpUser),
      smtpPassSet: Boolean(config.smtpPass),
      emailFromSet: Boolean(config.emailFrom),
    },
    lastAcceptedAt: lastAccepted?.sentAt || null,
    recentErrors: recent.map((job) => ({
      status: job.status,
      attempts: job.attempts,
      retryAt: job.status === 'queued' ? job.scheduledFor : null,
      error: redactSecrets(job.lastError || '', secrets),
      at: job.updatedAt,
    })),
    bounceCount,
    bounceNote: 'Bounce rows are recorded when SMTP rejects an address or when a provider webhook reports a bounce. Gmail does not send a bounce feed for personal SMTP. SMTP acceptance is not inbox placement.',
    templates: {
      receipt: {
        present: Boolean(receipt),
        subjectMatches: receipt?.subject === RECEIPT_SUBJECT,
        subject: receipt?.subject || '',
        htmlReady: Boolean(receipt?.htmlBody && receipt.htmlBody.includes('{{student_name}}') && receipt.htmlBody.includes('{{amount_collected}}')),
        textReady: Boolean(receipt?.textBody && receipt.textBody.includes('{{amount_collected}}')),
      },
      welcome: {
        present: Boolean(welcome),
        subjectMatches: welcome?.subject === WELCOME_SUBJECT,
        subject: welcome?.subject || '',
        htmlReady: Boolean(welcome?.htmlBody),
        textReady: Boolean(welcome?.textBody),
      },
    },
    guidance: 'In Gmail, open the message, choose the three dots, then Show original. Check SPF, DKIM, and DMARC. This page cannot see whether Gmail filed the message in Inbox or Spam.',
  });
}));

router.post('/email-diagnostics/connection', requirePermission('settings.manage'), diagnosticLimiter, asyncHandler(async (_req, res) => {
  const result = await testSmtpConnection();
  res.json(result);
}));

router.post('/email-diagnostics/test', requirePermission('settings.manage'), diagnosticLimiter, validate(envelope({
  body: z.object({ to: z.string().trim().email().max(254) }),
})), asyncHandler(async (req, res) => {
  const to = normalizeEmail(req.body.to);
  if (!isValidEmail(to)) throw badRequest('Enter a valid recipient email address.');
  const result = await sendDiagnosticMessage(to, req.user?._id.toString());
  res.json(result);
}));

export default router;
