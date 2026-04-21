import { MikroORM } from '@mikro-orm/postgresql';
import loadConfig from './mikro-orm.config';

let cached: Promise<MikroORM> | undefined;

export function getOrm(): Promise<MikroORM> {
  if (!cached) {
    cached = MikroORM.init(loadConfig());
  }
  return cached;
}

export async function closeOrm(): Promise<void> {
  if (cached) {
    const orm = await cached;
    await orm.close(true);
    cached = undefined;
  }
}

export { MikroORM };
