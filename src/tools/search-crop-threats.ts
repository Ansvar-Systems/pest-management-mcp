import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface SearchCropThreatsArgs {
  crop: string;
  growth_stage?: string;
  jurisdiction?: string;
}

export function handleSearchCropThreats(db: Database, args: SearchCropThreatsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  const pests = db.all<{
    id: string; name: string; pest_type: string; crops_affected: string;
    risk_factors: string; economic_impact: string; jurisdiction: string;
  }>(
    `SELECT id, name, pest_type, crops_affected, risk_factors, economic_impact, jurisdiction
     FROM pests
     WHERE jurisdiction = ?
       AND (LOWER(crops_affected) LIKE '%' || LOWER(?) || '%'
            OR LOWER(name) LIKE '%' || LOWER(?) || '%')
     ORDER BY pest_type, name`,
    [jv.jurisdiction, args.crop, args.crop]
  );

  let filtered = pests;
  if (args.growth_stage) {
    filtered = pests.filter(p => {
      const rf = (p.risk_factors ?? '').toLowerCase();
      return rf.includes(args.growth_stage!.toLowerCase());
    });
  }

  return {
    crop: args.crop,
    growth_stage_filter: args.growth_stage ?? null,
    jurisdiction: jv.jurisdiction,
    results_count: filtered.length,
    threats: filtered.map(p => ({
      pest_id: p.id,
      name: p.name,
      pest_type: p.pest_type,
      economic_impact: p.economic_impact,
      risk_factors: p.risk_factors,
    })),
    _meta: buildMeta(),
  };
}
