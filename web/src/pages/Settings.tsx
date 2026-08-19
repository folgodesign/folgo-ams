import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Field, Input, Spinner } from '../components/ui';

const TABS = ['Schedules', 'Holidays', 'Clients', 'Projects', 'Leave types', 'Teams'] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Schedules');
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-h1 mb-1">Settings</h1>
      <p className="text-sm text-text-muted mb-6">Policies, calendars, and the client/project lists that power task tagging.</p>
      <div className="flex gap-1 border-b border-border-subtle mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-accent text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Schedules' && <ListSection title="schedules" endpoint="/settings/schedules" columns={['name', 'startTime', 'endTime', 'requiredHours', 'graceMinutes']} fields={[{ k: 'name', label: 'Name' }, { k: 'startTime', label: 'Start (HH:MM)' }, { k: 'endTime', label: 'End (HH:MM)' }]} />}
      {tab === 'Holidays' && <ListSection title="holidays" endpoint="/settings/holidays" columns={['date', 'name', 'region']} fields={[{ k: 'date', label: 'Date (YYYY-MM-DD)' }, { k: 'name', label: 'Name' }, { k: 'region', label: 'Region' }]} />}
      {tab === 'Clients' && <ListSection title="clients" endpoint="/clients" columns={['name']} fields={[{ k: 'name', label: 'Client name' }]} />}
      {tab === 'Projects' && <ListSection title="projects" endpoint="/projects" columns={['name']} fields={[{ k: 'name', label: 'Project name' }]} />}
      {tab === 'Leave types' && <ListSection title="leave types" endpoint="/settings/leave-types" columns={['name', 'annualQuota']} fields={[{ k: 'name', label: 'Name' }, { k: 'annualQuota', label: 'Annual quota', type: 'number' }]} />}
      {tab === 'Teams' && <ListSection title="teams" endpoint="/settings/teams" columns={['name']} fields={[{ k: 'name', label: 'Team name' }]} />}
    </div>
  );
}

function ListSection({ title, endpoint, columns, fields }: { title: string; endpoint: string; columns: string[]; fields: { k: string; label: string; type?: string }[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({ queryKey: [endpoint], queryFn: () => api.get<any[]>(endpoint) });
  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) body[f.k] = f.type === 'number' ? Number(form[f.k] ?? 0) : form[f.k];
      return api.post(endpoint, body);
    },
    onSuccess: () => {
      setForm({});
      qc.invalidateQueries({ queryKey: [endpoint] });
    },
  });

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Card className="p-4 md:col-span-1 h-fit">
        <div className="text-caption uppercase text-text-muted mb-3">Add {title}</div>
        <div className="space-y-3">
          {fields.map((f) => (
            <Field key={f.k} label={f.label}>
              <Input type={f.type ?? 'text'} value={form[f.k] ?? ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Button className="w-full mt-4" onClick={() => create.mutate()} disabled={create.isPending}>Add</Button>
      </Card>

      <Card className="md:col-span-2 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-caption uppercase text-text-muted text-left border-b border-border-subtle">
                {columns.map((c) => <th key={c} className="py-3 px-4">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border-subtle">
                  {columns.map((c) => <td key={c} className="py-2.5 px-4">{String(row[c] ?? '—')}</td>)}
                </tr>
              ))}
              {data?.length === 0 && <tr><td colSpan={columns.length} className="py-8 text-center text-text-muted">None yet.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
