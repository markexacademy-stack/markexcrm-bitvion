import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api/client';
import { Alert, Button, Card, Empty, Field, PageHeader, Select, Spinner, useTitle } from '@/components/ui';
import { dayLabel, inr } from '@/lib/money';

interface Student {
  _id: string;
  fullName: string;
  gender: 'Male' | 'Female' | 'Other';
  place: string;
  email: string;
  phone?: string;
  amountCollected: number;
  pendingAmount: number;
  collectedDate?: string;
}

const empty = { fullName: '', gender: 'Male', place: '', email: '', phone: '', amountCollected: '', pendingAmount: '', collectedDate: '' };

export function StudentsPage() {
  useTitle('Students');
  const queryClient = useQueryClient();
  const students = useQuery({ queryKey: ['students'], queryFn: () => api<{ data: Student[] }>('/api/students?pageSize=100') });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        fullName: form.fullName,
        gender: form.gender,
        place: form.place,
        email: form.email,
        phone: form.phone,
        amountCollected: Number(form.amountCollected || 0),
        pendingAmount: Number(form.pendingAmount || 0),
        collectedDate: form.collectedDate || undefined,
        sendReceipt: true,
      };
      return editing
        ? api(`/api/students/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError('');
      setForm(empty);
      setEditing('');
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mail'] });
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'The student could not be saved.'),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  function edit(student: Student) {
    setEditing(student._id);
    setForm({
      fullName: student.fullName,
      gender: student.gender || 'Other',
      place: student.place || '',
      email: student.email,
      phone: student.phone || '',
      amountCollected: String(student.amountCollected || 0),
      pendingAmount: String(student.pendingAmount || 0),
      collectedDate: student.collectedDate ? student.collectedDate.slice(0, 10) : '',
    });
  }

  return (
    <div>
      <PageHeader title="Students" subtitle="Add the student, the amount collected, the pending amount, and the collected date. A receipt email is queued automatically." />
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <Card className="mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Name"><input className="field" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </Select>
          </Field>
          <Field label="Place"><input className="field" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} required /></Field>
          <Field label="Email"><input className="field" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required disabled={Boolean(editing)} /></Field>
          <Field label="Phone number"><input className="field" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></Field>
          <Field label="Amount collected (₹)"><input className="field" inputMode="decimal" value={form.amountCollected} onChange={(event) => setForm({ ...form, amountCollected: event.target.value })} required /></Field>
          <Field label="Pending amount (₹)"><input className="field" inputMode="decimal" value={form.pendingAmount} onChange={(event) => setForm({ ...form, pendingAmount: event.target.value })} required /></Field>
          <Field label="Collected date"><input className="field" type="date" value={form.collectedDate} onChange={(event) => setForm({ ...form, collectedDate: event.target.value })} /></Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Button type="submit" disabled={save.isPending} className="w-full sm:w-auto">{save.isPending ? 'Saving…' : editing ? 'Update student' : 'Add student'}</Button>
            {editing ? <button className="btn-secondary w-full sm:w-auto" type="button" onClick={() => { setEditing(''); setForm(empty); }}>Cancel</button> : null}
          </div>
        </form>
      </Card>
      {students.isLoading ? <Spinner /> : students.data?.data.length ? (
        <>
        <ul className="space-y-3 md:hidden">
          {students.data.data.map((student) => (
            <li key={student._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{student.fullName}</p>
                  <p className="text-xs text-stone-500">{student.gender} · {student.place || '—'}</p>
                </div>
                <button className="shrink-0 text-sm font-medium text-sky-700" type="button" onClick={() => edit(student)}>Edit</button>
              </div>
              <p className="mt-2 break-all text-sm">{student.email}</p>
              <p className="text-sm text-stone-600">{student.phone || '—'}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <p><span className="block text-xs text-stone-500">Collected</span>{inr(student.amountCollected)}</p>
                <p><span className="block text-xs text-stone-500">Pending</span>{inr(student.pendingAmount)}</p>
              </div>
              <p className="mt-2 text-xs text-stone-500">Collected date {dayLabel(student.collectedDate)}</p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-auto rounded-2xl border border-stone-200 bg-white md:block">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                {['Name', 'Gender', 'Place', 'Email', 'Phone', 'Collected', 'Pending', 'Collected date', ''].map((heading) => <th key={heading} className="px-3 py-3 font-medium">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.data.data.map((student) => (
                <tr key={student._id} className="border-t border-stone-100">
                  <td className="px-3 py-3">{student.fullName}</td>
                  <td className="px-3 py-3">{student.gender}</td>
                  <td className="px-3 py-3">{student.place || '—'}</td>
                  <td className="px-3 py-3">{student.email}</td>
                  <td className="px-3 py-3">{student.phone || '—'}</td>
                  <td className="px-3 py-3">{inr(student.amountCollected)}</td>
                  <td className="px-3 py-3">{inr(student.pendingAmount)}</td>
                  <td className="px-3 py-3">{dayLabel(student.collectedDate)}</td>
                  <td className="px-3 py-3"><button className="text-sky-700" type="button" onClick={() => edit(student)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : <Empty title="No students" body="Add a student to record the collected and pending amounts." />}
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button className="btn-secondary" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
