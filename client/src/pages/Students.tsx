import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  totalFee?: number;
  amountCollected: number;
  pendingAmount: number;
  collectedDate?: string;
}

const empty = {
  fullName: '',
  gender: 'Male',
  place: '',
  email: '',
  phone: '',
  totalFee: '',
  amountCollected: '',
  collectedDate: '',
  sendReceipt: true,
};

function moneyValue(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function studentFee(student: Student) {
  if (student.totalFee && student.totalFee > 0) return student.totalFee;
  return Number(student.amountCollected || 0) + Number(student.pendingAmount || 0);
}

export function StudentsPage() {
  useTitle('Students');
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const students = useQuery({ queryKey: ['students'], queryFn: () => api<{ data: Student[] }>('/api/students?pageSize=100') });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const balance = useMemo(() => {
    const total = moneyValue(form.totalFee);
    const paid = moneyValue(form.amountCollected);
    return Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);
  }, [form.totalFee, form.amountCollected]);

  useEffect(() => {
    if (!editing) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editing]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['students'] });
    await queryClient.invalidateQueries({ queryKey: ['overview'] });
    await queryClient.invalidateQueries({ queryKey: ['mail'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const totalFee = moneyValue(form.totalFee);
      const amountCollected = moneyValue(form.amountCollected);
      if (amountCollected > totalFee) {
        throw new ApiError(400, 'Amount paid cannot be more than the total fee.');
      }
      const payload = {
        fullName: form.fullName,
        gender: form.gender,
        place: form.place,
        email: form.email,
        phone: form.phone,
        totalFee,
        amountCollected,
        collectedDate: form.collectedDate || undefined,
        sendReceipt: form.sendReceipt,
      };
      return editing
        ? api(`/api/students/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async (saved) => {
      const result = saved as { receiptSent?: boolean; receiptError?: string };
      const wasEditing = Boolean(editing);
      setEditing('');
      setForm(empty);
      if (result.receiptSent) {
        setError('');
        setNotice(wasEditing
          ? 'Student updated. Gmail accepted the payment receipt.'
          : 'Student saved. Gmail accepted the welcome and payment receipt.');
      } else if (result.receiptError) {
        setNotice(wasEditing ? 'Student updated, but the receipt email failed.' : 'Student saved, but the receipt email failed.');
        setError(result.receiptError);
      } else {
        setError('');
        setNotice(wasEditing ? 'Student updated.' : 'Student saved.');
      }
      await refresh();
    },
    onError: (reason) => {
      setNotice('');
      setError(reason instanceof ApiError ? reason.message : 'The student could not be saved.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/students/${id}`, { method: 'DELETE' }),
    onSuccess: async (_result, id) => {
      if (editing === id) {
        setEditing('');
        setForm(empty);
      }
      setError('');
      setNotice('Student deleted. Their fee, paid amount, and balance are removed from the dashboard.');
      await refresh();
    },
    onError: (reason) => {
      setNotice('');
      setError(reason instanceof ApiError ? reason.message : 'The student could not be deleted.');
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (moneyValue(form.amountCollected) > moneyValue(form.totalFee)) {
      setError('Amount paid cannot be more than the total fee.');
      return;
    }
    save.mutate();
  }

  function edit(student: Student) {
    setError('');
    setNotice('');
    setEditing(student._id);
    setForm({
      fullName: student.fullName,
      gender: student.gender || 'Other',
      place: student.place || '',
      email: student.email,
      phone: student.phone || '',
      totalFee: String(studentFee(student) || 0),
      amountCollected: String(student.amountCollected || 0),
      collectedDate: student.collectedDate ? student.collectedDate.slice(0, 10) : '',
      sendReceipt: false,
    });
  }

  function cancelEdit() {
    setEditing('');
    setForm(empty);
    setError('');
    setNotice('');
  }

  function onDelete(student: Student) {
    const confirmed = window.confirm(`Delete ${student.fullName}? Their fee, paid amount, and balance will be removed.`);
    if (confirmed) remove.mutate(student._id);
  }

  return (
    <div>
      <PageHeader title="Students" subtitle="Enter the total fee and amount paid. Balance is calculated automatically. Edit or delete any student from the list." />
      {notice ? <div className="mb-4"><Alert tone="emerald">{notice}</Alert></div> : null}
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{editing ? 'Edit student' : 'Add student'}</h2>
          {editing ? <p className="text-sm text-sky-700">Editing selected student. Balance updates when you change the paid amount.</p> : null}
        </div>
        <form ref={formRef} className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Name"><input className="field" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </Select>
          </Field>
          <Field label="Place"><input className="field" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} required /></Field>
          <Field label="Email"><input className="field" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Phone number"><input className="field" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></Field>
          <Field label="Total fee (₹)" hint="Full course fee for this student.">
            <input className="field" inputMode="decimal" value={form.totalFee} onChange={(event) => setForm({ ...form, totalFee: event.target.value })} required />
          </Field>
          <Field label="Amount paid (₹)" hint="Enter what the student has paid so far.">
            <input className="field" inputMode="decimal" value={form.amountCollected} onChange={(event) => setForm({ ...form, amountCollected: event.target.value })} required />
          </Field>
          <Field label="Balance amount (₹)" hint="Set automatically from total fee minus amount paid.">
            <input className="field bg-stone-50" value={String(balance)} readOnly tabIndex={-1} />
          </Field>
          <Field label="Collected date"><input className="field" type="date" value={form.collectedDate} onChange={(event) => setForm({ ...form, collectedDate: event.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-stone-700 md:col-span-2">
            <input type="checkbox" checked={form.sendReceipt} onChange={(event) => setForm({ ...form, sendReceipt: event.target.checked })} />
            {editing ? 'Send updated payment receipt email' : 'Send welcome and payment receipt email'}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end md:col-span-2">
            <Button type="submit" disabled={save.isPending || remove.isPending} className="w-full sm:w-auto">
              {save.isPending ? (editing ? 'Updating…' : 'Saving…') : editing ? 'Update student' : 'Add student'}
            </Button>
            {editing ? <button className="btn-secondary w-full sm:w-auto" type="button" onClick={cancelEdit}>Cancel</button> : null}
          </div>
        </form>
      </Card>
      {students.isLoading ? <Spinner /> : students.data?.data.length ? (
        <>
          <ul className="space-y-3 md:hidden">
            {students.data.data.map((student) => (
              <li key={student._id} className={`card p-4 ${editing === student._id ? 'ring-2 ring-sky-300' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{student.fullName}</p>
                    <p className="text-xs text-stone-500">{student.gender} · {student.place || '—'}</p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button className="text-sm font-medium text-sky-700" type="button" onClick={() => edit(student)}>Edit</button>
                    <button className="text-sm font-medium text-red-700" type="button" onClick={() => onDelete(student)} disabled={remove.isPending}>Delete</button>
                  </div>
                </div>
                <p className="mt-2 break-all text-sm">{student.email}</p>
                <p className="text-sm text-stone-600">{student.phone || '—'}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <p><span className="block text-xs text-stone-500">Total fee</span>{inr(studentFee(student))}</p>
                  <p><span className="block text-xs text-stone-500">Paid</span>{inr(student.amountCollected)}</p>
                  <p><span className="block text-xs text-stone-500">Balance</span>{inr(student.pendingAmount)}</p>
                </div>
                <p className="mt-2 text-xs text-stone-500">Collected date {dayLabel(student.collectedDate)}</p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-auto rounded-2xl border border-stone-200 bg-white md:block">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  {['Name', 'Gender', 'Place', 'Email', 'Phone', 'Total fee', 'Paid', 'Balance', 'Collected date', ''].map((heading) => (
                    <th key={heading || 'actions'} className="px-3 py-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.data.data.map((student) => (
                  <tr key={student._id} className={`border-t border-stone-100 ${editing === student._id ? 'bg-sky-50/60' : ''}`}>
                    <td className="px-3 py-3">{student.fullName}</td>
                    <td className="px-3 py-3">{student.gender}</td>
                    <td className="px-3 py-3">{student.place || '—'}</td>
                    <td className="px-3 py-3">{student.email}</td>
                    <td className="px-3 py-3">{student.phone || '—'}</td>
                    <td className="px-3 py-3">{inr(studentFee(student))}</td>
                    <td className="px-3 py-3">{inr(student.amountCollected)}</td>
                    <td className="px-3 py-3">{inr(student.pendingAmount)}</td>
                    <td className="px-3 py-3">{dayLabel(student.collectedDate)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button className="mr-3 text-sky-700" type="button" onClick={() => edit(student)}>Edit</button>
                      <button className="text-red-700" type="button" onClick={() => onDelete(student)} disabled={remove.isPending}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <Empty title="No students" body="Add a student with the total fee and amount paid. Balance is calculated for you." />}
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
