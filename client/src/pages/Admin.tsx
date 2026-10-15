import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { PERMISSIONS, type Campaign, type EmailJob, type EmailTemplate, type Page } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, Select, Spinner, TextArea, TextInput, formatWhen, useTitle } from '@/components/ui';

export function TemplatesPage() {
  useTitle('Email templates');
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<{ data: EmailTemplate[] }>('/api/email-templates') });
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState('');
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (!selected && templates.data?.data[0]) setSelected(templates.data.data[0]); }, [selected, templates.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div>
        <PageHeader title="Email templates" />
        <div className="space-y-2">{templates.data?.data.map((template) => <button key={template._id} className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selected?._id === template._id ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200 bg-white'}`} type="button" onClick={() => setSelected(template)}>{template.name}<span className="mt-1 block text-xs text-stone-500">{template.category}</span></button>)}</div>
      </div>
      {selected ? <Card className="space-y-3 p-4">
        <Field label="Subject"><TextInput value={selected.subject} onChange={(event) => setSelected({ ...selected, subject: event.target.value })} /></Field>
        <Field label="Plain text"><TextArea className="min-h-64" value={selected.textBody} onChange={(event) => setSelected({ ...selected, textBody: event.target.value })} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void api(`/api/email-templates/${selected._id}`, { method: 'PATCH', body: JSON.stringify({ subject: selected.subject, textBody: selected.textBody, htmlBody: selected.textBody }) }).then(() => setMessage('Template saved. The HTML version was refreshed from the plain text.'))}>Save</Button>
          <Button type="button" variant="secondary" onClick={() => void api<{ text: string }>(`/api/email-templates/${selected._id}/preview`, { method: 'POST', body: JSON.stringify({ variables: { student_name: 'Student' } }) }).then((result) => setPreview(result.text))}>Preview</Button>
        </div>
        <div className="flex gap-2"><TextInput placeholder="Test recipient" value={testTo} onChange={(event) => setTestTo(event.target.value)} /><Button type="button" variant="secondary" onClick={() => void api(`/api/email-templates/${selected._id}/test`, { method: 'POST', body: JSON.stringify({ to: testTo }) }).then((result) => setMessage(`Test recorded: ${JSON.stringify(result)}`)).catch((error) => setMessage(error instanceof ApiError ? error.message : 'Test failed.'))}>Send test</Button></div>
        {message ? <Alert tone="emerald">{message}</Alert> : null}
        {preview ? <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs">{preview}</pre> : null}
      </Card> : <Spinner />}
    </div>
  );
}

export function CampaignsPage() {
  useTitle('Campaigns');
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => api<Page<Campaign>>('/api/email-campaigns') });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<{ data: EmailTemplate[] }>('/api/email-templates') });
  const [message, setMessage] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<Record<string, unknown>>('/api/email-campaigns', { method: 'POST', body: JSON.stringify({ name: form.get('name'), templateId: form.get('templateId'), enrollmentStatus: form.get('status') || undefined, confirm: form.get('confirm') === 'on', confirmPermittedImports: false, variables: {} }) });
      setMessage(JSON.stringify(result, null, 2));
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'The campaign could not be created.');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Bulk email" subtitle="Marketing campaigns include only recipients with marketing consent. Each address is emailed separately." />
      <Card className="p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
        <Field label="Campaign name"><TextInput name="name" required defaultValue={params.get('new') ? '' : ''} /></Field>
        <Field label="Template"><Select name="templateId">{templates.data?.data.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}</Select></Field>
        <Field label="Enrollment status filter"><Select name="status" defaultValue="New Registration"><option>New Registration</option><option>Batch Assigned</option><option>Active Student</option></Select></Field>
        <label className="flex items-center gap-2 text-sm"><input name="confirm" type="checkbox" /> Confirm and queue this campaign</label>
        <div><Button type="submit">Prepare campaign</Button></div>
      </form>{message ? <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs">{message}</pre> : null}</Card>
      {campaigns.data?.data.length ? campaigns.data.data.map((campaign) => <Card key={campaign._id} className="flex items-center justify-between p-4 text-sm"><div><p className="font-medium">{campaign.name}</p><p className="text-stone-500">{campaign.recipientCount} recipients · {formatWhen(campaign.createdAt)}</p></div><Badge>{campaign.status}</Badge></Card>) : <Empty title="No campaigns" body="Queued and sent campaigns will appear here." />}
    </div>
  );
}

