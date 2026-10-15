import { forwardRef, useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Bitvion CRM`;
  }, [title]);
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const { variant = 'primary', className = '', ...rest } = props;
  const styles = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' };
  return <button className={`${styles[variant]} ${className}`} {...rest} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className = '', ...props }, ref) {
  return <input ref={ref} className={`field ${className}`} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`field min-h-28 ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', ...props }, ref) {
  return <select ref={ref} className={`field ${className}`} {...props} />;
});

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'emerald' | 'amber' | 'red' | 'stone' | 'sky' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    stone: 'bg-stone-100 text-stone-700 ring-stone-200',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function integrationTone(status: string): 'emerald' | 'amber' | 'red' | 'stone' {
  if (status === 'verified') return 'emerald';
  if (status === 'error') return 'red';
  if (status === 'not_tested') return 'amber';
  return 'stone';
}

export function integrationLabel(status: string) {
  if (status === 'verified') return 'Verified';
  if (status === 'error') return 'Check failed';
  if (status === 'not_tested') return 'Not tested';
  return 'Not configured';
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-stone-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{body}</p>
    </div>
  );
}

export function Alert({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'amber' | 'emerald' }) {
  const tones = { red: 'border-red-200 bg-red-50 text-red-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" role="status" aria-label="Loading" /></div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-4 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose} type="button">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function refName(value: unknown, fallback = '—') {
  if (!value) return fallback;
  if (typeof value === 'string') return fallback;
  if (typeof value === 'object' && value && 'name' in value) return String((value as { name?: string }).name || fallback);
  return fallback;
}

export function formatWhen(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
