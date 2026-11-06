import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ChefHat, Lock, Mail, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isConfigured, errorMessage } from '@/lib/supabase';
import { Button, Field, Input, Spinner } from '@/components/ui';

export default function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) navigate('/setup', { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-100">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (session) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 shadow-lg">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">Restaurant ERP</p>
            <p className="text-xs text-ink-400">Integrated operations platform</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Every order, every ingredient, one system.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            POS, kitchen display, inventory, expenses, staff and AI reporting — connected by a single
            transactional database so the numbers always agree.
          </p>

          <div className="mt-8 grid gap-3">
            {[
              { icon: ChefHat, title: 'Live kitchen flow', text: 'Tickets move from POS to KDS in seconds.' },
              { icon: Sparkles, title: 'AI business reports', text: 'Daily analysis from your own data, permission-aware.' },
              { icon: Lock, title: 'Database-enforced rules', text: 'Totals, stock and permissions never rely on the browser.' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <f.icon className="mt-0.5 h-5 w-5 text-brand-400" />
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-ink-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-ink-500">
          React + Vite · Supabase · PostgreSQL · Gemini — deployable on Hostinger
        </p>
      </div>

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-500">Sign in with your staff account.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                />
              </div>
            </Field>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={busy} size="lg">
              Sign in
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-500">
            <p className="font-medium text-ink-700">First time here?</p>
            <p className="mt-1">
              Create the owner account in Supabase Auth, then run the promotion snippet in README.md.
              Staff accounts are created from the Employees module.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
