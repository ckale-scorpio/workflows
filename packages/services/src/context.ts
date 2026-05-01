import { getOrm } from '@app/db/orm';
import type { EntityManager } from '@mikro-orm/postgresql';

export interface ServerContext {
  em: EntityManager;
}

export async function withServerContext<T>(fn: (ctx: ServerContext) => Promise<T>): Promise<T> {
  const orm = await getOrm();
  const em = orm.em.fork() as EntityManager;
  try {
    const result = await fn({ em });
    await em.flush();
    return result;
  } finally {
    em.clear();
  }
}

// Like withServerContext but wraps the callback in an explicit database transaction.
// Use this when you need PESSIMISTIC_WRITE row locks — the lock must be acquired inside
// the same transaction as the subsequent writes, or Postgres releases it immediately.
export async function withTransactionalContext<T>(
  fn: (ctx: ServerContext) => Promise<T>,
): Promise<T> {
  const orm = await getOrm();
  const em = orm.em.fork() as EntityManager;
  try {
    return await em.transactional((txEm) => fn({ em: txEm as EntityManager }));
  } finally {
    em.clear();
  }
}
