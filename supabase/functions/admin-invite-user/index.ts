// supabase/functions/admin-invite-user/index.ts
// Creates a staff account. Runs with the service role server-side only,
// after verifying that the CALLER has employees.manage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

  const { data: allowed } = await caller.rpc('has_permission_public', {
    p_permission: 'employees.manage',
  });
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Server is not configured for user creation' }, 503);

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    role_code?: string;
    job_title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.full_name ?? '').trim();
  const roleCode = String(body.role_code ?? 'cashier');

  if (!email.includes('@')) return json({ error: 'Valid email required' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
  if (!fullName) return json({ error: 'Full name required' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: role } = await admin.from('roles').select('id, code').eq('code', roleCode).maybeSingle();
  if (!role) return json({ error: 'Invalid role' }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: roleCode },
  });
  if (createError) return json({ error: createError.message }, 400);

  const userId = created.user?.id;
  if (!userId) return json({ error: 'User creation failed' }, 500);

  // The auth trigger creates the profile; make the role explicit in case of races.
  await admin.from('profiles').update({ role_id: role.id, full_name: fullName, is_active: true }).eq('id', userId);

  if (body.job_title) {
    await admin.from('employees').upsert(
      { profile_id: userId, job_title: body.job_title },
      { onConflict: 'profile_id' },
    );
  }

  return json({ user_id: userId });
});
