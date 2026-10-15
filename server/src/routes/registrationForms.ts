import { Router } from 'express';
import { z } from 'zod';
import { sheetsConfigured } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { checkPublicFormUrl, parseGoogleFormUrl } from '../lib/googleFormUrl';
import { badRequest, conflict, notFound } from '../lib/http';
import { getPage, pageResult } from '../lib/time';
import { DUPLICATE_POLICIES } from '../lib/constants';
import { envelope, objectId } from '../lib/schema';
import { whatsAppShareUrl } from '../lib/whatsapp';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Batch, Course, GoogleSubmissionEvent, RegistrationForm } from '../models';
import { recordAudit } from '../services/audit';
import { getTemplateBySlug, queueEmail, templateVars } from '../services/email';
import { readFormResponses } from '../services/googleSheets';
import { processSubmission, sheetEventId } from '../services/registration';
import { courseName, createQueuedCampaign, findTemplate, resolveRecipients } from '../services/sharing';

const router = Router();

const formBody = z.object({
  formName: z.string().trim().min(3).max(180),
  publicFormUrl: z.string().trim().max(500),
  googleFormId: z.string().trim().max(200).optional(),
  responseSpreadsheetId: z.string().trim().max(200).optional(),
  associatedCourseId: objectId.optional(),
  optionalBatchId: objectId.optional(),
  formStatus: z.enum(['draft', 'active']).optional(),
  duplicatePolicy: z.enum(DUPLICATE_POLICIES).optional(),
  fieldMapping: z.object({
    fullName: z.array(z.string().trim().min(1)).max(12).optional(),
    email: z.array(z.string().trim().min(1)).max(12).optional(),
    phone: z.array(z.string().trim().min(1)).max(12).optional(),
    course: z.array(z.string().trim().min(1)).max(12).optional(),
    consent: z.array(z.string().trim().min(1)).max(12).optional(),
  }).optional(),
});

async function loadForm(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw badRequest('Choose a valid form.');
  const form = await RegistrationForm.findById(id).populate('associatedCourseId', 'name').populate('optionalBatchId', 'name');
  if (!form) throw notFound('Registration form not found.');
  return form;
}

async function assertAssociations(courseId?: string, batchId?: string) {
  if (courseId && !(await Course.exists({ _id: courseId, status: 'active' }))) throw badRequest('Choose an active course.');
  if (batchId) {
    const batch = await Batch.findById(batchId);
    if (!batch) throw badRequest('Choose a valid batch.');
    if (courseId && String(batch.courseId) !== courseId) throw badRequest('The selected batch belongs to a different course.');
  }
}

