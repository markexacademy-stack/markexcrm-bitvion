import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { badRequest, notFound } from '../lib/http';
import { isWhatsAppInviteUrl } from '../lib/whatsapp';
import { envelope, objectId } from '../lib/schema';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Batch, Student, WhatsAppCommunity } from '../models';
import { recordAudit } from '../services/audit';
import { getTemplateBySlug } from '../services/email';
import { createQueuedCampaign } from '../services/sharing';
import { templateVars } from '../services/email';

const router = Router();
const bodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  courseId: objectId.optional(),
  batchId: objectId.optional(),
  invitationUrl: z.string().trim().max(500),
  status: z.enum(['active', 'revoked', 'expired']).optional(),
  expiresAt: z.string().datetime().optional(),
  instructions: z.string().trim().max(2000).optional(),
});

router.get('/', requirePermission('batches.view'), asyncHandler(async (_req, res) => {
  const data = await WhatsAppCommunity.find().sort({ createdAt: -1 }).populate('courseId', 'name').populate('batchId', 'name');
  res.json({ data });
}));

router.post('/', requirePermission('batches.manage'), validate(envelope({ body: bodySchema })), asyncHandler(async (req, res) => {
  if (!isWhatsAppInviteUrl(req.body.invitationUrl)) throw badRequest('Paste an https://chat.whatsapp.com invitation or a WhatsApp channel URL. Other links are not stored.');
  const community = await WhatsAppCommunity.create({
    ...req.body,
    status: req.body.status || 'active',
    instructions: req.body.instructions || '',
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
  });
  if (req.body.batchId) await Batch.updateOne({ _id: req.body.batchId }, { whatsappCommunityId: community._id });
  await recordAudit({ req, action: 'whatsapp_invitation.shared', category: 'admin', entityType: 'WhatsAppCommunity', entityId: community._id.toString(), metadata: { action: 'created' } });
  res.status(201).json(community);
}));

router.patch('/:id', requirePermission('batches.manage'), validate(envelope({
  params: z.object({ id: objectId }),
  body: bodySchema.partial(),
})), asyncHandler(async (req, res) => {
  const community = await WhatsAppCommunity.findById(req.params.id);
  if (!community) throw notFound('WhatsApp community not found.');
  if (req.body.invitationUrl && !isWhatsAppInviteUrl(req.body.invitationUrl)) throw badRequest('Paste an actual WhatsApp invitation URL.');
  if (req.body.invitationUrl && req.body.invitationUrl !== community.invitationUrl) community.status = req.body.status || 'active';
  Object.assign(community, { ...req.body, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : community.expiresAt });
  if (req.body.expiresAt === undefined && req.body.invitationUrl) {
    /* keep existing expiry */
  }
  await community.save();
  if (community.batchId) await Batch.updateOne({ _id: community.batchId }, { whatsappCommunityId: community._id });
  await recordAudit({ req, action: 'whatsapp.updated', category: 'admin', entityType: 'WhatsAppCommunity', entityId: community._id.toString() });
  res.json(community);
}));

router.post('/:id/send', requirePermission('communications.send'), validate(envelope({
  params: z.object({ id: objectId }),
  body: z.object({ confirm: z.literal(true) }),
})), asyncHandler(async (req, res) => {
  const community = await WhatsAppCommunity.findById(req.params.id);
  if (!community) throw notFound('WhatsApp community not found.');
  if (community.status !== 'active' || !isWhatsAppInviteUrl(community.invitationUrl)) throw badRequest('Replace the invitation with an active WhatsApp URL before sending.');
  if (community.expiresAt && community.expiresAt <= new Date()) throw badRequest('This invitation has expired. Add a new link before sending.');
  if (!community.batchId) throw badRequest('Associate the invitation with a batch before emailing students.');
  const students = await Student.find({ batchId: community.batchId, archivedAt: null });
  const template = await getTemplateBySlug('whatsapp-invitation');
  const campaign = await createQueuedCampaign({
    name: `WhatsApp invitation — ${community.name}`,
    template,
    createdBy: req.user!._id.toString(),
    confirmPermittedImports: false,
    recipients: students.map((student) => ({ email: student.email, studentId: student._id.toString(), name: student.fullName, include: true })),
    excludedCount: 0,
    filters: { batchId: String(community.batchId) },
    auditAction: 'whatsapp_invitation.shared',
    varsFor: async (recipient) => templateVars({
      student_name: recipient.name,
      whatsapp_community_section: community.invitationUrl,
      instructions: community.instructions,
    }),
  });
  res.status(202).json({ campaignId: campaign._id, recipientCount: campaign.recipientCount });
}));

export default router;
