import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Alert, Button, Card, Field, PageHeader, Spinner, formatWhen, useTitle } from '@/components/ui';

interface Diagnostics {
  sender: string | null;
  fromName: string;
  replyTo: string | null;
  method: string;
  host: string | null;
  port: number | null;
  encryption: string | null;
  providerReady: boolean;
  configuration: { smtpUserSet: boolean; smtpPassSet: boolean; emailFromSet: boolean };
  lastAcceptedAt: string | null;
  recentErrors: { status: string; attempts: number; retryAt: string | null; error: string; at: string }[];
  bounceCount: number;
  bounceNote: string;
  templates: {
    receipt: { present: boolean; subjectMatches: boolean; subject: string; htmlReady: boolean; textReady: boolean };
    welcome: { present: boolean; subjectMatches: boolean; subject: string; htmlReady: boolean; textReady: boolean };
  };
  guidance: string;
}

function yesNo(value: boolean) {
  return value ? 'Ready' : 'Missing';
}

export function MailDiagnosticsPage() {
  useTitle('Email diagnostics');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const report = useQuery({ queryKey: ['email-diagnostics'], queryFn: () => api<Diagnostics>('/api/email-diagnostics') });
  const connection = useMutation({
    mutationFn: () => api<{ ok: boolean; error?: string }>('/api/email-diagnostics/connection', { method: 'POST' }),
    onSuccess: (result) => {
      setError('');
      setNotice(result.ok ? 'SMTP authentication succeeded. This does not place a message in the inbox.' : result.error || 'SMTP authentication failed.');
    },
    onError: (reason: Error) => {
      setNotice('');
      setError(reason.message);
    },
  });
  const testSend = useMutation({
    mutationFn: () => api<{ accepted: boolean; status: string; error?: string }>('/api/email-diagnostics/test', { method: 'POST', body: JSON.stringify({ to }) }),
    onSuccess: (result) => {
      setError('');
      setNotice(result.accepted ? 'The mail server accepted the test message. Check Gmail’s Show original page for SPF, DKIM, and DMARC. Acceptance is not inbox placement.' : result.error || `The test was not accepted (${result.status}).`);
      void report.refetch();
    },
    onError: (reason: Error) => {
      setNotice('');
      setError(reason.message);
    },
  });

  if (report.isLoading) return <Spinner />;
  if (report.isError) return <Alert>{(report.error as Error).message}</Alert>;
  const data = report.data;
  if (!data) return null;

  function onTest(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setError('');
    testSend.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Email diagnostics" subtitle="Administrators can check the sender setup. The app password is never shown." />
      {notice ? <Alert tone={notice.toLowerCase().includes('fail') || notice.toLowerCase().includes('not accepted') ? 'amber' : 'emerald'}>{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <Card className="grid gap-3 p-4 text-sm md:grid-cols-2">
        <p><span className="text-stone-500">Sender</span><br />{data.sender || 'Not set'}</p>
        <p><span className="text-stone-500">From name</span><br />{data.fromName}</p>
        <p><span className="text-stone-500">Reply-To</span><br />{data.replyTo || 'Not set'}</p>
        <p><span className="text-stone-500">Method</span><br />{data.method}</p>
        <p><span className="text-stone-500">Host and port</span><br />{data.host ? `${data.host}:${data.port} (${data.encryption})` : 'Not using SMTP'}</p>
        <p><span className="text-stone-500">Password stored</span><br />{data.configuration.smtpPassSet ? 'Yes, on the server only' : 'No'}</p>
        <p><span className="text-stone-500">Last SMTP acceptance</span><br />{data.lastAcceptedAt ? formatWhen(data.lastAcceptedAt) : 'None recorded'}</p>
        <p><span className="text-stone-500">Recorded bounces</span><br />{data.bounceCount}</p>
      </Card>
      <Card className="space-y-2 p-4 text-sm">
        <p>Receipt template: {yesNo(data.templates.receipt.present && data.templates.receipt.subjectMatches && data.templates.receipt.htmlReady && data.templates.receipt.textReady)}</p>
        <p>Receipt subject: {data.templates.receipt.subject || 'Missing'}</p>
        <p>Welcome template: {yesNo(data.templates.welcome.present && data.templates.welcome.subjectMatches && data.templates.welcome.htmlReady && data.templates.welcome.textReady)}</p>
        <p>Welcome subject: {data.templates.welcome.subject || 'Missing'}</p>
        <p>Provider ready: {data.providerReady ? 'Yes' : 'No'}</p>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => connection.mutate()} disabled={connection.isPending}>{connection.isPending ? 'Checking…' : 'Test SMTP connection'}</Button>
        </div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={onTest}>
          <Field label="Send a test to">
            <input className="field" type="email" required value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" />
          </Field>
          <Button type="submit" disabled={testSend.isPending}>{testSend.isPending ? 'Sending…' : 'Send test email'}</Button>
        </form>
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Recent delivery errors</h2>
        {!data.recentErrors.length ? <p className="mt-2 text-sm text-stone-600">No delivery errors are recorded.</p> : (
          <ul className="mt-3 space-y-3">
            {data.recentErrors.map((item, index) => (
              <li key={`${item.at}-${index}`} className="text-sm">
                <p className="font-medium">{item.status} · attempt {item.attempts}</p>
                <p className="text-stone-700">{item.error}</p>
                {item.retryAt ? <p className="text-xs text-stone-500">Retry scheduled {formatWhen(item.retryAt)}</p> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-stone-600">{data.bounceNote}</p>
        <p className="mt-2 text-sm text-stone-600">{data.guidance}</p>
      </Card>
    </div>
  );
}
