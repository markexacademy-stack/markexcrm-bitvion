import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError, api } from '@/api/client';
import type { Batch, Course, EmailTemplate, Page, RegistrationForm, Student } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { SharePanel } from '@/components/SharePanel';
import { Alert, Badge, Button, Card, Empty, Field, Modal, PageHeader, Select, Spinner, TextArea, TextInput, formatWhen, integrationLabel, integrationTone, refName, useTitle } from '@/components/ui';
import { useEffect, useState } from 'react';
import { Pager } from '@/pages/Students';

const GOOGLE_FORM_URL = /^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?[a-zA-Z0-9_-]+\/(?:viewform|edit|formResponse)(?:[/?#].*)?$/;

const formSchema = z.object({
  formName: z.string().trim().min(3, 'Enter a form name.'),
  publicFormUrl: z.string().trim().refine((value) => GOOGLE_FORM_URL.test(value), 'Paste a docs.google.com/forms URL. Short links are not accepted.'),
  googleFormId: z.string().trim().optional(),
  responseSpreadsheetId: z.string().trim().optional(),
  associatedCourseId: z.string().optional(),
  optionalBatchId: z.string().optional(),
  formStatus: z.enum(['draft', 'active']),
});

export function RegistrationFormsPage() {
  useTitle('Registration Forms');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const integration = params.get('integration') || '';
  const forms = useQuery({ queryKey: ['forms', status, integration], queryFn: () => api<Page<RegistrationForm>>(`/api/registration-forms?status=${status}&integration=${integration}`) });
  const [shareId, setShareId] = useState('');

  return (
    <div>
      <PageHeader title="Registration Forms" subtitle="Connect a real Google Form, then share its public link from here." actions={<Link to="/registration-forms/new" className="btn-primary">Add registration form</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={status} onChange={(event) => setParams({ status: event.target.value, integration })}>
          <option value="">All form statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={integration} onChange={(event) => setParams({ status, integration: event.target.value })}>
          <option value="">All integration states</option>
          <option value="verified">Integration verified</option>
          <option value="not_verified">Integration not verified</option>
        </Select>
      </div>
      {forms.isLoading ? <Spinner /> : forms.data?.data.length ? (
        <div className="overflow-auto rounded-2xl border border-stone-200 bg-white">
          <table className="min-w-[1100px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>{['Form', 'Form ID', 'Course', 'Google Form URL', 'Status', 'Integration', 'Submissions', 'Last submission', 'Last sync', 'Created', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {forms.data.data.map((form) => (
                <tr key={form._id} className="border-t border-stone-100 align-top">
                  <td className="px-3 py-3 font-medium"><Link to={`/registration-forms/${form._id}`}>{form.formName}</Link></td>
                  <td className="px-3 py-3 font-mono text-xs">{form.googleFormId}</td>
                  <td className="px-3 py-3">{refName(form.associatedCourseId)}</td>
                  <td className="max-w-xs truncate px-3 py-3"><a className="text-emerald-800" href={form.publicFormUrl} target="_blank" rel="noreferrer noopener">{form.publicFormUrl}</a></td>
                  <td className="px-3 py-3"><Badge>{form.formStatus}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={integrationTone(form.integrationStatus)}>{integrationLabel(form.integrationStatus)}</Badge></td>
                  <td className="px-3 py-3">{form.submissionCount}</td>
                  <td className="px-3 py-3">{formatWhen(form.lastSubmissionAt)}</td>
                  <td className="px-3 py-3">{formatWhen(form.lastSyncAt)}</td>
                  <td className="px-3 py-3">{formatWhen(form.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <a className="text-emerald-800" href={form.publicFormUrl} target="_blank" rel="noreferrer noopener">Open form</a>
                      <button className="text-left text-emerald-800" type="button" onClick={() => setShareId(form._id)}>Share form</button>
                      <Link to={`/registration-forms/${form._id}`}>Edit configuration</Link>
                      <Link to={`/registration-forms/${form._id}/submissions`}>View submissions</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No registration forms" body="Add a form by pasting the public Google Forms URL. The CRM does not invent a form or mark it verified before a connection test." />}
      {shareId ? <Modal title="Share registration form" onClose={() => setShareId('')}><SharePanel formId={shareId} /></Modal> : null}
    </div>
  );
}

export function RegistrationFormEditPage() {
  useTitle('Registration form');
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useQuery({ queryKey: ['form', id], queryFn: () => api<RegistrationForm>(`/api/registration-forms/${id}`), enabled: Boolean(id) });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api<{ data: Batch[] }>('/api/batches') });
  const record = existing.data;
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      formName: '',
      publicFormUrl: '',
      googleFormId: '',
      responseSpreadsheetId: '',
      associatedCourseId: '',
      optionalBatchId: '',
      formStatus: 'draft',
    },
  });
  useEffect(() => {
    if (!record) return;
    const course = record.associatedCourseId;
    const batch = record.optionalBatchId;
    form.reset({
      formName: record.formName,
      publicFormUrl: record.publicFormUrl,
      googleFormId: record.googleFormId || '',
      responseSpreadsheetId: record.responseSpreadsheetId || '',
      associatedCourseId: course && typeof course === 'object' ? course._id : '',
      optionalBatchId: batch && typeof batch === 'object' ? batch._id : '',
      formStatus: record.formStatus === 'active' ? 'active' : 'draft',
    });
  }, [record, form]);
  const save = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) => {
      const payload = { ...values, associatedCourseId: values.associatedCourseId || undefined, optionalBatchId: values.optionalBatchId || undefined, googleFormId: values.googleFormId || undefined, responseSpreadsheetId: values.responseSpreadsheetId || undefined };
      return id ? api(`/api/registration-forms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : api<RegistrationForm>('/api/registration-forms', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: (saved) => navigate(`/registration-forms/${id || (saved as RegistrationForm)._id}`),
  });

  if (id && existing.isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={id ? 'Edit registration form' : 'Add registration form'} subtitle="Create the form in Google Forms, then paste its public URL. This CRM does not create the Google Form for you." actions={<a className="btn-secondary" href="https://docs.google.com/forms/u/0/" target="_blank" rel="noreferrer noopener">Open Google Forms</a>} />
      <Card className="p-5">
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <Field label="Form name"><TextInput placeholder="MARKEX TRADING ACADEMY — Student Registration Form" {...form.register('formName')} /></Field>
          <Field label="Google Form URL" hint="Use the docs.google.com/forms link. Short links are not accepted."><TextInput placeholder="https://docs.google.com/forms/d/e/…/viewform" {...form.register('publicFormUrl')} /></Field>
          <Field label="Google Form ID" hint="Optional. Set this to FormApp.getId() if it differs from the published URL."><TextInput {...form.register('googleFormId')} /></Field>
          <Field label="Response spreadsheet ID"><TextInput {...form.register('responseSpreadsheetId')} /></Field>
          <Field label="Course"><Select {...form.register('associatedCourseId')}><option value="">Select a course</option>{courses.data?.data.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}</Select></Field>
          <Field label="Batch (optional)"><Select {...form.register('optionalBatchId')}><option value="">No batch</option>{batches.data?.data.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}</Select></Field>
          <Field label="Status"><Select {...form.register('formStatus')}><option value="draft">Draft</option><option value="active">Active</option></Select></Field>
          {form.formState.errors.formName ? <Alert>{form.formState.errors.formName.message}</Alert> : null}
          {form.formState.errors.publicFormUrl ? <Alert>{form.formState.errors.publicFormUrl.message}</Alert> : null}
          {save.error ? <Alert>{save.error instanceof ApiError ? save.error.message : 'The form could not be saved.'}</Alert> : null}
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save form'}</Button>
        </form>
      </Card>
    </div>
  );
}

export function RegistrationFormDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const form = useQuery({ queryKey: ['form', id], queryFn: () => api<RegistrationForm>(`/api/registration-forms/${id}`) });
  const [result, setResult] = useState('');
  useTitle(form.data?.formName || 'Form');
  if (form.isLoading) return <Spinner />;
  if (!form.data) return <Empty title="Form not found" body="This registration form is not in the CRM." />;
  const record = form.data;

  async function run(path: string) {
    setResult('');
    try {
      const response = await api<Record<string, unknown>>(`/api/registration-forms/${id}/${path}`, { method: 'POST' });
      setResult(JSON.stringify(response, null, 2));
      await queryClient.invalidateQueries({ queryKey: ['form', id] });
    } catch (error) {
      setResult(error instanceof ApiError ? error.message : 'The action failed.');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={record.formName} subtitle="Integration is verified only after a successful connection test." actions={<><Link className="btn-primary" to={`/registration-forms/${id}/share`}>Share form</Link><Link className="btn-secondary" to={`/registration-forms/${id}/edit`}>Edit</Link></>} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><p className="text-xs uppercase text-stone-500">Form status</p><div className="mt-2"><Badge>{record.formStatus}</Badge></div></Card>
        <Card className="p-4"><p className="text-xs uppercase text-stone-500">Integration</p><div className="mt-2"><Badge tone={integrationTone(record.integrationStatus)}>{integrationLabel(record.integrationStatus)}</Badge></div><p className="mt-2 text-xs text-stone-500">{record.lastTestDetail || record.lastTestError || 'No test has been run.'}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-stone-500">Submissions</p><p className="mt-2 text-2xl font-semibold">{record.submissionCount}</p></Card>
      </div>
      <Card className="space-y-2 p-4 text-sm">
        <p><span className="text-stone-500">Public URL:</span> <a className="text-emerald-800" href={record.publicFormUrl} target="_blank" rel="noreferrer noopener">{record.publicFormUrl}</a></p>
        <p><span className="text-stone-500">Google Form ID:</span> {record.googleFormId}</p>
        <p><span className="text-stone-500">Spreadsheet:</span> {record.responseSpreadsheetId || 'Not configured'}</p>
        <p><span className="text-stone-500">Last sync:</span> {formatWhen(record.lastSyncAt)} {record.lastSyncError || ''}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => void run('test')}>Test integration</Button>
          <Button type="button" variant="secondary" onClick={() => void run('sync')}>Synchronize responses</Button>
          <Button type="button" variant="secondary" onClick={() => void run(record.sharingEnabled ? 'disable-sharing' : 'enable-sharing')}>{record.sharingEnabled ? 'Disable sharing' : 'Enable sharing'}</Button>
          <Button type="button" variant="danger" onClick={() => void api(`/api/registration-forms/${id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: ['form', id] }))}>Archive form</Button>
          <Link className="btn-secondary" to={`/registration-forms/${id}/submissions`}>Submission history</Link>
          <Link className="btn-secondary" to="/google-integration">Integration settings</Link>
        </div>
        {result ? <pre className="overflow-auto rounded-xl bg-stone-50 p-3 text-xs">{result}</pre> : null}
      </Card>
    </div>
  );
}

