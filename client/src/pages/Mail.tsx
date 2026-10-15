import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Badge, Card, Empty, PageHeader, Spinner, formatWhen, useTitle } from '@/components/ui';

interface Job {
  _id: string;
  to: string;
  subject: string;
  status: string;
  lastError?: string;
  createdAt: string;
}

export function MailPage() {
  useTitle('Mail');
  const jobs = useQuery({ queryKey: ['mail'], queryFn: () => api<{ data: Job[] }>('/api/email-jobs?pageSize=50') });
  if (jobs.isLoading) return <Spinner />;
  const rows = jobs.data?.data || [];

  return (
    <div>
      <PageHeader title="Mail" subtitle="A receipt is queued when a student is added or updated. Sent means the email provider accepted it." />
      {!rows.length ? <Empty title="No emails yet" body="Add a student and the receipt will appear here." /> : (
        <>
        <ul className="space-y-3 md:hidden">
          {rows.map((job) => (
            <li key={job._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-all text-sm font-medium">{job.to}</p>
                <Badge tone={job.status === 'sent' ? 'emerald' : job.status === 'failed' ? 'red' : 'amber'}>{job.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-stone-700">{job.subject}</p>
              {job.lastError ? <p className="mt-1 text-xs text-amber-800">{job.lastError}</p> : null}
              <p className="mt-2 text-xs text-stone-500">{formatWhen(job.createdAt)}</p>
            </li>
          ))}
        </ul>
        <Card className="hidden overflow-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-3 font-medium">To</th>
                <th className="px-3 py-3 font-medium">Subject</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job._id} className="border-t border-stone-100">
                  <td className="px-3 py-3">{job.to}</td>
                  <td className="px-3 py-3">{job.subject}{job.lastError ? <span className="block text-xs text-amber-800">{job.lastError}</span> : null}</td>
                  <td className="px-3 py-3"><Badge tone={job.status === 'sent' ? 'emerald' : job.status === 'failed' ? 'red' : 'amber'}>{job.status}</Badge></td>
                  <td className="px-3 py-3">{formatWhen(job.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </div>
  );
}
