/**
 * Regenerate data/coverage.json from the current database.
 * Usage: npm run coverage:update
 */

import { createDatabase } from '../src/db.js';
import { writeFileSync } from 'fs';

const db = createDatabase();

const pests = db.get<{ c: number }>('SELECT count(*) as c FROM pests')!.c;
const treatments = db.get<{ c: number }>('SELECT count(*) as c FROM treatments')!.c;
const ipm_guidance = db.get<{ c: number }>('SELECT count(*) as c FROM ipm_guidance')!.c;
const symptoms = db.get<{ c: number }>('SELECT count(*) as c FROM symptoms')!.c;
const approved_products = db.get<{ c: number }>('SELECT count(*) as c FROM approved_products')!.c;
const fts = db.get<{ c: number }>('SELECT count(*) as c FROM search_index')!.c;
const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);

db.close();

const coverage = {
  mcp_name: 'UK Pest Management MCP',
  jurisdiction: 'GB',
  build_date: lastIngest?.value ?? new Date().toISOString().split('T')[0],
  pests,
  treatments,
  ipm_guidance,
  symptoms,
  approved_products,
  fts_entries: fts,
};

writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
console.log('Updated data/coverage.json:', coverage);
