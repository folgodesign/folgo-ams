import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Spinner } from '../components/ui';
import { classificationMeta } from '../lib/status';
import { fmtDate, fmtMinutes, fmtTime } from '../lib/format';

interface TimesheetData {
  month: string;
  days: any[];
  totals: { workedMinutes: number; overtimeMinutes: number; present: number; late: number; leaves: number };
}

export function TimesheetPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useQuery({ queryKey: ['timesheet', month], queryFn: () => api.get<TimesheetData>(`/me/timesheet?month=${month}`) });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-h1">My timesheet</h1>
          <p className="text-sm text-text-muted mt-1">Your hours, as recorded. Admin edits are marked.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-bg-surface border border-border-subtle rounded-sm px-3 py-1.5 text-sm focus:border-accent" />
          <button onClick={() => api.download(`/me/export`, 'my-folgo-data.json')} className="text-sm text-text-secondary hover:text-accent px-3 py-1.5">Export my data</button>
        </div>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Days present" value={String(data.totals.present)} />
            <Stat label="Total hours" value={fmtMinutes(data.totals.workedMinutes)} accent />
            <Stat label="Late arrivals" value={String(data.totals.late)} />
            <Stat label="Leaves taken" value={String(data.totals.leaves)} />
          </div>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-caption uppercase text-text-muted text-left border-b border-border-subtle">
                  <th className="py-3 px-4">Date</th><th>In</th><th>Out</th><th>Break</th><th>Net</th><th>OT</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.days.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-text-muted">No records this month.</td></tr>
                ) : (
                  data.days.map((d) => {
                    const c = classificationMeta(d.classification);
                    return (
                      <tr key={d.id} className="border-b border-border-subtle hover:bg-bg-hover">
                        <td className="py-2.5 px-4">{fmtDate(d.date)}</td>
                        <td className="tabular">{fmtTime(d.firstCheckIn)}</td>
                        <td className="tabular">{fmtTime(d.lastCheckOut)}</td>
                        <td className="tabular">{fmtMinutes(d.totalBreakMinutes)}</td>
                        <td className="tabular text-text-primary">{fmtMinutes(d.totalWorkedMinutes)}</td>
                        <td className="tabular text-status-focus">{d.overtimeMinutes ? fmtMinutes(d.overtimeMinutes) : '—'}</td>
                        <td><span style={{ color: c.colour }}>{c.label}</span>{d.isEdited && <span title="Edited by admin" className="text-accent ml-1">✎</span>}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-caption uppercase text-text-muted">{label}</div>
      <div className={`text-h1 tabular mt-1 ${accent ? 'text-accent' : ''}`}>{value}</div>
    </Card>
  );
}
