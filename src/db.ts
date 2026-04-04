import BetterSqlite3 from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface Database {
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): void;
  close(): void;
  readonly instance: BetterSqlite3.Database;
}

export function createDatabase(dbPath?: string): Database {
  const resolvedPath =
    dbPath ??
    join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'database.db');
  const db = new BetterSqlite3(resolvedPath);

  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  return {
    get<T>(sql: string, params: unknown[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    run(sql: string, params: unknown[] = []): void {
      db.prepare(sql).run(...params);
    },
    close(): void {
      db.close();
    },
    get instance() {
      return db;
    },
  };
}

function initSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      common_names TEXT,
      pest_type TEXT,
      description TEXT,
      lifecycle TEXT,
      identification TEXT,
      crops_affected TEXT,
      risk_factors TEXT,
      economic_impact TEXT,
      images_description TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id INTEGER PRIMARY KEY,
      pest_id TEXT REFERENCES pests(id),
      approach TEXT,
      treatment TEXT NOT NULL,
      active_substance TEXT,
      timing TEXT,
      dose_rate TEXT,
      efficacy_notes TEXT,
      resistance_risk TEXT,
      approval_status TEXT,
      source TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE TABLE IF NOT EXISTS ipm_guidance (
      id INTEGER PRIMARY KEY,
      crop_id TEXT,
      pest_id TEXT REFERENCES pests(id),
      threshold TEXT,
      monitoring_method TEXT,
      cultural_controls TEXT,
      prevention TEXT,
      decision_guide TEXT,
      source TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE TABLE IF NOT EXISTS symptoms (
      id INTEGER PRIMARY KEY,
      pest_id TEXT REFERENCES pests(id),
      symptom TEXT NOT NULL,
      plant_part TEXT,
      timing TEXT,
      confidence TEXT
    );

    CREATE TABLE IF NOT EXISTS approved_products (
      id INTEGER PRIMARY KEY,
      product_name TEXT NOT NULL,
      active_substance TEXT,
      target_pests TEXT,
      approved_crops TEXT,
      approval_expiry TEXT,
      registration_number TEXT,
      source TEXT DEFAULT 'CRD',
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      name, common_names, description, identification, pest_type, jurisdiction
    );

    CREATE TABLE IF NOT EXISTS db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('schema_version', '1.0');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('mcp_name', 'UK Pest Management MCP');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('jurisdiction', 'GB');
  `);
}

const FTS_COLUMNS = ['name', 'common_names', 'description', 'identification', 'pest_type', 'jurisdiction'];

export function ftsSearch(
  db: Database,
  query: string,
  limit: number = 20
): { name: string; common_names: string; description: string; identification: string; pest_type: string; jurisdiction: string; rank: number }[] {
  const { results } = tieredFtsSearch(db, 'search_index', FTS_COLUMNS, query, limit);
  return results as { name: string; common_names: string; description: string; identification: string; pest_type: string; jurisdiction: string; rank: number }[];
}

export function tieredFtsSearch(
  db: Database,
  table: string,
  columns: string[],
  query: string,
  limit: number = 20
): { tier: string; results: Record<string, unknown>[] } {
  const sanitized = sanitizeFtsInput(query);
  if (!sanitized.trim()) return { tier: 'empty', results: [] };

  const columnList = columns.join(', ');
  const select = `SELECT ${columnList}, rank FROM ${table}`;
  const order = `ORDER BY rank LIMIT ?`;

  const phrase = `"${sanitized}"`;
  let results = tryFts(db, select, table, order, phrase, limit);
  if (results.length > 0) return { tier: 'phrase', results };

  const words = sanitized.split(/\s+/).filter(w => w.length > 1);
  if (words.length > 1) {
    const andQuery = words.join(' AND ');
    results = tryFts(db, select, table, order, andQuery, limit);
    if (results.length > 0) return { tier: 'and', results };
  }

  const prefixQuery = words.map(w => `${w}*`).join(' AND ');
  results = tryFts(db, select, table, order, prefixQuery, limit);
  if (results.length > 0) return { tier: 'prefix', results };

  const stemmed = words.map(w => stemWord(w) + '*');
  const stemmedQuery = stemmed.join(' AND ');
  if (stemmedQuery !== prefixQuery) {
    results = tryFts(db, select, table, order, stemmedQuery, limit);
    if (results.length > 0) return { tier: 'stemmed', results };
  }

  if (words.length > 1) {
    const orQuery = words.join(' OR ');
    results = tryFts(db, select, table, order, orQuery, limit);
    if (results.length > 0) return { tier: 'or', results };
  }

  // LIKE fallback — search pests table directly
  const searchCols = ['name', 'common_names', 'description', 'identification', 'pest_type'];
  const likeConditions = words.map(() =>
    `(${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`
  ).join(' AND ');
  const likeParams = words.flatMap(w =>
    searchCols.map(() => `%${w}%`)
  );
  try {
    const likeResults = db.all<Record<string, unknown>>(
      `SELECT name, common_names, description, identification, pest_type, jurisdiction FROM pests WHERE ${likeConditions} LIMIT ?`,
      [...likeParams, limit]
    );
    if (likeResults.length > 0) return { tier: 'like', results: likeResults };
  } catch {
    // LIKE fallback failed
  }

  return { tier: 'none', results: [] };
}

function tryFts(
  db: Database, select: string, table: string,
  order: string, matchExpr: string, limit: number
): Record<string, unknown>[] {
  try {
    return db.all(`${select} WHERE ${table} MATCH ? ${order}`, [matchExpr, limit]);
  } catch {
    return [];
  }
}

function sanitizeFtsInput(query: string): string {
  return query
    .replace(/["""''„‚«»]/g, '"')
    .replace(/[^a-zA-Z0-9\s*"_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemWord(word: string): string {
  return word
    .replace(/(ies)$/i, 'y')
    .replace(/(ying|tion|ment|ness|able|ible|ous|ive|ing|ers|ed|es|er|ly|s)$/i, '');
}
