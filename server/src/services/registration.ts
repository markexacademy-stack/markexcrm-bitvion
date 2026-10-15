import crypto from 'node:crypto';
import { HttpError, badRequest } from '../lib/http';
import { GoogleIntegration, GoogleSubmissionEvent, RegistrationForm, Student } from '../models';
import { recordAudit } from './audit';
import { getTemplateBySlug, queueEmail, templateVars } from './email';
import { getSettings } from './settings';
import { applyRegistration, currentDuplicatePolicy, resolveCourseId } from './students';
import { formatDateInTimeZone } from '../lib/time';

const DEFAULT_ALIASES = {
  fullName: ['full name', 'name', 'student name', 'your name'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'whatsapp number', 'whatsapp', 'contact number'],
  course: ['course', 'course interest', 'selected course', 'program', 'programme'],
  consent: ['consent', 'i agree', 'agreement', 'contact consent', 'marketing consent'],
};

function pickAnswer(answers: Record<string, string>, aliases: string[]): string {
  const entries = Object.entries(answers);
  for (const alias of aliases) {
    const exact = entries.find(([key]) => key.trim().toLowerCase() === alias);
    if (exact?.[1]) return exact[1].trim();
  }
  for (const alias of aliases) {
    const partial = entries.find(([key]) => key.trim().toLowerCase().includes(alias));
    if (partial?.[1]) return partial[1].trim();
  }
  return '';
}

function parseConsent(value: string): { consentStatus: 'unknown' | 'granted' | 'denied'; marketing: boolean } {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { consentStatus: 'unknown', marketing: false };
  if (['yes', 'true', 'i agree', 'agree', 'accepted'].includes(normalized) || normalized.startsWith('i agree') || normalized.startsWith('yes')) {
    return { consentStatus: 'granted', marketing: true };
  }
  if (['no', 'false', 'decline', 'disagree', 'i do not agree'].includes(normalized)) {
    return { consentStatus: 'denied', marketing: false };
  }
  return { consentStatus: 'unknown', marketing: false };
}

export function sheetEventId(spreadsheetId: string, row: string[]): string {
  const digest = crypto.createHash('sha256').update(`${spreadsheetId}|${row.join('|')}`).digest('hex');
  return `sheet:${spreadsheetId}:${digest}`;
}