export function DeliveryPage() {
  useTitle('Email delivery');
  const [status, setStatus] = useState('');
  const jobs = useQuery({ queryKey: ['jobs', status], queryFn: () => api<Page<EmailJob>>(`/api/email-jobs?status=${status}`) });
  return (
    <div>
      <PageHeader title="Email delivery" subtitle="Sent means the provider accepted the message. Delivered is recorded only from a verified provider webhook." />
      <Select className="mb-4 max-w-xs" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['queued', 'sent', 'failed', 'suppressed', 'cancelled'].map((item) => <option key={item}>{item}</option>)}</Select>
      {jobs.isLoading ? <Spinner /> : jobs.data?.data.length ? <div className="overflow-auto rounded-2xl border border-stone-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr>{['When', 'To', 'Subject', 'Status', 'Detail'].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead><tbody>{jobs.data.data.map((job) => <tr key={job._id} className="border-t border-stone-100"><td className="px-3 py-3">{formatWhen(job.createdAt)}</td><td className="px-3 py-3">{job.to}</td><td className="px-3 py-3">{job.subject}</td><td className="px-3 py-3"><Badge tone={job.status === 'sent' ? 'emerald' : job.status === 'failed' ? 'red' : 'amber'}>{job.status}</Badge></td><td className="px-3 py-3">{job.lastError || '—'}</td></tr>)}</tbody></table></div> : <Empty title="No email jobs" body="Queued registration, batch, and campaign emails will appear here." />}
    </div>
  );
}

export function ReportsPage() {
  useTitle('Reports');
  const report = useQuery({ queryKey: ['report'], queryFn: () => api<{ byCourse: { name: string; count: number }[]; byStatus: { status: string; count: number }[]; totals: Record<string, number> }>('/api/reports/enrollment') });
  const comms = useQuery({ queryKey: ['report-comms'], queryFn: () => api<{ jobs: { status: string; count: number }[]; events: { type: string; count: number }[] }>('/api/reports/communications') });
  if (report.isLoading) return <Spinner />;
  return <div><PageHeader title="Reports" subtitle="Counts are calculated from stored records." /><div className="grid gap-4 md:grid-cols-2"><Card className="p-4"><h2 className="font-medium">Enrollment</h2>{report.data?.byStatus.length ? report.data.byStatus.map((item) => <p key={item.status} className="mt-2 flex justify-between text-sm"><span>{item.status}</span><span>{item.count}</span></p>) : <p className="mt-2 text-sm text-stone-500">No enrollment records.</p>}</Card><Card className="p-4"><h2 className="font-medium">Courses</h2>{report.data?.byCourse.length ? report.data.byCourse.map((item) => <p key={item.name} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><span>{item.count}</span></p>) : <p className="mt-2 text-sm text-stone-500">No course enrollments.</p>}</Card><Card className="p-4"><h2 className="font-medium">Email jobs</h2>{comms.data?.jobs.length ? comms.data.jobs.map((item) => <p key={item.status} className="mt-2 flex justify-between text-sm"><span>{item.status}</span><span>{item.count}</span></p>) : <p className="mt-2 text-sm text-stone-500">No email jobs.</p>}</Card><Card className="p-4"><h2 className="font-medium">Provider events</h2>{comms.data?.events.length ? comms.data.events.map((item) => <p key={item.type} className="mt-2 flex justify-between text-sm"><span>{item.type}</span><span>{item.count}</span></p>) : <p className="mt-2 text-sm text-stone-500">No delivery events have been confirmed.</p>}</Card></div></div>;
}

export function ImportExportPage() {
  useTitle('Import and export');
  const { can } = useAuth();
  const [csv, setCsv] = useState('fullName,email,phone,course\n');
  const [result, setResult] = useState('');
  return <div className="space-y-4"><PageHeader title="Import and export" subtitle="Imports create review records. They do not mark students as paid or enrolled." />
    {can('students.import') ? <Card className="space-y-3 p-4"><h2 className="font-medium">Import CSV</h2><TextArea value={csv} onChange={(event) => setCsv(event.target.value)} /><Button type="button" onClick={() => void api('/api/import/students', { method: 'POST', body: JSON.stringify({ csv, sendWelcomeEmail: false }) }).then((value) => setResult(JSON.stringify(value, null, 2))).catch((error) => setResult(error instanceof ApiError ? error.message : 'Import failed.'))}>Import</Button>{result ? <pre className="overflow-auto rounded-xl bg-stone-50 p-3 text-xs">{result}</pre> : null}</Card> : null}
    {can('exports.sensitive') ? <Card className="p-4"><h2 className="font-medium">Export students</h2><p className="my-2 text-sm text-stone-600">The file contains names and email addresses. The download is recorded in the audit log.</p><a className="btn-primary" href="/api/export/students">Download CSV</a></Card> : <Alert tone="amber">Export requires the sensitive export permission.</Alert>}
  </div>;
}

