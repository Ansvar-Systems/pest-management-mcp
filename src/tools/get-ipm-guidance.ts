import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface GetIpmGuidanceArgs {
  crop_id: string;
  pest_id?: string;
  jurisdiction?: string;
}

export function handleGetIpmGuidance(db: Database, args: GetIpmGuidanceArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let sql = 'SELECT * FROM ipm_guidance WHERE crop_id = ? AND jurisdiction = ?';
  const params: unknown[] = [args.crop_id, jv.jurisdiction];

  if (args.pest_id) {
    sql += ' AND pest_id = ?';
    params.push(args.pest_id);
  }

  const guidance = db.all<{
    id: number; crop_id: string; pest_id: string; threshold: string;
    monitoring_method: string; cultural_controls: string; prevention: string;
    decision_guide: string; source: string; jurisdiction: string;
  }>(sql, params);

  return {
    crop_id: args.crop_id,
    pest_id_filter: args.pest_id ?? null,
    jurisdiction: jv.jurisdiction,
    results_count: guidance.length,
    guidance: guidance.map(g => ({
      pest_id: g.pest_id,
      threshold: g.threshold,
      monitoring_method: g.monitoring_method,
      cultural_controls: g.cultural_controls,
      prevention: g.prevention,
      decision_guide: g.decision_guide,
      source: g.source,
    })),
    _meta: buildMeta(),
  };
}
