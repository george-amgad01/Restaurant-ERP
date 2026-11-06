import { Database, KeyRound, Terminal, UtensilsCrossed } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-ink-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-900">Restaurant ERP setup</h1>
            <p className="text-sm text-ink-500">Connect your Supabase project to start.</p>
          </div>
        </div>

        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Database className="h-4 w-4 text-brand-600" /> 1. Configure the environment
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Copy <code className="rounded bg-ink-100 px-1">.env.example</code> to{' '}
            <code className="rounded bg-ink-100 px-1">.env</code> and fill in your project URL and anon key
            (Supabase → Project Settings → API). Only public keys belong here.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs text-ink-100">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}</pre>

          <h2 className="mt-7 flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Terminal className="h-4 w-4 text-brand-600" /> 2. Apply the database
          </h2>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs text-ink-100">{`npx supabase login
npx supabase link --project-ref <your-ref>
npx supabase db push`}</pre>
          <p className="mt-2 text-xs text-ink-400">
            Then open <b>Supabase → SQL Editor</b> and run{' '}
            <code className="rounded bg-ink-100 px-1">supabase/seed.sql</code> (reference data + demo menu).
            Alternatively paste the migrations into the SQL editor in order, then the seed file.
          </p>

          <h2 className="mt-7 flex items-center gap-2 text-sm font-semibold text-ink-800">
            <KeyRound className="h-4 w-4 text-brand-600" /> 3. Create the owner
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            Create a user in Supabase Auth, then promote it:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs text-ink-100">{`update public.profiles
set role_id = (select id from public.roles where code = 'owner')
where email = 'owner@restaurant.com';`}</pre>

          <h2 className="mt-7 text-sm font-semibold text-ink-800">4. Deploy the Edge Functions</h2>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs text-ink-100">{`npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.0-flash
npx supabase functions deploy ai-assistant ai-daily-report admin-invite-user`}</pre>
        </Card>

        <div className="mt-6 flex justify-center">
          <Button onClick={() => window.location.reload()}>Reload after configuring</Button>
        </div>
      </div>
    </div>
  );
}
