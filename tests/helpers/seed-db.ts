import { createDatabase, type Database } from '../../src/db.js';

export function createSeededDatabase(dbPath: string): Database {
  const db = createDatabase(dbPath);

  // Pests
  db.run(
    `INSERT INTO pests (id, name, common_names, pest_type, description, lifecycle, identification, crops_affected, risk_factors, economic_impact, images_description, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'septoria-tritici', 'Septoria Tritici Blotch', JSON.stringify(['Septoria leaf blotch', 'Speckled leaf blotch']),
      'disease', 'Fungal disease caused by Zymoseptoria tritici. Major foliar disease of wheat in the UK.',
      'Rain-splashed spores infect leaves, 2-4 week latent period before visible symptoms.',
      'Tan or grey irregular lesions with dark fruiting bodies (pycnidia) visible under hand lens.',
      JSON.stringify(['wheat', 'winter wheat', 'spring wheat']),
      'Warm wet autumn, mild winter, dense canopy during tillering and stem extension',
      'Yield losses of 20-50% in untreated crops in high-pressure years.',
      'Tan lesions with black pycnidia dots on leaf surface',
      'GB',
    ]
  );
  db.run(
    `INSERT INTO pests (id, name, common_names, pest_type, description, lifecycle, identification, crops_affected, risk_factors, economic_impact, images_description, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'blackgrass', 'Black-grass', JSON.stringify(['Slender meadow foxtail']),
      'weed', 'Annual grass weed (Alopecurus myosuroides). Most serious herbicide-resistant weed in UK arable farming.',
      'Germinates autumn through spring, flowers May-July, single plant produces up to 1000 seeds.',
      'Distinctive dark purplish-black seed head. Leaves are smooth, slightly twisted, with a short blunt ligule.',
      JSON.stringify(['wheat', 'winter wheat', 'barley', 'oilseed rape']),
      'Continuous winter cropping, early drilling, heavy clay soils, mild wet autumns',
      'Yield losses of 0.4-0.8 t/ha per 100 heads/m2. Herbicide resistance widespread.',
      'Dark seed heads emerging above wheat canopy',
      'GB',
    ]
  );
  db.run(
    `INSERT INTO pests (id, name, common_names, pest_type, description, lifecycle, identification, crops_affected, risk_factors, economic_impact, images_description, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'grain-aphid', 'Grain Aphid', JSON.stringify(['English grain aphid', 'Sitobion avenae']),
      'pest', 'Aphid species (Sitobion avenae) that feeds on cereal ears and upper leaves.',
      'Winged adults colonise crops in late spring. Populations peak around flowering.',
      'Green to reddish-brown aphid 2-3mm long, found on ears and flag leaves. Black cornicles (siphunculi).',
      JSON.stringify(['wheat', 'barley', 'oats']),
      'Warm dry spring, low natural enemy numbers, early ear emergence',
      'Direct feeding damage and honeydew causing sooty moulds. Yield loss up to 15% in severe outbreaks.',
      'Clusters of green-brown aphids on wheat ear',
      'GB',
    ]
  );

  // Symptoms -- Septoria (3 symptoms at different confidence levels)
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['septoria-tritici', 'Tan or grey lesions with dark pycnidia on leaves', 'leaves', 'autumn through spring', 'diagnostic']
  );
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['septoria-tritici', 'Yellow patches on lower leaves', 'leaves', 'autumn and early spring', 'suggestive']
  );
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['septoria-tritici', 'Reduced grain fill in severe cases', 'ears', 'summer', 'associated']
  );

  // Symptoms -- Blackgrass (2 symptoms)
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['blackgrass', 'Dark purplish-black seed heads above crop canopy', 'seed head', 'May to July', 'diagnostic']
  );
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['blackgrass', 'Patches of thin or stunted crop with grass weed competition', 'whole plant', 'spring', 'suggestive']
  );

  // Symptoms -- Grain Aphid (2 symptoms)
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['grain-aphid', 'Clusters of small green-brown insects on ears and upper leaves', 'ears', 'late spring to summer', 'diagnostic']
  );
  db.run(
    `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
     VALUES (?, ?, ?, ?, ?)`,
    ['grain-aphid', 'Sticky honeydew deposits and sooty mould on leaves', 'leaves', 'summer', 'suggestive']
  );

  // Treatments -- Septoria (1 chemical, 1 cultural)
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'septoria-tritici', 'chemical', 'Foliar fungicide application (T1/T2 timing)',
      'prothioconazole + bixafen', 'T1 (GS30-32) and T2 (GS39-49)',
      'See product label', 'Good protectant and curative activity. Best applied preventatively.',
      'Azole resistance increasing. Use mixtures and alternate modes of action.',
      'approved', 'AHDB', 'GB',
    ]
  );
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'septoria-tritici', 'cultural', 'Variety resistance and delayed drilling',
      null, 'Pre-planting and variety selection',
      null, 'Choose varieties with high septoria resistance rating (7+). Delay drilling to reduce autumn infection.',
      null, null, 'AHDB', 'GB',
    ]
  );

  // Treatments -- Blackgrass (1 chemical, 1 cultural)
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'blackgrass', 'chemical', 'Pre-emergence herbicide application',
      'flufenacet + diflufenican', 'Pre-emergence (within 48h of drilling)',
      'See product label', 'Residual activity. Best on moist seedbeds. Reduced efficacy on dry soils.',
      'Metabolic resistance widespread. Stack sequences for best control.',
      'approved', 'AHDB', 'GB',
    ]
  );
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'blackgrass', 'cultural', 'Delayed drilling and spring cropping',
      null, 'Autumn planting decisions',
      null, 'Delay drilling to late October or switch to spring crops. Stale seedbeds before drilling.',
      null, null, 'AHDB', 'GB',
    ]
  );

  // Treatments -- Grain Aphid (1 chemical, 1 cultural)
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'grain-aphid', 'chemical', 'Pyrethroid insecticide spray',
      'lambda-cyhalothrin', 'When threshold exceeded (66% of tillers with aphids)',
      'See product label', 'Fast knockdown. Avoid broad-spectrum use to preserve natural enemies.',
      'Low current resistance but broad-spectrum impact on beneficials.',
      'approved', 'AHDB', 'GB',
    ]
  );
  db.run(
    `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'grain-aphid', 'cultural', 'Conservation biological control',
      null, 'Season-long',
      null, 'Maintain field margins and beetle banks to support natural enemies (ladybirds, parasitoids, hoverflies).',
      null, null, 'AHDB', 'GB',
    ]
  );

  // IPM guidance -- winter wheat + septoria
  db.run(
    `INSERT INTO ipm_guidance (crop_id, pest_id, threshold, monitoring_method, cultural_controls, prevention, decision_guide, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'winter-wheat', 'septoria-tritici',
      'Septoria on upper 3 leaves by GS32; >20% leaf area affected on leaf 3',
      'Regular leaf assessments from GS30. Check rain splash infection risk using AHDB disease risk tool.',
      'Resistant varieties (rating 7+), delayed drilling, wider row spacing for air circulation',
      'Select varieties with high septoria resistance. Avoid very early drilling in high-risk areas.',
      'Base T1 decision on variety resistance, autumn/winter rainfall, and leaf infection levels. T2 protects flag leaf.',
      'AHDB', 'GB',
    ]
  );

  // Approved products
  db.run(
    `INSERT INTO approved_products (product_name, active_substance, target_pests, approved_crops, approval_expiry, registration_number, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Aviator 235 Xpro', 'prothioconazole + bixafen', 'Septoria, rusts, eyespot',
      'wheat, barley', '2027-12-31', 'MAPP 16054', 'CRD', 'GB',
    ]
  );
  db.run(
    `INSERT INTO approved_products (product_name, active_substance, target_pests, approved_crops, approval_expiry, registration_number, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Liberator', 'flufenacet + diflufenican', 'Blackgrass, annual meadow-grass, ryegrass',
      'wheat, barley, oilseed rape', '2028-06-30', 'MAPP 14217', 'CRD', 'GB',
    ]
  );

  // FTS5 search index entries for all 3 pests
  db.run(
    `INSERT INTO search_index (name, common_names, description, identification, pest_type, jurisdiction) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Septoria Tritici Blotch', 'Septoria leaf blotch, Speckled leaf blotch',
      'Fungal disease caused by Zymoseptoria tritici. Major foliar disease of wheat in the UK.',
      'Tan or grey irregular lesions with dark fruiting bodies (pycnidia) visible under hand lens.',
      'disease', 'GB',
    ]
  );
  db.run(
    `INSERT INTO search_index (name, common_names, description, identification, pest_type, jurisdiction) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Black-grass', 'Slender meadow foxtail',
      'Annual grass weed (Alopecurus myosuroides). Most serious herbicide-resistant weed in UK arable farming.',
      'Distinctive dark purplish-black seed head. Leaves are smooth, slightly twisted, with a short blunt ligule.',
      'weed', 'GB',
    ]
  );
  db.run(
    `INSERT INTO search_index (name, common_names, description, identification, pest_type, jurisdiction) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Grain Aphid', 'English grain aphid, Sitobion avenae',
      'Aphid species (Sitobion avenae) that feeds on cereal ears and upper leaves.',
      'Green to reddish-brown aphid 2-3mm long, found on ears and flag leaves. Black cornicles (siphunculi).',
      'pest', 'GB',
    ]
  );

  return db;
}
