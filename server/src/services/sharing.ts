import { isValidEmail, isHttpsUrl, normalizeEmail } from '../lib/crypto';
import { badRequest } from '../lib/http';
import { Batch, BatchEnrollment, ClassSchedule, CommunicationConsent, Course, EmailCampaign, EmailTemplate, Student, WhatsAppCommunity, type IEmailTemplate, type IStudent } from '../models';
import { isWhatsAppInviteUrl } from '../lib/whatsapp';
import { formatDateInTimeZone } from '../lib/time';
import { queueEmail, templateVars } from './email';
import { getSettings } from './settings';

export interface RecipientDecision {
  email: string;
  studentId?: string;
  name: string;
  include: boolean;
  reason?: string;
}

export async function resolveRecipients(input: {
  studentIds?: string[];
  importEmails?: string[];
  courseId?: string;
  enrollmentStatus?: string;
  category: 'operational' | 'marketing';
  confirmPermittedImports: boolean;
}): Promise<{ eligible: RecipientDecision[]; excluded: RecipientDecision[] }> {
  const studentIds = input.studentIds || [];
  const importEmails = (input.importEmails || []).map((email) => normalizeEmail(email)).filter(Boolean);
  if (!studentIds.length && !importEmails.length && !input.courseId && !input.enrollmentStatus) {
    throw badRequest('Select students, apply a filter, or import a permitted recipient list.');
  }

  const filter: Record<string, unknown> = { archivedAt: null };
  if (studentIds.length) filter._id = { $in: studentIds };
  if (input.courseId) filter.courseId = input.courseId;
  if (input.enrollmentStatus) filter.enrollmentStatus = input.enrollmentStatus;
  const students = studentIds.length || input.courseId || input.enrollmentStatus ? await Student.find(filter) : [];
  const byEmail = new Map<string, IStudent>();
  for (const student of students) byEmail.set(student.email, student);

  const decisions: RecipientDecision[] = [];
  const seen = new Set<string>();

  const consider = async (email: string, student?: IStudent, imported = false) => {
    if (!isValidEmail(email) || seen.has(email)) {
      if (!isValidEmail(email)) decisions.push({ email, name: student?.fullName || '', include: false, reason: 'The email address is not valid.' });
      return;
    }
    seen.add(email);
    const consent = await CommunicationConsent.findOne({ email });
    if (consent?.suppressed) {
      decisions.push({ email, studentId: student?._id.toString(), name: student?.fullName || '', include: false, reason: 'This address is on the suppression list.' });
      return;
    }
    if (consent?.unsubscribedAll || student?.unsubscribedAll) {
      decisions.push({ email, studentId: student?._id.toString(), name: student?.fullName || '', include: false, reason: 'The recipient unsubscribed from academy emails.' });
      return;
    }
    if (input.category === 'marketing' && !consent?.marketing && !student?.marketingConsent) {
      decisions.push({ email, studentId: student?._id.toString(), name: student?.fullName || '', include: false, reason: 'Marketing consent has not been granted.' });
      return;
    }
    if (input.category === 'operational' && consent && consent.operational === false) {
      decisions.push({ email, studentId: student?._id.toString(), name: student?.fullName || '', include: false, reason: 'The recipient opted out of operational email.' });
      return;
    }
    if (imported && !student) {
      if (input.category === 'marketing' || !input.confirmPermittedImports) {
        decisions.push({ email, name: '', include: false, reason: input.category === 'marketing' ? 'Imported addresses need an existing marketing consent record.' : 'Confirm that imported recipients are permitted to receive this operational message.' });
        return;
      }
    }
    decisions.push({ email, studentId: student?._id.toString(), name: student?.fullName || '', include: true });
  };

  for (const student of students) await consider(student.email, student, false);
  for (const email of importEmails) await consider(email, byEmail.get(email), true);

  return {
    eligible: decisions.filter((item) => item.include),
    excluded: decisions.filter((item) => !item.include),
  };
}

