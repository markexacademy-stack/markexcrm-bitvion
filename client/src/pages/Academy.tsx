import { FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { BATCH_STATUSES, COURSE_CATEGORIES, type Batch, type ClassItem, type Course, type WhatsAppCommunity } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, Select, Spinner, TextArea, TextInput, formatWhen, refName, useTitle } from '@/components/ui';

export function CoursesPage() {
  useTitle('Courses');
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/courses', { method: 'POST', body: JSON.stringify({ name: form.get('name'), category: form.get('category'), description: form.get('description'), duration: form.get('duration'), enrollmentAvailable: form.get('enrollmentAvailable') === 'on' }) });
      setParams({});
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The course could not be saved.');
    }
  }

  return (
    <div>
      <PageHeader title="Courses" subtitle="Only courses you configure are shown as available." actions={can('courses.manage') ? <Button type="button" onClick={() => setParams({ new: '1' })}>Create course</Button> : null} />
      {error ? <Alert>{error}</Alert> : null}
      {params.get('new') === '1' ? (
        <Card className="mb-4 p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
          <Field label="Name"><TextInput name="name" required /></Field>
          <Field label="Category"><Select name="category">{COURSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Duration"><TextInput name="duration" /></Field>
          <Field label="Description"><TextArea name="description" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enrollmentAvailable" /> Enrollment available</label>
          <div><Button type="submit">Save course</Button></div>
        </form></Card>
      ) : null}
      {courses.isLoading ? <Spinner /> : courses.data?.data.length ? (
        <div className="grid gap-3 md:grid-cols-2">{courses.data.data.map((course) => (
          <Card key={course._id} className="p-4">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{course.name}</h2><p className="text-sm text-stone-500">{course.category}{course.duration ? ` · ${course.duration}` : ''}</p></div><Badge tone={course.enrollmentAvailable ? 'emerald' : 'stone'}>{course.enrollmentAvailable ? 'Enrollment open' : 'Not open'}</Badge></div>
            <p className="mt-3 text-sm text-stone-600">{course.description || 'No description yet.'}</p>
            <p className="mt-3 text-xs text-stone-500">{course.batchCount || 0} batches · {course.formCount || 0} forms</p>
            {can('courses.manage') ? <button className="mt-3 text-sm text-emerald-800" type="button" onClick={() => void api(`/api/courses/${course._id}/archive`, { method: 'POST' }).then(() => queryClient.invalidateQueries({ queryKey: ['courses'] }))}>Archive</button> : null}
          </Card>
        ))}</div>
      ) : <Empty title="No courses" body="Create a course before associating a registration form or batch." />}
    </div>
  );
}

