import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { STUDENT_STATUSES } from '../lib/constants';
import { escapeRegex, isValidEmail, normalizeEmail } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/http';
import { getPage, pageResult } from '../lib/time';
import { emailField, envelope, objectId } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuditLog, BatchEnrollment, EmailJob, GoogleSubmissionEvent, Student } from '../models';
import { recordAudit } from '../services/audit';
import { getTemplateBySlug, queueEmail, templateVars } from '../services/email';
import { ensureConsent, getSettings } from '../services/settings';
import { assertBatchCapacity, resolveCourseId } from '../services/students';
import { nextStudentCode } from '../services/settings';
import { queuePaymentReceipt } from '../services/receipt';
import { formatDateInTimeZone } from '../lib/time';

const router = Router();

router.get('/', requirePermission('students.view'), validate(envelope({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional().default(''),
    status: z.enum(STUDENT_STATUSES).optional(),
    courseId: objectId.optional(),
    batchId: objectId.optional(),
    source: z.enum(['google_form', 'manual', 'import']).optional(),
    consent: z.enum(['unknown', 'granted', 'denied']).optional(),
    archived: z.enum(['true', 'false']).optional().default('false'),
    missingBatch: z.enum(['true', 'false']).optional(),
    review: z.enum(['true', 'false']).optional(),
    sort: z.enum(['newest', 'oldest', 'name']).optional().default('newest'),
  }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as Record<string, string | number | undefined>;
  const { page, pageSize, skip } = getPage({ page: Number(query.page), pageSize: Number(query.pageSize) });
  const filter: Record<string, unknown> = {};
  filter.archivedAt = query.archived === 'true' ? { $ne: null } : null;
  if (query.status) filter.enrollmentStatus = query.status;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.batchId) filter.batchId = query.batchId;
  if (query.source) filter.registrationSource = query.source;
  if (query.consent) filter.consentStatus = query.consent;
  if (query.missingBatch === 'true') filter.$or = [{ batchId: { $exists: false } }, { batchId: null }];
  if (query.review === 'true') filter.reviewFlags = { $ne: [] };
  if (query.search) {
    const regex = new RegExp(escapeRegex(String(query.search)), 'i');
    const search = [{ fullName: regex }, { email: regex }, { phone: regex }, { studentId: regex }];
    filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), { $or: search }];
  }
  let sort: Record<string, 1 | -1> = { registrationDate: -1 };
  if (query.sort === 'oldest') sort = { registrationDate: 1 };
  if (query.sort === 'name') sort = { fullName: 1 };
  const [data, total] = await Promise.all([
    Student.find(filter).sort(sort).skip(skip).limit(pageSize).populate('courseId', 'name').populate('batchId', 'name batchCode'),
    Student.countDocuments(filter),
  ]);
  res.json(pageResult(data, total, page, pageSize));
}));

