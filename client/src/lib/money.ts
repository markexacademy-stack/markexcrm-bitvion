export function inr(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
}

export function inrCompact(value: number) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  if (abs >= 10000000) {
    const crore = amount / 10000000;
    return `₹${crore.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  }
  if (abs >= 100000) {
    const lakh = amount / 100000;
    return `₹${lakh.toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  }
  return inr(amount);
}

export function dayLabel(value?: string | null) {
  if (!value) return '—';
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}
