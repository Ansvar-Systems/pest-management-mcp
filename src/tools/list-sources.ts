import { buildMeta } from '../metadata.js';
import type { Database } from '../db.js';

interface Source {
  name: string;
  authority: string;
  official_url: string;
  retrieval_method: string;
  update_frequency: string;
  license: string;
  coverage: string;
  last_retrieved?: string;
}

export function handleListSources(db: Database): { sources: Source[]; _meta: ReturnType<typeof buildMeta> } {
  const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);

  const sources: Source[] = [
    {
      name: 'AHDB Knowledge Library',
      authority: 'Agriculture and Horticulture Development Board',
      official_url: 'https://ahdb.org.uk/knowledge-library',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'quarterly',
      license: 'Open Government Licence v3',
      coverage: 'Pest, disease, and weed profiles for major UK arable and horticultural crops',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'HSE CRD Pesticide Register',
      authority: 'Health and Safety Executive -- Chemicals Regulation Division',
      official_url: 'https://www.hse.gov.uk/pesticides/databases/',
      retrieval_method: 'BULK_DOWNLOAD',
      update_frequency: 'monthly',
      license: 'Open Government Licence v3',
      coverage: 'Approved pesticide products, active substances, and authorised uses in the UK',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'AHDB IPM Guidance',
      authority: 'Agriculture and Horticulture Development Board',
      official_url: 'https://ahdb.org.uk/ipm',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'annual',
      license: 'Open Government Licence v3',
      coverage: 'Integrated pest management thresholds, monitoring methods, and cultural controls',
      last_retrieved: lastIngest?.value,
    },
  ];

  return {
    sources,
    _meta: buildMeta({ source_url: 'https://ahdb.org.uk/knowledge-library' }),
  };
}
