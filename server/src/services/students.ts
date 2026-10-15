import { isValidEmail, normalizeEmail } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/http';
import { Course, Student, type IRegistrationForm, type IStudent } from '../models';
import { ensureConsent, getSettings, nextStudentCode } from './settings';
import type { DuplicatePolicy } from '../lib/constants';

export async function resolveCourseId(interest: string | undefined, fallback?: IRegistrationForm['associatedCourseId']) {
  const courses = await Course.find({ status: 'active' });
  const matched = interest
    ? courses.find((course) => course.name.trim().toLowerCase() === interest.trim().toLowerCase())
    : undefined;
  const courseId = matched?._id || fallback;
  const mismatch = Boolean(matched && fallback && String(matched._id) !== String(fallback));
  return { courseId, courseName: matched?.name || courses.find((course) => String(course._id) === String(courseId))?.name || '', mismatch };
}

export async function applyRegistration(input: {
  fullName: string;
  email: string;
  phone?: string;
  courseId?: unknown;
  courseInterest?: string;
  source: IStudent['registrationSource'];
  registrationFormId?: string;
  marketingConsent: boolean;
  consentStatus: IStudent['consentStatus'];
  registrationDate: Date;
  policy: DuplicatePolicy;
  mismatch: boolean;
}) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw badRequest('A valid student email address is required.');
  if (!input.fullName.trim()) throw badRequest('A student name is required.');
  const existing = await Student.findOne({ email, archivedAt: null });
  if (!existing) {
    const student = await Student.create({
      studentId: await nextStudentCode(),
      fullName: input.fullName.trim(),
      email,
      phone: input.phone?.trim() || undefined,
      courseId: input.courseId || undefined,
      courseInterest: input.courseInterest || undefined,
      registrationDate: input.registrationDate,
      registrationSource: input.source,
      registrationFormId: input.registrationFormId,
      enrollmentStatus: 'New Registration',
      consentStatus: input.consentStatus,
      marketingConsent: input.marketingConsent,
      reviewFlags: input.mismatch ? ['course_interest_mismatch'] : [],
    });
    await ensureConsent({ email, studentId: student._id.toString(), marketing: input.marketingConsent, source: input.source });
    return { student, created: true, changedFields: [] as string[], flagged: false, skipped: false };
  }

  if (input.policy === 'skip') {
    if (!existing.reviewFlags.includes('duplicate_submission')) existing.reviewFlags.push('duplicate_submission');
    await existing.save();
    return { student: existing, created: false, changedFields: [] as string[], flagged: false, skipped: true };
  }

  if (input.policy === 'flag') {
    if (!existing.reviewFlags.includes('possible_duplicate')) existing.reviewFlags.push('possible_duplicate');
    await existing.save();
    return { student: existing, created: false, changedFields: [] as string[], flagged: true, skipped: false };
  }

  const changed: string[] = [];
  if (!existing.phone && input.phone?.trim()) {
    existing.phone = input.phone.trim();
    changed.push('phone');
  }
  if (!existing.courseId && input.courseId) {
    existing.courseId = input.courseId as IStudent['courseId'];
    changed.push('course');
  }
  if (!existing.courseInterest && input.courseInterest) {
    existing.courseInterest = input.courseInterest;
    changed.push('courseInterest');
  }
  if (!existing.fullName.trim() && input.fullName.trim()) {
    existing.fullName = input.fullName.trim();
    changed.push('fullName');
  }
  if (input.mismatch && !existing.reviewFlags.includes('course_interest_mismatch')) existing.reviewFlags.push('course_interest_mismatch');
  await existing.save();
  return { student: existing, created: false, changedFields: changed, flagged: false, skipped: false };
}

export async function assertBatchCapacity(batchId: string, adding: number) {
  const { Batch, BatchEnrollment } = await import('../models');
  const batch = await Batch.findById(batchId);
  if (!batch) throw notFound('Batch not found.');
  if (batch.status === 'Cancelled' || batch.status === 'Completed') {
    throw conflict('Students cannot be assigned to a cancelled or completed batch.');
  }
  const count = await BatchEnrollment.countDocuments({ batchId, status: 'assigned' });
  if (count + adding > batch.capacity) {
    throw conflict(`This batch has room for ${Math.max(batch.capacity - count, 0)} more student${batch.capacity - count === 1 ? '' : 's'}.`);
  }
  return batch;
}

export async function currentDuplicatePolicy(override?: DuplicatePolicy | null): Promise<DuplicatePolicy> {
  if (override) return override;
  const settings = await getSettings();
  return settings.duplicatePolicy;
}
