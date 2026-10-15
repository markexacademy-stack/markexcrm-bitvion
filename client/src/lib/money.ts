export function inr(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
}

export function dayLabel(value?: string | null) {
  if (!value) return '—';
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}
