import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { Alert, Button, Card, Field, PageHeader, Spinner, useTitle } from '@/components/ui';
import { inr, inrCompact } from '@/lib/money';

interface Desk {
  _id: string;
  deskName: string;
  aum: number;
  netProfit: number;
  ytdReturnPercent: number;
  accuracyPercent: number;
  winRatePercent: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  activeStrategies: number;
  tradesThisMonth: number;
  bestMonthPercent: number;
  riskProfile: string;
  mandate: string;
}

interface Sleeve {
  _id: string;
  name: string;
  style: string;
  allocationPercent: number;
  capital: number;
  returnPercent: number;
  accuracyPercent: number;
  status: 'active' | 'paused';
  note: string;
}

interface MonthPoint {
  _id: string;
  label: string;
  aum: number;
  returnPercent: number;
  profit: number;
  accuracyPercent: number;
}

interface Overview {
  desk: Desk;
  totals: {
    allocated: number;
    cashReserve: number;
    sleeveCount: number;
    weightedAccuracy: number;
    peakAum: number;
  };
  sleeves: Sleeve[];
  months: MonthPoint[];
}

function Stat({ label, value, hint, tone = 'stone' }: { label: string; value: string; hint?: string; tone?: 'stone' | 'emerald' | 'sky' }) {
  const valueTone = tone === 'emerald' ? 'text-emerald-700' : tone === 'sky' ? 'text-sky-700' : 'text-stone-950';
  return (
    <Card className="px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-2 break-words text-xl font-semibold sm:text-2xl ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </Card>
  );
}

function EquityCurve({ months }: { months: MonthPoint[] }) {
  const points = useMemo(() => {
    if (!months.length) return '';
    const values = months.map((item) => item.aum);
    const min = Math.min(...values) * 0.98;
    const max = Math.max(...values) * 1.02;
    const span = Math.max(1, max - min);
    return months.map((item, index) => {
      const x = months.length === 1 ? 0 : (index / (months.length - 1)) * 100;
      const y = 100 - ((item.aum - min) / span) * 100;
      return `${x},${y}`;
    }).join(' ');
  }, [months]);

  if (!months.length) {
    return <p className="text-sm text-stone-500">Monthly equity history will appear here.</p>;
  }

  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Portfolio equity curve">
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline fill="url(#equityFill)" stroke="none" points={`0,100 ${points} 100,100`} />
        <polyline fill="none" stroke="#0284c7" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-stone-500">
        {months.map((item) => <span key={item._id}>{item.label.replace(' 2026', '')}</span>)}
      </div>
    </div>
  );
}

