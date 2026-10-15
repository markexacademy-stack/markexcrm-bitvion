import { formatDateInTimeZone } from '../lib/time';
import { formatInr, paymentReceiptKey } from '../lib/mailPolicy';
import { EmailJob, type IStudent } from '../models';
import { deliverEmailJob, getTemplateBySlug, queueEmail, templateVars } from './email';
import { getSettings } from './settings';

export async function queuePaymentReceipt(student: IStudent & { _id: { toString(): string } }, actorId?: string) {
  const settings = await getSettings();
  const collected = student.collectedDate ? formatDateInTimeZone(student.collectedDate, settings.timeZone) : 'Not set';
  const template = await getTemplateBySlug('payment-receipt');
  const job = await queueEmail({
    idempotencyKey: paymentReceiptKey(student._id.toString(), student.amountCollected, student.pendingAmount, collected),
    to: student.email,
    template,
    vars: await templateVars({
      student_name: student.fullName,
      gender: student.gender || 'Other',
      place: student.place || 'Not set',
      email: student.email,
      phone: student.phone || 'Not set',
      amount_collected: formatInr(student.amountCollected),
      pending_amount: formatInr(student.pendingAmount),
      collected_date: collected,
      website: 'https://markex-academy.com/',
    }),
    studentId: student._id.toString(),
    actorId,
    auditAction: 'payment_receipt.queued',
  });
  const delivery = await deliverEmailJob(job._id.toString());
  if (delivery === 'sent') return { sent: true as const };
  const saved = await EmailJob.findById(job._id).select('lastError');
  return { sent: false as const, error: saved?.lastError || 'The receipt could not be sent.' };
}
