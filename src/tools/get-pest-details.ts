import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface GetPestDetailsArgs {
  pest_id: string;
  jurisdiction?: string;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return value.includes(',') ? value.split(',').map(s => s.trim()) : [value];
  }
}

export function handleGetPestDetails(db: Database, args: GetPestDetailsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  const pest = db.get<{
    id: string; name: string; common_names: string; pest_type: string;
    description: string; lifecycle: string; identification: string;
    crops_affected: string; risk_factors: string; economic_impact: string;
    images_description: string; jurisdiction: string;
  }>(
    'SELECT * FROM pests WHERE id = ? AND jurisdiction = ?',
    [args.pest_id, jv.jurisdiction]
  );

  if (!pest) {
    return { error: 'not_found', message: `Pest '${args.pest_id}' not found. Use search_pests to find pest IDs.` };
  }

  const symptoms = db.all<{
    symptom: string; plant_part: string; timing: string; confidence: string;
  }>(
    'SELECT symptom, plant_part, timing, confidence FROM symptoms WHERE pest_id = ?',
    [args.pest_id]
  );

  return {
    ...pest,
    common_names: parseJsonArray(pest.common_names),
    crops_affected: parseJsonArray(pest.crops_affected),
    symptoms,
    _meta: buildMeta(),
  };
}