router.post('/', requirePermission('students.edit'), validate(envelope({
  body: z.object({
    fullName: z.string().trim().min(2).max(160),
    email: emailField,
    phone: z.string().trim().max(40).optional().default(''),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    place: z.string().trim().max(120).optional().default(''),
    amountCollected: z.coerce.number().min(0).max(1000000000).optional().default(0),
    pendingAmount: z.coerce.number().min(0).max(1000000000).optional().default(0),
    collectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    courseId: objectId.optional(),
    marketingConsent: z.boolean().optional().default(false),
    sendWelcomeEmail: z.boolean().optional().default(false),
    sendReceipt: z.boolean().optional().default(true),
  }),
})), asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (await Student.exists({ email, archivedAt: null })) throw conflict('A student with this email already exists. Review the existing record instead of creating another.');
  const course = req.body.courseId ? await resolveCourseId(undefined, req.body.courseId) : { courseId: undefined, courseName: '', mismatch: false };
  const student = await Student.create({
    studentId: await nextStudentCode(),
    fullName: req.body.fullName,
    email,
    phone: req.body.phone || undefined,
    courseId: course.courseId,
    registrationDate: new Date(),
    registrationSource: 'manual',
    enrollmentStatus: 'New Registration',
    consentStatus: req.body.marketingConsent ? 'granted' : 'unknown',
    marketingConsent: req.body.marketingConsent,
    gender: req.body.gender || 'Other',
    place: req.body.place || '',
    amountCollected: req.body.amountCollected,
    pendingAmount: req.body.pendingAmount,
    collectedDate: req.body.collectedDate ? new Date(`${req.body.collectedDate}T00:00:00.000Z`) : undefined,
  });
  await ensureConsent({ email, studentId: student._id.toString(), marketing: req.body.marketingConsent, source: 'manual' });
  let receipt: { sent: boolean; error?: string } | undefined;
  if (req.body.sendReceipt !== false) {
    receipt = await queuePaymentReceipt(student, req.user!._id.toString());
    student.welcomeQueuedAt = new Date();
    student.lastCommunicationAt = new Date();
    await student.save();
  }
  if (req.body.sendWelcomeEmail) {
    const settings = await getSettings();
    const template = await getTemplateBySlug('registration-confirmation');
    await queueEmail({
      idempotencyKey: `welcome:${student._id.toString()}`,
      to: student.email,
      template,
      vars: await templateVars({
        student_name: student.fullName,
        student_id: student.studentId,
        course_name: course.courseName || 'To be confirmed',
        registration_date: formatDateInTimeZone(student.registrationDate, settings.timeZone),
      }),
      studentId: student._id.toString(),
      actorId: req.user!._id.toString(),
      auditAction: 'welcome_email.queued',
    });
    student.welcomeQueuedAt = new Date();
    await student.save();
  }
  await recordAudit({ req, action: 'student.created', category: 'admin', entityType: 'Student', entityId: student._id.toString(), studentId: student._id.toString() });
  res.status(201).json({ ...student.toObject(), receiptSent: receipt?.sent ?? false, receiptError: receipt?.error });
}));

router.get('/:id', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate('courseId', 'name category').populate('batchId', 'name batchCode status');
  if (!student) throw notFound('Student not found.');
  res.json(student);
}));

router.patch('/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    place: z.string().trim().max(120).optional(),
    amountCollected: z.coerce.number().min(0).max(1000000000).optional(),
    pendingAmount: z.coerce.number().min(0).max(1000000000).optional(),
    collectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    sendReceipt: z.boolean().optional(),
    courseId: objectId.nullable().optional(),
    enrollmentStatus: z.enum(STUDENT_STATUSES).optional(),
    marketingConsent: z.boolean().optional(),
    consentStatus: z.enum(['unknown', 'granted', 'denied']).optional(),
  }),
})), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student || student.archivedAt) throw notFound('Student not found.');
  const before = student.fullName;
  if (req.body.fullName) student.fullName = req.body.fullName;
  if (req.body.phone !== undefined) student.phone = req.body.phone;
  if (req.body.gender) student.gender = req.body.gender;
  if (req.body.place !== undefined) student.place = req.body.place;
  if (req.body.amountCollected !== undefined) student.amountCollected = req.body.amountCollected;
  if (req.body.pendingAmount !== undefined) student.pendingAmount = req.body.pendingAmount;
  if (req.body.collectedDate !== undefined) student.collectedDate = req.body.collectedDate ? new Date(`${req.body.collectedDate}T00:00:00.000Z`) : undefined;
  if (req.body.courseId !== undefined) student.courseId = req.body.courseId || undefined;
  if (req.body.enrollmentStatus) student.enrollmentStatus = req.body.enrollmentStatus;
  if (typeof req.body.marketingConsent === 'boolean') student.marketingConsent = req.body.marketingConsent;
  if (req.body.consentStatus) student.consentStatus = req.body.consentStatus;
  await student.save();
  let receipt: { sent: boolean; error?: string } | undefined;
  if (req.body.sendReceipt) {
    receipt = await queuePaymentReceipt(student, req.user!._id.toString());
    student.lastCommunicationAt = new Date();
    await student.save();
  }
  await recordAudit({ req, action: 'student.updated', category: 'admin', entityType: 'Student', entityId: student._id.toString(), studentId: student._id.toString(), metadata: { nameChanged: before !== student.fullName } });
  res.json({ ...student.toObject(), receiptSent: receipt?.sent, receiptError: receipt?.error });
}));