export function UsersPage() {
  useTitle('Users');
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ data: { id: string; name: string; email: string; role: string; permissions: string[]; isActive: boolean }[] }>('/api/users') });
  const [permissions, setPermissions] = useState<string[]>(['students.view', 'forms.view', 'forms.share']);
  const [message, setMessage] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), role: form.get('role'), permissions: form.get('role') === 'staff' ? permissions : [] }) });
      event.currentTarget.reset();
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'The user could not be created.');
    }
  }
  return <div className="space-y-4"><PageHeader title="Users" subtitle="Staff access is limited to the permissions you assign. Administrators can do everything." />
    {message ? <Alert>{message}</Alert> : null}
    <Card className="p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}><Field label="Name"><TextInput name="name" required /></Field><Field label="Email"><TextInput name="email" type="email" required /></Field><Field label="Temporary password"><TextInput name="password" type="password" required /></Field><Field label="Role"><Select name="role"><option value="staff">Staff</option><option value="admin">Administrator</option></Select></Field><div className="md:col-span-2 grid gap-2 sm:grid-cols-2">{PERMISSIONS.map((permission) => <label key={permission} className="flex gap-2 text-sm"><input type="checkbox" checked={permissions.includes(permission)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />{permission}</label>)}</div><div><Button type="submit">Create user</Button></div></form></Card>
    {users.data?.data.map((user) => <Card key={user.id} className="flex items-center justify-between p-4 text-sm"><div><p className="font-medium">{user.name}</p><p className="text-stone-500">{user.email} · {user.role}</p></div><Badge tone={user.isActive ? 'emerald' : 'stone'}>{user.isActive ? 'Active' : 'Inactive'}</Badge></Card>)}
  </div>;
}

export function SettingsPage() {
  useTitle('Settings');
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string | boolean>>('/api/settings') });
  const [message, setMessage] = useState('');
  if (settings.isLoading || !settings.data) return <Spinner />;
  const data = settings.data;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ supportEmail: form.get('supportEmail'), timeZone: form.get('timeZone'), duplicatePolicy: form.get('duplicatePolicy'), communicationPolicy: form.get('communicationPolicy') }) });
    setMessage('Settings saved.');
  }
  return <div className="mx-auto max-w-2xl"><PageHeader title="Settings" subtitle="Secrets stay in environment variables and are never shown here." /><Card className="space-y-3 p-4"><form className="space-y-3" onSubmit={(event) => void save(event)}>
    <Field label="Support email"><TextInput name="supportEmail" defaultValue={String(data.supportEmail || '')} /></Field>
    <Field label="Academy time zone"><TextInput name="timeZone" defaultValue={String(data.timeZone || 'UTC')} /></Field>
    <Field label="Duplicate submissions"><Select name="duplicatePolicy" defaultValue={String(data.duplicatePolicy)}><option value="flag">Flag for review and keep existing details</option><option value="skip">Keep the existing record and flag the duplicate</option><option value="update_empty">Fill only empty fields</option></Select></Field>
    <Field label="Communication policy"><Select name="communicationPolicy" defaultValue={String(data.communicationPolicy)}><option value="operational_allowed">Allow operational registration messages</option><option value="require_consent">Require recorded consent for operational email</option></Select></Field>
    <Button type="submit">Save settings</Button>
  </form><div className="text-sm text-stone-600"><p>Email provider configured: {data.emailProviderConfigured ? 'Yes' : 'No'}</p><p>Webhook secret configured: {data.webhookConfigured ? 'Yes' : 'No'}</p><p>Google Sheets credentials configured: {data.sheetsConfigured ? 'Yes' : 'No'}</p></div>{message ? <Alert tone="emerald">{message}</Alert> : null}</Card></div>;
}