export function PortfolioPage() {
  useTitle('Portfolio');
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['portfolio'], queryFn: () => api<Overview>('/api/portfolio/overview') });
  const [form, setForm] = useState({
    deskName: '',
    aum: '',
    netProfit: '',
    ytdReturnPercent: '',
    accuracyPercent: '',
    winRatePercent: '',
    profitFactor: '',
    sharpeRatio: '',
    maxDrawdownPercent: '',
    activeStrategies: '',
    tradesThisMonth: '',
    bestMonthPercent: '',
    riskProfile: '',
    mandate: '',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const desk = overview.data?.desk;
    if (!desk) return;
    setForm({
      deskName: desk.deskName,
      aum: String(desk.aum),
      netProfit: String(desk.netProfit),
      ytdReturnPercent: String(desk.ytdReturnPercent),
      accuracyPercent: String(desk.accuracyPercent),
      winRatePercent: String(desk.winRatePercent),
      profitFactor: String(desk.profitFactor),
      sharpeRatio: String(desk.sharpeRatio),
      maxDrawdownPercent: String(desk.maxDrawdownPercent),
      activeStrategies: String(desk.activeStrategies),
      tradesThisMonth: String(desk.tradesThisMonth),
      bestMonthPercent: String(desk.bestMonthPercent),
      riskProfile: desk.riskProfile,
      mandate: desk.mandate,
    });
  }, [overview.data?.desk]);

  const save = useMutation({
    mutationFn: () => api('/api/portfolio/desk', {
      method: 'PATCH',
      body: JSON.stringify({
        deskName: form.deskName,
        aum: Number(form.aum || 0),
        netProfit: Number(form.netProfit || 0),
        ytdReturnPercent: Number(form.ytdReturnPercent || 0),
        accuracyPercent: Number(form.accuracyPercent || 0),
        winRatePercent: Number(form.winRatePercent || 0),
        profitFactor: Number(form.profitFactor || 0),
        sharpeRatio: Number(form.sharpeRatio || 0),
        maxDrawdownPercent: Number(form.maxDrawdownPercent || 0),
        activeStrategies: Number(form.activeStrategies || 0),
        tradesThisMonth: Number(form.tradesThisMonth || 0),
        bestMonthPercent: Number(form.bestMonthPercent || 0),
        riskProfile: form.riskProfile,
        mandate: form.mandate,
      }),
    }),
    onSuccess: async () => {
      setError('');
      setNotice('Portfolio desk figures saved.');
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
    onError: (reason) => {
      setNotice('');
      setError(reason instanceof ApiError ? reason.message : 'The portfolio could not be saved.');
    },
  });

  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <Alert>The managed portfolio could not be loaded.</Alert>;

  const { desk, totals, sleeves, months } = overview.data;
  const maxAllocation = Math.max(...sleeves.map((item) => item.allocationPercent), 1);

  function onSave(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={desk.deskName}
        subtitle={`${desk.mandate} Current book size ${inrCompact(desk.aum)}.`}
      />
      {notice ? <Alert tone="emerald">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Assets under management" value={inrCompact(desk.aum)} hint={inr(desk.aum)} tone="sky" />
        <Stat label="Net trading profit" value={inrCompact(desk.netProfit)} hint={`YTD return ${desk.ytdReturnPercent}%`} tone="emerald" />
        <Stat label="Trade accuracy" value={`${desk.accuracyPercent}%`} hint={`Win rate ${desk.winRatePercent}%`} tone="emerald" />
        <Stat label="Risk control" value={`${desk.maxDrawdownPercent}% DD`} hint={`Sharpe ${desk.sharpeRatio} · PF ${desk.profitFactor}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-medium">Equity curve</h2>
              <p className="mt-1 text-sm text-stone-600">Six-month managed book growth toward the ₹20 Cr desk.</p>
            </div>
            <p className="text-sm font-medium text-emerald-700">Peak {inrCompact(totals.peakAum)}</p>
          </div>
          <EquityCurve months={months} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {months.slice(-4).map((item) => (
              <div key={item._id} className="rounded-xl bg-stone-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-stone-500">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">+{item.returnPercent}%</p>
                <p className="text-xs text-stone-500">{item.accuracyPercent}% accuracy</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Accuracy & execution</h2>
          <p className="mt-1 text-sm text-stone-600">Professional desks track hit rate beside capital, not instead of it.</p>
          <div className="mt-4 space-y-4">
            {[
              ['Trade accuracy', desk.accuracyPercent, 'emerald'],
              ['Win rate', desk.winRatePercent, 'sky'],
              ['Sleeve-weighted accuracy', totals.weightedAccuracy, 'emerald'],
            ].map(([label, value, tone]) => (
              <div key={String(label)}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-stone-600">{label}</span>
                  <span className="font-medium text-stone-950">{value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full ${tone === 'sky' ? 'bg-sky-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, Number(value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-stone-200 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Active strategies</p>
              <p className="mt-1 text-lg font-semibold">{desk.activeStrategies}</p>
            </div>
            <div className="rounded-xl border border-stone-200 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Trades this month</p>
              <p className="mt-1 text-lg font-semibold">{desk.tradesThisMonth}</p>
            </div>
            <div className="rounded-xl border border-stone-200 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Best month</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">+{desk.bestMonthPercent}%</p>
            </div>
            <div className="rounded-xl border border-stone-200 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-stone-500">Risk profile</p>
              <p className="mt-1 text-sm font-semibold">{desk.riskProfile}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-medium">Strategy sleeves</h2>
            <p className="mt-1 text-sm text-stone-600">Capital is split across complementary books so no single style carries the whole ₹20 Cr mandate.</p>
          </div>
          <p className="text-sm text-stone-600">Allocated {inrCompact(totals.allocated)} · Reserve {inrCompact(totals.cashReserve)}</p>
        </div>
        <div className="mb-4 space-y-3">
          {sleeves.map((item) => (
            <div key={item._id}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-stone-900">{item.name}<span className="ml-2 font-normal text-stone-500">{item.style}</span></span>
                <span className="text-stone-600">{item.allocationPercent}% · {inrCompact(item.capital)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${(item.allocationPercent / maxAllocation) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <ul className="space-y-3 md:hidden">
          {sleeves.map((item) => (
            <li key={item._id} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-stone-500">{item.style} · {item.status === 'active' ? 'Active' : 'Paused'}</p>
                </div>
                <p className="text-right text-sm font-medium">{inrCompact(item.capital)}<span className="block text-xs font-normal text-emerald-700">+{item.returnPercent}%</span></p>
              </div>
              <p className="mt-2 text-sm text-stone-600">Accuracy {item.accuracyPercent}% · {item.note}</p>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-auto rounded-2xl border border-stone-200 md:block">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                {['Sleeve', 'Style', 'Allocation', 'Capital', 'Return', 'Accuracy', 'Status', 'Note'].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sleeves.map((item) => (
                <tr key={item._id} className="border-t border-stone-100">
                  <td className="px-3 py-3 font-medium">{item.name}</td>
                  <td className="px-3 py-3">{item.style}</td>
                  <td className="px-3 py-3">{item.allocationPercent}%</td>
                  <td className="px-3 py-3">{inrCompact(item.capital)}</td>
                  <td className="px-3 py-3 text-emerald-700">+{item.returnPercent}%</td>
                  <td className="px-3 py-3">{item.accuracyPercent}%</td>
                  <td className="px-3 py-3">{item.status === 'active' ? 'Active' : 'Paused'}</td>
                  <td className="px-3 py-3 text-stone-600">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="font-medium">Update desk figures</h2>
          <p className="mt-1 text-sm text-stone-600">Keep AUM, profit, and accuracy current so the portfolio page always matches the live desk.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
            <Field label="Desk name"><input className="field" value={form.deskName} onChange={(event) => setForm({ ...form, deskName: event.target.value })} required /></Field>
            <Field label="Risk profile"><input className="field" value={form.riskProfile} onChange={(event) => setForm({ ...form, riskProfile: event.target.value })} required /></Field>
            <Field label="AUM (₹)"><input className="field" inputMode="decimal" value={form.aum} onChange={(event) => setForm({ ...form, aum: event.target.value })} required /></Field>
            <Field label="Net profit (₹)"><input className="field" inputMode="decimal" value={form.netProfit} onChange={(event) => setForm({ ...form, netProfit: event.target.value })} required /></Field>
            <Field label="YTD return %"><input className="field" inputMode="decimal" value={form.ytdReturnPercent} onChange={(event) => setForm({ ...form, ytdReturnPercent: event.target.value })} required /></Field>
            <Field label="Accuracy %"><input className="field" inputMode="decimal" value={form.accuracyPercent} onChange={(event) => setForm({ ...form, accuracyPercent: event.target.value })} required /></Field>
            <Field label="Win rate %"><input className="field" inputMode="decimal" value={form.winRatePercent} onChange={(event) => setForm({ ...form, winRatePercent: event.target.value })} required /></Field>
            <Field label="Profit factor"><input className="field" inputMode="decimal" value={form.profitFactor} onChange={(event) => setForm({ ...form, profitFactor: event.target.value })} required /></Field>
            <Field label="Sharpe ratio"><input className="field" inputMode="decimal" value={form.sharpeRatio} onChange={(event) => setForm({ ...form, sharpeRatio: event.target.value })} required /></Field>
            <Field label="Max drawdown %"><input className="field" inputMode="decimal" value={form.maxDrawdownPercent} onChange={(event) => setForm({ ...form, maxDrawdownPercent: event.target.value })} required /></Field>
            <Field label="Active strategies"><input className="field" inputMode="numeric" value={form.activeStrategies} onChange={(event) => setForm({ ...form, activeStrategies: event.target.value })} required /></Field>
            <Field label="Trades this month"><input className="field" inputMode="numeric" value={form.tradesThisMonth} onChange={(event) => setForm({ ...form, tradesThisMonth: event.target.value })} required /></Field>
            <Field label="Best month %"><input className="field" inputMode="decimal" value={form.bestMonthPercent} onChange={(event) => setForm({ ...form, bestMonthPercent: event.target.value })} required /></Field>
            <Field label="Mandate"><input className="field" value={form.mandate} onChange={(event) => setForm({ ...form, mandate: event.target.value })} required /></Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save portfolio desk'}</Button>
            </div>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Desk standards</h2>
          <ul className="mt-3 space-y-3 text-sm text-stone-600">
            <li>Lead with AUM, net profit, accuracy, and drawdown — the same KPI strip used by modern trading desks.</li>
            <li>Split the ₹20 Cr book across sleeves so returns and accuracy can be judged by strategy, not one blended number.</li>
            <li>Track monthly equity growth next to hit rate so capital and precision stay visible together.</li>
            <li>Keep cash/hedge capital reserved so the desk can defend drawdowns without stopping the core books.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
