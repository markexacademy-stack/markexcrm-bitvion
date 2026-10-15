import { getConfig, newId } from '../config';
import type { HydratedDocument } from 'mongoose';
import { ApplicationSettings, CommunicationConsent, type IApplicationSettings } from '../models';

export async function getSettings(): Promise<HydratedDocument<IApplicationSettings>> {
  const existing = await ApplicationSettings.findOne({ key: 'default' });
  if (existing) return existing;
  return ApplicationSettings.create({ key: 'default' });
}

export async function nextStudentCode(): Promise<string> {
  const year = String(new Date().getUTCFullYear());
  const settings = await ApplicationSettings.findOneAndUpdate(
    { key: 'default' },
    { $inc: { [`sequences.${year}`]: 1 }, $setOnInsert: { key: 'default' } },
    { upsert: true, new: true },
  );
  const sequence = Number(settings.sequences.get(year) || 1);
  return `MX-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function ensureConsent(input: {
  email: string;
  studentId?: string;
  marketing: boolean;
  source: string;
}) {
  const existing = await CommunicationConsent.findOne({ email: input.email });
  if (existing) {
    if (input.studentId && !existing.studentId) existing.studentId = input.studentId as unknown as typeof existing.studentId;
    if (input.marketing && !existing.unsubscribedAll && !existing.suppressed) existing.marketing = true;
    await existing.save();
    return existing;
  }
  return CommunicationConsent.create({
    email: input.email,
    studentId: input.studentId,
    operational: true,
    marketing: input.marketing,
    unsubscribedAll: false,
    suppressed: false,
    unsubscribeToken: newId(24),
    source: input.source,
  });
}

export function preferencesUrl(token: string): string {
  return `${getConfig().appPublicUrl}/unsubscribe/${token}`;
}