export function AuditPage() {
  useTitle('Audit logs');
  const logs = useQuery({ queryKey: ['audit'], queryFn: () => api<{ data: { _id: string; action: string; category: string; createdAt: string; actorId?: { name?: string } }[] }>('/api/audit-logs') });
  if (logs.isLoading) return <Spinner />;
  return <div><PageHeader title="Audit logs" subtitle="Security, administration, and communication events. Secrets are not stored in these entries." />{logs.data?.data.length ? <div className="overflow-auto rounded-2xl border border-stone-200 bg-white"><table className="min-w-full text-left text-sm"><tbody>{logs.data.data.map((log) => <tr key={log._id} className="border-t border-stone-100"><td className="px-3 py-3">{formatWhen(log.createdAt)}</td><td className="px-3 py-3">{log.category}</td><td className="px-3 py-3">{log.action}</td><td className="px-3 py-3">{log.actorId?.name || 'System'}</td></tr>)}</tbody></table></div> : <Empty title="No audit events" body="Sign-ins and record changes will appear here." />}</div>;
}

export function GoogleIntegrationPage() {
  useTitle('Google integration');
  const integration = useQuery({ queryKey: ['google'], queryFn: () => api<{ webhookConfigured: boolean; sheetsConfigured: boolean; emailProviderConfigured: boolean; lastWebhookAt?: string | null; syncMethod: string; setupNotes?: string }>('/api/google-integration') });
  const [notes, setNotes] = useState('');
  useEffect(() => { if (integration.data) setNotes(integration.data.setupNotes || ''); }, [integration.data]);
  if (!integration.data) return <Spinner />;
  const data = integration.data;
  return <div className="mx-auto max-w-3xl space-y-4"><PageHeader title="Google integration" subtitle="Status is based on configuration and the last real webhook. A form is not marked verified from this page." />
    <div className="grid gap-3 md:grid-cols-3"><Card className="p-4 text-sm"><p className="text-stone-500">Webhook secret</p><p className="mt-1 font-medium">{data.webhookConfigured ? 'Configured' : 'Not configured'}</p></Card><Card className="p-4 text-sm"><p className="text-stone-500">Sheets credentials</p><p className="mt-1 font-medium">{data.sheetsConfigured ? 'Configured' : 'Not configured'}</p></Card><Card className="p-4 text-sm"><p className="text-stone-500">Last webhook</p><p className="mt-1 font-medium">{formatWhen(data.lastWebhookAt)}</p></Card></div>
    <Card className="space-y-3 p-4 text-sm text-stone-700"><p>Create the Google Form yourself, link its response sheet, then install the Apps Script in <span className="font-mono">apps-script/Code.gs</span>. The setup steps are in <span className="font-mono">docs/GOOGLE_FORMS_SETUP.md</span>.</p><p>The webhook endpoint is <span className="font-mono">POST /api/webhooks/google-form</span>.</p><Field label="Setup notes"><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><Button type="button" onClick={() => void api('/api/google-integration', { method: 'PATCH', body: JSON.stringify({ setupNotes: notes, syncMethod: data.syncMethod }) })}>Save notes</Button></Card>
  </div>;
}

export function UnsubscribePage() {
  const token = window.location.pathname.split('/').pop() || '';
  const [done, setDone] = useState('');
  useTitle('Email preferences');
  const valid = useQuery({ queryKey: ['unsub', token], queryFn: () => api<{ valid: boolean }>(`/api/public/unsubscribe/${token}`) });
  return <div className="mx-auto max-w-lg py-16"><Card className="space-y-4 p-6"><img src="/markex-logo.jpg" alt="MARKEX Trading Academy" className="h-16 w-16 rounded-xl object-cover" /><h1 className="text-xl font-semibold">Email preferences</h1>{valid.data?.valid === false ? <p className="text-sm text-stone-600">This link is not valid.</p> : <><p className="text-sm text-stone-600">Choose what to stop. This page does not show your email address.</p><Button type="button" variant="secondary" onClick={() => void api(`/api/public/unsubscribe/${token}`, { method: 'POST', body: JSON.stringify({ scope: 'marketing' }) }).then(() => setDone('Marketing emails are stopped.'))}>Unsubscribe from marketing</Button><Button type="button" onClick={() => void api(`/api/public/unsubscribe/${token}`, { method: 'POST', body: JSON.stringify({ scope: 'all' }) }).then(() => setDone('Academy emails are stopped.'))}>Unsubscribe from all academy emails</Button>{done ? <Alert tone="emerald">{done}</Alert> : null}</>}</Card></div>;
}
