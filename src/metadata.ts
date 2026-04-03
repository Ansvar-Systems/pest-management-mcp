export interface Meta {
  disclaimer: string;
  data_age: string;
  source_url: string;
  copyright: string;
  server: string;
  version: string;
}

const DISCLAIMER =
  'This data is provided for informational purposes only. It does not constitute professional ' +
  'pest management or agronomic advice. Always consult a qualified agronomist or BASIS-qualified ' +
  'advisor before making crop protection decisions. Pesticide approval data is sourced from the ' +
  'HSE Chemicals Regulation Division (CRD) register and AHDB publications under Open Government Licence. ' +
  'Always check the current CRD register before applying any pesticide product.';

export function buildMeta(overrides?: Partial<Meta>): Meta {
  return {
    disclaimer: DISCLAIMER,
    data_age: overrides?.data_age ?? 'unknown',
    source_url: overrides?.source_url ?? 'https://ahdb.org.uk/knowledge-library',
    copyright: 'Data: Crown Copyright, AHDB, and HSE CRD. Server: Apache-2.0 Ansvar Systems.',
    server: 'pest-management-mcp',
    version: '0.1.0',
    ...overrides,
  };
}
