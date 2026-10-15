import { formatDateInTimeZone } from '../lib/time';
import type { IStudent } from '../models';
import { getTemplateBySlug, queueEmail, templateVars } from './email';
import { getSettings } from './settings';

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
}

export async function queuePaymentReceipt(student: IStudent & { _id: { toString(): string } }, actorId?: string) {
  const settings = await getSettings();
  const collected = student.collectedDate ? formatDateInTimeZone(student.collectedDate, settings.timeZone) : 'Not set';
  const template = await getTemplateBySlug('payment-receipt');
  return queueEmail({
    idempotencyKey: `receipt:${student._id.toString()}:${student.amountCollected}:${student.pendingAmount}:${collected}`,
    to: student.email,
    template,
    vars: await templateVars({
      student_name: student.fullName,
      gender: student.gender || 'Other',
      place: student.place || 'Not set',
      email: student.email,
      phone: student.phone || 'Not set',
      amount_collected: money(student.amountCollected),
      pending_amount: money(student.pendingAmount),
      collected_date: collected,
    }),
    studentId: student._id.toString(),
    actorId,
    auditAction: 'payment_receipt.queued',
  });
}
