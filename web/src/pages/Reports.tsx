import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Spinner } from '../components/ui';
import { fmtMinutes } from '../lib/format';

export function ReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: dash } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<any>('/reports/dashboard') });
  const { data: report, isLoading } = useQuery({ queryKey: ['monthly', month], queryFn: () => api.get<any>(`/reports/monthly?month=${month}`) });

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-h1">Reports</h1>
          <p className="text-sm text-text-muted mt-1">Attendance summaries and payroll handoff.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-bg-surface border border-border-subtle rounded-sm px-3 py-1.5 text-sm focus:border-accent" />
          <Button onClick={() => api.download(`/reports/export?type=monthly&month=${month}`, `folgo-monthly-${month}.csv`)}>Export CSV</Button>
        </div>
      </div>

      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Widget label="Working now" value={dash.workingNow} accent />
          <Widget label="Present today" value={dash.present} />
          <Widget label="Absent" value={dash.absent} />
          <Widget label="Late" value={dash.late} />
          <Widget label="On leave" value={dash.onLeave} />
        </div>
      )}

      {dash?.topClients?.length > 0 && (
        <Card className="p-5 mb-6">
          <div className="text-caption uppercase text-text-muted mb-3">Top clients by logged time (this month)</div>
          <div className="space-y-2">
            {dash.topClients.map((c: any) => {
              const max = Math.max(...dash.topClients.map((x: any) => x.hours), 1);
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{c.name}</span>
                  <div className="flex-1 h-2 bg-bg-base rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(c.hours / max) * 100}%` }} />
                  </div>
                  <span className="text-sm tabular text-text-muted w-16 text-right">{c.hours}h</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle text-caption uppercase text-text-muted">Monthly attendance summary — {month}</div>
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-caption uppercase text-text-muted text-left border-b border-border-subtle">
                <th className="py-3 px-4">Employee</th><th>Present</th><th>Late</th><th>Half-day</th><th>Absent</th><th>Leaves</th><th>Total</th><th>OT</th>
              </tr>
            </thead>
            <tbody>
              {report?.rows?.map((r: any) => (
                <tr key={r.userId} className="border-b border-border-subtle hover:bg-bg-hover">
                  <td className="py-2.5 px-4">{r.name}</td>
                  <td className="tabular">{r.present}</td>
                  <td className="tabular">{r.late}</td>
                  <td className="tabular">{r.halfDays}</td>
                  <td className="tabular">{r.absent}</td>
                  <td className="tabular">{r.leaves}</td>
                  <td className="tabular text-text-primary">{fmtMinutes(r.totalMinutes)}</td>
                  <td className="tabular text-status-focus">{r.overtimeMinutes ? fmtMinutes(r.overtimeMinutes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Widget({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-caption uppercase text-text-muted">{label}</div>
      <div className={`text-display tabular mt-1 ${accent ? 'text-accent' : ''}`}>{value}</div>
    </Card>
  );
}
