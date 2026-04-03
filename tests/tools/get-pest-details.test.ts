import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleGetPestDetails } from '../../src/tools/get-pest-details.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-pest-details.db';

describe('get_pest_details tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns full pest profile for septoria', () => {
    const result = handleGetPestDetails(db, { pest_id: 'septoria-tritici' });
    expect(result).toHaveProperty('name', 'Septoria Tritici Blotch');
    expect(result).toHaveProperty('pest_type', 'disease');
    const typed = result as { common_names: string[]; crops_affected: string[]; symptoms: unknown[] };
    expect(typed.common_names).toBeInstanceOf(Array);
    expect(typed.common_names).toContain('Septoria leaf blotch');
    expect(typed.crops_affected).toContain('wheat');
    expect(typed.symptoms.length).toBe(3);
  });

  test('parses JSON arrays in common_names', () => {
    const result = handleGetPestDetails(db, { pest_id: 'blackgrass' });
    const typed = result as { common_names: string[] };
    expect(typed.common_names).toEqual(['Slender meadow foxtail']);
  });

  test('returns not_found for unknown pest', () => {
    const result = handleGetPestDetails(db, { pest_id: 'purple-plague' });
    expect(result).toHaveProperty('error', 'not_found');
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleGetPestDetails(db, { pest_id: 'septoria-tritici', jurisdiction: 'DE' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
