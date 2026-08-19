import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { fmtTime } from '../lib/format';

export function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['approvals'], queryFn: () => api.get<any>('/approvals') });
  const decideLeave = useMutation({ mutationFn: (v: { id: string; decision: string }) => api.post(`/approvals/leave/${v.id}`, { decision: v.decision }), onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }) });
  const decideReg = useMutation({ mutationFn: (v: { id: string; decision: string }) => api.post(`/approvals/regularisations/${v.id}`, { decision: v.decision }), onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }) });

  if (isLoading) return <Spinner />;
  const empty = (data?.leave?.length ?? 0) === 0 && (data?.regularisations?.length ?? 0) === 0;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 className="text-h1 mb-1">Approvals</h1>
      <p className="text-sm text-text-muted mb-6">Leave and attendance-correction requests awaiting your decision.</p>

      {empty ? (
        <EmptyState title="Inbox zero" hint="No pending requests." />
      ) : (
        <div className="space-y-6">
          {data.leave.length > 0 && (
            <section>
              <div className="text-caption uppercase text-text-muted mb-2">Leave requests</div>
              <div className="space-y-3">
                {data.leave.map((l: any) => (
                  <Card key={l.id} className="p-4 flex items-center gap-3">
                    <Avatar name={l.user.name} avatarUrl={l.user.avatarUrl} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm"><span className="font-medium">{l.user.name}</span> · {l.leaveType.name}</div>
                      <div className="text-caption uppercase text-text-muted">{l.startDate} → {l.endDate}{l.isHalfDay ? ' · half day' : ''}{l.reason ? ` · ${l.reason}` : ''}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => decideLeave.mutate({ id: l.id, decision: 'rejected' })}>Reject</Button>
                      <Button onClick={() => decideLeave.mutate({ id: l.id, decision: 'approved' })}>Approve</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {data.regularisations.length > 0 && (
            <section>
              <div className="text-caption uppercase text-text-muted mb-2">Regularisation requests</div>
              <div className="space-y-3">
                {data.regularisations.map((r: any) => (
                  <Card key={r.id} className="p-4 flex items-center gap-3">
                    <Avatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm"><span className="font-medium">{r.user.name}</span> · {r.date}</div>
                      <div className="text-caption uppercase text-text-muted">
                        {r.proposedCheckIn ? `In ${fmtTime(r.proposedCheckIn)}` : ''} {r.proposedCheckOut ? `Out ${fmtTime(r.proposedCheckOut)}` : ''} · {r.reason}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => decideReg.mutate({ id: r.id, decision: 'rejected' })}>Reject</Button>
                      <Button onClick={() => decideReg.mutate({ id: r.id, decision: 'approved' })}>Approve</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
