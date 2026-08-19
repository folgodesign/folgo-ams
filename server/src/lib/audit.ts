import { prisma } from './prisma.js';

/** PRD §4.10: immutable audit log. */
export async function audit(params: {
  orgId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      beforeJson: params.before === undefined ? null : JSON.stringify(params.before),
      afterJson: params.after === undefined ? null : JSON.stringify(params.after),
      ip: params.ip ?? null,
    },
  });
}