export function ShareFormPage() {
  const { id = '' } = useParams();
  useTitle('Share form');
  const { can } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('');
  const [imports, setImports] = useState('');
  const [preview, setPreview] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [when, setWhen] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [permitted, setPermitted] = useState(false);
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<{ data: EmailTemplate[] }>('/api/email-templates') });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });

  async function loadStudents() {
    const result = await api<Page<Student>>(`/api/students?pageSize=100&courseId=${courseId}&status=${encodeURIComponent(status)}`);
    setStudents(result.data);
  }

  async function campaign(confirmSend: boolean, test = false) {
    setMessage('');
    try {
      const result = await api<Record<string, unknown>>(`/api/registration-forms/${id}/share-campaign`, {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selected,
          importEmails: imports.split(/\s|,|;/).map((item) => item.trim()).filter(Boolean),
          courseId: courseId || undefined,
          enrollmentStatus: status || undefined,
          templateId: templateId || undefined,
          scheduledFor: when ? new Date(when).toISOString() : undefined,
          confirm: confirmSend,
          confirmPermittedImports: permitted,
          testEmail: test ? testEmail : undefined,
        }),
      });
      if (result.dryRun) setPreview(JSON.stringify(result, null, 2));
      else setMessage(`Campaign recorded. Status: ${String(result.status || 'queued')}. Recipients: ${String(result.recipientCount || '')}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'The campaign could not be prepared.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Share registration form" subtitle="Copy the real form link, open it, share it on WhatsApp, email it, or download a QR code." />
      <Card className="p-5"><SharePanel formId={id} /></Card>
      {can('campaigns.send') ? (
        <Card className="space-y-3 p-5">
          <h2 className="font-medium">Send to multiple students</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Course interest"><Select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Any</option>{courses.data?.data.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}</Select></Field>
            <Field label="Enrollment status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any</option><option>New Registration</option><option>Contact Required</option><option>Enrollment Pending</option></Select></Field>
            <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => void loadStudents()}>Load recipients</Button></div>
          </div>
          <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-stone-200 p-3 text-sm">
            {students.length === 0 ? <p className="text-stone-500">Load students or paste a permitted list below.</p> : students.map((student) => (
              <label key={student._id} className="flex gap-2"><input type="checkbox" checked={selected.includes(student._id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, student._id] : current.filter((item) => item !== student._id))} />{student.fullName} · {student.email}</label>
            ))}
          </div>
          <Field label="Import permitted emails" hint="One address per line. Marketing templates still require consent."><TextArea value={imports} onChange={(event) => setImports(event.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permitted} onChange={(event) => setPermitted(event.target.checked)} /> I confirm imported recipients may receive this operational registration invitation.</label>
          <Field label="Template"><Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Default registration invitation</option>{templates.data?.data.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}</Select></Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Test email"><TextInput value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></Field>
            <Field label="Schedule"><TextInput type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></Field>
          </div>
          <p className="text-sm text-stone-600">Selected recipients: {selected.length}. Each person receives a separate email.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I confirm this campaign.</label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void campaign(false)}>Review recipient count</Button>
            <Button type="button" variant="secondary" disabled={!testEmail} onClick={() => void campaign(false, true)}>Send test email</Button>
            <Button type="button" disabled={!confirm} onClick={() => void campaign(true)}>{when ? 'Schedule campaign' : 'Send now'}</Button>
          </div>
          {preview ? <pre className="overflow-auto rounded-xl bg-stone-50 p-3 text-xs">{preview}</pre> : null}
          {message ? <Alert tone="emerald">{message}</Alert> : null}
        </Card>
      ) : null}
    </div>
  );
}

export function SubmissionsPage() {
  const { id = '' } = useParams();
  useTitle('Submissions');
  const submissions = useQuery({ queryKey: ['submissions', id], queryFn: () => api<Page<{ _id: string; createdAt: string; processingStatus: string; source: string; error?: string; answers: Record<string, string> }>>(`/api/registration-forms/${id}/submissions`) });
  if (submissions.isLoading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Submission history" subtitle="Events received from the Apps Script webhook or spreadsheet synchronization." />
      {submissions.data?.data.length ? submissions.data.data.map((item) => (
        <Card key={item._id} className="mb-3 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><Badge>{item.processingStatus}</Badge><span>{formatWhen(item.createdAt)} · {item.source}</span></div>
          {item.error ? <p className="mt-2 text-red-700">{item.error}</p> : null}
          <dl className="mt-3 grid gap-1">{Object.entries(item.answers || {}).map(([key, value]) => <div key={key}><dt className="text-stone-500">{key}</dt><dd>{value}</dd></div>)}</dl>
        </Card>
      )) : <Empty title="No submissions" body="Submit the connected Google Form or run a spreadsheet sync after credentials are configured." />}
      <Pager page={submissions.data?.page || 1} total={submissions.data?.total || 0} pageSize={submissions.data?.pageSize || 20} onPage={() => undefined} />
    </div>
  );
}
