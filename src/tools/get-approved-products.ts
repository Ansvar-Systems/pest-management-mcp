import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface GetApprovedProductsArgs {
  active_substance?: string;
  target_pest?: string;
  crop?: string;
  jurisdiction?: string;
}

export function handleGetApprovedProducts(db: Database, args: GetApprovedProductsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let sql = 'SELECT * FROM approved_products WHERE jurisdiction = ?';
  const params: unknown[] = [jv.jurisdiction];

  if (args.active_substance) {
    sql += ' AND LOWER(active_substance) LIKE LOWER(?)';
    params.push(`%${args.active_substance}%`);
  }

  if (args.target_pest) {
    sql += ' AND LOWER(target_pests) LIKE LOWER(?)';
    params.push(`%${args.target_pest}%`);
  }

  if (args.crop) {
    sql += ' AND LOWER(approved_crops) LIKE LOWER(?)';
    params.push(`%${args.crop}%`);
  }

  sql += ' ORDER BY product_name';

  const products = db.all<{
    id: number; product_name: string; active_substance: string;
    target_pests: string; approved_crops: string; approval_expiry: string;
    registration_number: string; source: string; jurisdiction: string;
  }>(sql, params);

  return {
    filters: {
      active_substance: args.active_substance ?? null,
      target_pest: args.target_pest ?? null,
      crop: args.crop ?? null,
    },
    jurisdiction: jv.jurisdiction,
    results_count: products.length,
    products: products.map(p => ({
      product_name: p.product_name,
      active_substance: p.active_substance,
      target_pests: p.target_pests,
      approved_crops: p.approved_crops,
      approval_expiry: p.approval_expiry,
      registration_number: p.registration_number,
      source: p.source,
    })),
    _meta: buildMeta({ source_url: 'https://www.hse.gov.uk/pesticides/databases/' }),
  };
}
