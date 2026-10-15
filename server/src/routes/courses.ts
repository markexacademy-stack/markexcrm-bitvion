import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { COURSE_CATEGORIES } from '../lib/constants';
import { notFound } from '../lib/http';
import { envelope, objectId } from '../lib/schema';
import { requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Batch, Course, RegistrationForm } from '../models';
import { recordAudit } from '../services/audit';

const router = Router();
const courseBody = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.enum(COURSE_CATEGORIES),
  description: z.string().trim().max(4000).optional(),
  duration: z.string().trim().max(120).optional(),
  enrollmentAvailable: z.boolean().optional(),
  emailTemplateId: objectId.optional(),
});

router.get('/', requireAnyPermission('students.view', 'courses.manage', 'forms.manage', 'batches.view'), asyncHandler(async (req, res) => {
  const includeArchived = req.query.archived === 'true';
  const courses = await Course.find(includeArchived ? {} : { status: 'active' }).sort({ name: 1 });
  const counts = await Promise.all(courses.map(async (course) => ({
    id: course._id,
    batches: await Batch.countDocuments({ courseId: course._id, status: { $ne: 'Cancelled' } }),
    forms: await RegistrationForm.countDocuments({ associatedCourseId: course._id, formStatus: { $ne: 'archived' } }),
  })));
  const extras = new Map(counts.map((item) => [String(item.id), item]));
  res.json({ data: courses.map((course) => ({ ...course.toObject(), batchCount: extras.get(String(course._id))?.batches || 0, formCount: extras.get(String(course._id))?.forms || 0 })) });
}));

router.post('/', requirePermission('courses.manage'), validate(envelope({ body: courseBody })), asyncHandler(async (req, res) => {
  const course = await Course.create({
    ...req.body,
    description: req.body.description || '',
    duration: req.body.duration || '',
    enrollmentAvailable: req.body.enrollmentAvailable || false,
  });
  await recordAudit({ req, action: 'course.created', category: 'admin', entityType: 'Course', entityId: course._id.toString(), metadata: { name: course.name } });
  res.status(201).json(course);
}));

router.patch('/:id', requirePermission('courses.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: courseBody.partial(),
})), asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!course) throw notFound('Course not found.');
  await recordAudit({ req, action: 'course.updated', category: 'admin', entityType: 'Course', entityId: course._id.toString() });
  res.json(course);
}));

router.post('/:id/archive', requirePermission('courses.manage'), asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw notFound('Course not found.');
  course.status = course.status === 'archived' ? 'active' : 'archived';
  if (course.status === 'archived') course.enrollmentAvailable = false;
  await course.save();
  await recordAudit({ req, action: 'course.archived', category: 'admin', entityType: 'Course', entityId: course._id.toString(), metadata: { status: course.status } });
  res.json(course);
}));

export default router;
