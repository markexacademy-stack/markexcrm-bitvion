import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Alert, Button, useTitle } from '@/components/ui';

export function LoginPage() {
  useTitle('Sign in');
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="bg-[#05070d] px-5 py-6 text-white lg:flex lg:flex-col lg:justify-between lg:px-8 lg:py-10">
        <div className="flex items-center gap-4">
          <img src="/bitvion-logo.jpg" alt="Bitvion Groups" className="h-16 w-16 rounded-full object-cover lg:h-28 lg:w-28" />
          <div className="lg:hidden">
            <p className="text-sm font-semibold tracking-[0.16em]">BITVION CRM</p>
            <p className="mt-1 text-sm text-stone-300">Building businesses. Creating growth.</p>
          </div>
        </div>
        <div className="mt-10 hidden lg:block">
          <p className="font-serif text-4xl leading-tight">Building businesses. Creating growth.</p>
          <p className="mt-4 max-w-md text-sm text-stone-300">Student records, collected and pending amounts, spending, and payment emails in one Bitvion CRM.</p>
        </div>
        <p className="mt-8 hidden text-xs tracking-[0.18em] text-sky-300 lg:block">BITVION CRM</p>
      </section>
      <section className="flex items-center justify-center px-4 py-8 sm:px-6 sm:py-16">
        <form onSubmit={(event) => void onSubmit(event)} className="w-full max-w-md space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-stone-600">Use the administrator account created for this CRM.</p>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <label className="block"><span className="label">Username</span><input className="field" type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="block"><span className="label">Password</span><input className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <Button type="submit" disabled={pending} className="w-full">{pending ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  useTitle('Not found');
  return <div className="mx-auto max-w-lg py-20 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-stone-600">That page is not part of Bitvion CRM.</p></div>;
}
