import { emailProviderConfigured } from '../config';
import { REVIEW_STATUSES } from '../lib/constants';
import { addDays, startOfZonedDay, startOfZonedMonth } from '../lib/time';
import { AuditLog, Batch, ClassSchedule, EmailEvent, EmailJob, GoogleSubmissionEvent, Student } from '../models';
import { getSettings } from './settings';

const SHARE_ACTIONS = ['form_link.copied', 'form_link.opened', 'form_link.whatsapp', 'form_link.qr', 'form_invitation.queued'];

export async function dashboardSummary() {
  const settings = await getSettings();
  const timeZone = settings.timeZone || 'UTC';
  const now = new Date();
  const today = startOfZonedDay(now, timeZone);
  const month = startOfZonedMonth(now, timeZone);
  const active = { archivedAt: null };
  const [
    students,
    registrationsToday,
    registrationsThisMonth,
    awaitingReview,
    withoutBatch,
    activeBatches,
    upcomingClasses,
    formSubmissions,
    formShares,
    emailsQueued,
    emailsSent,
    emailsDelivered,
    emailsFailed,
    upcomingBatchStarts,
  ] = await Promise.all([
    Student.countDocuments(active),
    Student.countDocuments({ ...active, registrationDate: { $gte: today } }),
    Student.countDocuments({ ...active, registrationDate: { $gte: month } }),
    Student.countDocuments({ ...active, enrollmentStatus: { $in: REVIEW_STATUSES } }),
    Student.countDocuments({ ...active, $or: [{ batchId: { $exists: false } }, { batchId: null }], enrollmentStatus: { $nin: ['Cancelled', 'Completed'] } }),
    Batch.countDocuments({ status: 'Active' }),
    ClassSchedule.countDocuments({ status: { $in: ['scheduled', 'rescheduled'] }, startsAt: { $gte: now } }),
    GoogleSubmissionEvent.countDocuments({ processingStatus: { $in: ['processed', 'duplicate'] } }),
    AuditLog.countDocuments({ action: { $in: SHARE_ACTIONS } }),
    EmailJob.countDocuments({ status: 'queued' }),
    EmailJob.countDocuments({ status: 'sent' }),
    EmailEvent.countDocuments({ type: 'delivered' }),
    EmailJob.countDocuments({ status: 'failed' }),
    Batch.countDocuments({ status: { $in: ['Upcoming', 'Enrollment Open', 'Starting Soon'] }, startDate: { $gte: today } }),
  ]);

  return {
    timeZone,
    emailProviderConfigured: emailProviderConfigured(),
    totals: {
      students,
      registrationsToday,
      registrationsThisMonth,
      awaitingReview,
      withoutBatch,
      activeBatches,
      upcomingClasses,
      formSubmissions,
      formShares,
      emailsQueued,
      emailsSent,
      emailsDelivered,
      emailsFailed,
      upcomingBatchStarts,
    },
  };
}

export async function registrationTrend() {
  const settings = await getSettings();
  const timeZone = settings.timeZone || 'UTC';
  const start = addDays(startOfZonedDay(new Date(), timeZone), -29);
  const rows = await Student.aggregate<{ _id: string; count: number }>([
    { $match: { archivedAt: null, registrationDate: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registrationDate', timezone: timeZone } }, count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const series: { date: string; count: number }[] = [];
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(start, i);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(day);
    series.push({ date, count: counts.get(date) || 0 });
  }
  return { timeZone, series };
}

export async function enrollmentBreakdown() {
  const [byCourse, byBatch, byStatus] = await Promise.all([
    Student.aggregate([
      { $match: { archivedAt: null, courseId: { $type: 'objectId' } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $project: { _id: 0, courseId: '$_id', name: { $ifNull: [{ $arrayElemAt: ['$course.name', 0] }, 'Course'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: { archivedAt: null, batchId: { $type: 'objectId' } } },
      { $group: { _id: '$batchId', count: { $sum: 1 } } },
      { $lookup: { from: 'batches', localField: '_id', foreignField: '_id', as: 'batch' } },
      { $project: { _id: 0, batchId: '$_id', name: { $ifNull: [{ $arrayElemAt: ['$batch.name', 0] }, 'Batch'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Student.aggregate([
      { $match: { archivedAt: null } },
      { $group: { _id: '$enrollmentStatus', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]),
  ]);
  return { byCourse, byBatch, byStatus };
}

export async function recentActivity() {
  const [registrations, submissions, classes, communications] = await Promise.all([
    Student.find({ archivedAt: null }).sort({ registrationDate: -1 }).limit(8).populate('courseId', 'name').populate('batchId', 'name'),
    GoogleSubmissionEvent.find().sort({ createdAt: -1 }).limit(8).populate('registrationFormId', 'formName'),
    ClassSchedule.find({ status: { $in: ['scheduled', 'rescheduled'] }, startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(8).populate('batchId', 'name').populate('courseId', 'name'),
    AuditLog.find({ category: 'communication' }).sort({ createdAt: -1 }).limit(8),
  ]);
  return { registrations, submissions, classes, communications };
}
