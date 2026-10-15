import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { Alert, Card, PageHeader, Spinner, useTitle } from '@/components/ui';
import { dayLabel, inr } from '@/lib/money';

interface Overview {
  students: number;
  totalRevenue: number;
  totalPending: number;
  totalSpending: number;
  totalAssets: number;
  assetsAfterSpending: number;
  emailsQueued: number;
  emailsSent: number;
  emailProviderConfigured: boolean;
  recentStudents: { _id: string; fullName: string; place: string; amountCollected: number; pendingAmount: number; collectedDate?: string }[];
  recentExpenses: { _id: string; purpose: string; amount: number; spentOn: string }[];
}

export function DashboardPage() {
  useTitle('Dashboard');
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/finance/overview') });
  const [assets, setAssets] = useState('');
  const [error, setError] = useState('');
  const saveAssets = useMutation({
    mutationFn: (totalAssets: number) => api('/api/finance', { method: 'PATCH', body: JSON.stringify({ totalAssets }) }),
    onSuccess: async () => {
      setError('');
      setAssets('');
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The asset figure could not be saved.'),
  });

  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <Alert>The dashboard could not be loaded from the database.</Alert>;
  const data = overview.data;

  function onAssets(event: FormEvent) {
    event.preventDefault();
    const amount = Number(assets);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter the company asset amount as a number.');
      return;
    }
    saveAssets.mutate(amount);
  }

  const cards = [
    ['Students', String(data.students)],
    ['Total revenue', inr(data.totalRevenue)],
    ['Pending amount', inr(data.totalPending)],
    ['Total spending', inr(data.totalSpending)],
    ['Total assets', inr(data.totalAssets)],
    ['Assets after spending', inr(data.assetsAfterSpending)],
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Revenue is the amount collected from students. Assets after spending is the company asset figure minus recorded spending." />
      {!data.emailProviderConfigured ? <div className="mb-4"><Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Email is not connected yet. Receipts are saved as queued and are not marked sent.</Card></div> : null}
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
            <p className="mt-2 break-words text-xl font-semibold text-stone-950 sm:text-2xl">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-4">
        <h2 className="font-medium">Company assets</h2>
        <p className="mt-1 text-sm text-stone-600">Current figure: {inr(data.totalAssets)}. After spending: {inr(data.assetsAfterSpending)}.</p>
        <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onAssets}>
          <label className="block w-full sm:w-auto"><span className="label">Set total assets (₹)</span><input className="field sm:w-52" inputMode="decimal" value={assets} onChange={(event) => setAssets(event.target.value)} placeholder="0" required /></label>
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={saveAssets.isPending}>{saveAssets.isPending ? 'Saving…' : 'Save assets'}</button>
        </form>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Recent students</h2>
          {data.recentStudents.length === 0 ? <p className="text-sm text-stone-500">No students yet.</p> : (
            <ul className="space-y-2 text-sm">
              {data.recentStudents.map((student) => (
                <li key={student._id} className="flex justify-between gap-3 border-b border-stone-100 pb-2">
                  <span>{student.fullName}<span className="block text-xs text-stone-500">{student.place || 'Place not set'}</span></span>
                  <span className="text-right">{inr(student.amountCollected)}<span className="block text-xs text-stone-500">Pending {inr(student.pendingAmount)} · {dayLabel(student.collectedDate)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Recent spending</h2>
          {data.recentExpenses.length === 0 ? <p className="text-sm text-stone-500">No spending recorded.</p> : (
            <ul className="space-y-2 text-sm">
              {data.recentExpenses.map((item) => (
                <li key={item._id} className="flex justify-between gap-3 border-b border-stone-100 pb-2">
                  <span>{item.purpose}<span className="block text-xs text-stone-500">{dayLabel(item.spentOn)}</span></span>
                  <span>{inr(item.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-500">Queued emails: {data.emailsQueued}. Sent emails: {data.emailsSent}.</p>
        </Card>
      </div>
    </div>
  );
}
