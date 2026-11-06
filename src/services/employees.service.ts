import { supabase } from '@/lib/supabase';
import type { Employee, Permission, Profile, Role } from '@/types';

export async function listRoles() {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function listPermissions() {
  const { data, error } = await supabase.from('permissions').select('*').order('module').order('code');
  if (error) throw error;
  return (data ?? []) as Permission[];
}

export async function listRolePermissions() {
  const { data, error } = await supabase.from('role_permissions').select('role_id, permissions(code)');
  if (error) throw error;
  return (data ?? []) as unknown as { role_id: string; permissions: { code: string } | null }[];
}

export async function listEmployees() {
  const [profilesRes, detailsRes] = await Promise.all([
    supabase.from('profiles').select('*, role:roles(id, code, name)').order('created_at'),
    supabase.from('employees').select('*'),
  ]);
  if (profilesRes.error) throw profilesRes.error;

  const details = new Map<string, Employee>(
    ((detailsRes.data ?? []) as Employee[]).map((e) => [e.profile_id, e]),
  );

  return ((profilesRes.data ?? []) as Profile[]).map((p) => ({
    ...p,
    employee: details.get(p.id) ?? null,
  }));
}

export async function setEmployeeRole(profileId: string, roleCode: string) {
  const { error } = await supabase.rpc('admin_set_employee_role', {
    p_profile_id: profileId,
    p_role_code: roleCode,
  });
  if (error) throw error;
}

export async function setEmployeeActive(profileId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_employee_active', {
    p_profile_id: profileId,
    p_active: active,
  });
  if (error) throw error;
}

export async function saveEmployeeDetails(
  profileId: string,
  patch: Partial<Employee>,
) {
  const { error } = await supabase.rpc('admin_upsert_employee', {
    p_profile_id: profileId,
    p_job_title: patch.job_title ?? null,
    p_hire_date: patch.hire_date ?? null,
    p_salary: patch.salary ?? null,
    p_national_id: patch.national_id ?? null,
    p_emergency_contact: patch.emergency_contact ?? null,
    p_notes: patch.notes ?? null,
  });
  if (error) throw error;
}

export async function inviteEmployee(input: {
  email: string;
  password: string;
  full_name: string;
  role_code: string;
  job_title?: string;
}) {
  const { data, error } = await supabase.functions.invoke('admin-invite-user', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { user_id: string };
}

export async function updateMyProfile(patch: { full_name?: string; phone?: string }) {
  const { error } = await supabase.rpc('update_my_profile', {
    p_full_name: patch.full_name ?? null,
    p_phone: patch.phone ?? null,
    p_avatar_url: null,
  });
  if (error) throw error;
}