router.delete('/:id', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
})), asyncHandler(async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) throw notFound('Student not found.');
  await BatchEnrollment.deleteMany({ studentId: student._id });
  await EmailJob.updateMany(
    { studentId: student._id, status: { $in: ['queued', 'sending'] } },
    { $set: { status: 'cancelled', lastError: 'Cancelled because the student was deleted.' } },
  );
  await recordAudit({
    req,
    action: 'student.deleted',
    category: 'admin',
    entityType: 'Student',
    entityId: student._id.toString(),
    metadata: { fullName: student.fullName },
  });
  res.status(204).end();
}));

router.post('/:id/notes', requirePermission('students.edit'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ body: z.string().trim().min(1).max(2000) }),
})), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw notFound('Student not found.');
  student.notes.push({ body: req.body.body, authorId: req.user!._id, createdAt: new Date() });
  await student.save();
  res.status(201).json(student.notes.at(-1));
}));

router.post('/:id/archive', requirePermission('students.edit'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw notFound('Student not found.');
  student.archivedAt = student.archivedAt ? undefined : new Date();
  await student.save();
  await recordAudit({ req, action: student.archivedAt ? 'student.archived' : 'student.restored', category: 'admin', entityType: 'Student', entityId: student._id.toString(), studentId: student._id.toString() });
  res.json({ archivedAt: student.archivedAt || null });
}));

router.post('/:id/assign-batch', requirePermission('batches.assign'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ batchId: objectId }),
})), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student || student.archivedAt) throw notFound('Student not found.');
  if (student.enrollmentStatus === 'Cancelled') throw conflict('Change the student status before assigning a cancelled registration to a batch.');
  const existing = await BatchEnrollment.findOne({ batchId: req.body.batchId, studentId: student._id, status: 'assigned' });
  if (!existing) await assertBatchCapacity(req.body.batchId, 1);
  await BatchEnrollment.updateOne(
    { batchId: req.body.batchId, studentId: student._id },
    { $set: { status: 'assigned', assignedBy: req.user!._id, assignedAt: new Date() } },
    { upsert: true },
  );
  student.batchId = req.body.batchId;
  if (['New Registration', 'Contact Required', 'Enrollment Pending', 'Enrolled'].includes(student.enrollmentStatus)) {
    student.enrollmentStatus = 'Batch Assigned';
  }
  await student.save();
  await recordAudit({ req, action: 'batch.assigned', category: 'communication', entityType: 'Batch', entityId: req.body.batchId, studentId: student._id.toString() });
  res.json(student);
}));

router.get('/:id/communications', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const [activity, emails] = await Promise.all([
    AuditLog.find({ studentId: req.params.id }).sort({ createdAt: -1 }).limit(100),
    EmailJob.find({ studentId: req.params.id }).sort({ createdAt: -1 }).limit(100).select('-html -text'),
  ]);
  res.json({ activity, emails });
}));

router.get('/:id/submissions', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const submissions = await GoogleSubmissionEvent.find({ studentRef: req.params.id }).sort({ createdAt: -1 }).limit(100);
  res.json({ data: submissions });
}));

router.post('/:id/clear-review', requirePermission('students.edit'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw notFound('Student not found.');
  student.reviewFlags = [];
  await student.save();
  res.json(student);
}));

export function assertEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw badRequest('Enter a valid email address.');
  return email;
}

export default router;
