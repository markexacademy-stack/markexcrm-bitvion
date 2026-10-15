import nodemailer from 'nodemailer';
import { emailProviderConfigured, getConfig, smtpConfigured } from '../config';
import { isValidEmail, normalizeEmail } from '../lib/crypto';
import { badRequest } from '../lib/http';
import { CommunicationConsent, EmailEvent, EmailJob, EmailTemplate, type IEmailTemplate } from '../models';
import { recordAudit } from './audit';
import { ensureConsent, getSettings, preferencesUrl } from './settings';
import { renderStoredTemplate } from './systemTemplates';

export async function templateVars(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const settings = await getSettings();
  return {
    support_email: settings.supportEmail || '',
    website: settings.website,
    organization_name: settings.organizationName,
    tagline: settings.tagline,
    student_name: '',
    student_id: '',
    course_name: '',
    registration_date: '',
    registration_form_url: '',
    batch_name: '',
    batch_start_date: '',
    batch_timezone: '',
    instructor_name: '',
    class_schedule: '',
    class_access_section: '',
    whatsapp_community_section: '',
    preferences_url: '',
    unsubscribe_url: '',
    ...extra,
  };
}

export async function getTemplateBySlug(slug: string): Promise<IEmailTemplate> {
  const template = await EmailTemplate.findOne({ slug });
  if (!template) throw badRequest(`The email template "${slug}" is not available.`);
  return template;
}

async function consentDecision(email: string, category: 'operational' | 'marketing') {
  const consent = await CommunicationConsent.findOne({ email });
  if (consent?.suppressed) return { allowed: false, reason: consent.suppressedReason || 'This address is on the suppression list.', consent };
  if (consent?.unsubscribedAll) return { allowed: false, reason: 'The recipient unsubscribed from academy emails.', consent };
  if (category === 'marketing' && !consent?.marketing) return { allowed: false, reason: 'The recipient has not granted marketing consent.', consent };
  if (category === 'operational' && consent && consent.operational === false) return { allowed: false, reason: 'The recipient has opted out of operational email.', consent };
  return { allowed: true, reason: '', consent };
}

export async function queueEmail(input: {
  idempotencyKey: string;
  to: string;
  template: Pick<IEmailTemplate, 'subject' | 'htmlBody' | 'textBody' | 'category' | 'slug' | 'name'>;
  vars: Record<string, string>;
  category?: 'operational' | 'marketing';
  studentId?: string;
  campaignId?: string;
  scheduledFor?: Date;
  test?: boolean;
  actorId?: string;
  auditAction?: string;
}) {
  const to = normalizeEmail(input.to);
  if (!isValidEmail(to)) throw badRequest('Enter a valid recipient email address.');
  const category = input.category || input.template.category;
  const decision = await consentDecision(to, category);
  let allowed = decision.allowed;
  let reason = decision.reason;
  const settings = await getSettings();
  if (settings.communicationPolicy === 'require_consent' && category === 'operational' && allowed && !decision.consent?.operational) {
    allowed = false;
    reason = 'Operational email requires recorded consent under the current communication policy.';
  }
  const consent = decision.consent || (await ensureConsent({ email: to, studentId: input.studentId, marketing: false, source: 'email' }));
  const vars = {
    ...input.vars,
    preferences_url: preferencesUrl(consent.unsubscribeToken),
    unsubscribe_url: preferencesUrl(consent.unsubscribeToken),
  };
  const rendered = renderStoredTemplate(input.template, vars);
  const status = allowed ? 'queued' : 'suppressed';
  try {
    const job = await EmailJob.create({
      idempotencyKey: input.idempotencyKey,
      campaignId: input.campaignId,
      studentId: input.studentId,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category,
      status,
      lastError: allowed ? undefined : reason,
      scheduledFor: input.scheduledFor || new Date(),
      test: Boolean(input.test),
      attempts: 0,
    });
    await EmailEvent.create({ jobId: job._id, type: allowed ? 'queued' : 'failed', payload: { reason: reason || 'queued' } });
    if (input.studentId && input.auditAction) {
      await recordAudit({
        actorId: input.actorId,
        action: input.auditAction,
        category: 'communication',
        entityType: 'EmailJob',
        entityId: job._id.toString(),
        studentId: input.studentId,
        metadata: { to, status, template: input.template.slug },
      });
    }
    return job;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const existing = await EmailJob.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function deliverEmailJob(jobId: string): Promise<'sent' | 'waiting' | 'failed' | 'skipped'> {
  const lockExpiry = new Date(Date.now() - 5 * 60 * 1000);
  const job = await EmailJob.findOneAndUpdate(
    {
      _id: jobId,
      status: 'queued',
      scheduledFor: { $lte: new Date() },
      $or: [{ lockedAt: { $exists: false } }, { lockedAt: null }, { lockedAt: { $lt: lockExpiry } }],
    },
    { $set: { lockedAt: new Date(), status: 'sending' } },
    { new: true },
  );
  if (!job) return 'skipped';
  if (!emailProviderConfigured()) {
    job.status = 'queued';
    job.lockedAt = undefined;
    job.lastError = 'Email provider is not configured. The message stays queued.';
    await job.save();
    return 'waiting';
  }
  try {
    const providerMessageId = smtpConfigured() ? await sendWithSmtp(job) : await sendWithResend(job);
    job.status = 'sent';
    job.providerMessageId = providerMessageId;
    job.sentAt = new Date();
    job.lockedAt = undefined;
    job.lastError = undefined;
    await job.save();
    await EmailEvent.create({ jobId: job._id, type: 'sent', payload: { providerMessageId } });
    if (job.studentId) {
      const { Student } = await import('../models');
      await Student.updateOne({ _id: job.studentId }, { $set: { lastCommunicationAt: new Date() } });
      await recordAudit({
        action: 'email.sent',
        category: 'communication',
        entityType: 'EmailJob',
        entityId: job._id.toString(),
        studentId: job.studentId.toString(),
        metadata: { providerMessageId },
      });
    }
    return 'sent';
  } catch (error) {
    job.attempts += 1;
    job.lastError = error instanceof Error ? error.message : 'Email delivery failed.';
    job.lockedAt = undefined;
    if (job.attempts >= 5) {
      job.status = 'failed';
      await EmailEvent.create({ jobId: job._id, type: 'failed', payload: { error: job.lastError } });
    } else {
      job.status = 'queued';
      job.scheduledFor = new Date(Date.now() + 2 ** job.attempts * 60 * 1000);
    }
    await job.save();
    return 'failed';
  }
}

async function sendWithSmtp(job: { to: string; subject: string; html: string; text: string }): Promise<string> {
  const config = getConfig();
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  const info = await transport.sendMail({
    from: config.emailFrom || config.smtpUser,
    to: job.to,
    subject: job.subject,
    html: job.html,
    text: job.text,
  });
  return info.messageId || 'smtp-accepted';
}

async function sendWithResend(job: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<string> {
  const config = getConfig();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': job.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [job.to],
      subject: job.subject,
      html: job.html,
      text: job.text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new Error(body.message || `Email provider returned HTTP ${response.status}.`);
  }
  return body.id;
}

export async function previewTemplate(template: Pick<IEmailTemplate, 'subject' | 'htmlBody' | 'textBody' | 'category'>, vars: Record<string, string>) {
  const merged = await templateVars(vars);
  return renderStoredTemplate(template, merged);
}
