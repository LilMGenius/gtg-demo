import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
await sql.query(await readFile(new URL('./migrations/0001_rank.sql', import.meta.url), 'utf8'));
console.log('rank migration PASS');
