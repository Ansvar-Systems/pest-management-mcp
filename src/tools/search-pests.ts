import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import { ftsSearch, type Database } from '../db.js';

interface SearchPestsArgs {
  query: string;
  pest_type?: string;
  crop?: string;
  jurisdiction?: string;
  limit?: number;
}

export function handleSearchPests(db: Database, args: SearchPestsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  const limit = Math.min(args.limit ?? 20, 50);
  let results = ftsSearch(db, args.query, limit);

  if (args.pest_type) {
    results = results.filter(r => r.pest_type.toLowerCase() === args.pest_type!.toLowerCase());
  }

  if (args.crop) {
    results = results.filter(r => {
      const desc = (r.description ?? '').toLowerCase();
      const names = (r.common_names ?? '').toLowerCase();
      return desc.includes(args.crop!.toLowerCase()) || names.includes(args.crop!.toLowerCase());
    });
  }

  return {
    query: args.query,
    jurisdiction: jv.jurisdiction,
    results_count: results.length,
    results: results.map(r => ({
      name: r.name,
      common_names: r.common_names,
      pest_type: r.pest_type,
      description: r.description,
      relevance_rank: r.rank,
    })),
    _meta: buildMeta(),
  };
}
