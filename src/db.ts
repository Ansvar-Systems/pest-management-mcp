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
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('mcp_name', 'Pest Management MCP');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('jurisdiction', 'GB');
  `);
}

export function ftsSearch(
  db: Database,
  query: string,
  limit: number = 20
): { name: string; common_names: string; description: string; identification: string; pest_type: string; jurisdiction: string; rank: number }[] {
  return db.all(
    `SELECT name, common_names, description, identification, pest_type, jurisdiction, rank
     FROM search_index
     WHERE search_index MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [query, limit]
  );
}