export function BatchesPage() {
  useTitle('Batches');
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api<{ data: Batch[] }>('/api/batches') });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/batches', { method: 'POST', body: JSON.stringify({ name: form.get('name'), courseId: form.get('courseId'), capacity: Number(form.get('capacity')), status: form.get('status'), timeZone: form.get('timeZone') || 'UTC', instructor: form.get('instructor'), startDate: form.get('startDate') ? new Date(String(form.get('startDate'))).toISOString() : undefined }) });
      setParams({});
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The batch could not be saved.');
    }
  }

  return (
    <div>
      <PageHeader title="Batches" subtitle="Assign students only through an authorized action. Nothing here records payment." actions={can('batches.manage') ? <Button type="button" onClick={() => setParams({ new: '1' })}>Create batch</Button> : null} />
      {error ? <div className="mb-3"><Alert>{error}</Alert></div> : null}
      {params.get('new') === '1' ? <Card className="mb-4 p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
        <Field label="Batch name"><TextInput name="name" required /></Field>
        <Field label="Course"><Select name="courseId" required><option value="">Select</option>{courses.data?.data.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}</Select></Field>
        <Field label="Capacity"><TextInput name="capacity" type="number" min={1} required /></Field>
        <Field label="Status"><Select name="status">{BATCH_STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Time zone"><TextInput name="timeZone" defaultValue="UTC" /></Field>
        <Field label="Instructor"><TextInput name="instructor" /></Field>
        <Field label="Start"><TextInput name="startDate" type="datetime-local" /></Field>
        <div className="flex items-end"><Button type="submit">Save batch</Button></div>
      </form></Card> : null}
      {batches.isLoading ? <Spinner /> : batches.data?.data.length ? <div className="overflow-auto rounded-2xl border border-stone-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr>{['Batch', 'Course', 'Status', 'Capacity', 'Start', 'Instructor'].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead><tbody>{batches.data.data.map((batch) => <tr key={batch._id} className="border-t border-stone-100"><td className="px-3 py-3"><Link className="text-emerald-800" to={`/batches/${batch._id}`}>{batch.name}</Link><div className="text-xs text-stone-500">{batch.batchCode}</div></td><td className="px-3 py-3">{refName(batch.courseId)}</td><td className="px-3 py-3"><Badge>{batch.status}</Badge></td><td className="px-3 py-3">{batch.assignedCount || 0} / {batch.capacity}</td><td className="px-3 py-3">{formatWhen(batch.startDate)}</td><td className="px-3 py-3">{batch.instructor || '—'}</td></tr>)}</tbody></table></div> : <Empty title="No batches" body="Create a batch after the course exists." />}
    </div>
  );
}

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => api<Batch & { students: { _id: string; fullName: string; email: string; studentId: string }[] }>(`/api/batches/${id}`) });
  const students = useQuery({ queryKey: ['students', 'picker'], queryFn: () => api<{ data: { _id: string; fullName: string; email: string }[] }>('/api/students?pageSize=100'), enabled: can('batches.assign') });
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  useTitle(batch.data?.name || 'Batch');
  if (batch.isLoading) return <Spinner />;
  if (!batch.data) return <Empty title="Batch not found" body="This batch is not in the CRM." />;
  const record = batch.data;

  return (
    <div className="space-y-4">
      <PageHeader title={record.name} subtitle={`${record.batchCode} · ${record.status} · ${record.timeZone}`} />
      <Card className="p-4 text-sm"><p>Instructor: {record.instructor || 'Not set'}</p><p>Start: {formatWhen(record.startDate)}</p><p>WhatsApp community: {typeof record.whatsappCommunityId === 'object' && record.whatsappCommunityId ? record.whatsappCommunityId.name : 'Not linked'}</p></Card>
      <Card className="p-4">
        <h2 className="mb-2 font-medium">Assigned students</h2>
        {record.students?.length ? record.students.map((student) => <Link key={student._id} className="block border-t border-stone-100 py-2 text-sm" to={`/students/${student._id}`}>{student.studentId} · {student.fullName}</Link>) : <p className="text-sm text-stone-500">No students are assigned.</p>}
        {can('batches.assign') ? <div className="mt-3 max-h-40 space-y-1 overflow-auto text-sm">{students.data?.data.map((student) => <label key={student._id} className="flex gap-2"><input type="checkbox" checked={picked.includes(student._id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, student._id] : current.filter((item) => item !== student._id))} />{student.fullName}</label>)}<Button className="mt-2" type="button" onClick={() => void api(`/api/batches/${id}/assign-students`, { method: 'POST', body: JSON.stringify({ studentIds: picked }) }).then(() => queryClient.invalidateQueries({ queryKey: ['batch', id] }))}>Assign selected</Button></div> : null}
      </Card>
      {can('communications.send') ? <Card className="space-y-3 p-4">
        <h2 className="font-medium">Batch notification</h2>
        <p className="text-sm text-stone-600">Class links and the WhatsApp invitation appear only when they are saved and valid. Sending queues one email per assigned student.</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void api<{ preview: { text: string } }>(`/api/batches/${id}/preview-email`).then((result) => setPreview(result.preview.text))}>Preview</Button>
          <Button type="button" onClick={() => void api(`/api/batches/${id}/notify`, { method: 'POST', body: JSON.stringify({ confirm: true }) }).then((result) => setMessage(`Queued. Reference ${JSON.stringify(result)}`)).catch((error) => setMessage(error instanceof ApiError ? error.message : 'Could not queue the notification.'))}>Send batch details</Button>
        </div>
        {preview ? <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs">{preview}</pre> : null}
        {message ? <Alert tone="emerald">{message}</Alert> : null}
      </Card> : null}
    </div>
  );
}

