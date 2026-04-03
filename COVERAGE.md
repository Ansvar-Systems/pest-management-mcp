# Coverage

## What Is Included

- **Pest profiles** from AHDB: diseases, weeds, and invertebrate pests affecting UK arable and horticultural crops
- **Symptom database** with confidence levels (diagnostic, suggestive, associated) for differential diagnosis
- **Treatment options**: chemical (with active substances, timing, resistance risk), cultural, and biological approaches
- **IPM guidance**: monitoring thresholds, decision guides, cultural controls from AHDB IPM publications
- **Approved products**: UK pesticide authorisations from the HSE CRD register

## Jurisdictions

| Code | Country | Status |
|------|---------|--------|
| GB | Great Britain | Supported |

## What Is NOT Included

- **Northern Ireland** -- follows separate plant health regulations (DAERA)
- **EU product approvals** -- only UK CRD-approved products are included
- **Detailed resistance data** -- general resistance risk notes are included, not full resistance maps
- **Real-time product approval changes** -- CRD updates are ingested periodically, not in real time
- **Horticultural and ornamental pests** -- primary focus is arable crops in v0.1.0
- **Nematode and soil-borne pathogen detail** -- limited coverage in initial release
- **Biological control agent products** -- focus is on chemical and cultural approaches
- **Spray application rates** -- always refer to product labels for current authorised rates

## Known Gaps

1. Symptom database coverage depends on AHDB publication completeness
2. FTS5 search quality varies with query phrasing -- use specific pest or symptom terms for best results
3. Approved product data depends on CRD publication schedule; always verify current approvals before use

## Data Freshness

Run `check_data_freshness` to see when data was last updated. The ingestion pipeline runs on a schedule; manual triggers available via `gh workflow run ingest.yml`.
