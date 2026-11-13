import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { Alert, Button, Card, Empty, Field, PageHeader, Select, Spinner, useTitle } from '@/components/ui';
import { dayLabel, inr } from '@/lib/money';

type Period = 'weekly' | 'monthly' | 'quarterly';

interface Investor {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  capital: number;
  joinedOn: string;
  notes: string;
  active: boolean;
}

interface Profit {
  _id: string;
  period: Period;
  periodDate: string;
  label: string;
  grossProfit: number;
  investorSharePercent: number;
  companySharePercent: number;
  investorPool: number;
  companyProfit: number;
  note: string;
}

interface Payout {
  _id: string;
  investorName: string;
  period: Period;
  periodDate: string;
  capitalAtPayout: number;
  amount: number;
  status: 'recorded' | 'paid';
}

interface Overview {
  settings: {
    weeklyInvestorPercent: number;
    monthlyInvestorPercent: number;
    quarterlyInvestorPercent: number;
  };
  totals: {
    investors: number;
    activeInvestors: number;
    totalCapital: number;
    grossProfit: number;
    companyProfit: number;
    investorPayouts: number;
  };
  investors: Investor[];
  profits: Profit[];
  payouts: Payout[];
}

const emptyInvestor = { fullName: '', phone: '', email: '', capital: '', joinedOn: '', notes: '', active: true };
const emptyProfit = { period: 'weekly' as Period, periodDate: '', label: '', grossProfit: '', note: '' };

function periodLabel(value: Period) {
  if (value === 'weekly') return 'Weekly';
  if (value === 'monthly') return 'Monthly';
  return 'Quarterly';
}

