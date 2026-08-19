import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, EmptyState, Spinner } from '../components/ui';

export function AuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => api.get<any[]>('/audit-log') });

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-h1 mb-1">Audit log</h1>
      <p className="text-sm text-text-muted mb-6">Immutable record of edits, approvals, exports, and logins. Retained 24 months.</p>
      {isLoading ? (
        <Spinner />
      ) : data?.length === 0 ? (
        <EmptyState title="No audit entries yet" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-caption uppercase text-text-muted text-left border-b border-border-subtle">
                <th className="py-3 px-4">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle hover:bg-bg-hover">
                  <td className="py-2.5 px-4 tabular text-text-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString('en-GB')}</td>
                  <td>{l.actorName}</td>
                  <td><span className="text-accent">{l.action}</span></td>
                  <td className="text-text-muted">{l.entityType}</td>
                  <td className="tabular text-text-muted">{l.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
