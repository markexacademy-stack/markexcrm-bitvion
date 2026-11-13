import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
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

interface TradingInvestor {
  _id: string;
  fullName: string;
  capital: number;
  sharePercent: number;
  active: boolean;
  payoutTotal: number;
}

interface TradingOverview {
  settings: { quarterlyInvestorPercent: number };
  totals: {
    activeInvestors: number;
    totalCapital: number;
    grossProfit: number;
    companyProfit: number;
    investorPayouts: number;
  };
  investors: TradingInvestor[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-stone-950 sm:text-2xl">{value}</p>
    </Card>
  );
}

export function DashboardPage() {
  useTitle('Dashboard');
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/finance/overview') });
  const trading = useQuery({ queryKey: ['trading'], queryFn: () => api<TradingOverview>('/api/trading/overview') });

  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <Alert>The dashboard could not be loaded from the database.</Alert>;
  const data = overview.data;
  const trade = trading.data;

  const crmCards = [
    ['Students', String(data.students)],
    ['Total revenue', inr(data.totalRevenue)],
    ['Pending amount', inr(data.totalPending)],
    ['Total spending', inr(data.totalSpending)],
    ['Total assets', inr(data.totalAssets)],
    ['Assets after spending', inr(data.assetsAfterSpending)],
  ];

  const tradingCards = trade
    ? [
        ['Active investors', String(trade.totals.activeInvestors)],
        ['Investor capital', inr(trade.totals.totalCapital)],
        ['Gross trading profit', inr(trade.totals.grossProfit)],
        ['Company profit', inr(trade.totals.companyProfit)],
        ['Investor payouts', inr(trade.totals.investorPayouts)],
        ['Quarterly investor share', `${trade.settings.quarterlyInvestorPercent}%`],
      ]
    : [];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Total assets follow total revenue automatically. Assets after spending is that figure minus recorded spending." />
      {!data.emailProviderConfigured ? <div className="mb-4"><Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Email is not connected yet. Receipts are saved as queued and are not marked sent.</Card></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-medium">Bitvion CRM</h2>
          <div className="grid grid-cols-2 gap-3">
            {crmCards.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">MX Trading</h2>
            <Link className="text-sm font-medium text-sky-700" to="/trading">Open trading</Link>
          </div>
          {trading.isLoading ? <Spinner /> : null}
          {trading.error ? <Alert>MX Trading could not be loaded.</Alert> : null}
          {trade ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {tradingCards.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
              </div>
              <Card className="mt-3 p-4">
                <h3 className="font-medium">Investor profit shares</h3>
                <p className="mt-1 text-sm text-stone-600">Each investor keeps their own share of the investor pool.</p>
                {trade.investors.length === 0 ? <p className="mt-3 text-sm text-stone-500">No investors yet.</p> : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {trade.investors.map((investor) => (
                      <li key={investor._id} className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2">
                        <span>
                          {investor.fullName}
                          <span className="block text-xs text-stone-500">{investor.active ? 'Active' : 'Inactive'} · Capital {inr(investor.capital)}</span>
                        </span>
                        <span className="text-right">
                          {investor.sharePercent}%
                          <span className="block text-xs text-stone-500">Payouts {inr(investor.payoutTotal || 0)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : null}
        </section>
      </div>
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