export function TradingPage() {
  useTitle('SN Trading');
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['trading'], queryFn: () => api<Overview>('/api/trading/overview') });
  const [investorForm, setInvestorForm] = useState(emptyInvestor);
  const [editingInvestor, setEditingInvestor] = useState('');
  const [profitForm, setProfitForm] = useState(emptyProfit);
  const [quarterlyPercent, setQuarterlyPercent] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['trading'] });
  };

  const saveInvestor = useMutation({
    mutationFn: () => {
      const payload = {
        fullName: investorForm.fullName,
        phone: investorForm.phone,
        email: investorForm.email,
        capital: Number(investorForm.capital || 0),
        joinedOn: investorForm.joinedOn,
        notes: investorForm.notes,
        active: investorForm.active,
      };
      return editingInvestor
        ? api(`/api/trading/investors/${editingInvestor}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/api/trading/investors', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError('');
      setNotice(editingInvestor ? 'Investor updated.' : 'Investor added.');
      setEditingInvestor('');
      setInvestorForm(emptyInvestor);
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The investor could not be saved.'),
  });

  const removeInvestor = useMutation({
    mutationFn: (id: string) => api(`/api/trading/investors/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setNotice('Investor removed.');
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The investor could not be deleted.'),
  });

  const saveProfit = useMutation({
    mutationFn: () => api('/api/trading/profits', {
      method: 'POST',
      body: JSON.stringify({
        period: profitForm.period,
        periodDate: profitForm.periodDate,
        label: profitForm.label || undefined,
        grossProfit: Number(profitForm.grossProfit || 0),
        note: profitForm.note,
      }),
    }),
    onSuccess: async () => {
      setError('');
      setNotice('Profit recorded. Investor and company shares were calculated.');
      setProfitForm(emptyProfit);
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The profit could not be saved.'),
  });

  const removeProfit = useMutation({
    mutationFn: (id: string) => api(`/api/trading/profits/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setNotice('Profit and related payouts removed.');
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The profit could not be deleted.'),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api(`/api/trading/payouts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
    onSuccess: async () => {
      setNotice('Payout marked as paid.');
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The payout could not be updated.'),
  });

  const saveSettings = useMutation({
    mutationFn: (quarterlyInvestorPercent: number) => api('/api/trading/settings', {
      method: 'PATCH',
      body: JSON.stringify({ quarterlyInvestorPercent }),
    }),
    onSuccess: async () => {
      setError('');
      setNotice('Quarterly investor share saved.');
      setQuarterlyPercent('');
      await refresh();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The trading settings could not be saved.'),
  });

  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <Alert>SN Trading could not be loaded.</Alert>;
  const data = overview.data;
  const settings = data.settings;

  function editInvestor(item: Investor) {
    setEditingInvestor(item._id);
    setInvestorForm({
      fullName: item.fullName,
      phone: item.phone || '',
      email: item.email || '',
      capital: String(item.capital || 0),
      joinedOn: item.joinedOn ? item.joinedOn.slice(0, 10) : '',
      notes: item.notes || '',
      active: item.active,
    });
  }

  function onInvestor(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    saveInvestor.mutate();
  }

  function onProfit(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    saveProfit.mutate();
  }

  function onSettings(event: FormEvent) {
    event.preventDefault();
    const value = Number(quarterlyPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('Enter a quarterly investor share between 0 and 100.');
      return;
    }
    setNotice('');
    saveSettings.mutate(value);
  }

  const cards = [
    ['Active investors', String(data.totals.activeInvestors)],
    ['Investor capital', inr(data.totals.totalCapital)],
    ['Gross trading profit', inr(data.totals.grossProfit)],
    ['Company profit', inr(data.totals.companyProfit)],
    ['Investor payouts', inr(data.totals.investorPayouts)],
    ['Quarterly investor share', `${settings.quarterlyInvestorPercent}%`],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="SN Trading"
        subtitle={`Investors and company share trading profits. Weekly and monthly use a ${settings.weeklyInvestorPercent}/${100 - settings.weeklyInvestorPercent} split. Quarterly investor share is ${settings.quarterlyInvestorPercent}%.`}
      />
      {notice ? <Alert tone="emerald">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
            <p className="mt-2 break-words text-lg font-semibold text-stone-950 sm:text-xl">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="font-medium">Quarterly investor share</h2>
        <p className="mt-1 text-sm text-stone-600">Current quarterly investor share: {settings.quarterlyInvestorPercent}%. Company keeps the rest.</p>
        <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSettings}>
          <Field label="Quarterly investor %">
            <input className="field sm:w-40" inputMode="decimal" value={quarterlyPercent} onChange={(event) => setQuarterlyPercent(event.target.value)} placeholder={String(settings.quarterlyInvestorPercent)} required />
          </Field>
          <Button type="submit" disabled={saveSettings.isPending}>{saveSettings.isPending ? 'Saving…' : 'Save quarterly %'}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-medium">{editingInvestor ? 'Update investor' : 'Add investor'}</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onInvestor}>
          <Field label="Name"><input className="field" value={investorForm.fullName} onChange={(event) => setInvestorForm({ ...investorForm, fullName: event.target.value })} required /></Field>
          <Field label="Phone"><input className="field" value={investorForm.phone} onChange={(event) => setInvestorForm({ ...investorForm, phone: event.target.value })} /></Field>
          <Field label="Email"><input className="field" type="email" value={investorForm.email} onChange={(event) => setInvestorForm({ ...investorForm, email: event.target.value })} /></Field>
          <Field label="Capital invested (₹)"><input className="field" inputMode="decimal" value={investorForm.capital} onChange={(event) => setInvestorForm({ ...investorForm, capital: event.target.value })} required /></Field>
          <Field label="Joined on"><input className="field" type="date" value={investorForm.joinedOn} onChange={(event) => setInvestorForm({ ...investorForm, joinedOn: event.target.value })} required /></Field>
          <Field label="Notes"><input className="field" value={investorForm.notes} onChange={(event) => setInvestorForm({ ...investorForm, notes: event.target.value })} /></Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={investorForm.active} onChange={(event) => setInvestorForm({ ...investorForm, active: event.target.checked })} />
              Active investor
            </label>
            <Button type="submit" disabled={saveInvestor.isPending} className="w-full sm:w-auto">{saveInvestor.isPending ? 'Saving…' : editingInvestor ? 'Update investor' : 'Add investor'}</Button>
            {editingInvestor ? <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => { setEditingInvestor(''); setInvestorForm(emptyInvestor); }}>Cancel</button> : null}
          </div>
        </form>
      </Card>

      {data.investors.length ? (
        <>
          <ul className="space-y-3 md:hidden">
            {data.investors.map((item) => (
              <li key={item._id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.fullName}</p>
                    <p className="text-xs text-stone-500">{item.active ? 'Active' : 'Inactive'} · Joined {dayLabel(item.joinedOn)}</p>
                  </div>
                  <p className="font-medium">{inr(item.capital)}</p>
                </div>
                <p className="mt-2 break-all text-sm text-stone-600">{item.phone || '—'} · {item.email || 'No email'}</p>
                <div className="mt-3 flex gap-4 text-sm">
                  <button className="font-medium text-sky-700" type="button" onClick={() => editInvestor(item)}>Edit</button>
                  <button className="font-medium text-red-700" type="button" onClick={() => {
                    if (window.confirm(`Delete ${item.fullName}?`)) removeInvestor.mutate(item._id);
                  }}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-auto rounded-2xl border border-stone-200 bg-white md:block">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  {['Name', 'Phone', 'Email', 'Capital', 'Joined', 'Status', ''].map((heading) => <th key={heading || 'actions'} className="px-3 py-3 font-medium">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.investors.map((item) => (
                  <tr key={item._id} className="border-t border-stone-100">
                    <td className="px-3 py-3">{item.fullName}</td>
                    <td className="px-3 py-3">{item.phone || '—'}</td>
                    <td className="px-3 py-3">{item.email || '—'}</td>
                    <td className="px-3 py-3">{inr(item.capital)}</td>
                    <td className="px-3 py-3">{dayLabel(item.joinedOn)}</td>
                    <td className="px-3 py-3">{item.active ? 'Active' : 'Inactive'}</td>
                    <td className="px-3 py-3 text-right">
                      <button className="mr-3 text-sky-700" type="button" onClick={() => editInvestor(item)}>Edit</button>
                      <button className="text-red-700" type="button" onClick={() => {
                        if (window.confirm(`Delete ${item.fullName}?`)) removeInvestor.mutate(item._id);
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <Empty title="No investors yet" body="Add investors and their capital to start SN Trading payouts." />}

      <Card className="p-4">
        <h2 className="mb-3 font-medium">Record trading profit</h2>
        <p className="mb-3 text-sm text-stone-600">Weekly and monthly profits split {settings.weeklyInvestorPercent}% to investors and {100 - settings.weeklyInvestorPercent}% to the company. Quarterly uses {settings.quarterlyInvestorPercent}% for investors. Investor payouts are shared by capital.</p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onProfit}>
          <Field label="Period">
            <Select value={profitForm.period} onChange={(event) => setProfitForm({ ...profitForm, period: event.target.value as Period })}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </Select>
          </Field>
          <Field label="Period date"><input className="field" type="date" value={profitForm.periodDate} onChange={(event) => setProfitForm({ ...profitForm, periodDate: event.target.value })} required /></Field>
          <Field label="Label"><input className="field" value={profitForm.label} onChange={(event) => setProfitForm({ ...profitForm, label: event.target.value })} placeholder="Week 12 profit" /></Field>
          <Field label="Gross profit (₹)"><input className="field" inputMode="decimal" value={profitForm.grossProfit} onChange={(event) => setProfitForm({ ...profitForm, grossProfit: event.target.value })} required /></Field>
          <Field label="Note"><input className="field" value={profitForm.note} onChange={(event) => setProfitForm({ ...profitForm, note: event.target.value })} /></Field>
          <div className="flex items-end">
            <Button type="submit" disabled={saveProfit.isPending} className="w-full sm:w-auto">{saveProfit.isPending ? 'Saving…' : 'Record profit'}</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Profit history</h2>
          {!data.profits.length ? <p className="text-sm text-stone-500">No profits recorded yet.</p> : (
            <ul className="space-y-3 text-sm">
              {data.profits.map((item) => (
                <li key={item._id} className="border-b border-stone-100 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-stone-500">{periodLabel(item.period)} · {dayLabel(item.periodDate)}</p>
                    </div>
                    <button className="text-red-700" type="button" onClick={() => {
                      if (window.confirm('Delete this profit and its investor payouts?')) removeProfit.mutate(item._id);
                    }}>Delete</button>
                  </div>
                  <p className="mt-2">Gross {inr(item.grossProfit)}</p>
                  <p className="text-stone-600">Investors {item.investorSharePercent}% · {inr(item.investorPool)}</p>
                  <p className="text-stone-600">Company {item.companySharePercent}% · {inr(item.companyProfit)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Investor payouts</h2>
          {!data.payouts.length ? <p className="text-sm text-stone-500">Payouts appear after a profit is recorded.</p> : (
            <ul className="space-y-3 text-sm">
              {data.payouts.map((item) => (
                <li key={item._id} className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                  <div>
                    <p className="font-medium">{item.investorName}</p>
                    <p className="text-xs text-stone-500">{periodLabel(item.period)} · {dayLabel(item.periodDate)} · Capital {inr(item.capitalAtPayout)}</p>
                    <p className="mt-1">{inr(item.amount)} · {item.status === 'paid' ? 'Paid' : 'Recorded'}</p>
                  </div>
                  {item.status !== 'paid' ? (
                    <button className="shrink-0 text-sky-700" type="button" onClick={() => markPaid.mutate(item._id)}>Mark paid</button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
