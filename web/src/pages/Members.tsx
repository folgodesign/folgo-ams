import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/Avatar';
import { Button, Card, Field, Input, Select, Spinner, EmptyState } from '../components/ui';

interface Member {
  id: string; name: string; email: string; avatarUrl: string | null; designation: string | null;
  role: string; teamId: string | null; teamName: string | null; status: string; employeeCode: string | null; timezone: string | null;
}

export function MembersPage() {
  const { isAdmin } = useAuth();
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['members'], queryFn: () => api.get<Member[]>('/users') });

  if (isLoading) return <Spinner />;
  const members = (data ?? []).filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-h1">Members ({data?.length ?? 0})</h1>
          <p className="text-sm text-text-muted mt-1">The agency directory.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="bg-bg-surface border border-border-subtle rounded-sm px-3 py-1.5 text-sm focus:border-accent" />
          {isAdmin && <Button onClick={() => setInviteOpen(true)}>+ Invite</Button>}
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members found" />
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {members.map((m) => (
            <Card key={m.id} className={`p-4 ${m.status === 'deactivated' ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3">
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-sm text-text-muted truncate">{m.designation ?? '—'}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => setEditing(m)} title="Edit member" className="text-sm text-text-muted hover:text-accent shrink-0">
                    Edit
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-border-subtle text-sm text-text-muted space-y-1">
                <div className="truncate">{m.email}</div>
                <div className="flex justify-between">
                  <span>{m.teamName ?? 'No team'}</span>
                  <span className="text-caption uppercase">{m.status === 'invited' ? 'Pending' : m.role.replace('_', ' ')}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditMemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api.get<{ id: string; name: string }[]>('/settings/teams') });
  const [form, setForm] = useState({
    name: member.name,
    designation: member.designation ?? '',
    role: member.role,
    teamId: member.teamId ?? '',
  });
  const [error, setError] = useState('');
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/users/${member.id}`, {
        name: form.name.trim(),
        designation: form.designation || undefined,
        role: form.role,
        teamId: form.teamId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['live'] });
      onClose();
    },
    onError: () => setError('Could not save. Please try again.'),
  });

  const deactivate = useMutation({
    mutationFn: () => api.del(`/users/${member.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
  });
  const reactivate = useMutation({
    mutationFn: () => api.post(`/users/${member.id}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 bg-bg-raised" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h2 mb-4">Edit {member.name.split(' ')[0]}</h3>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Designation"><Input value={form.designation} onChange={set('designation')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={form.role} onChange={set('role')}>
                <option value="employee">Employee</option>
                <option value="lead">Team Lead</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </Field>
            <Field label="Team">
              <Select value={form.teamId} onChange={set('teamId')}>
                <option value="">—</option>
                {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        {error && <div className="mt-4 text-sm text-[#F4713F]">{error}</div>}
        <div className="flex gap-2 mt-6">
          {member.status === 'deactivated' ? (
            <Button variant="outline" onClick={() => reactivate.mutate()}>Reactivate</Button>
          ) : (
            <Button variant="danger" onClick={() => deactivate.mutate()}>Deactivate</Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: () => api.get<{ id: string; name: string }[]>('/settings/teams') });
  const [form, setForm] = useState({ name: '', email: '', role: 'employee', teamId: '', designation: '' });
  const [link, setLink] = useState('');
  const invite = useMutation({
    mutationFn: () => api.post<{ activationLink: string }>('/users/invite', { ...form, teamId: form.teamId || undefined, designation: form.designation || undefined }),
    onSuccess: (r) => {
      setLink(r.activationLink);
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 bg-bg-raised" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h2 mb-4">Invite a team member</h3>
        {link ? (
          <div>
            <p className="text-sm text-text-secondary mb-2">Invite created. Share this activation link (normally emailed):</p>
            <div className="bg-bg-base rounded-sm p-3 text-sm text-accent break-all">{link}</div>
            <Button className="w-full mt-4" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Field label="Name"><Input value={form.name} onChange={set('name')} /></Field>
              <Field label="Work email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Designation"><Input value={form.designation} onChange={set('designation')} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <Select value={form.role} onChange={set('role')}>
                    <option value="employee">Employee</option>
                    <option value="lead">Team Lead</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
                <Field label="Team">
                  <Select value={form.teamId} onChange={set('teamId')}>
                    <option value="">—</option>
                    {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => invite.mutate()} disabled={invite.isPending || !form.name || !form.email}>
                {invite.isPending ? 'Inviting…' : 'Send invite'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
