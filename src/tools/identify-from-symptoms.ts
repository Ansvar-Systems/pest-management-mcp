import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface IdentifyFromSymptomsArgs {
  symptoms: string;
  plant_part?: string;
  crop?: string;
  jurisdiction?: string;
}

interface MatchingSymptom {
  symptom: string;
  plant_part: string | null;
  confidence: string;
}

interface DiagnosisResult {
  pest_id: string;
  pest_name: string;
  pest_type: string;
  matching_symptoms: MatchingSymptom[];
  confidence_score: number;
  explanation: string;
}

const CONFIDENCE_WEIGHTS: Record<string, number> = {
  diagnostic: 3,
  suggestive: 2,
  associated: 1,
};

export function handleIdentifyFromSymptoms(db: Database, args: IdentifyFromSymptomsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  // Step 1: FTS5 search the symptoms table for matching symptom text.
  // We use a direct LIKE search on the symptom column since FTS is on the pests table.
  // For broader matching, also try exact word overlap.
  const searchTerms = args.symptoms.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  let sql = `SELECT s.pest_id, s.symptom, s.plant_part, s.timing, s.confidence,
                    p.name AS pest_name, p.pest_type
             FROM symptoms s
             JOIN pests p ON p.id = s.pest_id
             WHERE p.jurisdiction = ?`;
  const params: unknown[] = [jv.jurisdiction];

  if (args.plant_part) {
    sql += ' AND LOWER(s.plant_part) = LOWER(?)';
    params.push(args.plant_part);
  }

  const allSymptoms = db.all<{
    pest_id: string; symptom: string; plant_part: string; timing: string;
    confidence: string; pest_name: string; pest_type: string;
  }>(sql, params);

  // Step 2: Score each symptom row against the query using word overlap
  const scoredSymptoms = allSymptoms.map(row => {
    const symptomWords = row.symptom.toLowerCase().split(/\s+/);
    const matchCount = searchTerms.filter(term =>
      symptomWords.some(w => w.includes(term))
    ).length;
    return { ...row, matchCount };
  }).filter(row => row.matchCount > 0);

  // Step 3: Group by pest_id
  const pestMap = new Map<string, {
    pest_name: string;
    pest_type: string;
    matchingSymptoms: { symptom: string; plant_part: string | null; confidence: string }[];
    totalScore: number;
    highestConfidence: string;
  }>();

  for (const row of scoredSymptoms) {
    if (!pestMap.has(row.pest_id)) {
      pestMap.set(row.pest_id, {
        pest_name: row.pest_name,
        pest_type: row.pest_type,
        matchingSymptoms: [],
        totalScore: 0,
        highestConfidence: 'associated',
      });
    }
    const entry = pestMap.get(row.pest_id)!;
    entry.matchingSymptoms.push({
      symptom: row.symptom,
      plant_part: row.plant_part || null,
      confidence: row.confidence,
    });

    // Step 4: Score = sum of confidence weights for each matching symptom
    const weight = CONFIDENCE_WEIGHTS[row.confidence] ?? 1;
    entry.totalScore += weight;

    // Track highest confidence
    const currentWeight = CONFIDENCE_WEIGHTS[entry.highestConfidence] ?? 0;
    if (weight > currentWeight) {
      entry.highestConfidence = row.confidence;
    }
  }

  // Step 5: Sort by score descending, return top 5
  const ranked: DiagnosisResult[] = Array.from(pestMap.entries())
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .slice(0, 5)
    .map(([pestId, data]) => {
      const symptomCount = data.matchingSymptoms.length;
      const explanation =
        `${symptomCount} symptom${symptomCount > 1 ? 's' : ''} match with ` +
        `highest confidence level '${data.highestConfidence}'. ` +
        `Score: ${data.totalScore} (diagnostic=3, suggestive=2, associated=1).`;

      return {
        pest_id: pestId,
        pest_name: data.pest_name,
        pest_type: data.pest_type,
        matching_symptoms: data.matchingSymptoms,
        confidence_score: data.totalScore,
        explanation,
      };
    });

  return {
    query_symptoms: args.symptoms,
    plant_part_filter: args.plant_part ?? null,
    jurisdiction: jv.jurisdiction,
    results_count: ranked.length,
    diagnoses: ranked,
    _meta: buildMeta({ source_url: 'https://ahdb.org.uk/knowledge-library' }),
  };
}
