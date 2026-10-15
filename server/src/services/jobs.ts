import { EmailCampaign, EmailJob } from '../models';
import { deliverEmailJob } from './email';

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function processEmailQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const jobs = await EmailJob.find({ status: 'queued', scheduledFor: { $lte: new Date() } }).sort({ scheduledFor: 1 }).limit(20).select('_id');
    for (const job of jobs) {
      await deliverEmailJob(job._id.toString());
    }

    const open = await EmailCampaign.find({ status: { $in: ['scheduled', 'sending'] } });
    for (const campaign of open) {
      const pending = await EmailJob.countDocuments({ campaignId: campaign._id, status: { $in: ['queued', 'sending'] } });
      if (pending === 0 && campaign.recipientCount > 0) {
        campaign.status = 'sent';
        campaign.sentAt = campaign.sentAt || new Date();
        await campaign.save();
      } else if (pending > 0 && campaign.status === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt <= new Date()) {
        campaign.status = 'sending';
        await campaign.save();
      }
    }
  } finally {
    running = false;
  }
}

export function startJobWorker(): void {
  if (process.env.DISABLE_JOB_WORKER === 'true') return;
  if (timer) return;
  timer = setInterval(() => {
    void processEmailQueue().catch((error) => {
      console.error(JSON.stringify({ level: 'error', message: 'Job worker failed', detail: error instanceof Error ? error.message : 'unknown' }));
    });
  }, 10000);
  timer.unref();
  void processEmailQueue().catch(() => undefined);
}

export function stopJobWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
