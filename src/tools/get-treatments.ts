import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface GetTreatmentsArgs {
  pest_id: string;
  approach?: string;
  jurisdiction?: string;
}

export function handleGetTreatments(db: Database, args: GetTreatmentsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let sql = 'SELECT * FROM treatments WHERE pest_id = ? AND jurisdiction = ?';
  const params: unknown[] = [args.pest_id, jv.jurisdiction];

  if (args.approach) {
    sql += ' AND LOWER(approach) = LOWER(?)';
    params.push(args.approach);
  }

  sql += ' ORDER BY approach, treatment';

  const treatments = db.all<{
    id: number; pest_id: string; approach: string; treatment: string;
    active_substance: string; timing: string; dose_rate: string;
    efficacy_notes: string; resistance_risk: string; approval_status: string;
    source: string; jurisdiction: string;
  }>(sql, params);

  return {
    pest_id: args.pest_id,
    jurisdiction: jv.jurisdiction,
    approach_filter: args.approach ?? null,
    results_count: treatments.length,
    treatments: treatments.map(t => ({
      approach: t.approach,
      treatment: t.treatment,
      active_substance: t.active_substance,
      timing: t.timing,
      dose_rate: t.dose_rate,
      efficacy_notes: t.efficacy_notes,
      resistance_risk: t.resistance_risk,
      approval_status: t.approval_status,
      source: t.source,
    })),
    _meta: buildMeta(),
  };
}
