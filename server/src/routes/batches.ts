import crypto from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { BATCH_STATUSES } from '../lib/constants';
import { badRequest, conflict, notFound } from '../lib/http';
import { isValidTimeZone } from '../lib/time';
import { envelope, objectId } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Batch, BatchEnrollment, Course, Student } from '../models';
import { recordAudit } from '../services/audit';
import { assertBatchCapacity } from '../services/students';
import { buildBatchVariables, createQueuedCampaign, findTemplate } from '../services/sharing';
import { getTemplateBySlug } from '../services/email';

const router = Router();

router.get('/', requirePermission('batches.view'), asyncHandler(async (_req, res) => {
  const batches = await Batch.find().sort({ createdAt: -1 }).populate('courseId', 'name').populate('whatsappCommunityId', 'name status invitationUrl');
  const counts = await BatchEnrollment.aggregate<{ _id: unknown; count: number }>([
    { $match: { status: 'assigned' } },
    { $group: { _id: '$batchId', count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((item) => [String(item._id), item.count]));
  res.json({ data: batches.map((batch) => ({ ...batch.toObject(), assignedCount: map.get(String(batch._id)) || 0 })) });
}));

router.post('/', requirePermission('batches.manage'), validate(envelope({
  body: z.object({
    name: z.string().trim().min(2).max(160),
    batchCode: z.string().trim().max(40).optional().default(''),
    courseId: objectId,
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    timeZone: z.string().trim().default('UTC'),
    instructor: z.string().trim().max(160).optional().default(''),
    capacity: z.number().int().min(1).max(5000),
    status: z.enum(BATCH_STATUSES).optional().default('Draft'),
    whatsappCommunityId: objectId.optional(),
    emailTemplateId: objectId.optional(),
  }),
})), asyncHandler(async (req, res) => {
  if (!isValidTimeZone(req.body.timeZone)) throw badRequest('Choose a valid time zone.');
  const course = await Course.findOne({ _id: req.body.courseId, status: 'active' });
  if (!course) throw badRequest('Choose an active course.');
  const batch = await Batch.create({
    ...req.body,
    batchCode: req.body.batchCode || `MXB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
  });
  await recordAudit({ req, action: 'batch.created', category: 'admin', entityType: 'Batch', entityId: batch._id.toString(), metadata: { name: batch.name } });
  res.status(201).json(batch);
}));

router.get('/:id', requirePermission('batches.view'), asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id).populate('courseId', 'name').populate('whatsappCommunityId', 'name invitationUrl status expiresAt instructions');
  if (!batch) throw notFound('Batch not found.');
  const enrollments = await BatchEnrollment.find({ batchId: batch._id, status: 'assigned' }).populate('studentId', 'studentId fullName email phone enrollmentStatus');
  res.json({ ...batch.toObject(), students: enrollments.map((item) => item.studentId) });
}));

router.patch('/:id', requirePermission('batches.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(160).optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    timeZone: z.string().trim().optional(),
    instructor: z.string().trim().max(160).optional(),
    capacity: z.number().int().min(1).max(5000).optional(),
    status: z.enum(BATCH_STATUSES).optional(),
    whatsappCommunityId: objectId.nullable().optional(),
    emailTemplateId: objectId.nullable().optional(),
  }),
})), asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw notFound('Batch not found.');
  if (req.body.timeZone && !isValidTimeZone(req.body.timeZone)) throw badRequest('Choose a valid time zone.');
  if (req.body.capacity && req.body.capacity < await BatchEnrollment.countDocuments({ batchId: batch._id, status: 'assigned' })) {
    throw conflict('Capacity cannot be lower than the number of assigned students.');
  }
  const { startDate, endDate, whatsappCommunityId, emailTemplateId, ...rest } = req.body;
  Object.assign(batch, rest);
  if (startDate !== undefined) batch.startDate = startDate ? new Date(startDate) : undefined;
  if (endDate !== undefined) batch.endDate = endDate ? new Date(endDate) : undefined;
  if (whatsappCommunityId !== undefined) batch.whatsappCommunityId = whatsappCommunityId || undefined;
  if (emailTemplateId !== undefined) batch.emailTemplateId = emailTemplateId || undefined;
  await batch.save();
  await recordAudit({ req, action: 'batch.updated', category: 'admin', entityType: 'Batch', entityId: batch._id.toString() });
  res.json(batch);
}));

router.post('/:id/assign-students', requirePermission('batches.assign'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ studentIds: z.array(objectId).min(1).max(500) }),
})), asyncHandler(async (req, res) => {
  const ids = [...new Set(req.body.studentIds as string[])];
  const students = await Student.find({ _id: { $in: ids }, archivedAt: null, enrollmentStatus: { $ne: 'Cancelled' } });
  if (students.length !== ids.length) throw badRequest('One or more students cannot be assigned. Archived and cancelled students were not changed.');
  const already = await BatchEnrollment.countDocuments({ batchId: req.params.id, studentId: { $in: ids }, status: 'assigned' });
  await assertBatchCapacity(req.params.id, ids.length - already);
  for (const student of students) {
    await BatchEnrollment.updateOne(
      { batchId: req.params.id, studentId: student._id },
      { $set: { status: 'assigned', assignedBy: req.user!._id, assignedAt: new Date() } },
      { upsert: true },
    );
    if (!student.batchId) student.batchId = new Types.ObjectId(String(req.params.id));
    if (['New Registration', 'Contact Required', 'Enrollment Pending', 'Enrolled'].includes(student.enrollmentStatus)) student.enrollmentStatus = 'Batch Assigned';
    await student.save();
    await recordAudit({ req, action: 'batch.assigned', category: 'communication', entityType: 'Batch', entityId: req.params.id, studentId: student._id.toString() });
  }
  res.json({ assigned: students.length });
}));

router.get('/:id/preview-email', requirePermission('communications.send'), asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw notFound('Batch not found.');
  const sample = await Student.findOne({ batchId: batch._id, archivedAt: null });
  const template = batch.emailTemplateId ? await findTemplate(String(batch.emailTemplateId)) : await getTemplateBySlug('batch-start');
  const vars = await buildBatchVariables(sample || { fullName: '', studentId: '', email: 'preview@markex-academy.local' } as never, batch._id.toString());
  const { renderStoredTemplate } = await import('../services/systemTemplates');
  res.json({ preview: renderStoredTemplate(template, vars), usesSampleStudent: Boolean(sample) });
}));

router.post('/:id/notify', requirePermission('communications.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ templateId: objectId.optional(), confirm: z.literal(true) }),
})), asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw notFound('Batch not found.');
  const enrollments = await BatchEnrollment.find({ batchId: batch._id, status: 'assigned' });
  const students = await Student.find({ _id: { $in: enrollments.map((item) => item.studentId) }, archivedAt: null });
  const template = req.body.templateId ? await findTemplate(req.body.templateId) : batch.emailTemplateId ? await findTemplate(String(batch.emailTemplateId)) : await getTemplateBySlug('batch-start');
  const recipients = students.map((student) => ({ email: student.email, studentId: student._id.toString(), name: student.fullName, include: true }));
  const campaign = await createQueuedCampaign({
    name: `Batch details — ${batch.name}`,
    template,
    createdBy: req.user!._id.toString(),
    confirmPermittedImports: false,
    recipients,
    excludedCount: 0,
    filters: { batchId: batch._id.toString() },
    auditAction: 'batch_notification.sent',
    varsFor: async (recipient) => {
      const student = students.find((item) => item._id.toString() === recipient.studentId);
      if (!student) throw badRequest('A batch recipient could not be loaded.');
      return buildBatchVariables(student, batch._id.toString());
    },
  });
  await BatchEnrollment.updateMany({ batchId: batch._id, status: 'assigned' }, { $set: { notificationSentAt: new Date() } });
  res.status(202).json({ campaignId: campaign._id, recipientCount: campaign.recipientCount, status: campaign.status });
}));

export default router;
