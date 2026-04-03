import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleGetTreatments } from '../../src/tools/get-treatments.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-treatments.db';

describe('get_treatments tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns treatments for septoria', () => {
    const result = handleGetTreatments(db, { pest_id: 'septoria-tritici' });
    expect(result).toHaveProperty('results_count', 2);
    const typed = result as { treatments: { approach: string }[] };
    const approaches = typed.treatments.map(t => t.approach);
    expect(approaches).toContain('chemical');
    expect(approaches).toContain('cultural');
  });

  test('filters by approach', () => {
    const result = handleGetTreatments(db, { pest_id: 'septoria-tritici', approach: 'chemical' });
    expect(result).toHaveProperty('results_count', 1);
    const typed = result as { treatments: { approach: string; active_substance: string }[] };
    expect(typed.treatments[0].approach).toBe('chemical');
    expect(typed.treatments[0].active_substance).toContain('prothioconazole');
  });

  test('returns empty for non-existent pest', () => {
    const result = handleGetTreatments(db, { pest_id: 'non-existent-pest' });
    expect(result).toHaveProperty('results_count', 0);
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleGetTreatments(db, { pest_id: 'septoria-tritici', jurisdiction: 'SE' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
