import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleSearchPests } from '../../src/tools/search-pests.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-search-pests.db';

describe('search_pests tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns results for septoria query', () => {
    const result = handleSearchPests(db, { query: 'septoria' });
    expect(result).toHaveProperty('results_count');
    expect((result as { results_count: number }).results_count).toBeGreaterThan(0);
  });

  test('returns results for wheat disease query', () => {
    const result = handleSearchPests(db, { query: 'wheat' });
    expect((result as { results_count: number }).results_count).toBeGreaterThan(0);
  });

  test('filters by pest_type', () => {
    const result = handleSearchPests(db, { query: 'grass weed', pest_type: 'weed' });
    const typed = result as { results: { pest_type: string }[] };
    for (const r of typed.results) {
      expect(r.pest_type).toBe('weed');
    }
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleSearchPests(db, { query: 'septoria', jurisdiction: 'FR' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
