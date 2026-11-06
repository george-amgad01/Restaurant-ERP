import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Check, Lock, Mail, Pencil, Plus, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  inviteEmployee,
  listEmployees,
  listPermissions,
  listRolePermissions,
  listRoles,
  saveEmployeeDetails,
  setEmployeeActive,
  setEmployeeRole,
} from '@/services/employees.service';
import { errorMessage } from '@/lib/supabase';
import { cn, dateOnly, initials, money } from '@/lib/utils';
import type { Employee, Permission, Profile, Role } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';

type TeamMember = Profile & { employee?: Employee | null };

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { profile: me } = useAuth();
  const [tab, setTab] = useState('team');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [search, setSearch] = useState('');

  const teamQuery = useQuery({ queryKey: ['employees'], queryFn: listEmployees });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const permissionsQuery = useQuery({ queryKey: ['permissions'], queryFn: listPermissions });
  const matrixQuery = useQuery({ queryKey: ['role-permissions'], queryFn: listRolePermissions });

  const team = (teamQuery.data ?? []) as TeamMember[];
  const roles = rolesQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return team;
    return team.filter(
      (m) =>
        m.full_name.toLowerCase().includes(term) ||
        (m.email ?? '').toLowerCase().includes(term) ||
        (m.employee?.job_title ?? '').toLowerCase().includes(term),
    );
  }, [team, search]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['employees'] });
  }

  async function toggleActive(member: TeamMember) {
    try {
      await setEmployeeActive(member.id, !member.is_active);
      toast.success(member.is_active ? 'Account deactivated.' : 'Account reactivated.');
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function changeRole(member: TeamMember, roleCode: string) {
    try {
      await setEmployeeRole(member.id, roleCode);
      toast.success('Role updated. Changes apply on next sign-in.');
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (teamQuery.isLoading) return <PageLoader label="Loading team…" />;

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Accounts, roles and HR details. Permissions are enforced by the database."
        actions={<Button onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Invite employee</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'team', label: 'Team', count: team.length },
            { value: 'matrix', label: 'Permission matrix' },
          ]}
        />
        {tab === 'team' && (
          <div className="flex items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" className="w-52" />
          </div>
        )}
      </div>

      {tab === 'team' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Job title</th>
                  <th>Role</th>
                  <th>Hired</th>
                  <th>Salary</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={<Users className="h-8 w-8" />} title="No employees found" /></td></tr>
                ) : (
                  filtered.map((member) => (
                    <tr key={member.id} className={cn(!member.is_active && 'opacity-60')}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                            {initials(member.full_name)}
                          </div>
                          <div>
                            <p className="font-medium text-ink-800">
                              {member.full_name}
                              {member.id === me?.id && <span className="ml-2 text-[10px] font-normal text-ink-400">(you)</span>}
                            </p>
                            <p className="text-xs text-ink-400">{member.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-ink-600">{member.employee?.job_title || '—'}</td>
                      <td>
                        <Select
                          value={member.role?.code ?? ''}
                          disabled={member.id === me?.id}
                          onChange={(e) => void changeRole(member, e.target.value)}
                          className="h-8 w-36 text-xs"
                        >
                          <option value="">No role</option>
                          {roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
                        </Select>
                      </td>
                      <td className="text-xs text-ink-500">{member.employee?.hire_date ? dateOnly(member.employee.hire_date) : '—'}</td>
                      <td className="text-right tabular-nums text-ink-600">
                        {member.employee?.salary == null ? '—' : money(member.employee.salary)}
                      </td>
                      <td>
                        <Badge tone={member.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                          {member.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="HR details" onClick={() => setEditTarget(member)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={member.is_active ? 'Deactivate' : 'Reactivate'}
                            disabled={member.id === me?.id}
                            className={member.is_active ? 'text-rose-500' : 'text-emerald-600'}
                            onClick={() => void toggleActive(member)}
                          >
                            {member.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <PermissionMatrix
          roles={roles}
          permissions={permissionsQuery.data ?? []}
          links={matrixQuery.data ?? []}
          loading={permissionsQuery.isLoading || matrixQuery.isLoading}
        />
      )}

      {inviteOpen && (
        <InviteModal
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onSaved={async () => { setInviteOpen(false); await refresh(); }}
        />
      )}
      {editTarget && (
        <DetailsModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { setEditTarget(null); await refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Invite                                                                     */
/* -------------------------------------------------------------------------- */
function InviteModal({
  roles,
  onClose,
  onSaved,
}: {
  roles: Role[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState(roles.find((r) => r.code === 'waiter')?.code ?? roles[0]?.code ?? '');
  const [jobTitle, setJobTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedRole = roles.find((r) => r.code === roleCode);

  async function submit() {
    if (!fullName.trim() || !email.trim()) return toast.error('Name and email are required.');
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    if (!roleCode) return toast.error('Choose a role.');
    setBusy(true);
    try {
      await inviteEmployee({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role_code: roleCode,
        job_title: jobTitle.trim() || undefined,
      });
      toast.success('Employee account created.');
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite employee"
      subtitle="Creates a confirmed account and assigns a role immediately."
      size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Create account</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Temporary password" required hint="At least 8 characters.">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Role" required>
          <Select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Job title">
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Head chef" />
        </Field>
        {selectedRole && (
          <div className="sm:col-span-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
            <span className="font-medium text-ink-700">{selectedRole.name}</span>
            {selectedRole.description ? ` — ${selectedRole.description}` : ''}
          </div>
        )}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-ink-400">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Share the temporary password with the employee through a secure channel and ask them to change it.
      </p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* HR details                                                                 */
/* -------------------------------------------------------------------------- */
function DetailsModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Employee>>(member.employee ?? {});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await saveEmployeeDetails(member.id, {
        job_title: form.job_title || null,
        hire_date: form.hire_date || null,
        salary: form.salary == null || form.salary === ('' as unknown as number) ? null : Number(form.salary),
        national_id: form.national_id || null,
        emergency_contact: form.emergency_contact || null,
        notes: form.notes || null,
      });
      toast.success('Employee details saved.');
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`HR details — ${member.full_name}`}
      subtitle={member.email ?? undefined}
      size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save details</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title"><Input value={form.job_title ?? ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></Field>
        <Field label="Hire date"><Input type="date" value={form.hire_date ?? ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
        <Field label="Monthly salary"><Input type="number" min={0} step="0.01" value={form.salary ?? ''} onChange={(e) => setForm({ ...form, salary: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        <Field label="National ID"><Input value={form.national_id ?? ''} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></Field>
        <Field label="Emergency contact" className="sm:col-span-2"><Input value={form.emergency_contact ?? ''} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} placeholder="Name — phone" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-ink-400">
        <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Salary and national ID are visible only to roles with employee management access.
      </p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Permission matrix                                                          */
/* -------------------------------------------------------------------------- */
function PermissionMatrix({
  roles,
  permissions,
  links,
  loading,
}: {
  roles: Role[];
  permissions: Permission[];
  links: { role_id: string; permissions: { code: string } | null }[];
  loading: boolean;
}) {
  const byModule = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const list = map.get(permission.module) ?? [];
      list.push(permission);
      map.set(permission.module, list);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const link of links) {
      if (link.permissions?.code) set.add(`${link.role_id}:${link.permissions.code}`);
    }
    return set;
  }, [links]);

  if (loading) return <PageLoader label="Loading permission matrix…" />;

  return (
    <Card>
      <CardHeader
        title="Role permission matrix"
        subtitle="Database-enforced. Role changes take effect on next sign-in."
        actions={<ShieldCheck className="h-4 w-4 text-ink-400" />}
      />
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white">Permission</th>
              {roles.map((role) => <th key={role.id} className="text-center text-[11px]">{role.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {byModule.map(([module, list]) => (
              <Fragment key={module}>
                <tr className="bg-ink-50">
                  <td colSpan={roles.length + 1} className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {module}
                  </td>
                </tr>
                {list.map((permission) => (
                  <tr key={permission.id}>
                    <td className="sticky left-0 bg-white">
                      <p className="text-sm text-ink-800">{permission.description ?? permission.code}</p>
                      <p className="font-mono text-[10px] text-ink-400">{permission.code}</p>
                    </td>
                    {roles.map((role) => (
                      <td key={role.id} className="text-center">
                        {granted.has(`${role.id}:${permission.code}`) ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <span className="text-ink-200">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" /> Granted</span>
        <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-ink-300" /> Denied</span>
        <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> System roles are fixed; create custom roles in the database if needed.</span>
      </div>
    </Card>
  );
}