export async function processSubmission(input: {
  eventId: string;
  googleFormId: string;
  responseTimestamp?: string;
  answers: Record<string, string>;
  source: 'webhook' | 'sheet_sync';
}) {
  const prior = await GoogleSubmissionEvent.findOne({ eventId: input.eventId });
  if (prior && (prior.processingStatus === 'processed' || prior.processingStatus === 'duplicate')) {
    return { duplicate: true, studentId: prior.studentRef?.toString() || null, status: prior.processingStatus, emailQueued: prior.emailQueued };
  }

  let event = prior;
  if (!event) {
    try {
      event = await GoogleSubmissionEvent.create({
        eventId: input.eventId,
        googleFormId: input.googleFormId,
        responseTimestamp: input.responseTimestamp ? new Date(input.responseTimestamp) : undefined,
        answers: input.answers,
        processingStatus: 'processing',
        source: input.source,
        emailQueued: false,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await GoogleSubmissionEvent.findOne({ eventId: input.eventId });
      if (!raced) throw error;
      if (raced.processingStatus === 'processed' || raced.processingStatus === 'duplicate') {
        return { duplicate: true, studentId: raced.studentRef?.toString() || null, status: raced.processingStatus, emailQueued: raced.emailQueued };
      }
      event = raced;
    }
  }

  const form = await RegistrationForm.findOne({
    formStatus: { $ne: 'archived' },
    $or: [{ googleFormId: input.googleFormId }, { publishedFormId: input.googleFormId }],
  });
  if (!form) {
    event.processingStatus = 'failed';
    event.error = 'No active CRM registration form matches this Google Form ID.';
    await event.save();
    throw new HttpError(404, event.error, 'FORM_NOT_CONNECTED');
  }

  const mapping = {
    fullName: form.fieldMapping.fullName?.length ? form.fieldMapping.fullName.map((item) => item.toLowerCase()) : DEFAULT_ALIASES.fullName,
    email: form.fieldMapping.email?.length ? form.fieldMapping.email.map((item) => item.toLowerCase()) : DEFAULT_ALIASES.email,
    phone: form.fieldMapping.phone?.length ? form.fieldMapping.phone.map((item) => item.toLowerCase()) : DEFAULT_ALIASES.phone,
    course: form.fieldMapping.course?.length ? form.fieldMapping.course.map((item) => item.toLowerCase()) : DEFAULT_ALIASES.course,
    consent: form.fieldMapping.consent?.length ? form.fieldMapping.consent.map((item) => item.toLowerCase()) : DEFAULT_ALIASES.consent,
  };

  const fullName = pickAnswer(input.answers, mapping.fullName);
  const email = pickAnswer(input.answers, mapping.email);
  const phone = pickAnswer(input.answers, mapping.phone);
  const courseInterest = pickAnswer(input.answers, mapping.course);
  const consent = parseConsent(pickAnswer(input.answers, mapping.consent));

  if (!fullName || !email) {
    event.processingStatus = 'failed';
    event.registrationFormId = form._id;
    event.error = 'The submission is missing a name or email address.';
    await event.save();
    throw badRequest(event.error);
  }

  const resolved = await resolveCourseId(courseInterest, form.associatedCourseId);
  const policy = await currentDuplicatePolicy(form.duplicatePolicy);
  const registrationDate = input.responseTimestamp ? new Date(input.responseTimestamp) : new Date();
  const result = await applyRegistration({
    fullName,
    email,
    phone,
    courseId: resolved.courseId,
    courseInterest,
    source: 'google_form',
    registrationFormId: form._id.toString(),
    marketingConsent: consent.marketing,
    consentStatus: consent.consentStatus,
    registrationDate: Number.isNaN(registrationDate.getTime()) ? new Date() : registrationDate,
    policy,
    mismatch: resolved.mismatch,
  });

  let emailQueued = false;
  if (!result.student.welcomeQueuedAt) {
    const settings = await getSettings();
    const template = await getTemplateBySlug('registration-confirmation');
    const vars = await templateVars({
      student_name: result.student.fullName,
      student_id: result.student.studentId,
      course_name: resolved.courseName || courseInterest || 'To be confirmed',
      registration_date: formatDateInTimeZone(result.student.registrationDate, settings.timeZone),
    });
    await queueEmail({
      idempotencyKey: `welcome:${result.student._id.toString()}`,
      to: result.student.email,
      template,
      vars,
      studentId: result.student._id.toString(),
      auditAction: 'welcome_email.queued',
    });
    result.student.welcomeQueuedAt = new Date();
    result.student.lastCommunicationAt = new Date();
    await result.student.save();
    emailQueued = true;
  }

  const alreadyCounted = prior?.processingStatus === 'processed';
  event.processingStatus = result.created ? 'processed' : 'duplicate';
  event.registrationFormId = form._id;
  event.studentRef = result.student._id;
  event.emailQueued = emailQueued;
  event.error = undefined;
  event.answers = input.answers;
  await event.save();

  if (!alreadyCounted) {
    form.submissionCount += 1;
    form.lastSubmissionAt = new Date();
    form.lastSyncError = undefined;
    await form.save();
  }

  await GoogleIntegration.updateOne({ key: 'default' }, { $set: { lastWebhookAt: new Date() }, $setOnInsert: { key: 'default' } }, { upsert: true });
  await recordAudit({
    action: 'student.registered',
    category: 'communication',
    entityType: 'Student',
    entityId: result.student._id.toString(),
    studentId: result.student._id.toString(),
    metadata: {
      created: result.created,
      duplicatePolicy: policy,
      changedFields: result.changedFields.join(','),
      source: input.source,
      formId: form._id.toString(),
    },
  });

  return {
    duplicate: !result.created,
    studentId: result.student._id.toString(),
    publicStudentId: result.student.studentId,
    status: event.processingStatus,
    emailQueued,
  };
}

export async function studentPublic(id: string) {
  const student = await Student.findById(id).populate('courseId', 'name').populate('batchId', 'name batchCode');
  if (!student) return null;
  return student;
}
