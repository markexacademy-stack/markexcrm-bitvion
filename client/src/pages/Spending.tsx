import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { Alert, Button, Card, Empty, Field, PageHeader, Spinner, useTitle } from '@/components/ui';
import { dayLabel, inr } from '@/lib/money';

interface Expense {
  _id: string;
  purpose: string;
  amount: number;
  spentOn: string;
}

export function SpendingPage() {
  useTitle('Spending');
  const queryClient = useQueryClient();
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => api<{ data: Expense[] }>('/api/expenses') });
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const payload = { purpose, amount: Number(amount), spentOn };
      return editing
        ? api(`/api/expenses/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError('');
      setPurpose('');
      setAmount('');
      setSpentOn('');
      setEditing('');
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The spending could not be saved.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const total = (expenses.data?.data || []).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div>
      <PageHeader title="Spending" subtitle={`Record what the company spent and how much. Total spending: ${inr(total)}.`} />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <Card className="mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <Field label="What was it for?"><input className="field" value={purpose} onChange={(event) => setPurpose(event.target.value)} required /></Field>
          <Field label="How much (₹)"><input className="field" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
          <Field label="Date"><input className="field" type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} required /></Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end md:col-span-4">
            <Button type="submit" disabled={save.isPending} className="w-full sm:w-auto">{save.isPending ? 'Saving…' : editing ? 'Update' : 'Add spending'}</Button>
            {editing ? <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => { setEditing(''); setPurpose(''); setAmount(''); setSpentOn(''); }}>Cancel</button> : null}
          </div>
        </form>
      </Card>
      {expenses.isLoading ? <Spinner /> : expenses.data?.data.length ? (
        <>
        <ul className="space-y-3 md:hidden">
          {expenses.data.data.map((item) => (
            <li key={item._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{item.purpose}</p>
                <p className="shrink-0 font-medium">{inr(item.amount)}</p>
              </div>
              <p className="mt-1 text-xs text-stone-500">{dayLabel(item.spentOn)}</p>
              <div className="mt-3 flex gap-4 text-sm">
                <button className="font-medium text-sky-700" type="button" onClick={() => { setEditing(item._id); setPurpose(item.purpose); setAmount(String(item.amount)); setSpentOn(item.spentOn.slice(0, 10)); }}>Edit</button>
                <button className="font-medium text-red-700" type="button" onClick={() => remove.mutate(item._id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-auto rounded-2xl border border-stone-200 bg-white md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-3 font-medium">What</th>
                <th className="px-3 py-3 font-medium">How much</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {expenses.data.data.map((item) => (
                <tr key={item._id} className="border-t border-stone-100">
                  <td className="px-3 py-3">{item.purpose}</td>
                  <td className="px-3 py-3">{inr(item.amount)}</td>
                  <td className="px-3 py-3">{dayLabel(item.spentOn)}</td>
                  <td className="px-3 py-3 text-right">
                    <button className="mr-3 text-sky-700" type="button" onClick={() => { setEditing(item._id); setPurpose(item.purpose); setAmount(String(item.amount)); setSpentOn(item.spentOn.slice(0, 10)); }}>Edit</button>
                    <button className="text-red-700" type="button" onClick={() => remove.mutate(item._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : <Empty title="No spending" body="Add a purpose and an amount when the company spends money." />}
    </div>
  );
}
