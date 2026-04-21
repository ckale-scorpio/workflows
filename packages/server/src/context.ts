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