export function ClassesPage() {
  useTitle('Class calendar');
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<{ data: ClassItem[] }>('/api/classes') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api<{ data: Batch[] }>('/api/batches') });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/classes', { method: 'POST', body: JSON.stringify({
        title: form.get('title'), courseId: form.get('courseId') || undefined, batchId: form.get('batchId') || undefined,
        date: form.get('date'), startTime: form.get('startTime'), endTime: form.get('endTime'), timeZone: form.get('timeZone') || 'UTC',
        instructor: form.get('instructor'), meetingProvider: form.get('meetingProvider'), meetingUrl: form.get('meetingUrl') || undefined,
        description: form.get('description'), notifyAnnouncement: form.get('notifyAnnouncement') === 'on', notify24h: form.get('notify24h') === 'on', notify1h: form.get('notify1h') === 'on',
      }) });
      setParams({});
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The class could not be saved.');
    }
  }

  return (
    <div>
      <PageHeader title="Class calendar" subtitle="Paste the real meeting link. Empty links are left empty." actions={<Button type="button" onClick={() => setParams({ new: '1' })}>Schedule class</Button>} />
      {error ? <div className="mb-3"><Alert>{error}</Alert></div> : null}
      {params.get('new') === '1' ? <Card className="mb-4 p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
        <Field label="Title"><TextInput name="title" required /></Field>
        <Field label="Course"><Select name="courseId"><option value="">None</option>{courses.data?.data.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}</Select></Field>
        <Field label="Batch"><Select name="batchId"><option value="">None</option>{batches.data?.data.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}</Select></Field>
        <Field label="Date"><TextInput name="date" type="date" required /></Field>
        <Field label="Start"><TextInput name="startTime" type="time" required /></Field>
        <Field label="End"><TextInput name="endTime" type="time" required /></Field>
        <Field label="Time zone"><TextInput name="timeZone" defaultValue="UTC" /></Field>
        <Field label="Instructor"><TextInput name="instructor" /></Field>
        <Field label="Meeting provider"><Select name="meetingProvider"><option>Google Meet</option><option>Zoom</option><option>Microsoft Teams</option><option>Other</option></Select></Field>
        <Field label="Meeting URL"><TextInput name="meetingUrl" placeholder="https://" /></Field>
        <Field label="Description"><TextArea name="description" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyAnnouncement" /> Send announcement</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify24h" /> 24-hour reminder</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify1h" /> 1-hour reminder</label>
        <div><Button type="submit">Save class</Button></div>
      </form></Card> : null}
      {classes.isLoading ? <Spinner /> : classes.data?.data.length ? <div className="space-y-3">{classes.data.data.map((item) => <Card key={item._id} className="p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-medium">{item.title}</h2><Badge>{item.status}</Badge></div><p className="mt-1 text-stone-600">{item.date} {item.startTime}–{item.endTime} ({item.timeZone}) · {refName(item.batchId, 'No batch')}</p>{item.meetingUrl ? <a className="mt-2 inline-block text-emerald-800" href={item.meetingUrl} target="_blank" rel="noreferrer noopener">Open meeting link</a> : <p className="mt-2 text-stone-500">No meeting link configured.</p>}<div className="mt-2 flex gap-2"><Button type="button" variant="secondary" onClick={() => void api(`/api/classes/${item._id}/notify`, { method: 'POST', body: JSON.stringify({ type: 'cancellation' }) }).then(() => queryClient.invalidateQueries({ queryKey: ['classes'] }))}>Cancel and notify</Button></div></Card>)}</div> : <Empty title="No classes" body="Schedule a class when the date, time, and batch are known." />}
    </div>
  );
}

export function WhatsAppPage() {
  useTitle('WhatsApp communities');
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: ['whatsapp'], queryFn: () => api<{ data: WhatsAppCommunity[] }>('/api/whatsapp-communities') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api<{ data: Batch[] }>('/api/batches') });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<{ data: Course[] }>('/api/courses') });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/whatsapp-communities', { method: 'POST', body: JSON.stringify({ name: form.get('name'), invitationUrl: form.get('invitationUrl'), courseId: form.get('courseId') || undefined, batchId: form.get('batchId') || undefined, instructions: form.get('instructions'), expiresAt: form.get('expiresAt') ? new Date(String(form.get('expiresAt'))).toISOString() : undefined }) });
      event.currentTarget.reset();
      await queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The invitation could not be saved.');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="WhatsApp communities" subtitle="Store invitation links an administrator pastes. Students still choose whether to join." />
      {error ? <Alert>{error}</Alert> : null}
      <Card className="p-4"><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}>
        <Field label="Community name"><TextInput name="name" required /></Field>
        <Field label="Invitation URL" hint="https://chat.whatsapp.com/… or a WhatsApp channel URL"><TextInput name="invitationUrl" required /></Field>
        <Field label="Course"><Select name="courseId"><option value="">None</option>{courses.data?.data.map((course) => <option key={course._id} value={course._id}>{course.name}</option>)}</Select></Field>
        <Field label="Batch"><Select name="batchId"><option value="">None</option>{batches.data?.data.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}</Select></Field>
        <Field label="Expiry"><TextInput name="expiresAt" type="datetime-local" /></Field>
        <Field label="Instructions"><TextArea name="instructions" /></Field>
        <div><Button type="submit">Add invitation</Button></div>
      </form></Card>
      {items.data?.data.length ? items.data.data.map((item) => <Card key={item._id} className="p-4 text-sm"><div className="flex justify-between gap-3"><h2 className="font-medium">{item.name}</h2><Badge tone={item.status === 'active' ? 'emerald' : 'stone'}>{item.status}</Badge></div><p className="mt-2 break-all">{item.invitationUrl}</p><p className="mt-1 text-stone-500">{item.instructions}</p><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(item.invitationUrl).then(() => setCopied(item._id)).catch(() => setCopied(''))}>Copy invitation</Button><Button type="button" variant="secondary" onClick={() => void api(`/api/whatsapp-communities/${item._id}/send`, { method: 'POST', body: JSON.stringify({ confirm: true }) })}>Email assigned students</Button><Button type="button" variant="ghost" onClick={() => void api(`/api/whatsapp-communities/${item._id}`, { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) }).then(() => queryClient.invalidateQueries({ queryKey: ['whatsapp'] }))}>Mark revoked</Button></div>{copied === item._id ? <p className="mt-2 text-emerald-800">Invitation copied.</p> : null}</Card>) : <Empty title="No invitations" body="Add a WhatsApp invitation URL when the academy creates one." />}
    </div>
  );
}