export async function buildBatchVariables(student: IStudent, batchId: string) {
  const batch = await Batch.findById(batchId).populate('courseId').populate('whatsappCommunityId');
  if (!batch) throw badRequest('Batch not found.');
  const classes = await ClassSchedule.find({ batchId, status: { $in: ['scheduled', 'rescheduled'] } }).sort({ startsAt: 1 });
  const schedule = classes.map((item) => `${item.date} ${item.startTime}–${item.endTime} (${item.timeZone}) — ${item.title}${item.instructor ? ` — ${item.instructor}` : ''}`).join('\n');
  const access = classes
    .filter((item) => item.meetingUrl && isHttpsUrl(item.meetingUrl))
    .map((item) => `${item.title}: ${item.meetingUrl}`)
    .join('\n');
  const community = batch.whatsappCommunityId as unknown as { invitationUrl?: string; status?: string; expiresAt?: Date } | null;
  let whatsapp = '';
  if (community?.invitationUrl && community.status === 'active' && isWhatsAppInviteUrl(community.invitationUrl)) {
    if (!community.expiresAt || community.expiresAt > new Date()) whatsapp = community.invitationUrl;
  }
  const settings = await getSettings();
  const course = batch.courseId as unknown as { name?: string } | null;
  return templateVars({
    student_name: student.fullName,
    student_id: student.studentId,
    course_name: course?.name || '',
    batch_name: batch.name,
    batch_start_date: batch.startDate ? formatDateInTimeZone(batch.startDate, batch.timeZone || settings.timeZone) : '',
    batch_timezone: batch.timeZone,
    instructor_name: batch.instructor || '',
    class_schedule: schedule,
    class_access_section: access,
    whatsapp_community_section: whatsapp,
  });
}

export async function createQueuedCampaign(input: {
  name: string;
  template: IEmailTemplate;
  registrationFormId?: string;
  createdBy?: string;
  scheduledFor?: Date;
  confirmPermittedImports: boolean;
  recipients: RecipientDecision[];
  excludedCount: number;
  varsFor: (recipient: RecipientDecision) => Promise<Record<string, string>>;
  filters: Record<string, unknown>;
  auditAction?: string;
}) {
  if (!input.recipients.length) throw badRequest('No eligible recipients remain after consent and suppression checks.');
  const campaign = await EmailCampaign.create({
    name: input.name,
    templateId: input.template._id,
    registrationFormId: input.registrationFormId,
    category: input.template.category,
    status: input.scheduledFor && input.scheduledFor.getTime() > Date.now() + 1000 ? 'scheduled' : 'sending',
    filters: input.filters,
    recipientCount: input.recipients.length,
    excludedCount: input.excludedCount,
    scheduledAt: input.scheduledFor,
    createdBy: input.createdBy,
    confirmPermittedImports: input.confirmPermittedImports,
  });
  for (const recipient of input.recipients) {
    const vars = await input.varsFor(recipient);
    await queueEmail({
      idempotencyKey: `campaign:${campaign._id.toString()}:${recipient.email}`,
      to: recipient.email,
      template: input.template,
      vars,
      studentId: recipient.studentId,
      campaignId: campaign._id.toString(),
      scheduledFor: input.scheduledFor,
      actorId: input.createdBy,
      auditAction: input.auditAction || 'form_invitation.queued',
    });
  }
  return campaign;
}

export async function courseName(courseId?: unknown): Promise<string> {
  if (!courseId) return '';
  const course = await Course.findById(courseId);
  return course?.name || '';
}

export async function activeCommunityForBatch(batchId: string) {
  const batch = await Batch.findById(batchId);
  if (!batch?.whatsappCommunityId) return null;
  const community = await WhatsAppCommunity.findById(batch.whatsappCommunityId);
  if (!community || community.status !== 'active' || !isWhatsAppInviteUrl(community.invitationUrl)) return null;
  if (community.expiresAt && community.expiresAt <= new Date()) return null;
  return community;
}

export async function assignedStudents(batchId: string) {
  const enrollments = await BatchEnrollment.find({ batchId, status: 'assigned' });
  return Student.find({ _id: { $in: enrollments.map((item) => item.studentId) }, archivedAt: null });
}

export async function findTemplate(id: string) {
  const template = await EmailTemplate.findById(id);
  if (!template) throw badRequest('Choose an email template.');
  return template;
}
