import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { entities } from './entities';

export default function loadConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  return defineConfig({
    clientUrl: databaseUrl,
    entities,
    extensions: [Migrator],
    migrations: {
      path: './migrations',
      pathTs: './migrations',
      emit: 'ts',
      snapshot: false,
    },
    debug: process.env.MIKRO_ORM_DEBUG === '1',
    forceUtcTimezone: true,
    allowGlobalContext: false,
  });
}