router.get('/', requirePermission('forms.view'), validate(envelope({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    integration: z.enum(['verified', 'not_verified']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { page: number; pageSize: number; status?: string; integration?: string };
  const { page, pageSize, skip } = getPage(query);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.formStatus = query.status;
  if (query.integration === 'verified') filter.integrationStatus = 'verified';
  if (query.integration === 'not_verified') filter.integrationStatus = { $ne: 'verified' };
  const [data, total] = await Promise.all([
    RegistrationForm.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).populate('associatedCourseId', 'name'),
    RegistrationForm.countDocuments(filter),
  ]);
  res.json(pageResult(data, total, page, pageSize));
}));

router.post('/', requirePermission('forms.manage'), validate(envelope({ body: formBody })), asyncHandler(async (req, res) => {
  const parsed = parseGoogleFormUrl(req.body.publicFormUrl);
  if (!parsed) throw badRequest('Paste the public Google Form URL from docs.google.com/forms. Short links and invented URLs are not accepted.');
  const formStatus = req.body.formStatus || 'draft';
  if (formStatus === 'active' && !req.body.associatedCourseId) throw badRequest('Associate an active form with a course before activating it.');
  if (req.body.responseSpreadsheetId && !/^[a-zA-Z0-9-_]{10,}$/.test(req.body.responseSpreadsheetId)) throw badRequest('The spreadsheet ID is not in the expected format.');
  await assertAssociations(req.body.associatedCourseId, req.body.optionalBatchId);
  const form = await RegistrationForm.create({
    formName: req.body.formName,
    publicFormUrl: parsed.publicFormUrl,
    publishedFormId: parsed.publishedFormId,
    googleFormId: req.body.googleFormId || parsed.publishedFormId,
    responseSpreadsheetId: req.body.responseSpreadsheetId || undefined,
    associatedCourseId: req.body.associatedCourseId,
    optionalBatchId: req.body.optionalBatchId,
    formStatus,
    sharingEnabled: formStatus === 'active',
    integrationStatus: 'not_tested',
    duplicatePolicy: req.body.duplicatePolicy,
    fieldMapping: req.body.fieldMapping || {},
    createdBy: req.user!._id,
    submissionCount: 0,
  });
  await recordAudit({ req, action: 'form.created', category: 'admin', entityType: 'RegistrationForm', entityId: form._id.toString(), metadata: { formName: form.formName } });
  res.status(201).json(form);
}));

router.get('/:id', requirePermission('forms.view'), asyncHandler(async (req, res) => {
  res.json(await loadForm(req.params.id));
}));

router.patch('/:id', requirePermission('forms.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: formBody.partial().extend({ formStatus: z.enum(['draft', 'active', 'archived']).optional(), sharingEnabled: z.boolean().optional() }),
})), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (req.body.publicFormUrl) {
    const parsed = parseGoogleFormUrl(req.body.publicFormUrl);
    if (!parsed) throw badRequest('Paste the public Google Form URL from docs.google.com/forms.');
    if (parsed.publicFormUrl !== form.publicFormUrl) {
      form.publicFormUrl = parsed.publicFormUrl;
      form.publishedFormId = parsed.publishedFormId;
      form.integrationStatus = 'not_tested';
      form.lastTestDetail = undefined;
      form.lastTestError = undefined;
    }
  }
  if (req.body.googleFormId) form.googleFormId = req.body.googleFormId;
  if (req.body.formName) form.formName = req.body.formName;
  if (req.body.responseSpreadsheetId !== undefined) {
    if (req.body.responseSpreadsheetId && !/^[a-zA-Z0-9-_]{10,}$/.test(req.body.responseSpreadsheetId)) throw badRequest('The spreadsheet ID is not in the expected format.');
    form.responseSpreadsheetId = req.body.responseSpreadsheetId || undefined;
    form.integrationStatus = 'not_tested';
  }
  const courseId = req.body.associatedCourseId === undefined ? form.associatedCourseId?.toString() : req.body.associatedCourseId;
  const batchId = req.body.optionalBatchId === undefined ? form.optionalBatchId?.toString() : req.body.optionalBatchId;
  await assertAssociations(courseId, batchId);
  if (req.body.associatedCourseId !== undefined) form.associatedCourseId = req.body.associatedCourseId as never;
  if (req.body.optionalBatchId !== undefined) form.optionalBatchId = req.body.optionalBatchId as never;
  if (req.body.formStatus) form.formStatus = req.body.formStatus;
  if (req.body.duplicatePolicy) form.duplicatePolicy = req.body.duplicatePolicy;
  if (req.body.fieldMapping) form.fieldMapping = req.body.fieldMapping;
  if (typeof req.body.sharingEnabled === 'boolean') form.sharingEnabled = req.body.sharingEnabled;
  if (form.formStatus === 'active' && !form.associatedCourseId) throw badRequest('Associate the form with a course before activating it.');
  if (form.formStatus !== 'active') form.sharingEnabled = false;
  await form.save();
  await recordAudit({ req, action: 'form.updated', category: 'admin', entityType: 'RegistrationForm', entityId: form._id.toString() });
  res.json(form);
}));

router.delete('/:id', requirePermission('forms.manage'), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  form.formStatus = 'archived';
  form.sharingEnabled = false;
  await form.save();
  await recordAudit({ req, action: 'form.archived', category: 'admin', entityType: 'RegistrationForm', entityId: form._id.toString() });
  res.json({ archived: true });
}));

router.post('/:id/disable-sharing', requirePermission('forms.manage'), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  form.sharingEnabled = false;
  await form.save();
  res.json({ sharingEnabled: false });
}));

router.post('/:id/enable-sharing', requirePermission('forms.manage'), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (form.formStatus !== 'active') throw conflict('Activate the form before sharing it.');
  form.sharingEnabled = true;
  await form.save();
  res.json({ sharingEnabled: true });
}));

