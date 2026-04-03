import { buildMeta } from '../metadata.js';
import { SUPPORTED_JURISDICTIONS } from '../jurisdiction.js';

export function handleAbout() {
  return {
    name: 'Pest Management MCP',
    description:
      'UK pest, disease, and weed identification, treatment options, IPM guidance, and symptom-based ' +
      'differential diagnosis. Data sourced from AHDB crop protection publications and the HSE CRD ' +
      'pesticide register.',
    version: '0.1.0',
    jurisdiction: [...SUPPORTED_JURISDICTIONS],
    data_sources: ['AHDB Knowledge Library', 'HSE CRD Pesticide Register', 'AHDB IPM Guidance'],
    tools_count: 10,
    links: {
      homepage: 'https://ansvar.eu/open-agriculture',
      repository: 'https://github.com/ansvar-systems/pest-management-mcp',
      mcp_network: 'https://ansvar.ai/mcp',
    },
    _meta: buildMeta(),
  };
}
