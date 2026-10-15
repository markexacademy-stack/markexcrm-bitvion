import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { MEETING_PROVIDERS } from '../lib/constants';
import { badRequest, notFound } from '../lib/http';
import { validateMeetingUrl } from '../lib/meetings';
import { envelope, objectId } from '../lib/schema';
import { isValidTimeZone, zonedDateTimeToUtc } from '../lib/time';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Batch, ClassSchedule } from '../models';
import { recordAudit } from '../services/audit';
import { assertClassTiming, queueClassMessages, syncAutomaticReminders } from '../services/classes';

const router = Router();

function toInstants(date: string, startTime: string, endTime: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return {
    startsAt: zonedDateTimeToUtc(year, month, day, startHour, startMinute, timeZone),
    endsAt: zonedDateTimeToUtc(year, month, day, endHour, endMinute, timeZone),
  };
}

const classBody = z.object({
  title: z.string().trim().min(2).max(160),
  courseId: objectId.optional(),
  batchId: objectId.optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  timeZone: z.string().trim().optional(),
  instructor: z.string().trim().max(160).optional(),
  meetingProvider: z.enum(MEETING_PROVIDERS).optional(),
  meetingUrl: z.string().trim().max(500).optional(),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(['scheduled', 'cancelled', 'completed', 'rescheduled']).optional(),
  notifyAnnouncement: z.boolean().optional(),
  notify24h: z.boolean().optional(),
  notify1h: z.boolean().optional(),
});

router.get('/', requirePermission('schedules.manage'), validate(envelope({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    batchId: objectId.optional(),
  }),
})), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as { from?: string; to?: string; batchId?: string };
  const filter: Record<string, unknown> = {};
  if (query.batchId) filter.batchId = query.batchId;
  if (query.from || query.to) {
    filter.startsAt = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to ? { $lte: new Date(query.to) } : {}),
    };
  }
  const data = await ClassSchedule.find(filter).sort({ startsAt: 1 }).limit(300).populate('courseId', 'name').populate('batchId', 'name');
  res.json({ data });
}));

router.post('/', requirePermission('schedules.manage'), validate(envelope({ body: classBody })), asyncHandler(async (req, res) => {
  const timeZone = req.body.timeZone || 'UTC';
  if (!isValidTimeZone(timeZone)) throw badRequest('Choose a valid time zone.');
  assertClassTiming(req.body.date, req.body.startTime, req.body.endTime);
  if (req.body.batchId && !(await Batch.exists({ _id: req.body.batchId }))) throw badRequest('Choose a valid batch.');
  const meetingUrl = validateMeetingUrl(req.body.meetingProvider || 'Other', req.body.meetingUrl);
  const instants = toInstants(req.body.date, req.body.startTime, req.body.endTime, timeZone);
  const classItem = await ClassSchedule.create({
    ...req.body,
    timeZone,
    instructor: req.body.instructor || '',
    meetingProvider: req.body.meetingProvider || 'Other',
    description: req.body.description || '',
    status: req.body.status || 'scheduled',
    notifyAnnouncement: req.body.notifyAnnouncement || false,
    notify24h: req.body.notify24h || false,
    notify1h: req.body.notify1h || false,
    meetingUrl,
    ...instants,
    reminders: {},
  });
  await syncAutomaticReminders(classItem, req.user!._id.toString());
  await recordAudit({ req, action: 'class.scheduled', category: 'communication', entityType: 'ClassSchedule', entityId: classItem._id.toString(), metadata: { title: classItem.title } });
  res.status(201).json(classItem);
}));

router.patch('/:id', requirePermission('schedules.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: classBody.partial(),
})), asyncHandler(async (req, res) => {
  const classItem = await ClassSchedule.findById(req.params.id);
  if (!classItem) throw notFound('Class not found.');
  const provided = Object.fromEntries(Object.entries(req.body).filter(([, value]) => value !== undefined));
  const next = { ...classItem.toObject(), ...provided };
  if (!isValidTimeZone(next.timeZone)) throw badRequest('Choose a valid time zone.');
  assertClassTiming(next.date, next.startTime, next.endTime);
  const meetingUrl = validateMeetingUrl(next.meetingProvider, req.body.meetingUrl === undefined ? classItem.meetingUrl : req.body.meetingUrl);
  const previousStart = classItem.startsAt.getTime();
  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined && key !== 'meetingUrl') (classItem as unknown as Record<string, unknown>)[key] = value;
  }
  classItem.meetingUrl = meetingUrl;
  Object.assign(classItem, toInstants(next.date, next.startTime, next.endTime, next.timeZone));
  if (classItem.startsAt.getTime() !== previousStart && classItem.status === 'scheduled') classItem.status = 'rescheduled';
  await classItem.save();
  await syncAutomaticReminders(classItem, req.user!._id.toString());
  await recordAudit({ req, action: 'class.updated', category: 'admin', entityType: 'ClassSchedule', entityId: classItem._id.toString() });
  res.json(classItem);
}));

router.post('/:id/notify', requirePermission('communications.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ type: z.enum(['announcement', 'reminder', 'cancellation', 'reschedule']) }),
})), asyncHandler(async (req, res) => {
  const classItem = await ClassSchedule.findById(req.params.id);
  if (!classItem) throw notFound('Class not found.');
  const kind = req.body.type === 'reminder' ? 'reminder24' : req.body.type === 'announcement' ? 'announcement' : req.body.type === 'cancellation' ? 'cancellation' : 'reschedule';
  if (kind === 'cancellation') {
    classItem.status = 'cancelled';
    classItem.reminders.cancellationAt = undefined;
    await classItem.save();
  }
  const result = await queueClassMessages(classItem, kind, req.user!._id.toString());
  res.status(202).json(result);
}));

export default router;
