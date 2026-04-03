# Tools Reference

## Meta Tools

### `about`

Get server metadata: name, version, coverage, data sources, and links.

**Parameters:** None

**Returns:** Server name, version, jurisdiction list, data source names, tool count, homepage/repository links.

---

### `list_sources`

List all data sources with authority, URL, license, and freshness info.

**Parameters:** None

**Returns:** Array of data sources, each with `name`, `authority`, `official_url`, `retrieval_method`, `update_frequency`, `license`, `coverage`, `last_retrieved`.

---

### `check_data_freshness`

Check when data was last ingested, staleness status, and how to trigger a refresh.

**Parameters:** None

**Returns:** `status` (fresh/stale/unknown), `last_ingest`, `days_since_ingest`, `staleness_threshold_days`, `refresh_command`.

---

## Domain Tools

### `search_pests`

Search pests, diseases, and weeds by name or description. Use for broad queries about crop threats.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Free-text search query |
| `pest_type` | string | No | Filter by type: disease, weed, or pest |
| `crop` | string | No | Filter results mentioning this crop |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |
| `limit` | number | No | Max results (default: 20, max: 50) |

**Example:** `{ "query": "septoria wheat" }`

---

### `get_pest_details`

Get full pest profile: identification, lifecycle, symptoms, crops affected.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pest_id` | string | Yes | Pest ID (e.g. septoria-tritici, blackgrass) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Full profile with identification markers, lifecycle, symptoms array (with confidence levels), crops affected, risk factors, economic impact.

**Example:** `{ "pest_id": "septoria-tritici" }`

---

### `get_treatments`

Get treatment options for a pest: chemical, cultural, and biological approaches.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pest_id` | string | Yes | Pest ID |
| `approach` | string | No | Filter by approach: chemical, cultural, or biological |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Treatment list with approach, active substance, timing, dose rate, efficacy notes, resistance risk, approval status.

**Example:** `{ "pest_id": "blackgrass", "approach": "cultural" }`

---

### `get_ipm_guidance`

Get integrated pest management guidance for a crop: thresholds, monitoring, cultural controls.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop_id` | string | Yes | Crop ID (e.g. winter-wheat) |
| `pest_id` | string | No | Optional pest ID to narrow guidance |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** IPM guidance with thresholds, monitoring methods, cultural controls, prevention, decision guides.

**Example:** `{ "crop_id": "winter-wheat", "pest_id": "septoria-tritici" }`

---

### `search_crop_threats`

Find all pests, diseases, and weeds affecting a specific crop.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop name (e.g. wheat, barley, oilseed rape) |
| `growth_stage` | string | No | Filter by growth stage (e.g. tillering, stem extension) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** List of threats with pest_id, name, type, economic impact, risk factors.

**Example:** `{ "crop": "wheat" }`

---

### `identify_from_symptoms`

Symptom-based differential diagnosis. Describe what you see and get ranked pest/disease matches with confidence scores.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symptoms` | string | Yes | Description of observed symptoms |
| `plant_part` | string | No | Affected plant part (e.g. leaves, stem, roots) |
| `crop` | string | No | Crop being assessed (for context) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Up to 5 ranked diagnoses, each with pest_id, pest_name, pest_type, matching_symptoms (with confidence level), confidence_score, and explanation. Scoring: diagnostic=3, suggestive=2, associated=1.

**Example:** `{ "symptoms": "yellow patches on lower leaves with dark spots" }`

---

### `get_approved_products`

Search UK-approved pesticide products by active substance, target pest, or crop.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `active_substance` | string | No | Filter by active substance (e.g. prothioconazole) |
| `target_pest` | string | No | Filter by target pest name |
| `crop` | string | No | Filter by approved crop |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Product list with name, active substance, target pests, approved crops, approval expiry, registration number. Always check the CRD register for current approval status.

**Example:** `{ "active_substance": "prothioconazole", "crop": "wheat" }`
