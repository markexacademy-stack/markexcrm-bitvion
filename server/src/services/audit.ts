import type { Request } from 'express';
import { sanitizeMetadata } from '../lib/crypto';
import { AuditLog } from '../models';

export async function recordAudit(entry: {
  req?: Request;
  actorId?: string | null;
  action: string;
  category: 'communication' | 'admin' | 'security';
  entityType: string;
  entityId?: string;
  studentId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    actorId: entry.actorId || entry.req?.user?._id,
    action: entry.action,
    category: entry.category,
    entityType: entry.entityType,
    entityId: entry.entityId,
    studentId: entry.studentId || undefined,
    metadata: sanitizeMetadata(entry.metadata),
    ip: entry.req?.ip,
  });
}
