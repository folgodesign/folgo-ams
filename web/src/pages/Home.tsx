import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTick } from '../hooks/useTick';
import { fmtDuration, fmtMinutes, fmtTime, secondsSince } from '../lib/format';
import { SELECTABLE_STATUSES, statusMeta } from '../lib/status';
import { Button, Card, Input, Spinner, Badge } from '../components/ui';

interface Today {
  date: string;
  timezone: string;
  checkedIn: boolean;
  onBreak: boolean;
  session: { id: string; checkInAt: string; openBreakId: string | null } | null;
  status: string;
  workedMinutes: number;
  breakMinutes: number;
  firstCheckIn: string | null;
  currentTask: { id: string; title: string; seconds: number; client: string | null; project: string | null } | null;
  tasks: { id: string; title: string; state: string; seconds: number; client: string | null; project: string | null; startedAt: string; endedAt: string | null }[];
  assignedTasks: { id: string; title: string; note: string | null; client: string | null; project: string | null; assignedAt: string }[];
}

export function HomePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useTick(1000);
  const [taskText, setTaskText] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['today'], queryFn: () => api.get<Today>('/me/today'), refetchInterval: 20000 });
  const { data: suggestions } = useQuery({ queryKey: ['task-suggestions'], queryFn: () => api.get<{ title: string; carriedFrom: string | null }[]>('/me/tasks/suggestions') });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['task-suggestions'] });
  };

  const checkIn = useMutation({ mutationFn: (title?: string) => api.post('/me/check-in', { first_task_title: title }), onSuccess: invalidate });
  const startTask = useMutation({ mutationFn: (title: string) => api.post('/me/tasks', { title }), onSuccess: invalidate });
  const patchTask = useMutation({ mutationFn: (v: { id: string; state: string }) => api.patch(`/me/tasks/${v.id}`, { state: v.state }), onSuccess: invalidate });
  const setStatus = useMutation({ mutationFn: (status: string) => api.post('/me/status', { status }), onSuccess: invalidate });
  const startBreak = useMutation({ mutationFn: () => api.post('/me/breaks', { type: 'short' }), onSuccess: invalidate });
  const endBreak = useMutation({ mutationFn: (id: string) => api.patch(`/me/breaks/${id}`), onSuccess: invalidate });
  // Start an admin-assigned task; check in first if the day hasn't started.
  const startAssigned = useMutation({
    mutationFn: async (id: string) => {
      if (!data?.checkedIn) await api.post('/me/check-in', {});
      await api.patch(`/me/tasks/${id}`, { state: 'in_progress' });
    },
    onSuccess: invalidate,
  });

  if (isLoading || !data) return <Spinner />;

  const meta = statusMeta(data.status);
  const workedSeconds = data.firstCheckIn && data.checkedIn ? data.workedMinutes * 60 + secondsSince(data.firstCheckIn) % 60 : data.workedMinutes * 60;
  const liveWorked = data.checkedIn && data.firstCheckIn && !data.onBreak ? Math.floor((Date.now() - new Date(data.firstCheckIn).getTime()) / 1000) - data.breakMinutes * 60 : data.workedMinutes * 60;

  function submitTask() {
    const t = taskText.trim();
    if (!t) return;
    if (!data!.checkedIn) checkIn.mutate(t);
    else startTask.mutate(t);
    setTaskText('');
  }

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-h1">Good day, {user?.name.split(' ')[0]}</h1>
        <p className="text-text-muted text-sm mt-1">
          {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} · {data.timezone}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Primary check-in / timer card. */}
        <Card className="lg:col-span-2 p-6">
          {!data.checkedIn ? (
            <div className="flex flex-col items-center py-8">
              <p className="text-text-secondary mb-5">Ready to start your day?</p>
              <button
                onClick={() => checkIn.mutate(taskText.trim() || undefined)}
                disabled={checkIn.isPending}
                className="w-40 h-40 rounded-full bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white text-h2 font-bold flex items-center justify-center transition-transform hover:scale-[1.02] shadow-lg"
              >
                Check in
              </button>
              <p className="text-caption uppercase text-text-muted mt-5">One tap · under 15 seconds</p>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-caption uppercase text-text-muted mb-1">Worked today</div>
                  <div className="text-display tabular" style={{ color: meta.colour }}>{fmtDuration(Math.max(0, liveWorked))}</div>
                  <div className="text-sm text-text-muted mt-1">
                    Checked in {fmtTime(data.firstCheckIn, data.timezone)} · Break {fmtMinutes(data.breakMinutes)}
                  </div>
                </div>
                <Badge colour={meta.colour}>{meta.label}</Badge>
              </div>

              {/* Current task input. */}
              <div className="mt-6">
                <div className="text-caption uppercase text-text-muted mb-2">What are you working on?</div>
                <div className="flex gap-2">
                  <Input
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitTask()}
                    placeholder={data.currentTask ? 'Switch to a new task…' : 'Type a task, press Enter'}
                    maxLength={140}
                  />
                  <Button onClick={submitTask} disabled={!taskText.trim()}>Start</Button>
                </div>
                {suggestions && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {suggestions.slice(0, 5).map((s, i) => (
                      <button key={i} onClick={() => startTask.mutate(s.title)} className="rounded-sm px-2.5 py-1 text-sm border border-border-subtle text-text-secondary hover:bg-bg-hover">
                        {s.carriedFrom && <span className="text-accent mr-1">↻</span>}{s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {data.currentTask && (
                <Card className="mt-4 p-4 bg-bg-raised flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-caption uppercase text-status-working mb-0.5">In progress</div>
                    <div className="font-medium truncate">{data.currentTask.title}</div>
                    {(data.currentTask.client || data.currentTask.project) && (
                      <div className="text-sm text-text-muted truncate">
                        {data.currentTask.client}{data.currentTask.project ? ` · ${data.currentTask.project}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular text-h2" style={{ color: '#3DD68C' }}>{fmtDuration(data.currentTask.seconds)}</span>
                    <Button variant="outline" onClick={() => patchTask.mutate({ id: data.currentTask!.id, state: 'paused' })}>Pause</Button>
                    <Button onClick={() => patchTask.mutate({ id: data.currentTask!.id, state: 'completed' })}>✓ Complete</Button>
                  </div>
                </Card>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-6">
                {data.onBreak ? (
                  <Button variant="outline" onClick={() => endBreak.mutate(data.session!.openBreakId!)}>End break</Button>
                ) : (
                  <Button variant="outline" onClick={() => startBreak.mutate()}>Start break</Button>
                )}
                <Button variant="danger" onClick={() => setCheckoutOpen(true)}>Check out</Button>
              </div>
            </div>
          )}
        </Card>

        {/* Status selector + today's tasks. */}
        <div className="space-y-5">
          {data.assignedTasks.length > 0 && (
            <Card className="p-4 border-accent/40">
              <div className="text-caption uppercase text-accent mb-3">Assigned to you ({data.assignedTasks.length})</div>
              <ul className="space-y-3">
                {data.assignedTasks.map((t) => (
                  <li key={t.id} className="bg-bg-raised rounded-sm p-3">
                    <div className="text-sm font-medium">{t.title}</div>
                    {(t.client || t.project) && (
                      <div className="text-caption uppercase text-text-muted mt-0.5">{t.client}{t.project ? ` · ${t.project}` : ''}</div>
                    )}
                    {t.note && <div className="text-sm text-text-muted mt-1">{t.note}</div>}
                    <Button className="w-full mt-2" onClick={() => startAssigned.mutate(t.id)} disabled={startAssigned.isPending}>
                      Start task
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.checkedIn && (
            <Card className="p-4">
              <div className="text-caption uppercase text-text-muted mb-3">Set availability</div>
              <div className="grid grid-cols-2 gap-2">
                {SELECTABLE_STATUSES.map((s) => {
                  const m = statusMeta(s);
                  const active = data.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => (s === 'ON_BREAK' ? startBreak.mutate() : setStatus.mutate(s))}
                      className={`flex items-center gap-2 rounded-sm px-3 py-2 text-sm border transition-colors ${active ? 'border-transparent' : 'border-border-subtle hover:bg-bg-hover'}`}
                      style={active ? { background: `${m.colour}22`, color: m.colour } : {}}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.colour }} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="text-caption uppercase text-text-muted mb-3">Today's timeline</div>
            {data.tasks.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">No tasks logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.tasks.map((t) => {
                  const tm = { in_progress: '#3DD68C', paused: '#F5C542', completed: '#B5ADA6', carried_over: '#6B8A9E', cancelled: '#7D7570' }[t.state] ?? '#7D7570';
                  return (
                    <li key={t.id} className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: tm }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{t.title}</div>
                        <div className="text-caption uppercase text-text-muted">{t.state.replace('_', ' ')}</div>
                      </div>
                      <span className="tabular text-sm text-text-secondary shrink-0">{fmtDuration(t.seconds)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {checkoutOpen && <CheckoutModal today={data} onClose={() => setCheckoutOpen(false)} onDone={invalidate} />}
    </div>
  );
}

function CheckoutModal({ today, onClose, onDone }: { today: Today; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const checkout = useMutation({
    mutationFn: () => api.post('/me/check-out', { note: note || undefined }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const openTasks = today.tasks.filter((t) => t.state === 'in_progress' || t.state === 'paused');

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 bg-bg-raised" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h2 mb-4">End of day</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-bg-base rounded-sm p-3">
            <div className="text-caption uppercase text-text-muted">Worked</div>
            <div className="text-h2 tabular text-status-working">{fmtMinutes(today.workedMinutes)}</div>
          </div>
          <div className="bg-bg-base rounded-sm p-3">
            <div className="text-caption uppercase text-text-muted">Break</div>
            <div className="text-h2 tabular text-status-break">{fmtMinutes(today.breakMinutes)}</div>
          </div>
        </div>
        {openTasks.length > 0 && (
          <p className="text-sm text-text-muted mb-3">{openTasks.length} open task{openTasks.length > 1 ? 's' : ''} will be carried over to tomorrow.</p>
        )}
        <label className="text-caption uppercase text-text-muted block mb-1.5">End-of-day note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full bg-bg-base border border-border-strong rounded-sm px-3 py-2 text-body focus:border-accent" placeholder="Anything worth recording about today?" />
        <div className="flex gap-2 mt-5">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="flex-1" onClick={() => checkout.mutate()} disabled={checkout.isPending}>Confirm check out</Button>
        </div>
      </Card>
    </div>
  );
}
