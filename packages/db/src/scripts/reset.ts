import { execSync } from 'node:child_process';
import { getOrm } from '../orm';

async function reset() {
  const orm = await getOrm();
  const conn = orm.em.getConnection();

  const tables = await conn.execute<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );

  if (tables.length > 0) {
    const list = tables.map((r) => `"${r.tablename}"`).join(', ');
    await conn.execute(`DROP TABLE IF EXISTS ${list} CASCADE`);
    console.log(`Dropped tables: ${list}`);
  }

  const enums = await conn.execute<{ typname: string }[]>(
    `SELECT typname FROM pg_type
     WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
     AND typtype = 'e'`,
  );

  if (enums.length > 0) {
    for (const { typname } of enums) {
      await conn.execute(`DROP TYPE IF EXISTS "${typname}" CASCADE`);
    }
    console.log(`Dropped enums: ${enums.map((e) => e.typname).join(', ')}`);
  }

  if (tables.length === 0 && enums.length === 0) {
    console.log('Nothing to drop.');
  }

  await orm.close();

  const pkgRoot = new URL('../..', import.meta.url).pathname;
  execSync('tsx ./node_modules/@mikro-orm/cli/cli.js migration:up', {
    stdio: 'inherit',
    cwd: pkgRoot,
    env: process.env,
  });
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
