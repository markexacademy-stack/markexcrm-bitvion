import { isHttpsUrl } from '../lib/crypto';
import { badRequest, notFound } from '../lib/http';
import type { HydratedDocument } from 'mongoose';
import { Batch, BatchEnrollment, ClassSchedule, Course, EmailJob, Student, type IClassSchedule } from '../models';
import { formatInTimeZone } from '../lib/time';
import { recordAudit } from './audit';
import { getTemplateBySlug, queueEmail, templateVars } from './email';

async function classVars(classItem: IClassSchedule, studentName: string, notice: string) {
  const course = classItem.courseId ? await Course.findById(classItem.courseId) : null;
  const batch = classItem.batchId ? await Batch.findById(classItem.batchId) : null;
  const access = classItem.meetingUrl && isHttpsUrl(classItem.meetingUrl) ? `${classItem.title}: ${classItem.meetingUrl}` : '';
  return templateVars({
    student_name: studentName,
    class_notice: notice,
    class_title: classItem.title,
    class_when: `${classItem.date} ${classItem.startTime}–${classItem.endTime} (${classItem.timeZone})`,
    course_name: course?.name || '',
    batch_name: batch?.name || '',
    instructor_name: classItem.instructor || batch?.instructor || '',
    class_access_section: access,
  });
}

export async function queueClassMessages(classItem: IClassSchedule, kind: 'announcement' | 'reminder24' | 'reminder1' | 'cancellation' | 'reschedule', actorId?: string) {
  if (!classItem.batchId) return { queued: 0 };
  const enrollments = await BatchEnrollment.find({ batchId: classItem.batchId, status: 'assigned' });
  const students = await Student.find({ _id: { $in: enrollments.map((item) => item.studentId) }, archivedAt: null, unsubscribedAll: { $ne: true } });
  const template = await getTemplateBySlug('class-notification');
  const notices = {
    announcement: 'A class has been scheduled.',
    reminder24: 'This is a reminder that your class is coming up in about 24 hours.',
    reminder1: 'This is a reminder that your class starts in about one hour.',
    cancellation: 'This class has been cancelled. Do not use any previous meeting link for this session.',
    reschedule: 'This class has been rescheduled. Use the updated time below.',
  };
  let queued = 0;
  for (const student of students) {
    const when = classItem.startsAt.toISOString();
    const key = kind === 'announcement' || kind === 'cancellation'
      ? `class:${classItem._id.toString()}:${kind}:${student._id.toString()}`
      : `class:${classItem._id.toString()}:${kind}:${student._id.toString()}:${when}`;
    const scheduledFor = kind === 'reminder24'
      ? new Date(classItem.startsAt.getTime() - 24 * 60 * 60 * 1000)
      : kind === 'reminder1'
        ? new Date(classItem.startsAt.getTime() - 60 * 60 * 1000)
        : new Date();
    if ((kind === 'reminder24' || kind === 'reminder1') && scheduledFor.getTime() <= Date.now()) continue;
    const existing = await EmailJob.findOne({ idempotencyKey: key });
    if (existing) continue;
    const vars = await classVars(classItem, student.fullName, notices[kind]);
    vars.registration_date = formatInTimeZone(classItem.startsAt, classItem.timeZone);
    await queueEmail({
      idempotencyKey: key,
      to: student.email,
      template,
      vars,
      studentId: student._id.toString(),
      scheduledFor,
      actorId,
      auditAction: kind === 'announcement' ? 'class.scheduled' : 'class_reminder.sent',
    });
    queued += 1;
  }
  return { queued };
}

export async function syncAutomaticReminders(classItem: HydratedDocument<IClassSchedule>, actorId?: string) {
  const current = classItem.startsAt.toISOString();
  const queuedReminders = await EmailJob.find({
    status: 'queued',
    idempotencyKey: { $regex: `^class:${classItem._id.toString()}:reminder` },
  });
  for (const job of queuedReminders) {
    if (!job.idempotencyKey.endsWith(current)) {
      job.status = 'cancelled';
      job.lastError = 'The class time changed before this reminder was sent.';
      await job.save();
    }
  }
  if (classItem.status === 'cancelled') {
    if (!classItem.reminders.cancellationAt) {
      await queueClassMessages(classItem, 'cancellation', actorId);
      classItem.reminders.cancellationAt = new Date();
      await classItem.save();
    }
    return;
  }
  if (classItem.notifyAnnouncement && !classItem.reminders.announcementAt) {
    await queueClassMessages(classItem, 'announcement', actorId);
    classItem.reminders.announcementAt = new Date();
  }
  if (classItem.notify24h) await queueClassMessages(classItem, 'reminder24', actorId);
  if (classItem.notify1h) await queueClassMessages(classItem, 'reminder1', actorId);
  if (classItem.status === 'rescheduled') {
    await queueClassMessages(classItem, 'reschedule', actorId);
    classItem.reminders.rescheduleAt = new Date();
  }
  classItem.markModified('reminders');
  await classItem.save();
}

export async function requireClass(id: string) {
  const classItem = await ClassSchedule.findById(id);
  if (!classItem) throw notFound('Class not found.');
  return classItem;
}

export function assertClassTiming(date: string, startTime: string, endTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Use a class date in YYYY-MM-DD format.');
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) throw badRequest('Use 24-hour times in HH:MM format.');
  if (startTime >= endTime) throw badRequest('The class end time must be after the start time.');
}
