// Lets harness.mjs run on a REAL PostgreSQL server instead of PGlite. It exports a class named PGlite with the
// three methods the harness uses (exec, query, close). Every instance creates its own throw-away database
// (and drops it, plus the Supabase-like cluster roles, on close()).
// Usage:  PG_MODULE_DIR=<dir that has node_modules/pg> PGPORT=54417 HARNESS_OUT=harness-output-pg17.txt \
//         node harness.mjs <this file> <plan/sql dir> <db snapshot dir>
// The server must accept the 'postgres' superuser on 127.0.0.1 without a password (a local test cluster).
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const pg = require('pg');
pg.types.setTypeParser(20, (v) => Number(v));          // int8: PGlite returns numbers too

const CONN = { host: '127.0.0.1', port: +(process.env.PGPORT || 5432), user: 'postgres' };
const ROLES = ['anon', 'authenticated', 'service_role', 'supabase_auth_admin', 'migrator'];
let counter = 0;

async function admin(fn) {
  const c = new pg.Client({ ...CONN, database: 'postgres' });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

export class PGlite {
  constructor() {
    this.name = `bt_${process.pid}_${++counter}`;
    this.ready = this._open();
  }
  async _open() {
    await admin(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${this.name}`);
      for (const r of ROLES) await c.query(`DROP ROLE IF EXISTS ${r}`);
      await c.query(`CREATE DATABASE ${this.name}`);
    });
    this.client = new pg.Client({ ...CONN, database: this.name });
    await this.client.connect();
  }
  async exec(sql) { await this.ready; const r = await this.client.query(sql); return Array.isArray(r) ? r : [r]; }
  async query(sql, params) { await this.ready; const r = await this.client.query(sql, params); return { rows: r.rows }; }
  async close() {
    await this.ready;
    await this.client.end();
    await admin(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${this.name} WITH (FORCE)`);
      for (const r of ROLES) await c.query(`DROP ROLE IF EXISTS ${r}`);
    });
  }
}