router.post('/:id/test', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  const formUrl = await checkPublicFormUrl(form.publicFormUrl);
  const spreadsheet: { configured: boolean; ok?: boolean; error?: string } = { configured: Boolean(form.responseSpreadsheetId) };
  if (form.responseSpreadsheetId) {
    if (!sheetsConfigured()) spreadsheet.error = 'A spreadsheet ID is saved, but Google Sheets credentials are not configured.';
    else {
      try {
        await readFormResponses(form.responseSpreadsheetId);
        spreadsheet.ok = true;
      } catch (error) {
        spreadsheet.ok = false;
        spreadsheet.error = error instanceof Error ? error.message : 'Spreadsheet check failed.';
      }
    }
  }
  const verified = formUrl.ok && (!spreadsheet.configured || spreadsheet.ok === true);
  form.lastTestedAt = new Date();
  form.integrationStatus = verified ? 'verified' : 'error';
  form.lastTestError = verified ? undefined : formUrl.error || spreadsheet.error;
  form.lastTestDetail = verified
    ? spreadsheet.configured
      ? 'The public form URL responded and the response spreadsheet could be read.'
      : 'The public form URL responded successfully. Spreadsheet sync is not configured.'
    : form.lastTestError;
  await form.save();
  res.json({ integrationStatus: form.integrationStatus, formUrl, spreadsheet, message: form.lastTestDetail || form.lastTestError });
}));

router.post('/:id/sync', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (!form.responseSpreadsheetId) throw badRequest('Save the response spreadsheet ID before synchronizing.');
  if (!sheetsConfigured()) throw conflict('Google Sheets credentials are not configured. Submissions can still arrive through the Apps Script webhook.');
  try {
    const rows = await readFormResponses(form.responseSpreadsheetId);
    const [header, ...body] = rows;
    if (!header?.length) throw badRequest('The spreadsheet does not contain a header row yet.');
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const row of body) {
      const answers: Record<string, string> = {};
      header.forEach((key, index) => {
        if (key) answers[key] = String(row[index] || '').slice(0, 5000);
      });
      const timestamp = answers.Timestamp || answers.timestamp || new Date().toISOString();
      try {
        const result = await processSubmission({
          eventId: sheetEventId(form.responseSpreadsheetId, [timestamp, ...row.map((cell) => String(cell || ''))]),
          googleFormId: form.googleFormId,
          responseTimestamp: timestamp,
          answers,
          source: 'sheet_sync',
        });
        if (result.duplicate) duplicates += 1;
        else imported += 1;
      } catch (error) {
        failed += 1;
        if (errors.length < 8) errors.push(error instanceof Error ? error.message : 'A row could not be processed.');
      }
    }
    form.lastSyncAt = new Date();
    form.lastSyncError = failed ? errors.join(' ') : undefined;
    await form.save();
    res.json({ imported, duplicates, failed, errors });
  } catch (error) {
    form.lastSyncAt = new Date();
    form.lastSyncError = error instanceof Error ? error.message : 'Sync failed.';
    form.integrationStatus = 'error';
    await form.save();
    throw error;
  }
}));

router.get('/:id/submissions', requirePermission('forms.view'), validate(envelope({
  params: z.object({ id: objectId }),
  query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { page: number; pageSize: number };
  const { page, pageSize, skip } = getPage(query);
  const filter = { registrationFormId: req.params.id };
  const [data, total] = await Promise.all([
    GoogleSubmissionEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
    GoogleSubmissionEvent.countDocuments(filter),
  ]);
  res.json(pageResult(data, total, page, pageSize));
}));

router.get('/:id/share-links', requirePermission('forms.share'), asyncHandler(async (req, res) => {
  const form = await loadForm(req.params.id);
  const course = form.associatedCourseId as unknown as { name?: string } | null;
  res.json({
    formName: form.formName,
    courseName: course?.name || await courseName(form.associatedCourseId),
    publicFormUrl: form.publicFormUrl,
    whatsappUrl: whatsAppShareUrl(form.publicFormUrl),
    sharingEnabled: form.sharingEnabled && form.formStatus === 'active',
  });
}));

router.post('/:id/share-events', requirePermission('forms.share'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ channel: z.enum(['copied', 'opened', 'whatsapp', 'qr']) }),
})), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (!form.sharingEnabled || form.formStatus !== 'active') throw conflict('Sharing is disabled for this form.');
  await recordAudit({ req, action: `form_link.${req.body.channel}`, category: 'communication', entityType: 'RegistrationForm', entityId: form._id.toString(), metadata: { channel: req.body.channel } });
  res.status(201).json({ ok: true });
}));

async function invitationVars(form: { publicFormUrl: string; associatedCourseId?: unknown }, studentName: string) {
  return templateVars({
    student_name: studentName,
    course_name: await courseName(form.associatedCourseId) || 'To be confirmed',
    registration_form_url: form.publicFormUrl,
  });
}

router.post('/:id/share-email', requirePermission('forms.share', 'communications.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    recipientEmail: z.string().trim().email(),
    studentName: z.string().trim().max(160).optional().default(''),
    templateId: objectId.optional(),
  }),
})), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (!form.sharingEnabled || form.formStatus !== 'active') throw conflict('Sharing is disabled for this form.');
  const template = req.body.templateId ? await findTemplate(req.body.templateId) : await getTemplateBySlug('registration-invitation');
  const job = await queueEmail({
    idempotencyKey: `form-invite:${form._id.toString()}:${req.body.recipientEmail.toLowerCase()}:${Date.now()}`,
    to: req.body.recipientEmail,
    template,
    vars: await invitationVars(form, req.body.studentName),
    actorId: req.user!._id.toString(),
    auditAction: 'form_invitation.queued',
  });
  res.status(202).json({ jobId: job._id, status: job.status, error: job.lastError || null });
}));

router.post('/:id/share-campaign', requirePermission('campaigns.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    studentIds: z.array(objectId).max(1000).optional().default([]),
    importEmails: z.array(z.string().trim().max(320)).max(1000).optional().default([]),
    courseId: objectId.optional(),
    enrollmentStatus: z.string().max(80).optional(),
    templateId: objectId.optional(),
    scheduledFor: z.string().datetime().optional(),
    confirm: z.boolean().optional().default(false),
    confirmPermittedImports: z.boolean().optional().default(false),
    testEmail: z.string().trim().email().optional(),
  }),
})), asyncHandler(async (req, res) => {
  const form = await RegistrationForm.findById(req.params.id);
  if (!form) throw notFound('Registration form not found.');
  if (!form.sharingEnabled || form.formStatus !== 'active') throw conflict('Sharing is disabled for this form.');
  const template = req.body.templateId ? await findTemplate(req.body.templateId) : await getTemplateBySlug('registration-invitation');
  if (req.body.testEmail) {
    const job = await queueEmail({
      idempotencyKey: `form-test:${form._id.toString()}:${req.body.testEmail.toLowerCase()}:${Date.now()}`,
      to: req.body.testEmail,
      template,
      vars: await invitationVars(form, ''),
      test: true,
      actorId: req.user!._id.toString(),
    });
    res.status(202).json({ test: true, jobId: job._id, status: job.status, error: job.lastError || null });
    return;
  }
  const resolved = await resolveRecipients({
    studentIds: req.body.studentIds,
    importEmails: req.body.importEmails,
    courseId: req.body.courseId,
    enrollmentStatus: req.body.enrollmentStatus,
    category: template.category,
    confirmPermittedImports: req.body.confirmPermittedImports,
  });
  if (!req.body.confirm) {
    res.json({ dryRun: true, eligibleCount: resolved.eligible.length, excluded: resolved.excluded, eligible: resolved.eligible.map(({ email, name, studentId }) => ({ email, name, studentId })) });
    return;
  }
  const scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : undefined;
  const campaign = await createQueuedCampaign({
    name: `Registration invitation — ${form.formName}`,
    template,
    registrationFormId: form._id.toString(),
    createdBy: req.user!._id.toString(),
    scheduledFor,
    confirmPermittedImports: req.body.confirmPermittedImports,
    recipients: resolved.eligible,
    excludedCount: resolved.excluded.length,
    filters: { courseId: req.body.courseId, enrollmentStatus: req.body.enrollmentStatus, formId: form._id.toString() },
    varsFor: async (recipient) => invitationVars(form, recipient.name),
  });
  res.status(202).json({ campaignId: campaign._id, recipientCount: campaign.recipientCount, excludedCount: campaign.excludedCount, status: campaign.status });
}));

export default router;
