/**
 * Pest Management MCP — Data Ingestion Script
 *
 * Sources:
 * 1. AHDB Knowledge Library — pest, disease, and weed profiles (reference data)
 * 2. HSE CRD Pesticide Register — approved product reference set
 * 3. AHDB IPM Guidance — thresholds, monitoring, cultural controls
 *
 * AHDB pest profiles and CRD product data are not available via API.
 * The reference tables below are manually curated from authoritative
 * publications (AHDB Encyclopaedia, CRD register, HGCA guides).
 * This is the standard approach for MCP servers where the
 * authoritative source is not machine-readable.
 *
 * Usage: npm run ingest
 */

import { createDatabase, type Database } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ── Types ───────────────────────────────────────────────────────

interface Pest {
  id: string;
  name: string;
  common_names: string[];
  pest_type: 'disease' | 'pest' | 'weed';
  description: string;
  lifecycle: string;
  identification: string;
  crops_affected: string[];
  risk_factors: string;
  economic_impact: string;
  images_description: string;
}

interface Symptom {
  pest_id: string;
  symptom: string;
  plant_part: string;
  timing: string;
  confidence: 'diagnostic' | 'suggestive' | 'associated';
}

interface Treatment {
  pest_id: string;
  approach: 'chemical' | 'cultural' | 'biological';
  treatment: string;
  active_substance: string | null;
  timing: string;
  dose_rate: string | null;
  efficacy_notes: string;
  resistance_risk: string | null;
  approval_status: string | null;
  source: string;
}

interface IpmGuidance {
  crop_id: string;
  pest_id: string;
  threshold: string;
  monitoring_method: string;
  cultural_controls: string;
  prevention: string;
  decision_guide: string;
  source: string;
}

interface ApprovedProduct {
  product_name: string;
  active_substance: string;
  target_pests: string;
  approved_crops: string;
  approval_expiry: string;
  registration_number: string;
  source: string;
}

// ── Diseases ────────────────────────────────────────────────────

const DISEASES: Pest[] = [
  {
    id: 'septoria-tritici',
    name: 'Septoria Tritici Blotch',
    common_names: ['Septoria leaf blotch', 'Speckled leaf blotch'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Zymoseptoria tritici. The most damaging foliar disease of wheat in the UK, responsible for more yield loss than all other wheat diseases combined. Favoured by wet weather during autumn and spring.',
    lifecycle: 'Ascospores released from stubble debris in autumn infect young wheat leaves. Rain-splashed pycnidiospores spread the disease up the canopy during spring. Latent period of 2-4 weeks between infection and visible symptoms.',
    identification: 'Tan or grey irregular lesions with dark fruiting bodies (pycnidia) visible as black dots under a hand lens. Lesions often rectangular, bounded by leaf veins. Lower leaves affected first.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Warm wet autumn, mild winter, frequent rainfall March-June, early drilling, susceptible varieties, high inoculum from previous wheat stubble, dense canopy',
    economic_impact: 'Yield losses of 20-50% in untreated crops in high-pressure years. Costs the UK wheat industry an estimated GBP 200-400 million annually in fungicide spend and yield loss.',
    images_description: 'Tan lesions with black pycnidia dots on leaf surface',
  },
  {
    id: 'yellow-rust',
    name: 'Yellow Rust',
    common_names: ['Stripe rust', 'Puccinia striiformis'],
    pest_type: 'disease',
    description: 'Biotrophic fungal disease caused by Puccinia striiformis f. sp. tritici. Produces bright yellow-orange pustules arranged in stripes along leaf veins. Can cause rapid and severe yield loss when varieties lack resistance.',
    lifecycle: 'Overwintering on volunteer cereals and autumn-sown crops. Wind-dispersed urediniospores spread rapidly in cool, moist conditions (8-15C with dew). New races emerge frequently, breaking variety resistance.',
    identification: 'Bright yellow-orange uredinia (pustules) arranged in distinct stripes or lines between leaf veins. Early infections appear as isolated yellow flecks. Flag leaf infection most damaging to yield.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'triticale'],
    risk_factors: 'Cool moist springs (10-15C optimal), susceptible variety, early-sown crops, mild winters allowing green bridge, proximity to infected volunteers',
    economic_impact: 'Yield losses up to 40% on susceptible varieties if untreated. Highly variable between seasons depending on race changes and variety susceptibility. Epidemic years cause region-wide losses.',
    images_description: 'Bright yellow-orange pustule stripes between leaf veins',
  },
  {
    id: 'brown-rust',
    name: 'Brown Rust',
    common_names: ['Leaf rust', 'Puccinia recondita', 'Puccinia triticina'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Puccinia triticina. Produces scattered orange-brown pustules on leaf surfaces. More common in warmer seasons and southern England. Late-season development on flag leaf most damaging.',
    lifecycle: 'Urediniospores spread by wind, sometimes over long distances from continental Europe. Infections established when free moisture present on leaf surface at 15-22C. Can develop rapidly in warm, humid summers.',
    identification: 'Small, round, orange-brown pustules scattered randomly across the leaf surface (not in stripes). Pustules rupture the leaf epidermis. Distinguished from yellow rust by random distribution and darker colour.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Warm summers (15-22C optimal), humid conditions, susceptible varieties, southern regions, late-season development, continental airborne inoculum',
    economic_impact: 'Yield losses typically 5-20% in affected crops. Losses concentrated in warm seasons in southern England. Less consistently damaging than septoria but can cause severe loss in epidemic years.',
    images_description: 'Scattered orange-brown pustules on wheat leaf surface',
  },
  {
    id: 'fusarium-ear-blight',
    name: 'Fusarium Ear Blight',
    common_names: ['Head blight', 'Scab', 'Fusarium head blight'],
    pest_type: 'disease',
    description: 'Disease complex caused by Fusarium graminearum, F. culmorum, and other Fusarium species. Infects wheat ears during flowering, causing bleached spikelets and contamination with mycotoxins (deoxynivalenol, DON).',
    lifecycle: 'Ascospores and conidia released from cereal stubble and maize debris during wet weather at anthesis. Infection occurs through open florets during a 3-5 day window around mid-anthesis. Rain at flowering is the primary risk driver.',
    identification: 'Bleached or pink-tinged spikelets on otherwise green ears. Orange sporodochia may be visible at spikelet bases in humid conditions. Infected grains are shrivelled, chalky white or pink.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'oats'],
    risk_factors: 'Rain during flowering (GS59-69), maize or cereal previous crop, minimum tillage retaining surface debris, warm humid conditions, susceptible variety',
    economic_impact: 'Direct yield loss typically 5-15%. Mycotoxin contamination (DON) can cause grain rejection at maximum legal limits (1250 ug/kg for unprocessed wheat). Quality downgrading costs significant premium losses.',
    images_description: 'Bleached spikelets with orange sporodochia on wheat ear',
  },
  {
    id: 'take-all',
    name: 'Take-All',
    common_names: ['Take-all root disease', 'Gaeumannomyces graminis var. tritici'],
    pest_type: 'disease',
    description: 'Soilborne root disease caused by Gaeumannomyces tritici (formerly G. graminis var. tritici). Destroys root systems of wheat and barley, causing characteristic whiteheads. Most severe in second and third successive wheat crops.',
    lifecycle: 'Fungus survives on infected root fragments in soil. Runner hyphae grow along roots, infecting new tissue. Builds up over successive cereal crops. Natural decline (take-all decline) occurs after 3-4 continuous wheat crops due to antagonistic soil microbes.',
    identification: 'Blackened root bases with characteristic black runner hyphae visible under hand lens. Above ground: irregular patches of stunted, pale plants. Whiteheads (prematurely ripened ears) in summer.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley'],
    risk_factors: 'Second or third consecutive wheat crop, alkaline soils (pH >7), light sandy soils, early drilling, poor soil structure, wet conditions in autumn and spring',
    economic_impact: 'Yield losses of 10-50% in severely affected patches, typically averaging 5-20% in second wheats. One of the main reasons for crop rotation in UK arable systems.',
    images_description: 'Blackened root bases with whiteheads in wheat field patches',
  },
  {
    id: 'eyespot',
    name: 'Eyespot',
    common_names: ['Stem base disease', 'Foot rot'],
    pest_type: 'disease',
    description: 'Stem base disease caused by Oculimacula yallundae (previously Tapesia yallundae) and O. acuformis. Weakens stem bases, causing lodging. Most prevalent in wet autumns and winters on heavy soils.',
    lifecycle: 'Conidia splash from infected stubble to stem bases of young plants in autumn. Infection progresses through leaf sheaths into the stem during winter and spring. Warm, wet conditions accelerate disease progress.',
    identification: 'Eye-shaped lesions on stem base at ground level. Lesions have a diffuse brown margin and lighter centre, sometimes with a dark spot at the core. Distinguished from sharp eyespot by diffuse margins.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'rye', 'triticale'],
    risk_factors: 'Second or third cereal crop, wet autumn and winter, early drilling, heavy soils, mild winters, high-yielding crops prone to lodging',
    economic_impact: 'Yield losses of 5-15% in moderate infections. Severe infections cause lodging, which can reduce yield by 20-30% and increase harvesting costs.',
    images_description: 'Eye-shaped lesion with diffuse brown margin on wheat stem base',
  },
  {
    id: 'powdery-mildew',
    name: 'Powdery Mildew',
    common_names: ['Mildew'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Blumeria graminis (form-specific: f.sp. tritici on wheat, f.sp. hordei on barley). Produces distinctive white powdery pustules on leaves and stems. Favoured by dry weather with high humidity.',
    lifecycle: 'Conidia spread by wind throughout the growing season. Survives between crops on volunteers and wild grasses. Unlike most cereal diseases, does not require leaf wetness for infection — high humidity (>95%) is sufficient.',
    identification: 'White to grey fluffy pustules on upper leaf surface, stems, and ears. Pustules darken with age. Black cleistothecia (sexual fruiting bodies) may be visible later in season. Leaves may yellow beneath pustules.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'spring barley', 'winter barley', 'oats'],
    risk_factors: 'Dense crops, high nitrogen, sheltered positions, dry weather with high humidity, susceptible varieties, volunteer cereal green bridge',
    economic_impact: 'Yield losses of 5-20% in susceptible varieties. Generally well-controlled by variety resistance. More important in barley than wheat in most UK seasons.',
    images_description: 'White powdery pustules on wheat leaf surface',
  },
  {
    id: 'light-leaf-spot',
    name: 'Light Leaf Spot',
    common_names: ['LLS'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Pyrenopeziza brassicae. The most damaging disease of winter oilseed rape in northern UK. Causes white or pale green spots on leaves, stems, and pods.',
    lifecycle: 'Ascospores released from previous crop debris in autumn. Airborne conidia spread throughout the canopy during winter and spring. Latent infections established in autumn may not become visible until spring.',
    identification: 'Small white or pale green spots on leaves, sometimes with a faint green halo. On stems and pods, lesions appear as bleached patches. Acervuli (spore-producing structures) visible as white dots under magnification.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Northern and western UK, autumn-sown crops, susceptible varieties, mild wet winters, proximity to previous OSR stubble',
    economic_impact: 'Yield losses of 10-30% in untreated susceptible crops in Scotland and northern England. Less damaging in southern England.',
    images_description: 'White spots with faint green halo on OSR leaves',
  },
  {
    id: 'phoma-stem-canker',
    name: 'Phoma Stem Canker',
    common_names: ['Blackleg', 'Leptosphaeria stem canker'],
    pest_type: 'disease',
    description: 'Stem canker disease of oilseed rape caused by Leptosphaeria maculans (and L. biglobosa). Causes damaging cankers at the stem base that restrict water and nutrient flow, leading to premature ripening.',
    lifecycle: 'Ascospores released from stubble pseudothecia in autumn. Spores infect leaves, causing phoma leaf spots. Fungus grows systemically down the petiole to the stem base over winter, causing cankers visible from spring onwards.',
    identification: 'Leaf spots: pale, round with dark margin and grey centre containing pycnidia. Stem cankers: dark, sunken, cracked lesions at stem base. Internal discolouration visible when stems are split.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Close OSR rotations (<4 years), susceptible varieties, early drilling, warm moist autumns, proximity to previous OSR stubble',
    economic_impact: 'Yield losses of 10-25% in severely affected crops. Premature ripening from stem cankers reduces oil content. One of the most consistently damaging diseases of UK oilseed rape.',
    images_description: 'Dark sunken canker at OSR stem base with internal discolouration',
  },
  {
    id: 'sclerotinia',
    name: 'Sclerotinia Stem Rot',
    common_names: ['White mould', 'Sclerotinia'],
    pest_type: 'disease',
    description: 'Stem rot caused by Sclerotinia sclerotiorum. Infects oilseed rape during flowering via airborne ascospores. Causes bleached, rotting stems with characteristic white mycelium and black sclerotia.',
    lifecycle: 'Sclerotia persist in soil for 5-8 years. In spring, sclerotia near the surface produce apothecia (small cup-shaped structures) that release ascospores. Spores land on senescing petals lodged in leaf axils, then infect stems.',
    identification: 'Bleached, water-soaked stem lesions with fluffy white mycelium. Black sclerotia (1-10mm hard resting bodies) form inside and on the stem surface. Infected stems become brittle and shatter at harvest.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'beans', 'peas', 'potatoes', 'carrots'],
    risk_factors: 'Wet weather during flowering, dense canopy trapping humidity, previous susceptible crops (OSR, beans), high sclerotia load in soil, prolonged petal fall period',
    economic_impact: 'Yield losses of 10-50% in severe outbreaks. Average UK annual loss estimated at GBP 50-100 million across all susceptible crops. Highly variable between seasons.',
    images_description: 'Bleached OSR stem with white mycelium and black sclerotia',
  },
  {
    id: 'ramularia',
    name: 'Ramularia Leaf Spot',
    common_names: ['Ramularia'],
    pest_type: 'disease',
    description: 'Leaf spot disease of barley caused by Ramularia collo-cygni. Causes small brown spots surrounded by yellow halos on upper leaves late in the season. Has increased in importance since chlorothalonil withdrawal.',
    lifecycle: 'Seed-transmitted and airborne conidia. Latent endophytic phase within the plant during early growth. Symptoms typically appear after ear emergence (GS49+) when physiological stress triggers disease expression. UV light exposure may activate symptoms.',
    identification: 'Small (1-3mm) rectangular brown spots bounded by leaf veins, often with a yellow halo. Spots may coalesce. Distinguished from physiological spotting by the presence of conidiophores on leaf undersurface (visible under microscope).',
    crops_affected: ['barley', 'winter barley', 'spring barley'],
    risk_factors: 'Late-season warm sunny weather after cool spring, susceptible varieties, infected seed, loss of chlorothalonil (previously main control), high nitrogen crops',
    economic_impact: 'Yield losses of 5-20% in affected crops. Increasing importance since 2020 due to loss of multi-site fungicide chlorothalonil. Can reduce specific weight and grain quality.',
    images_description: 'Small brown rectangular spots with yellow halo on barley leaf',
  },
  {
    id: 'net-blotch',
    name: 'Net Blotch',
    common_names: ['Net form of net blotch', 'Spot form of net blotch'],
    pest_type: 'disease',
    description: 'Foliar disease of barley caused by Pyrenophora teres. Two forms: net form (P. teres f. teres) produces net-like cross-hatching on leaves; spot form (P. teres f. maculata) produces dark spots. Both reduce green leaf area.',
    lifecycle: 'Survives on infected stubble and seed. Rain-splashed conidia infect lower leaves in autumn. Ascospores provide primary inoculum in spring. Disease progresses up the canopy during stem extension.',
    identification: 'Net form: distinctive dark brown net-like cross-hatching on leaves. Spot form: dark brown circular to elliptical spots, sometimes with chlorotic halo. Both forms may co-occur.',
    crops_affected: ['barley', 'winter barley', 'spring barley'],
    risk_factors: 'Barley-after-barley rotation, infected seed, susceptible varieties, wet weather, minimum tillage retaining surface residue',
    economic_impact: 'Yield losses of 10-30% in susceptible varieties. One of the most common barley diseases worldwide. Well-managed by variety choice and fungicides.',
    images_description: 'Dark brown net-like markings across barley leaf surface',
  },
  {
    id: 'rhynchosporium',
    name: 'Rhynchosporium',
    common_names: ['Leaf scald', 'Barley scald'],
    pest_type: 'disease',
    description: 'Foliar disease of barley caused by Rhynchosporium commune (formerly R. secalis). Produces characteristic blue-grey water-soaked lesions on leaves and leaf sheaths. Most important foliar disease of barley in wet western regions.',
    lifecycle: 'Splash-dispersed conidia spread from lower infected leaves and from stubble debris. Seed-borne inoculum also contributes. Most rapid spread in cool, wet conditions during autumn and spring.',
    identification: 'Irregular blue-grey to pale brown water-soaked lesions, often with a dark brown margin. Lesions typically start at leaf tip or margin. On leaf sheaths, lesions may girdle the sheath causing leaf death.',
    crops_affected: ['barley', 'winter barley', 'spring barley', 'rye'],
    risk_factors: 'Wet western and northern regions, susceptible varieties, barley-after-barley, infected stubble and seed, dense crops, mild wet autumns',
    economic_impact: 'Yield losses of 5-20% in affected crops. Most damaging in Scotland, Wales, and western England. Variety resistance is the primary management tool.',
    images_description: 'Blue-grey water-soaked lesions on barley leaf margins',
  },

  // ── Additional Cereal Diseases ─────────────────────────────────
  {
    id: 'sharp-eyespot',
    name: 'Sharp Eyespot',
    common_names: ['Rhizoctonia cerealis'],
    pest_type: 'disease',
    description: 'Stem base disease caused by Ceratobasidium cereale (anamorph Rhizoctonia cerealis). Produces sharply defined elliptical lesions on outer leaf sheaths and stems. More common on light soils and in crops following grass or cereals.',
    lifecycle: 'Soilborne fungus surviving on crop debris and organic matter. Infects stem bases in autumn via runner hyphae on the soil surface. Progresses through leaf sheaths inward through winter and spring.',
    identification: 'Sharply defined elliptical lesions with a dark brown border and grey-white centre on outer leaf sheaths. Distinguished from eyespot by sharp (not diffuse) lesion margins. Lesions higher on the stem than true eyespot.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley'],
    risk_factors: 'Light sandy soils, continuous cereal cropping, minimum tillage, grass leys in rotation, mild wet winters',
    economic_impact: 'Yield losses of 5-10% in moderate infections. Can cause lodging when lesions penetrate inner stem tissue. Often overestimated at early growth stages — many superficial infections do not penetrate to cause yield loss.',
    images_description: 'Sharply defined elliptical lesion with dark border on wheat stem sheath',
  },
  {
    id: 'ergot',
    name: 'Ergot',
    common_names: ['Claviceps purpurea'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Claviceps purpurea. Replaces grain with dark purple-black sclerotia (ergot bodies) that contain toxic alkaloids. A food safety concern rather than a major yield loss disease in modern agriculture.',
    lifecycle: 'Sclerotia germinate in spring to produce stalked fruiting bodies (stromata) releasing ascospores. Spores infect open florets of cereals and grasses. Honeydew containing conidia is spread by insects. Sclerotia form in place of grain.',
    identification: 'Dark purple-black elongated sclerotia (2-20mm) protruding from infected florets in place of grain. Honeydew (sticky, sweet exudate) on ears during early infection before sclerotia form.',
    crops_affected: ['wheat', 'rye', 'triticale', 'barley', 'oats'],
    risk_factors: 'Open-flowering cereals (rye, triticale), grass weed infestations providing inoculum, wet weather during flowering, field margins with infected grasses, hybrid varieties with male sterility',
    economic_impact: 'Direct yield loss is minor. Primary concern is grain contamination — EU maximum limit 0.5g/kg for unprocessed cereals. Rye and triticale most affected. Ergot alkaloids are toxic to humans and livestock.',
    images_description: 'Dark purple-black sclerotia protruding from wheat ear in place of grain',
  },
  {
    id: 'loose-smut-wheat',
    name: 'Loose Smut of Wheat',
    common_names: ['Ustilago tritici'],
    pest_type: 'disease',
    description: 'Seed-borne disease caused by Ustilago tritici. Infected plants produce ears completely replaced by masses of dark brown-black smut spores. Rare in modern certified seed but can build up in farm-saved seed.',
    lifecycle: 'Spores released at flowering infect developing seeds of adjacent healthy plants. The fungus remains dormant within the embryo of the infected seed. When sown, the fungus grows systemically within the plant, replacing the ear with spore masses.',
    identification: 'Entire ear replaced by a mass of dark brown-black powdery spores enclosed in a thin membrane that ruptures at heading. Affected ears emerge slightly earlier than healthy ears. Smutted ears are obvious at heading.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Farm-saved seed without fungicide treatment, warm moist conditions during flowering of previous crop, lack of seed testing, uncertified seed lots',
    economic_impact: 'Yield loss proportional to infection rate — typically 1-5% in untreated farm-saved seed. Eliminated by systemic seed treatments. Negligible in crops grown from certified seed.',
    images_description: 'Wheat ear completely replaced by mass of dark brown-black smut spores',
  },
  {
    id: 'covered-smut-barley',
    name: 'Covered Smut of Barley',
    common_names: ['Ustilago hordei'],
    pest_type: 'disease',
    description: 'Seed-borne disease caused by Ustilago hordei. Similar to loose smut but the spore mass remains enclosed in a persistent membrane that does not rupture until threshing. Controlled by seed treatment.',
    lifecycle: 'Spore masses released at threshing contaminate the surface of healthy seed. Spores germinate with the seed and grow systemically within the plant. Ears are replaced by smut balls — spore masses enclosed in a tough membrane.',
    identification: 'Ears appear dark and swollen, remaining enclosed in a grey-brown membrane. Spore masses only released when membrane is broken (typically at harvest). Distinguished from loose smut by the intact membrane.',
    crops_affected: ['barley', 'winter barley', 'spring barley'],
    risk_factors: 'Farm-saved seed without seed treatment, contamination at harvest from infected ears, uncertified seed',
    economic_impact: 'Low significance in modern agriculture due to effective seed treatments. Can reach 5-10% in untreated farm-saved seed. Eliminated by standard seed treatment fungicides.',
    images_description: 'Barley ear with dark swollen smut balls enclosed in grey membrane',
  },
  {
    id: 'barley-yellow-dwarf-virus',
    name: 'Barley Yellow Dwarf Virus',
    common_names: ['BYDV', 'Yellow dwarf'],
    pest_type: 'disease',
    description: 'Viral disease transmitted by aphid vectors, primarily bird cherry-oat aphid (Rhopalosiphum padi) and grain aphid (Sitobion avenae). Causes yellowing, reddening, and dwarfing of cereal plants. Not seed-transmitted.',
    lifecycle: 'Persistent, non-propagative transmission by aphids. Aphids acquire the virus in 12-24 hours of feeding and remain viruliferous for life. Autumn infections in winter cereals are most damaging. Virus overwinters in volunteers and autumn-sown crops.',
    identification: 'Wheat: yellow leaf tips and margins, often with a reddish-purple tinge. Barley: bright yellowing of leaves from tip downward. Oats: reddish-purple leaf discolouration. Plants stunted with reduced tillering. Symptoms appear in irregular patches.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oats', 'spring barley'],
    risk_factors: 'Mild autumn extending aphid flight period, early drilling before mid-October, absence of insecticidal seed treatment, proximity to grass hosts, warm September-November',
    economic_impact: 'Yield losses of 10-50% in severely affected crops. Average UK losses estimated at GBP 20-60 million annually. Risk increased since neonicotinoid seed treatment withdrawal in 2018.',
    images_description: 'Patches of yellowed and stunted cereal plants with purple-tinged leaf tips',
  },
  {
    id: 'wheat-yellow-mosaic-virus',
    name: 'Wheat Yellow Mosaic Virus',
    common_names: ['WYMV', 'Wheat spindle streak mosaic virus'],
    pest_type: 'disease',
    description: 'Soil-borne viral disease transmitted by the plasmodiophorid vector Polymyxa graminis. Causes yellow mosaic and spindle streak patterns on wheat leaves in spring. Confined to specific field areas where the vector is established.',
    lifecycle: 'The virus is carried within resting spores of Polymyxa graminis in soil, which persist for decades. Zoospores released in wet conditions infect wheat roots, introducing the virus. Symptoms expressed in cool spring weather (5-15C) and may disappear as temperatures rise.',
    identification: 'Yellow mosaic or spindle-shaped streaks on young leaves in spring. Symptoms most visible in cool spring weather. Patches of affected plants correspond to areas of vector establishment. Plants may grow through symptoms in warm weather.',
    crops_affected: ['wheat', 'winter wheat'],
    risk_factors: 'Heavy or poorly drained soils, fields with established Polymyxa graminis populations, cool wet springs, continuous wheat cropping, neutral to alkaline soils',
    economic_impact: 'Yield losses of 5-30% in affected patches. Distribution expanding slowly as vector spreads. No chemical control available for either virus or vector. Variety tolerance is the main management approach.',
    images_description: 'Yellow mosaic streaks on wheat leaves in spring-affected field patches',
  },
  {
    id: 'ear-blight-complex',
    name: 'Ear Blight Complex',
    common_names: ['Fusarium-Microdochium ear blight complex', 'Head blight'],
    pest_type: 'disease',
    description: 'Disease complex involving multiple Fusarium species and Microdochium nivale/majus. Differs from pure Fusarium ear blight in that Microdochium species do not produce mycotoxins but still cause yield loss through grain shrivelling.',
    lifecycle: 'Both Fusarium and Microdochium produce airborne and rain-splashed spores from cereal debris. Infection occurs through open florets at anthesis. Microdochium is favoured by cooler, wetter conditions than Fusarium graminearum.',
    identification: 'Bleached spikelets similar to Fusarium ear blight. Microdochium infection may produce grey-white discolouration rather than pink. Infected grains are shrivelled. Laboratory testing needed to distinguish Fusarium from Microdochium.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'oats'],
    risk_factors: 'Rain during flowering, cereal debris on soil surface, minimum tillage, cool wet summers (favours Microdochium), warm humid conditions (favours Fusarium), maize as previous crop',
    economic_impact: 'Combined yield losses of 5-20%. Microdochium does not produce DON mycotoxin, so species composition affects food safety risk. UK conditions often favour Microdochium-dominated complex.',
    images_description: 'Mixed bleached and grey-white spikelets on wheat ear during grain fill',
  },
  {
    id: 'sooty-moulds',
    name: 'Sooty Moulds',
    common_names: ['Cladosporium spp.', 'Black mould on wheat ears'],
    pest_type: 'disease',
    description: 'Superficial fungal growth (primarily Cladosporium spp. and Alternaria spp.) on wheat ears and grain. Grows on honeydew deposits from aphids or on damaged grain. A quality issue rather than a pathogenic infection.',
    lifecycle: 'Saprophytic fungi that colonise dead organic matter and exudates on plant surfaces. Spores are ubiquitous in the air. Fungal growth promoted by honeydew from aphid infestations, mechanical damage to grain, and humid conditions pre-harvest.',
    identification: 'Dark grey-black superficial fungal growth on ears and exposed grain surfaces. Often associated with aphid colonies (honeydew). Grain may appear blackened or discoloured. Not a true pathogenic infection — colonises surface only.',
    crops_affected: ['wheat', 'winter wheat', 'barley'],
    risk_factors: 'Aphid infestations producing honeydew, wet weather pre-harvest, delayed harvest, mechanical grain damage (e.g. from OWBM or bird damage), high humidity',
    economic_impact: 'Minimal yield loss but significant grain quality and appearance downgrading. Can cause rejection of milling wheat lots. Addressed by controlling aphids and timely harvest rather than direct fungicide application.',
    images_description: 'Dark grey-black fungal growth on wheat ear surface and exposed grain',
  },
  {
    id: 'crown-rot',
    name: 'Crown Rot',
    common_names: ['Fusarium crown rot'],
    pest_type: 'disease',
    description: 'Root and stem base disease caused by Fusarium pseudograminearum and F. culmorum. Causes brown discolouration of the crown and lower stem internodes, leading to whiteheads in dry conditions. Increasing in UK due to minimum tillage.',
    lifecycle: 'Fungus survives on cereal stubble in soil. Infects seedlings through the coleoptile and crown in autumn. Grows through stem base tissue during winter. Symptoms worst in dry springs when infected roots cannot supply water to developing ears.',
    identification: 'Brown discolouration of the stem base and crown, typically extending 1-2 internodes. Honey-brown rather than black (distinguishes from take-all). Whiteheads in dry seasons. Pink fungal growth may be visible on stem base in humid conditions.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley'],
    risk_factors: 'Cereal-after-cereal rotations, minimum tillage retaining surface residue, dry spring conditions after wet autumn infection, drought stress, heavy stubble loads',
    economic_impact: 'Yield losses of 5-25% in severe cases, especially when dry spring weather coincides with crown infection. Increasing in importance in UK with the trend toward reduced tillage systems.',
    images_description: 'Honey-brown discolouration of wheat stem base and crown with whiteheads',
  },
  {
    id: 'snow-mould',
    name: 'Snow Mould',
    common_names: ['Microdochium patch', 'Fusarium patch'],
    pest_type: 'disease',
    description: 'Cool-weather disease caused by Microdochium nivale and M. majus. Attacks cereals during autumn and winter, particularly under prolonged snow cover or cold wet conditions. Causes circular patches of dead or bleached tissue.',
    lifecycle: 'Conidia and mycelium survive on crop debris and seed. Active at 0-15C, optimal around 5C — the main winter-active foliar pathogen. Grows beneath snow cover. Seed-borne transmission is important in spring barley.',
    identification: 'Circular patches of bleached or grey-white dead leaf tissue, often with a pinkish-white mycelial fringe at the edges in moist conditions. Seedlings may be killed. Older plants show bleached lower leaves. Active when other diseases are dormant.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'rye', 'triticale'],
    risk_factors: 'Prolonged snow cover, cold wet autumn and winter, poorly drained fields, heavy nitrogen application in autumn, susceptible varieties, infected seed',
    economic_impact: 'Yield losses of 5-15% in affected patches. More important in northern UK and upland areas. Can destroy seedlings in severe cases. Also important as a turf disease on amenity grass.',
    images_description: 'Circular patches of bleached tissue with pinkish-white mycelial fringe on wheat leaves',
  },

  // ── OSR Diseases ───────────────────────────────────────────────
  {
    id: 'clubroot',
    name: 'Clubroot',
    common_names: ['Finger and toe', 'Plasmodiophora brassicae'],
    pest_type: 'disease',
    description: 'Soil-borne disease caused by the plasmodiophorid Plasmodiophora brassicae. Causes massive swelling (clubs) of roots, disrupting water and nutrient uptake. Resting spores persist in soil for 15-20 years. The most important soil-borne disease of brassica crops.',
    lifecycle: 'Resting spores germinate in moist soil to release zoospores that infect root hairs. Secondary zoospores infect cortical root cells, causing cell division and enlargement (club formation). Clubs decay at harvest, releasing billions of resting spores.',
    identification: 'Swollen, distorted, club-shaped roots. Above-ground: wilting on hot days (plants recover at night initially), purple leaf discolouration, stunting. Plants may be pulled up easily as root system is destroyed. Clubs become slimy as they decay.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Acid soils (pH <6.5), wet poorly drained fields, short brassica rotations, contaminated soil on machinery, high inoculum from previous brassica crops',
    economic_impact: 'Yield losses of 10-50% in infested fields. Can make fields permanently unsuitable for brassica cropping. Lime application and resistant varieties reduce impact. No effective chemical control.',
    images_description: 'Massively swollen and distorted club-shaped roots of OSR plant',
  },
  {
    id: 'alternaria-dark-leaf-spot',
    name: 'Alternaria Dark Leaf Spot',
    common_names: ['Dark leaf spot', 'Alternaria brassicae'],
    pest_type: 'disease',
    description: 'Foliar and pod disease caused by Alternaria brassicae and A. brassicicola. Produces dark brown-black spots with concentric rings on leaves and pods. More damaging on pods where it causes premature ripening and seed loss.',
    lifecycle: 'Conidia produced on infected plant debris, spread by rain splash and wind. Infects leaves and pods through direct penetration or wounds. Disease progresses during warm humid weather. Can be seed-borne.',
    identification: 'Dark brown-black spots with concentric rings (target-spot pattern) on leaves and pods. On pods, spots enlarge and cause premature splitting. Spots may coalesce, causing extensive leaf death. Older lesions may have a grey centre with sporulation.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Warm humid weather during pod development, close OSR rotations, high inoculum from debris, wounded tissue, late-season dense canopy',
    economic_impact: 'Yield losses of 5-15% from premature pod shatter and reduced seed weight. Most damaging in warm, humid seasons. Pod infections cause more yield loss than leaf infections.',
    images_description: 'Dark concentric-ring spots on OSR pod and leaf surface',
  },
  {
    id: 'white-leaf-spot',
    name: 'White Leaf Spot',
    common_names: ['Mycosphaerella capsellae', 'Pseudocercosporella capsellae'],
    pest_type: 'disease',
    description: 'Foliar disease of OSR caused by Mycosphaerella capsellae. Produces small white to grey spots on leaves, stems, and pods. Often co-occurs with light leaf spot and can be confused with it in early stages.',
    lifecycle: 'Ascospores released from previous crop debris provide primary inoculum. Conidia spread the disease within the canopy during winter and spring. Favoured by cool, wet conditions similar to light leaf spot.',
    identification: 'Small (1-5mm) white to grey spots on leaves, sometimes coalescing. Spots lack the green halo seen in light leaf spot. On stems and pods, pale cream spots may cause superficial cracking. Requires microscopy to distinguish from LLS reliably.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Cool wet autumn and winter, close OSR rotations, susceptible varieties, northern regions, co-occurrence with light leaf spot',
    economic_impact: 'Generally less damaging than light leaf spot. Yield losses of 3-10% in severe cases. Often overlooked or confused with LLS. Increasing in recognition as a distinct pathogen contributing to foliar disease complex.',
    images_description: 'Small white-grey spots on OSR leaves without green halo',
  },
  {
    id: 'verticillium-wilt-osr',
    name: 'Verticillium Wilt of OSR',
    common_names: ['Verticillium longisporum'],
    pest_type: 'disease',
    description: 'Vascular wilt disease caused by Verticillium longisporum. Infects oilseed rape through roots and colonises the xylem, causing premature ripening with characteristic one-sided yellowing of leaves. Increasing in UK.',
    lifecycle: 'Microsclerotia persist in soil for 10+ years. Root exudates stimulate germination. Fungus enters roots, colonises xylem vessels, and is transported upward. Symptoms appear from stem extension. New microsclerotia form in stem debris after harvest.',
    identification: 'One-sided (asymmetric) yellowing of leaves, progressing upward. Stem cross-section shows brown discolouration of vascular tissue. Premature ripening of one side of plant. Microsclerotia visible as black dots on stem surface after harvest.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Short OSR rotations (<4 years), high soil inoculum from previous brassica crops, warm conditions during root growth, lack of resistant varieties',
    economic_impact: 'Yield losses of 10-30% in severely affected crops. Increasing in UK and continental Europe. Long-lived soil inoculum means problems persist. Variety resistance and extended rotation are the main management tools.',
    images_description: 'One-sided yellowing of OSR leaf and brown vascular discolouration in stem cross-section',
  },
  {
    id: 'downy-mildew-osr',
    name: 'Downy Mildew of OSR',
    common_names: ['Hyaloperonospora parasitica', 'Peronospora parasitica'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Hyaloperonospora parasitica. Produces angular yellow patches on upper leaf surface with white-grey sporulation on the underside. Mainly a seedling and young plant disease in oilseed rape.',
    lifecycle: 'Oospores survive in soil and seed. Sporangia produced on infected tissue in cool, humid conditions. Spread by wind and rain splash. Most aggressive at seedling stage. Older plants develop resistance. Systemic infection can occur in seedlings.',
    identification: 'Angular yellow patches on upper leaf surface, delimited by leaf veins. White-grey downy sporulation on corresponding lower surface. Seedlings may show systemic infection with stunting and distorted growth.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Cool humid conditions (8-15C), dense plant stands, autumn-sown crops at seedling stage, poor air circulation, infected seed',
    economic_impact: 'Yield loss generally low (2-5%) in established crops. Can be more damaging at seedling stage if systemic infection occurs. Usually a cosmetic issue in mature crops. Seed treatments provide early protection.',
    images_description: 'Angular yellow patches on OSR leaf upper surface with white-grey sporulation beneath',
  },
  {
    id: 'turnip-yellows-virus',
    name: 'Turnip Yellows Virus',
    common_names: ['TuYV', 'Beet western yellows virus'],
    pest_type: 'disease',
    description: 'Viral disease transmitted by peach-potato aphid (Myzus persicae). Causes interveinal yellowing and reddening of OSR leaves from late autumn. Widespread across UK OSR crops — most plants are infected in most years, but yield impact is subtle.',
    lifecycle: 'Persistent transmission by Myzus persicae (minimum 15-minute acquisition, retained for life). Virus circulates year-round in brassica weeds and volunteer OSR. Autumn aphid migration introduces virus to newly established crops.',
    identification: 'Interveinal yellowing and purple-red discolouration of older leaves, often on one half of the leaf first. Plants appear generally less vigorous. Difficult to distinguish from nutrient deficiency without laboratory testing. Symptoms vary with variety.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Mild autumn extending aphid flight period, loss of neonicotinoid seed treatments, early drilling, proximity to brassica host plants, Myzus persicae populations with insecticide resistance',
    economic_impact: 'Yield losses of 10-30% documented in research trials. Difficult to attribute in practice because infection is near-universal. Estimated annual UK cost GBP 60-100 million. TuYV-resistant varieties now available on the Recommended List.',
    images_description: 'Interveinal yellowing and purple-red discolouration on older OSR leaves',
  },

  // ── Potato Diseases ────────────────────────────────────────────
  {
    id: 'late-blight',
    name: 'Late Blight',
    common_names: ['Potato blight', 'Phytophthora infestans'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Phytophthora infestans. The most devastating potato disease worldwide, responsible for the Irish potato famine. Causes rapid destruction of foliage and tuber rot. New aggressive strains (e.g. EU_43_A1) pose ongoing threats.',
    lifecycle: 'Survives on infected tubers (seed, volunteers, waste heaps). Sporangia produced on infected foliage, wind-dispersed over many kilometres. Zoospores released in wet conditions infect leaves and stems. Sporangia wash into soil to infect tubers.',
    identification: 'Water-soaked dark brown-black lesions on leaves and stems, expanding rapidly in humid conditions. White sporulation (sporangiophores) visible on lesion margins in humid weather, particularly on leaf undersurface. Tubers show firm reddish-brown rot.',
    crops_affected: ['potatoes'],
    risk_factors: 'Warm humid weather (Smith periods: 2 consecutive days >10C with >90% humidity for 11+ hours), susceptible varieties, infected seed or volunteer potatoes, proximity to waste heaps',
    economic_impact: 'Untreated blight can destroy a potato crop in 7-10 days. UK potato industry spends GBP 50-60 million annually on blight control. New genotypes (EU_36_A2, EU_43_A1) with fungicide insensitivity increasing threat.',
    images_description: 'Dark water-soaked lesions with white sporulation on potato leaf margin',
  },
  {
    id: 'early-blight',
    name: 'Early Blight',
    common_names: ['Target spot', 'Alternaria solani'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Alternaria solani. Produces dark brown spots with concentric rings (target spot) on potato leaves. Most common late in the season on stressed or senescing plants. Less destructive than late blight but increasingly recognised.',
    lifecycle: 'Survives on infected crop debris in soil. Conidia produced on debris, wind-dispersed to lower leaves. Disease progresses up the canopy. Favoured by warm days and cool nights with heavy dew. Older and stressed plants most susceptible.',
    identification: 'Dark brown circular spots with concentric rings giving a target-board appearance. Lower leaves affected first. Lesions dry and papery. Distinguished from late blight by dry lesions (not water-soaked), concentric rings, and absence of white sporulation.',
    crops_affected: ['potatoes'],
    risk_factors: 'Warm days (20-30C) with cool nights and heavy dew, stressed plants, nutrient deficiency (nitrogen, potassium), late season, senescing canopy, susceptible varieties',
    economic_impact: 'Yield losses of 5-20% in susceptible varieties when uncontrolled. Often co-occurs with late blight programmes and receives incidental control. Increasing in recognition as a distinct yield-limiting disease.',
    images_description: 'Dark brown target-spot lesions with concentric rings on potato leaf',
  },
  {
    id: 'potato-cyst-nematode',
    name: 'Potato Cyst Nematode',
    common_names: ['PCN', 'Eelworm', 'Globodera pallida', 'Globodera rostochiensis'],
    pest_type: 'disease',
    description: 'Soilborne nematode pests (Globodera pallida and G. rostochiensis). Larvae invade roots and feed internally, forming cysts on root surfaces. Causes stunting, yellowing, and yield loss. Cysts persist in soil for 20+ years.',
    lifecycle: 'Cysts containing 200-600 eggs persist in soil. Root exudates from potato stimulate hatching. Juvenile nematodes invade roots, feed on cells, and mature. Females swell to form visible cysts on root surface. One generation per year.',
    identification: 'Above ground: irregular patches of stunted, pale, wilting plants. Below ground: small white (G. rostochiensis) or cream/brown (G. pallida) spherical cysts (0.5mm) visible on root surface. Soil testing confirms species and population density.',
    crops_affected: ['potatoes'],
    risk_factors: 'Short potato rotations, high nematode populations, susceptible varieties, infested soil transferred on machinery, lack of resistant varieties for G. pallida',
    economic_impact: 'Yield losses of 10-60% in heavily infested fields. UK statutory pest requiring management. G. pallida is the dominant species and more difficult to manage than G. rostochiensis. Nematicide use and resistance breeding are the main tools.',
    images_description: 'Stunted yellowing potato patch with small white cysts visible on pulled roots',
  },
  {
    id: 'blackleg',
    name: 'Blackleg',
    common_names: ['Bacterial soft rot', 'Pectobacterium atrosepticum'],
    pest_type: 'disease',
    description: 'Bacterial disease caused by Pectobacterium atrosepticum (cool climates) and Dickeya spp. (warmer conditions). Causes wet black rot of stem base and tuber soft rot. Transmitted primarily through infected seed tubers.',
    lifecycle: 'Bacteria survive in infected seed tubers and soil. Infection spreads from rotting mother tuber up the stem in wet conditions. Tuber contamination occurs via stolon end or lenticels in waterlogged soil. Spread by water and contaminated equipment.',
    identification: 'Wet, slimy, black rotting of stem base from soil level upward. Foul smell from decaying tissue. Affected stems easily pulled from the plant. Tubers show soft, wet, cream-coloured internal rot that turns dark on exposure to air.',
    crops_affected: ['potatoes'],
    risk_factors: 'Infected seed tubers, wet soil conditions, waterlogging, warm temperatures (for Dickeya spp.), mechanical damage at harvest, anaerobic storage conditions',
    economic_impact: 'Yield losses of 5-20% from plant losses and tuber rot. Seed certification limits blackleg to 2% in certified seed. Storage losses can be severe if infected tubers are stored. No chemical control — seed hygiene is primary management.',
    images_description: 'Wet black slimy rot at potato stem base with foul-smelling tissue',
  },
  {
    id: 'common-scab',
    name: 'Common Scab',
    common_names: ['Potato scab', 'Streptomyces scabies'],
    pest_type: 'disease',
    description: 'Tuber skin disease caused by Streptomyces scabies and related species. Produces raised, rough, corky lesions on tuber surface. A quality defect rather than a yield loss disease — affects appearance and peelability. Favoured by dry alkaline soils.',
    lifecycle: 'Streptomyces bacteria are ubiquitous in soil. Infection occurs through lenticels on developing tubers during a 2-4 week susceptible period after tuber initiation. Dry conditions during this period favour infection. Alkaline soils increase severity.',
    identification: 'Raised, rough, corky brown lesions on tuber surface. Can be flat, raised, or pitted depending on strain and conditions. Does not affect flesh beneath the lesion. Tuber skin feels rough and sandpaper-like.',
    crops_affected: ['potatoes'],
    risk_factors: 'Dry soil during tuber initiation, alkaline soils (pH >5.5 for most strains), previous liming, susceptible varieties, low organic matter',
    economic_impact: 'No yield loss but significant quality downgrading. Scab-affected tubers rejected by supermarkets and processing factories. High cosmetic standard demanded by fresh pack market. Irrigation during tuber initiation is the main control.',
    images_description: 'Raised rough corky brown scab lesions on potato tuber surface',
  },
  {
    id: 'silver-scurf',
    name: 'Silver Scurf',
    common_names: ['Helminthosporium solani'],
    pest_type: 'disease',
    description: 'Tuber skin disease caused by Helminthosporium solani. Produces silvery patches on tuber surface and increases water loss in storage. A seed-borne quality disease that has increased in importance with the move to washed pre-pack potatoes.',
    lifecycle: 'Seed-borne: conidia on infected seed tuber surfaces infect daughter tubers via lenticels. Disease spreads within the store in humid conditions. New conidia produced on tuber surface re-infect adjacent tubers. Soil inoculum less important than seed.',
    identification: 'Silvery or metallic sheen on tuber skin, initially in small patches that enlarge during storage. Skin becomes papery and may peel. Tubers lose moisture more rapidly than healthy tubers, leading to shrinkage and weight loss.',
    crops_affected: ['potatoes'],
    risk_factors: 'Infected seed tubers, long storage periods, high humidity in store, delayed harvesting, susceptible varieties, lack of post-harvest treatment',
    economic_impact: 'No field yield loss but significant storage losses and quality downgrading. Increased moisture loss causes weight loss (commercial loss) and shrivelling. Important for pre-pack and fresh market where appearance standards are high.',
    images_description: 'Silvery metallic patches on potato tuber skin surface',
  },

  // ── Pulse Diseases ─────────────────────────────────────────────
  {
    id: 'chocolate-spot',
    name: 'Chocolate Spot',
    common_names: ['Botrytis fabae'],
    pest_type: 'disease',
    description: 'Foliar disease of beans caused by Botrytis fabae (aggressive form) and B. cinerea (non-aggressive form). Produces distinctive chocolate-brown spots on leaves, stems, and pods. The most important disease of winter and spring beans in the UK.',
    lifecycle: 'Ascospores from previous crop debris provide primary inoculum. Non-aggressive phase: small discrete spots on leaves. Aggressive phase: spots enlarge, coalesce, and cause rapid defoliation in warm, humid conditions. Favoured by dense canopy.',
    identification: 'Small (1-5mm) circular chocolate-brown spots on leaves (non-aggressive). In aggressive phase, spots enlarge with dark brown-grey mass of spores, leaves blacken and die. Can affect entire plant including stems and pods.',
    crops_affected: ['beans', 'winter beans', 'spring beans'],
    risk_factors: 'Dense canopy, high humidity, warm temperatures (15-22C), high nitrogen, autumn-sown crops (longer exposure), proximity to previous bean crops',
    economic_impact: 'Yield losses of 10-40% in severe outbreaks of aggressive chocolate spot. Non-aggressive form causes minor loss. Most damaging in winter beans in wet, warm seasons. Fungicide timing at early flowering is critical.',
    images_description: 'Circular chocolate-brown spots on bean leaf surface',
  },
  {
    id: 'downy-mildew-peas',
    name: 'Downy Mildew of Peas',
    common_names: ['Peronospora viciae'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Peronospora viciae. Causes yellow patches on upper leaf surface with grey-purple sporulation on the underside. Systemic infections cause stunted, distorted plants. Most damaging at seedling stage.',
    lifecycle: 'Oospores persist in soil and infected debris for several years. Systemic infection occurs when oospores germinate and infect seedling roots. Localised foliar infection from airborne sporangia in cool, humid weather. Seed-borne transmission also occurs.',
    identification: 'Yellow patches on upper leaf surface with grey-violet downy sporulation on corresponding lower surface. Systemically infected plants are stunted, pale, and have curled distorted growth. Pods may be distorted and poorly filled.',
    crops_affected: ['peas', 'spring peas', 'winter peas'],
    risk_factors: 'Cool humid conditions (5-15C), infected soil with short pea rotation, infected seed, dense crop, wet springs',
    economic_impact: 'Yield losses of 5-25% in severe cases. Systemic infection from soil can be very damaging. Localised foliar infection less damaging. Seed treatment and rotation are the main management approaches.',
    images_description: 'Yellow patches on pea leaf with grey-violet sporulation on underside',
  },
  {
    id: 'ascochyta-blight',
    name: 'Ascochyta Blight',
    common_names: ['Ascochyta leaf and pod spot'],
    pest_type: 'disease',
    description: 'Disease complex caused by Ascochyta pisi (peas), A. fabae (beans), and related species. Causes dark spots on leaves, stems, and pods. Seed-borne and rain-splashed. Can cause significant seed quality issues through pod infection.',
    lifecycle: 'Seed-borne and debris-borne. Pycnidiospores rain-splashed from lower leaves upward. Pseudothecia on debris provide ascospore inoculum. Infection occurs through stomata in wet conditions. Pod infection leads to seed infection perpetuating the cycle.',
    identification: 'Dark brown to black spots on leaves, stems, and pods. Lesions on peas have a dark margin with lighter centre and visible pycnidia. On beans, dark sunken spots on stems and pods. Infected seeds may show brown staining.',
    crops_affected: ['peas', 'spring peas', 'beans', 'spring beans'],
    risk_factors: 'Infected seed, wet weather during flowering and pod fill, close rotations, crop debris on soil surface, dense plant populations',
    economic_impact: 'Yield losses of 5-20% from leaf area loss and seed infection. Seed-borne infection perpetuates the disease. Seed testing and treatment reduce risk. Important for seed quality in pulse exports.',
    images_description: 'Dark brown-black spots with visible pycnidia on pea leaf and pod',
  },
  {
    id: 'bean-rust',
    name: 'Bean Rust',
    common_names: ['Uromyces viciae-fabae'],
    pest_type: 'disease',
    description: 'Rust disease caused by Uromyces viciae-fabae. Produces dark brown pustules on leaves and stems of beans. Primarily a late-season disease but early infections on winter beans can be more damaging.',
    lifecycle: 'Autoecious rust (completes lifecycle on one host). Urediniospores spread by wind. Overwinters on crop debris and volunteer beans. Most rapid development in warm, humid conditions. Late-season disease in spring beans, can be earlier in winter beans.',
    identification: 'Dark brown (chocolate-brown) round uredinia (pustules) scattered on leaves, petioles, and stems. Pustules rupture leaf epidermis releasing brown spores. Later in season, black telia replace uredinia. Leaves yellow and fall prematurely.',
    crops_affected: ['beans', 'winter beans', 'spring beans'],
    risk_factors: 'Warm humid conditions (15-22C), late-season prolonged canopy, volunteer beans, close rotations, susceptible varieties, early-sown winter beans',
    economic_impact: 'Yield losses of 5-25% in severe early infections. Late infections (after pod fill) cause less yield loss. Most damaging when rust develops before or during flowering. Fungicide application at first signs effective.',
    images_description: 'Dark brown rust pustules scattered on bean leaf surface',
  },

  // ── Sugar Beet Diseases ────────────────────────────────────────
  {
    id: 'cercospora-leaf-spot',
    name: 'Cercospora Leaf Spot',
    common_names: ['CLS', 'Cercospora beticola'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Cercospora beticola. Produces small circular spots with grey-white centre and dark border on beet leaves. The most damaging foliar disease of sugar beet globally, currently expanding northward into the UK.',
    lifecycle: 'Survives on infected debris and seed. Conidia produced on lesions, rain-splashed and wind-dispersed. Infection through stomata in warm, humid conditions (>25C optimal). Multiple cycles per season possible in warm years.',
    identification: 'Small (2-5mm) circular spots with grey-white to tan centre, dark brown to reddish-purple border, and sometimes a yellow halo. Spots may coalesce, causing extensive leaf death. Needs to be distinguished from Ramularia leaf spot.',
    crops_affected: ['sugar beet'],
    risk_factors: 'Warm humid conditions (>25C, >90% RH), short rotations, infected debris, continental European origin inoculum, southern and eastern England',
    economic_impact: 'Can cause 20-40% sugar yield loss in severe outbreaks in continental Europe. UK impact currently limited but increasing with warmer summers. Loss of sugar content and root yield from repeated defoliation and leaf regrowth.',
    images_description: 'Small circular spots with grey centre and dark border on sugar beet leaf',
  },
  {
    id: 'powdery-mildew-beet',
    name: 'Powdery Mildew of Sugar Beet',
    common_names: ['Erysiphe betae'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Erysiphe betae. Produces white powdery coating on leaf surfaces. Common in late summer and early autumn on sugar beet. Reduces photosynthetic capacity and sugar content of roots.',
    lifecycle: 'Wind-dispersed conidia infect leaf surfaces. Does not require free water — high humidity sufficient. Survives between crops on beet debris and alternative hosts. Most rapid development in warm, dry weather with cool nights producing dew.',
    identification: 'White powdery coating on upper and lower leaf surfaces. Initially in discrete patches, spreading to cover entire leaves. Affected leaves become chlorotic and may die prematurely. Black cleistothecia may appear late in season.',
    crops_affected: ['sugar beet'],
    risk_factors: 'Warm dry days with cool dewy nights, late season (July-September), susceptible varieties, dense crop canopy',
    economic_impact: 'Yield losses of 5-15% sugar yield if established before mid-August. Late infections cause less damage. Well-controlled by fungicide programmes. Variety resistance available.',
    images_description: 'White powdery mildew coating on sugar beet leaf surfaces',
  },
  {
    id: 'rhizomania',
    name: 'Rhizomania',
    common_names: ['Beet Necrotic Yellow Vein Virus', 'BNYVV'],
    pest_type: 'disease',
    description: 'Viral disease transmitted by the soil-borne vector Polymyxa betae. Causes massive proliferation of lateral roots (rhizomania = root madness), constricted tap root, and reduced sugar content. A statutory notifiable disease in many countries.',
    lifecycle: 'Virus carried within resting spores of Polymyxa betae in soil, persisting for 15+ years. Zoospores released in wet conditions infect beet roots, introducing the virus. Infected root cells produce virus particles that are transmitted to new roots.',
    identification: 'Wilting and yellowing of leaves in hot weather. Tap root constricted with fan-shaped proliferation of fine lateral roots. Root cross-section shows yellow discolouration of vascular tissue. Reduced sugar content. Field patches correspond to vector distribution.',
    crops_affected: ['sugar beet'],
    risk_factors: 'Infested soil with Polymyxa betae, wet poorly drained fields, alkaline soils, short beet rotations, contaminated soil on machinery',
    economic_impact: 'Yield losses of 30-70% in susceptible varieties on infested land. All UK sugar beet varieties now carry Rz1 resistance. Resistance-breaking strains reported in continental Europe. Rotation and resistant varieties are the only management tools.',
    images_description: 'Constricted beet tap root with excessive lateral root proliferation',
  },
  {
    id: 'ramularia-beet',
    name: 'Ramularia Leaf Spot of Beet',
    common_names: ['Ramularia beticola'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Ramularia beticola. Produces small pale brown spots on sugar beet leaves, similar in appearance to Cercospora but favoured by cooler conditions. Common in the UK and northern Europe.',
    lifecycle: 'Survives on infected debris. Conidia produced on lesions in cool, humid conditions. Rain-splashed to new leaves. Most active at 15-20C — cooler than Cercospora. Multiple infection cycles through the growing season.',
    identification: 'Small (2-5mm) pale brown to grey spots, often angular and limited by veins. Distinguished from Cercospora by smaller size, less distinct border, and absence of reddish-purple margin. Often needs laboratory confirmation for reliable distinction.',
    crops_affected: ['sugar beet'],
    risk_factors: 'Cool humid conditions (15-20C), wet summers, short beet rotations, infected debris, UK climate conditions',
    economic_impact: 'Yield losses of 5-15% in severe years. More common than Cercospora in the UK due to cooler climate. Often co-managed with other foliar diseases in fungicide programmes. Reduced efficacy of some fungicides reported.',
    images_description: 'Small pale brown angular spots on sugar beet leaf surface',
  },
];

// ── Insect Pests ────────────────────────────────────────────────

const INSECT_PESTS: Pest[] = [
  {
    id: 'grain-aphid',
    name: 'Grain Aphid',
    common_names: ['English grain aphid', 'Sitobion avenae'],
    pest_type: 'pest',
    description: 'Aphid species (Sitobion avenae) that feeds on cereal ears and upper leaves. The most economically important cereal aphid in the UK. Direct feeding reduces grain fill; honeydew deposits cause sooty moulds.',
    lifecycle: 'Overwinters as eggs on grasses or as viviparous females on winter cereals. Winged adults colonise crops from late April. Populations peak around flowering (GS59-69). Natural enemies (parasitoids, ladybirds, hoverflies) provide control from mid-summer.',
    identification: 'Green to reddish-brown aphid 2-3mm long, found on ears and flag leaves. Black siphunculi (cornicles) at rear. Distinguished from bird cherry-oat aphid by longer siphunculi and preference for ears rather than leaves.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'oats'],
    risk_factors: 'Warm dry spring, low natural enemy numbers, early ear emergence, absence of field margins supporting predators, late nitrogen application promoting lush growth',
    economic_impact: 'Direct feeding damage and honeydew causing sooty moulds. Yield loss up to 15% in severe outbreaks. AHDB threshold: average 5 per ear during grain fill.',
    images_description: 'Clusters of green-brown aphids on wheat ear',
  },
  {
    id: 'bird-cherry-aphid',
    name: 'Bird Cherry-Oat Aphid',
    common_names: ['BYDV vector', 'Rhopalosiphum padi'],
    pest_type: 'pest',
    description: 'Aphid species (Rhopalosiphum padi) that transmits Barley Yellow Dwarf Virus (BYDV). Primary vector of BYDV in UK autumn-sown cereals. Direct feeding damage is minor compared to virus transmission impact.',
    lifecycle: 'Summer host is bird cherry (Prunus padus). Winged migrants colonise cereal crops from September. Virus acquisition and transmission requires 12-24 hours of feeding. Autumn flights peak in October; mild autumns extend migration.',
    identification: 'Small (1.5-2.5mm) olive-green to dark brown aphid with a distinctive rusty-red patch around the siphunculi bases. Found on leaves rather than ears. Often in colonies on lower leaves.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oats'],
    risk_factors: 'Mild autumn extending aphid flight period, early drilling (before mid-October), absence of neonicotinoid seed treatments (withdrawn), proximity to bird cherry trees, warm September-November',
    economic_impact: 'BYDV yield losses of 10-50% in severely infected crops. Average UK losses estimated at GBP 20-60 million annually. Neonicotinoid seed treatment withdrawal (2018) has increased BYDV risk.',
    images_description: 'Small olive-green aphid with rusty-red patch near siphunculi on cereal leaf',
  },
  {
    id: 'orange-wheat-blossom-midge',
    name: 'Orange Wheat Blossom Midge',
    common_names: ['OWBM', 'Sitodiplosis mosellana'],
    pest_type: 'pest',
    description: 'Cereal midge (Sitodiplosis mosellana) whose larvae feed on developing wheat grains. Adult females lay eggs in wheat ears at ear emergence. Larvae cause shrivelled grain and quality downgrading.',
    lifecycle: 'Pupae overwinter in soil. Adults emerge in June-July when evening temperatures exceed 15C. Females lay eggs between glumes of wheat ears at GS59-61. Larvae feed on developing grains for 2-3 weeks, then drop to soil to pupate.',
    identification: 'Adults: tiny (2-3mm) orange flies swarming around wheat ears at dusk in June-July. Larvae: small (2mm) orange maggots found between glumes when ears are peeled open. Damaged grains are shrivelled at the embryo end.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Warm still evenings during ear emergence, high soil moisture in May-June for adult emergence, field history of OWBM, wheat after wheat, non-resistant variety',
    economic_impact: 'Yield losses of 5-30% in untreated susceptible crops during outbreak years. Quality downgrading from shrivelled grain. Resistant varieties (Robigus-type resistance) now widely deployed.',
    images_description: 'Tiny orange flies around wheat ear at dusk; orange larvae between glumes',
  },
  {
    id: 'cabbage-stem-flea-beetle',
    name: 'Cabbage Stem Flea Beetle',
    common_names: ['CSFB', 'Psylliodes chrysocephala'],
    pest_type: 'pest',
    description: 'Flea beetle (Psylliodes chrysocephala) that damages oilseed rape at establishment. Adults cause shot-holing of cotyledons and first true leaves. Larvae mine into petioles and stems, causing structural weakness.',
    lifecycle: 'Adults become active in August-September after summer aestivation. Migrate to newly emerged OSR crops. Eggs laid at the base of plants in autumn. Larvae feed inside petioles and stems through winter, pupating in soil in spring.',
    identification: 'Adults: small (3-5mm) metallic blue-black beetles that jump when disturbed. Shot-holes in cotyledons and true leaves. Larvae: white, legless grubs (up to 7mm) found inside petioles and stems when split.',
    crops_affected: ['oilseed rape', 'winter oilseed rape'],
    risk_factors: 'Early emerging crops (August-September), dry seedbeds slowing establishment, proximity to previous OSR crops, warm autumn weather increasing beetle activity, loss of neonicotinoid seed treatments',
    economic_impact: 'Yield losses of 5-50% in severe infestations. CSFB has become the most damaging pest of UK oilseed rape since neonicotinoid seed treatment withdrawal. Some fields abandoned due to larval damage. Estimated annual losses GBP 100+ million.',
    images_description: 'Small metallic blue-black beetles on OSR cotyledon with shot-holes',
  },
  {
    id: 'pollen-beetle',
    name: 'Pollen Beetle',
    common_names: ['Rape blossom beetle', 'Brassicogethes aeneus', 'Meligethes aeneus'],
    pest_type: 'pest',
    description: 'Small beetle (Brassicogethes aeneus) that feeds on pollen within OSR buds before flowering. Damage occurs during the green-yellow bud stage. Once flowering begins, beetles cause little further harm as open flowers provide accessible pollen.',
    lifecycle: 'Adults emerge from winter hibernation in March-April. Migrate to OSR crops at green-yellow bud stage. Eggs laid in buds; larvae feed on pollen then drop to soil to pupate. One generation per year.',
    identification: 'Adults: small (2-3mm) shiny black-green beetles found in OSR buds. Damaged buds fail to open or produce aborted flowers. Larvae: small, pale grubs inside buds.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Warm spring weather above 15C triggering mass migration, backward crop at green bud stage during beetle migration, small crop area concentrating beetles, pyrethroid resistance',
    economic_impact: 'Yield losses of 5-15% in untreated crops when threshold exceeded. Pyrethroid resistance is now widespread in UK populations. Threshold: 15 beetles per plant at green bud (GS3.3-3.5) for winter OSR.',
    images_description: 'Small shiny dark beetles inside yellow-green OSR buds',
  },
  {
    id: 'slugs',
    name: 'Slugs',
    common_names: ['Grey field slug', 'Deroceras reticulatum'],
    pest_type: 'pest',
    description: 'Grey field slug (Deroceras reticulatum) is the most damaging slug species in UK arable crops. Feeds on seeds, seedlings, and established plant tissue, particularly in wet autumn conditions. Causes irregular plant establishment.',
    lifecycle: 'Active year-round in mild, moist conditions. Eggs laid in clusters in soil crevices, hatching after 2-4 weeks. Multiple generations per year. Most active at night and in overcast, damp weather. Population builds under min-till and cover crop residues.',
    identification: 'Grey-brown slug 35-50mm long with cream/white underside. Leaves irregular ragged feeding damage on leaves. Seed hollowing visible on germinating seed. Slime trails on soil surface and plant debris.',
    crops_affected: ['wheat', 'winter wheat', 'oilseed rape', 'winter oilseed rape', 'potatoes', 'beans', 'peas'],
    risk_factors: 'Wet autumn, cloddy seedbed with poor consolidation, minimum tillage, cover crop residue, heavy clay soils, previous grass or cover crop, mild winters',
    economic_impact: 'Yield losses from poor establishment can reach 5-30% or require costly re-drilling. Annual UK slug damage estimated at GBP 40-60 million. Metaldehyde bait withdrawn 2022; ferric phosphate now the main control.',
    images_description: 'Grey-brown slug on soil surface near damaged wheat seedling',
  },
  {
    id: 'wheat-bulb-fly',
    name: 'Wheat Bulb Fly',
    common_names: ['Delia coarctata'],
    pest_type: 'pest',
    description: 'Fly species (Delia coarctata) whose larvae bore into wheat stems at or below ground level. Most damaging in late-sown winter wheat following fallow, set-aside, or early-lifted potatoes. Larvae destroy the central shoot, causing deadhearts.',
    lifecycle: 'Adults lay eggs on bare soil surface in July-August. Eggs overwinter in soil. Larvae hatch in January-February and bore into the base of the nearest wheat stem. One generation per year.',
    identification: 'Deadhearts: central shoot of young wheat plant yellows and can be pulled out easily. Larva visible as a white-cream maggot (up to 10mm) inside the stem base below ground level.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Late drilling (November onwards), bare soil in July-August (fallow, early potato harvest, set-aside), eastern England, thin backward crops in spring',
    economic_impact: 'Yield losses of 5-20% in affected fields. Can cause crop failure in severe cases. Most important in East Anglia and eastern England where egg populations are highest.',
    images_description: 'Deadheart shoot in young wheat plant; cream larva inside stem base',
  },
  {
    id: 'gout-fly',
    name: 'Gout Fly',
    common_names: ['Chlorops pumilionis'],
    pest_type: 'pest',
    description: 'Fly species (Chlorops pumilionis) whose larvae feed within cereal stems, causing characteristic swollen (gouty) tillers. Two generations per year: spring generation attacks stem bases, autumn generation attacks young shoots.',
    lifecycle: 'Spring generation: adults emerge April-May, lay eggs on stems. Larvae bore into stems causing gall-like swelling. Autumn generation: adults emerge August-September, lay eggs on young winter cereal shoots. Larvae feed inside shoots through winter.',
    identification: 'Spring generation: swollen, distorted stem bases with stunted ears. Autumn generation: thickened, swollen tillers in young winter wheat and barley. Larva is a small yellow maggot inside the swollen tissue.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'rye'],
    risk_factors: 'Early autumn drilling, mild autumns, proximity to grass margins (alternative hosts), backward crops in autumn, wheat after wheat',
    economic_impact: 'Yield losses of 2-10% in affected crops. Generally a secondary pest but locally important in some seasons. Autumn generation more damaging than spring.',
    images_description: 'Swollen, gouty tiller base in young winter wheat plant',
  },

  // ── Additional Insect Pests ────────────────────────────────────
  {
    id: 'peach-potato-aphid',
    name: 'Peach-Potato Aphid',
    common_names: ['Green peach aphid', 'Myzus persicae'],
    pest_type: 'pest',
    description: 'Aphid species (Myzus persicae) that is the primary vector of Turnip Yellows Virus (TuYV) in oilseed rape and various viruses in potatoes and sugar beet. Extremely polyphagous — feeds on over 400 plant species. Widespread insecticide resistance.',
    lifecycle: 'Overwinters as eggs on peach (Prunus persica) or as viviparous females on brassicas and other hosts year-round. Winged migrants colonise OSR in autumn. Feeds on leaf undersurfaces. Multiple generations per year.',
    identification: 'Small (1.5-2.5mm) pale green to yellowish-green aphid. Distinguished from other green aphids by the converging frontal tubercles on the head (visible under magnification). Found on leaf undersurfaces. Colonies often mixed with other aphid species.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'potatoes', 'sugar beet'],
    risk_factors: 'Mild autumn and winter, peach trees nearby (primary host), lack of neonicotinoid seed treatments, pyrethroid resistance, brassica weeds as green bridge',
    economic_impact: 'Direct feeding damage is minor. Primary economic impact from virus transmission: TuYV in OSR (GBP 60-100 million/year), potato viruses (PVY, PLRV). Insecticide resistance (kdr, MACE, metabolic) limits chemical control options.',
    images_description: 'Small pale green aphids on undersurface of OSR leaf',
  },
  {
    id: 'cereal-leaf-beetle',
    name: 'Cereal Leaf Beetle',
    common_names: ['CLB', 'Oulema melanopus'],
    pest_type: 'pest',
    description: 'Beetle (Oulema melanopus and O. lichenis) whose larvae strip the upper epidermis of cereal leaves, leaving characteristic window-pane damage. Both adults and larvae feed on leaves but larval damage is more significant.',
    lifecycle: 'Adults overwinter in sheltered field margins and hedgerows. Emerge in spring (April-May). Eggs laid singly on upper leaf surface. Larvae feed for 2-3 weeks, then pupate in soil. One generation per year. Larvae carry a faecal shield on their back.',
    identification: 'Adults: 5mm metallic blue-black beetle with orange thorax. Larvae: yellow-brown grubs carrying a dark faecal shield (looks like a moving blob of dirt). Feeding damage: parallel strips of epidermis removed, leaving translucent window-pane areas.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'oats'],
    risk_factors: 'Warm dry springs, cereal-heavy rotations, field margins providing overwintering sites, oat crops (preferred host), late-drilled spring cereals',
    economic_impact: 'Yield losses generally low (2-5%) in UK. More important in continental Europe. Threshold: 1 egg or larva per flag leaf. Natural enemies (parasitoid Tetrastichus julis) provide significant biological control.',
    images_description: 'Metallic blue-black beetle with orange thorax on cereal leaf; window-pane feeding strips',
  },
  {
    id: 'saddle-gall-midge',
    name: 'Saddle Gall Midge',
    common_names: ['Haplodiplosis marginata'],
    pest_type: 'pest',
    description: 'Cereal midge (Haplodiplosis marginata) whose larvae cause saddle-shaped galls on wheat and barley stems. Adults emerge from soil in June-July. Has re-emerged as a significant pest in UK after decades of low incidence.',
    lifecycle: 'Larvae overwinter in soil, pupating in spring. Adults emerge May-July, lay eggs on leaf sheaths. Larvae migrate behind leaf sheaths to stem surface, feeding on developing stem tissue. Feeding causes characteristic saddle-shaped gall indentation. Drop to soil in late summer.',
    identification: 'Saddle-shaped indentations (galls) on stems, visible at ear emergence. Orange-red larvae (3-4mm) found behind leaf sheaths. Adults: small (3-4mm) grey-brown flies. Multiple galls per stem reduce grain fill. Pheromone traps used for adult monitoring.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley'],
    risk_factors: 'Heavy clay soils, cereal-heavy rotations, fields with previous history, still humid evenings in June-July for adult flight, undisturbed soil (minimum tillage)',
    economic_impact: 'Yield losses of 5-15% in severe infestations. Re-emerged as a significant UK pest from 2010 onwards. Pheromone trapping used to monitor adult emergence. Spray timing critical — must target egg-laying adults.',
    images_description: 'Saddle-shaped gall indentations on wheat stem with orange larvae',
  },
  {
    id: 'yellow-cereal-fly',
    name: 'Yellow Cereal Fly',
    common_names: ['Opomyza florum'],
    pest_type: 'pest',
    description: 'Fly species (Opomyza florum) whose larvae mine within cereal stems from autumn. Adults are small yellow flies active in autumn. Larvae feed inside tillers, causing deadhearts similar to wheat bulb fly but from autumn-laid eggs.',
    lifecycle: 'Adults active September-November, laying eggs on soil surface near crop. Eggs overwinter on soil. Larvae hatch in spring (February-March) and mine into the nearest stem base. One generation per year. Larvae creamy-white, up to 8mm.',
    identification: 'Adults: small (4mm) yellow flies on crop in autumn. Damage: deadhearts in spring — central shoot yellows and can be pulled out. Larvae: creamy-white maggots inside stem base. Distinguished from wheat bulb fly by egg-laying timing (autumn not summer).',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oats'],
    risk_factors: 'Early autumn drilling, cereal-heavy rotations, mild autumns promoting adult activity, backward crops in spring, eastern England',
    economic_impact: 'Yield losses generally low (2-5%) as crops compensate through tillering. Locally important in some years. No specific insecticide treatment — crop vigour and later drilling reduce risk.',
    images_description: 'Small yellow fly on crop in autumn; deadheart shoot damage in spring',
  },
  {
    id: 'leatherjackets',
    name: 'Leatherjackets',
    common_names: ['Crane fly larvae', 'Tipula spp.'],
    pest_type: 'pest',
    description: 'Larvae of crane flies (Tipula paludosa and T. oleracea). Grey-brown, legless, tough-skinned larvae that feed on roots and stem bases of cereals and grass. Most damaging following grass leys or in wet autumns favouring egg survival.',
    lifecycle: 'Adults (crane flies / daddy-long-legs) emerge August-October. Eggs laid on moist soil surface in grassland or cereal fields. Larvae hatch in 2-3 weeks, feeding on roots through winter and spring. Pupate in soil in spring. T. oleracea has two generations.',
    identification: 'Larvae: grey-brown, cylindrical, legless, tough-skinned (leathery), up to 40mm. No distinct head capsule. Feed at or below soil surface. Damage: yellowing patches, plants easily pulled out due to severed roots. Starlings probing soil indicate presence.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'oilseed rape', 'potatoes', 'sugar beet'],
    risk_factors: 'Crops after grass ley or permanent pasture, wet autumn (September-October), mild winters, minimum tillage, set-aside ground, high crane fly emergence counts',
    economic_impact: 'Yield losses of 5-20% in severe infestations, primarily after grass. Can cause complete crop failure in worst cases. Loss of chlorpyrifos has reduced control options. Monitoring: sample soil for larvae per m2.',
    images_description: 'Grey-brown legless larva on soil surface next to damaged cereal seedling',
  },
  {
    id: 'wireworms',
    name: 'Wireworms',
    common_names: ['Click beetle larvae', 'Agriotes spp.'],
    pest_type: 'pest',
    description: 'Larvae of click beetles (Agriotes lineatus, A. obscurus, A. sputator). Orange-brown, hard-bodied, wireworm-like larvae that feed on seeds, roots, and stem bases. Long larval stage (3-5 years). Most problematic following grass leys.',
    lifecycle: 'Adults (click beetles) lay eggs in grassland in spring. Larvae feed on organic matter and roots for 3-5 years, growing to 25mm. Pupate in soil in final year. Damage to crops worst in years 1-3 after ploughing grass — populations decline as food source reduces.',
    identification: 'Larvae: hard, shiny, orange-brown, segmented, with 3 pairs of short legs (not legless like leatherjackets). Up to 25mm. Characteristic wireworm shape. Feed on seeds (hollowed-out), roots, and stem bases. Damage: patchy crop establishment, yellowing.',
    crops_affected: ['wheat', 'potatoes', 'sugar beet', 'barley', 'oilseed rape'],
    risk_factors: 'Fields recently out of grass ley (years 1-3), permanent pasture conversion, minimum tillage, organic systems, set-aside, mild winters',
    economic_impact: 'Yield losses from patchy establishment, typically 5-15% in affected fields. Major pest in potatoes — larvae bore into tubers causing quality rejection. Declining importance in arable rotations but increasing on grass-ley conversions.',
    images_description: 'Hard shiny orange-brown segmented wireworm larva beside damaged seed',
  },
  {
    id: 'beet-cyst-nematode',
    name: 'Beet Cyst Nematode',
    common_names: ['BCN', 'Heterodera schachtii'],
    pest_type: 'pest',
    description: 'Soilborne cyst nematode (Heterodera schachtii) that parasitises sugar beet roots. Causes stunting, wilting, and yellowing of beet plants. Cysts containing hundreds of eggs persist in soil for 5-10 years. Also attacks brassicas.',
    lifecycle: 'Cysts in soil stimulated to hatch by beet root exudates. Juveniles invade roots, establish feeding sites, and mature. Females swell to form lemon-shaped cysts on root surface. Two generations per year possible in warm conditions.',
    identification: 'Above ground: patches of stunted, wilted, pale plants that do not recover after watering. Below ground: small white/brown lemon-shaped cysts (0.5mm) visible on root surface. Fine lateral root proliferation (bearding). Tap root often distorted.',
    crops_affected: ['sugar beet', 'oilseed rape'],
    risk_factors: 'Short sugar beet rotations (less than 4 years), brassica crops in rotation (also hosts), high soil populations, warm soil temperatures, sandy soils',
    economic_impact: 'Yield losses of 10-50% in heavily infested fields. UK statutory pest for sugar beet. Minimum 4-year rotation recommended. Nematode-tolerant varieties available. Cover crop trap crops (resistant mustard) can reduce populations.',
    images_description: 'Stunted wilting sugar beet patch with lemon-shaped cysts on pulled roots',
  },
  {
    id: 'colorado-potato-beetle',
    name: 'Colorado Potato Beetle',
    common_names: ['CPB', 'Leptinotarsa decemlineata'],
    pest_type: 'pest',
    description: 'Leaf-feeding beetle (Leptinotarsa decemlineata) and its larvae that can defoliate potato crops. A quarantine pest in the UK — not established but regular interceptions on imported produce. EU notifiable pest with statutory eradication requirements.',
    lifecycle: 'Adults overwinter in soil. Emerge in spring, lay orange-yellow egg clusters on leaf undersurfaces. Larvae pass through 4 instars, feeding voraciously on foliage. Pupate in soil. 1-2 generations per year depending on climate.',
    identification: 'Adults: distinctive 10mm beetle with yellow-orange body and five black longitudinal stripes per wing cover. Larvae: red-orange with black spots, humped shape, up to 15mm. Egg masses: bright orange-yellow on leaf undersurfaces. Defoliation starts on upper canopy.',
    crops_affected: ['potatoes'],
    risk_factors: 'Importation on produce from infested countries, climate change enabling establishment in UK, warm summers, proximity to Channel Tunnel ports',
    economic_impact: 'If established in UK, could cause 30-50% yield losses without control. Currently a quarantine pest — any finding triggers statutory eradication. Widespread insecticide resistance in established populations in continental Europe and North America.',
    images_description: 'Distinctive yellow-orange beetle with five black stripes on potato leaf',
  },
  {
    id: 'pea-moth',
    name: 'Pea Moth',
    common_names: ['Cydia nigricana'],
    pest_type: 'pest',
    description: 'Moth species (Cydia nigricana) whose larvae feed inside pea pods, damaging developing seeds. Adults are small grey-brown moths that fly in June-July. The primary insect pest of combining peas in the UK.',
    lifecycle: 'Adults emerge from overwintering pupae in soil in June-July. Eggs laid on plants during flowering. Larvae enter pods and feed on developing seeds for 3-4 weeks. Mature larvae exit pods and drop to soil to pupate. One generation per year.',
    identification: 'Adults: small (12-15mm wingspan) grey-brown moths, difficult to see. Larvae: creamy-white caterpillars (up to 12mm) with dark head, found inside pods. Damaged peas show circular entry holes and characteristic frass (excrement) inside pod.',
    crops_affected: ['peas', 'spring peas'],
    risk_factors: 'Peas flowering during June-July peak moth flight, pea-after-pea fields, warm dry summers, fields near previous pea crops, proximity to hedgerows (adult shelter)',
    economic_impact: 'Damage levels of 5-30% of pods in untreated crops. Quality rejection threshold for vining peas is strict — over 1% damaged peas causes rejection. Spray timing based on pheromone trap threshold (crossing 5 moths per trap per week).',
    images_description: 'Small creamy-white caterpillar inside pea pod with frass and damaged seeds',
  },
  {
    id: 'bean-seed-fly',
    name: 'Bean Seed Fly',
    common_names: ['Delia platura'],
    pest_type: 'pest',
    description: 'Fly species (Delia platura) whose larvae feed on germinating seeds and seedlings of beans, peas, and other crops. Causes poor establishment with missing plants. Most damaging in cold, slow-germinating conditions.',
    lifecycle: 'Adults emerge from pupae in soil in spring (April-May). Attracted to recently cultivated soil with decomposing organic matter. Eggs laid in soil near seeds. Larvae feed on germinating seeds and emerging seedlings. Multiple generations per year.',
    identification: 'Adults: small (5mm) grey fly, similar to house fly but smaller. Larvae: white legless maggots (up to 7mm) found in or on germinating seeds. Damage: seeds hollowed out or seedlings with bored stems below ground. Patchy emergence.',
    crops_affected: ['beans', 'spring beans', 'peas', 'spring peas', 'maize'],
    risk_factors: 'Cold soil at drilling, slow germination, recently incorporated organic matter (green manure, FYM), deep drilling, damaged seed',
    economic_impact: 'Yield losses from poor establishment — typically requires increased seed rate to compensate. Most damaging in cold springs. No approved seed treatments. Cultural management (warm soil, shallow drilling, firm seedbed) is the main approach.',
    images_description: 'White maggot feeding on germinating bean seed in soil',
  },
  {
    id: 'rape-winter-stem-weevil',
    name: 'Rape Winter Stem Weevil',
    common_names: ['Ceutorhynchus picitarsis'],
    pest_type: 'pest',
    description: 'Weevil (Ceutorhynchus picitarsis) whose larvae mine inside OSR stems during winter. Adults active in autumn, laying eggs in leaf petioles. Larvae migrate into main stem, weakening plants and predisposing to frost damage and lodging.',
    lifecycle: 'Adults become active in October-November, migrating to OSR crops. Eggs laid in leaf petioles during autumn and winter. Larvae mine through petioles into the main stem, feeding on pith tissue. Mature larvae exit stems in spring and pupate in soil.',
    identification: 'Adults: small (3mm) grey-brown weevils. Adult presence detected by water trapping in autumn. Larvae: small white grubs inside stem pith when stems are split. Stem damage visible as galleries in pith at stem base. Plants may snap in frost or wind.',
    crops_affected: ['oilseed rape', 'winter oilseed rape'],
    risk_factors: 'Mild autumn and early winter, proximity to previous OSR crops, early-drilled crops (more attractive to migrating adults), southern and eastern England',
    economic_impact: 'Yield losses of 3-10% from stem weakening and larval damage. Can predispose stems to frost splitting and lodging. Part of the OSR weevil complex requiring integrated management. Pyrethroid resistance in some populations.',
    images_description: 'Small grey weevil on OSR plant; white larvae in stem pith when split',
  },
  {
    id: 'seed-weevil-osr',
    name: 'Cabbage Seed Weevil',
    common_names: ['Ceutorhynchus obstrictus', 'Ceutorhynchus assimilis'],
    pest_type: 'pest',
    description: 'Weevil (Ceutorhynchus obstrictus) that feeds on developing OSR seeds within pods. Adults puncture pods to lay eggs; larvae consume 3-5 seeds per pod. Damage opens pods to secondary infection by brassica pod midge.',
    lifecycle: 'Adults emerge from overwintering in April-May. Migrate to flowering OSR crops. Eggs laid singly inside developing pods through feeding punctures. Larvae consume seeds for 3-4 weeks, then chew exit hole and drop to soil to pupate.',
    identification: 'Adults: small (2.5-3mm) grey weevils on flowering OSR. Egg-laying punctures visible as small brown scars on pod surface. Larvae: white grubs (up to 5mm) with brown head capsule, found inside pods among seed. Exit holes in mature pods.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Warm weather during flowering and pod set, proximity to previous OSR crops, pyrethroid resistance, late-flowering crops extending exposure period',
    economic_impact: 'Yield losses of 3-8% from direct seed consumption. Greater indirect damage from brassica pod midge entering through weevil exit holes. Threshold: 1 weevil per 2 plants during flowering. Pyrethroid resistance increasing.',
    images_description: 'Small grey weevil on OSR flower; white larva inside pod among seeds',
  },
];

// ── Weeds ───────────────────────────────────────────────────────

const WEEDS: Pest[] = [
  {
    id: 'blackgrass',
    name: 'Black-grass',
    common_names: ['Slender meadow foxtail'],
    pest_type: 'weed',
    description: 'Annual grass weed (Alopecurus myosuroides). The most serious herbicide-resistant weed in UK arable farming. Found primarily on heavy clay soils in central and eastern England. Resistance to multiple herbicide modes of action is widespread.',
    lifecycle: 'Germinates primarily in autumn (September-November) with some spring germination. Flowers May-July. Single plant can produce up to 1000 seeds. Seeds persist in soil for 2-5 years. Over 80% of seeds germinate in the first year if left on the soil surface.',
    identification: 'Distinctive dark purplish-black seed head (spike). Leaves are smooth, slightly twisted, with a short blunt ligule. Seedlings have a characteristic reddish-purple tinge at the base. Grows to 60-80cm.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oilseed rape', 'winter oilseed rape'],
    risk_factors: 'Continuous winter cropping, early drilling (September), heavy clay soils, mild wet autumns, minimum tillage, herbicide resistance history, central and eastern England',
    economic_impact: 'Yield losses of 0.4-0.8 t/ha per 100 heads/m2. Herbicide resistance widespread — metabolic resistance (enhanced metabolism) affects all grass-weed herbicides. Management costs estimated at GBP 400 million/year UK-wide.',
    images_description: 'Dark purplish-black seed heads emerging above wheat canopy',
  },
  {
    id: 'italian-ryegrass',
    name: 'Italian Rye-grass',
    common_names: ['Westerwolds ryegrass', 'Lolium multiflorum'],
    pest_type: 'weed',
    description: 'Annual or biennial grass weed (Lolium multiflorum). Increasingly problematic in UK arable systems due to herbicide resistance. Can be extremely competitive with cereals, particularly spring barley.',
    lifecycle: 'Germinates autumn through spring. Vigorous tillering. Flowers June-July. Produces large quantities of seed. Seed shed before crop harvest. Target-site and metabolic herbicide resistance reported in UK populations.',
    identification: 'Bright green, glossy leaves with prominent veining on the underside. Auricles clasping the stem. Seed head is a flattened spike with alternating spikelets. More robust than perennial ryegrass with wider leaves.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'spring barley', 'oilseed rape'],
    risk_factors: 'Winter cereal rotations, herbicide resistance (ACCase and ALS), cover crop escapes, field margins, previous grass ley in rotation, mild winters',
    economic_impact: 'Yield losses of 5-30% in severe infestations. Rising in importance as a resistance problem. Can contaminate malting barley samples causing rejection. Management increasingly relies on cultural and non-chemical methods.',
    images_description: 'Bright green grass weed with flattened spike seed head in wheat field',
  },
  {
    id: 'wild-oats',
    name: 'Wild Oats',
    common_names: ['Common wild oat', 'Spring wild oat'],
    pest_type: 'weed',
    description: 'Annual grass weed (Avena fatua, common wild oat, and A. sterilis ssp. ludoviciana, winter wild oat). Highly competitive with cereals. Long-lived seed bank makes eradication difficult. Herbicide resistance to ACCase and ALS inhibitors documented.',
    lifecycle: 'Avena fatua germinates primarily in spring (February-April). A. sterilis ssp. ludoviciana germinates in autumn. Seeds have deep dormancy and can persist in soil for 8-10 years. Shattering before harvest replenishes seed bank.',
    identification: 'Taller than crop (80-150cm). Large, open panicle seed head. Seeds have a distinctive twisted awn that is hygroscopic (coils and uncoils with moisture changes). Hairy leaf sheath. Counter-clockwise leaf twist (opposite to wheat).',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley', 'spring barley', 'oats'],
    risk_factors: 'Cereal-heavy rotations, spring cropping (for A. fatua), contaminated seed, light and medium soils, herbicide resistance to ACCase inhibitors',
    economic_impact: 'Yield losses of 5-25% depending on density. Grain contamination reduces value. Historically one of the most important UK arable weeds. Long-lived seed bank means problems persist for years after initial infestation.',
    images_description: 'Tall grass weed with large open panicle and twisted awns above wheat',
  },
  {
    id: 'cleavers',
    name: 'Cleavers',
    common_names: ['Goosegrass', 'Sticky willy', 'Galium aparine'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Galium aparine). Scrambling habit causes lodging in cereals and clogs combine harvester mechanisms. Major weed of winter cereals and oilseed rape. Multiple flushes from autumn through spring.',
    lifecycle: 'Germinates primarily in autumn, with secondary flushes in spring. Scrambling growth using hooked hairs on stems and leaves. Seeds (nutlets) spread by adhesion to animals, machinery, and clothing. Seed bank moderately persistent (3-5 years).',
    identification: 'Square stems with backward-pointing hooks. Whorls of 6-8 narrow leaves at each node. Tiny white flowers. Round green fruits covered in hooked bristles. Scrambles over crop using hooks, reaching 100-150cm.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'oilseed rape', 'winter oilseed rape', 'beans', 'peas'],
    risk_factors: 'Autumn-sown crops, fertile soils, alkaline pH, winter cereal rotations, reduced tillage, ALS herbicide resistance developing',
    economic_impact: 'Yield losses of 5-15% from direct competition. Combines blockage causes harvesting delays. Clogs combine sieves, requiring frequent cleaning. One of the most common broadleaved weeds in UK cereals.',
    images_description: 'Scrambling weed with whorled leaves and hooked stems tangled in wheat',
  },
  {
    id: 'charlock',
    name: 'Charlock',
    common_names: ['Wild mustard', 'Sinapis arvensis'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Sinapis arvensis) of the brassica family. Bright yellow flowers are conspicuous in spring crops. Seed bank can persist for 50+ years in soil. Particularly problematic in spring cereals and pulses.',
    lifecycle: 'Germinates primarily in spring (March-May). Rapid growth to 30-80cm. Bright yellow flowers April-July. Prolific seed production (up to 4000 seeds per plant). Seeds extremely long-lived in soil, with dormancy broken by soil disturbance.',
    identification: 'Bright yellow four-petalled flowers in clusters at stem tops. Lower leaves are large, roughly lobed, and bristly-hairy. Beaked seed pods (siliquas). Stems rough and bristly. Distinguished from oilseed rape by rougher leaves and smaller stature.',
    crops_affected: ['spring barley', 'spring wheat', 'spring oats', 'peas', 'beans', 'spring oilseed rape'],
    risk_factors: 'Spring cropping, soil disturbance bringing buried seeds to surface, alkaline soils, reduced herbicide options in pulses, organic systems',
    economic_impact: 'Yield losses of 5-20% in spring crops. Contaminates rapeseed with high-erucic-acid seed. Long seed bank persistence makes long-term control difficult.',
    images_description: 'Bright yellow-flowered plant with bristly leaves in spring barley',
  },
  {
    id: 'poppies',
    name: 'Common Poppy',
    common_names: ['Field poppy', 'Corn poppy', 'Papaver rhoeas'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Papaver rhoeas) with distinctive bright red flowers. Prolific seed production — a single plant can produce over 10,000 seeds. Primarily a weed of autumn-sown crops on lighter soils.',
    lifecycle: 'Germinates mainly in autumn but also in spring. Rosette stage overwinters. Stems elongate in spring, flowering June-August. Seed dispersed from pepper-pot capsules by wind. Seeds dormant in soil for 80+ years.',
    identification: 'Bright scarlet-red four-petalled flowers with dark blotch at base. Hairy stems, deeply divided leaves. Smooth, rounded seed capsule with ring of pores below flat cap. Milky sap when stems broken.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oilseed rape'],
    risk_factors: 'Light and chalky soils, autumn-sown crops, soil disturbance, reduced herbicide options, ALS resistance developing in some populations',
    economic_impact: 'Yield losses generally low (2-5%) unless in dense patches. Mainly a quality concern — poppy seeds contaminate grain samples. ALS-resistant populations increasingly reported in UK.',
    images_description: 'Bright red poppy flowers among wheat stems',
  },
  {
    id: 'chickweed',
    name: 'Common Chickweed',
    common_names: ['Chickweed', 'Stellaria media'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Stellaria media). Germinates year-round and can complete multiple generations per year. Low, spreading habit smothers crop seedlings. One of the most common UK arable weeds.',
    lifecycle: 'Germinates throughout the year whenever conditions are moist. Rapid growth cycle — can flower 5-6 weeks after germination. Multiple overlapping generations. Seeds short-lived (2-5 years) but produced in large quantities. Stems root at nodes.',
    identification: 'Low, spreading habit. Small, oval, bright green leaves in opposite pairs. Tiny white flowers with deeply notched petals (appearing as 10 petals). Single line of hairs down the stem (alternating sides between nodes). Stems green, succulent.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'oilseed rape', 'spring barley', 'peas', 'beans'],
    risk_factors: 'Fertile, moist soils, nitrogen-rich conditions, autumn and spring cropping, sheltered positions, reduced tillage',
    economic_impact: 'Yield losses of 3-10% from direct competition and smothering of seedlings. Can harbour aphids and viruses. Low growing habit means it rarely interferes with harvest but competes strongly for light and nutrients at establishment.',
    images_description: 'Low spreading plant with small white flowers among crop seedlings',
  },
  {
    id: 'fat-hen',
    name: 'Fat Hen',
    common_names: ['Lamb\'s quarters', 'Chenopodium album'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Chenopodium album). One of the most globally distributed arable weeds. Highly competitive in spring-sown crops, particularly sugar beet, maize, and vegetables. Extremely prolific seed production.',
    lifecycle: 'Germinates in spring (April-June) when soil temperatures exceed 5C. Rapid upright growth to 30-150cm. Flowers July-October. A single plant can produce 70,000+ seeds. Seeds persist in soil for 20+ years. Seed dimorphism provides staggered germination.',
    identification: 'Upright bushy habit. Diamond-shaped to oval leaves with a mealy-white coating (especially on young leaves and growing tips). Small greenish flowers in dense clusters at stem tips. Stems often red-striped.',
    crops_affected: ['sugar beet', 'potatoes', 'maize', 'spring barley', 'spring wheat', 'peas', 'beans', 'vegetables'],
    risk_factors: 'Spring cropping, fertile soils, high nitrogen, root crop rotations, late-emerging crops, reduced herbicide options in some crops',
    economic_impact: 'Yield losses of 10-40% in spring crops if uncontrolled. Major problem in sugar beet and vegetable production. Generally well-controlled by herbicides in cereals but difficult in some horticultural crops.',
    images_description: 'Upright bushy plant with mealy-white leaf coating in sugar beet field',
  },
  {
    id: 'mayweed',
    name: 'Scentless Mayweed',
    common_names: ['Scentless chamomile', 'False chamomile', 'Tripleurospermum inodorum'],
    pest_type: 'weed',
    description: 'Annual or short-lived perennial broadleaved weed (Tripleurospermum inodorum). Common in cereals and oilseed rape across the UK. Distinguished from scented mayweed by lack of fragrance and solid (not hollow) receptacle.',
    lifecycle: 'Germinates autumn through spring. Rosette phase in winter. Stems elongate in spring, flowering June-September. Prolific seed production (up to 30,000 seeds per plant). Seeds moderately persistent (5-10 years). Some populations ALS-resistant.',
    identification: 'Daisy-like white flowers with yellow disc. Finely divided, feathery leaves (like chamomile). Solid receptacle when flower head is cut in half (scented mayweed is hollow). Odourless when crushed. Grows to 20-60cm.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'oilseed rape', 'spring cereals', 'set-aside'],
    risk_factors: 'Autumn and spring cropping, reduced tillage, ALS resistance (increasing), alkaline soils, field edges, set-aside',
    economic_impact: 'Yield losses of 3-10% in cereal crops. Can cause combine blockage at harvest. ALS resistance is increasing, limiting herbicide options. One of the most commonly occurring broadleaved weeds in UK arable fields.',
    images_description: 'White daisy-like flowers with feathery leaves in wheat field',
  },

  // ── Additional Weeds ───────────────────────────────────────────
  {
    id: 'annual-meadow-grass',
    name: 'Annual Meadow-Grass',
    common_names: ['Poa annua', 'AMG'],
    pest_type: 'weed',
    description: 'Annual (or short-lived perennial) grass weed (Poa annua). The most common grass weed in UK arable crops. Germinates year-round. Less competitive than blackgrass but ubiquitous and increasingly herbicide-resistant.',
    lifecycle: 'Germinates throughout the year whenever soil is moist, peaking in autumn. Flowers and sets seed rapidly — can complete a generation in 6-8 weeks. Produces large quantities of seed with no dormancy requirement. Seed bank moderate (3-5 years).',
    identification: 'Low-growing tufted grass with bright green, boat-tipped leaves. Open triangular panicle seed head. Leaves folded in the shoot, smooth. Ligule prominent, blunt. Distinguished from other grasses by its small stature, ubiquity, and year-round flowering.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'oilseed rape', 'sugar beet', 'potatoes', 'spring barley'],
    risk_factors: 'Continuous cropping, minimum tillage, mild winters allowing year-round germination, compacted soils, high-fertility areas, resistant populations',
    economic_impact: 'Yield losses typically 2-8% individually, but ubiquity means cumulative impact is significant. Increasing herbicide resistance to ALS and ACCase inhibitors. Resistance to glyphosate reported in some populations.',
    images_description: 'Low tufted bright green grass with triangular panicle seed head',
  },
  {
    id: 'sterile-brome',
    name: 'Sterile Brome',
    common_names: ['Barren brome', 'Bromus sterilis', 'Anisantha sterilis'],
    pest_type: 'weed',
    description: 'Annual grass weed (Anisantha sterilis, formerly Bromus sterilis). Tall, drooping panicle with long awns. Primary weed of field margins and reduced-tillage systems. Seeds do not persist long in soil but plants are highly competitive.',
    lifecycle: 'Germinates primarily in autumn (September-November). Vigorous upright growth to 60-100cm. Large drooping panicle with long-awned spikelets. Seeds shed before crop harvest. Short seed bank — most seeds die within 2 years if buried.',
    identification: 'Tall grass with large drooping panicle of awned spikelets. Leaves broad, hairy, often with a characteristic twist. Stem bases purple-red. Distinguished from other bromes by nodding panicle and field edge distribution. Seedlings hairy with broad leaves.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'winter barley', 'oilseed rape'],
    risk_factors: 'Minimum tillage, field margins and headlands, continuous winter cropping, early drilling, lack of ploughing (buries seed below germination depth)',
    economic_impact: 'Yield losses of 5-20% in patches. Major weed of headlands and minimum tillage systems. Short seed bank means ploughing once can effectively eliminate it. No selective herbicide for control in cereals — cultural control essential.',
    images_description: 'Tall grass with large drooping panicle of long-awned spikelets at field edge',
  },
  {
    id: 'couch-grass',
    name: 'Couch Grass',
    common_names: ['Common couch', 'Twitch', 'Elymus repens', 'Elytrigia repens'],
    pest_type: 'weed',
    description: 'Perennial grass weed (Elymus repens) spreading by extensive underground rhizomes. Forms dense patches that suppress crops. Cannot be controlled by in-crop herbicides in cereals — requires glyphosate in stubble or fallow periods.',
    lifecycle: 'Perennial, spreading vegetatively by white underground rhizomes. Rhizome fragments as small as 5cm can regenerate. Also produces seed but vegetative spread is the primary reproduction method. Active growth from spring through autumn.',
    identification: 'Erect stems 30-100cm with characteristic clasping auricles at the leaf-stem junction. Leaves dull green, rough on upper surface. Rhizomes white with pointed tips. Seed head is a narrow spike resembling a thin wheat ear. Rhizome fragments white with nodes.',
    crops_affected: ['wheat', 'barley', 'oilseed rape', 'potatoes', 'sugar beet', 'spring barley'],
    risk_factors: 'Minimum tillage spreading rhizome fragments, wet areas of field, field margins, failed glyphosate application, continuous cropping without cultivation',
    economic_impact: 'Yield losses of 10-30% in dense patches. Allelopathic effects suppress crop growth. Major weed problem in minimum tillage systems. Glyphosate in stubble is the main control — no selective in-crop option in cereals.',
    images_description: 'Dense patch of erect couch grass with visible white rhizomes at soil surface',
  },
  {
    id: 'volunteer-osr',
    name: 'Volunteer Oilseed Rape',
    common_names: ['Volunteer rape', 'Brassica napus volunteers'],
    pest_type: 'weed',
    description: 'Self-sown oilseed rape plants from seed shed at previous harvest. OSR seeds can survive 5-10 years in the soil seed bank. Volunteer OSR competes with subsequent crops and acts as a green bridge for OSR diseases and pests.',
    lifecycle: 'Seeds shed at harvest persist in soil for up to 10 years. Germinate when brought to soil surface by cultivation. Multiple flushes in subsequent crops. Can flower and set seed within the crop, replenishing the seed bank.',
    identification: 'Rosette of blue-green waxy leaves (distinctive from other brassica weeds). Yellow four-petalled flowers when reaching reproductive stage. Plants can be vigorous and highly competitive. Cotyledons large, kidney-shaped.',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'spring barley', 'sugar beet', 'peas', 'beans'],
    risk_factors: 'Following OSR in rotation, minimum tillage leaving seeds on surface, high pod shatter at previous harvest, herbicide-tolerant (Clearfield) varieties complicating control',
    economic_impact: 'Yield losses of 3-10% from competition. Primary concern is disease bridge — volunteers host phoma, light leaf spot, clubroot, and CSFB between OSR crops. Volunteers of herbicide-tolerant varieties are difficult to control in subsequent crops.',
    images_description: 'Blue-green waxy-leaved OSR volunteers growing among wheat crop',
  },
  {
    id: 'cranes-bill',
    name: "Crane's-Bill",
    common_names: ['Cut-leaved cranesbill', 'Geranium dissectum'],
    pest_type: 'weed',
    description: "Annual broadleaved weed (Geranium dissectum). Small pink-purple flowers and deeply dissected leaves. Increasingly problematic as a weed of winter cereals and OSR, particularly where ALS herbicide resistance limits options.",
    lifecycle: 'Germinates in autumn and spring. Low sprawling growth, flowering May-August. Seeds dispersed by explosive dehiscence of the beak-like fruit capsule. Seed bank moderately persistent (3-5 years).',
    identification: 'Deeply divided (dissected) palmate leaves. Small pink-purple flowers 8-10mm. Characteristic beak-like fruit capsule that splits explosively at maturity. Low sprawling habit with reddish stems. Leaves often reddish-tinged in autumn.',
    crops_affected: ['wheat', 'winter wheat', 'oilseed rape', 'winter oilseed rape', 'barley'],
    risk_factors: 'Winter cropping, minimum tillage, reduced herbicide options due to resistance in other weeds, alkaline soils, field margins',
    economic_impact: 'Yield losses generally low (2-5%). Increasing in frequency as a component of the broadleaved weed complex. Difficult to control in some crops. Often treated as a secondary weed alongside more competitive species.',
    images_description: 'Small pink-purple flowers and deeply dissected palmate leaves among crop',
  },
  {
    id: 'field-pansy',
    name: 'Field Pansy',
    common_names: ['Viola arvensis'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Viola arvensis). Small cream-white flowers. Common in winter cereals and OSR across the UK. ALS herbicide resistance increasing, making control more difficult in some situations.',
    lifecycle: 'Germinates primarily in autumn, with some spring germination. Low rosette stage in winter, flowering from April onwards. Produces small capsules with numerous seeds. Seed bank moderately persistent (3-5 years). Self-pollinating.',
    identification: 'Small (10-15mm) cream-white to pale yellow flowers with darker veining on lower petals. Leaves ovate with rounded teeth and prominent stipules (larger than leaves). Low bushy habit in early stages, stems elongate at flowering.',
    crops_affected: ['wheat', 'winter wheat', 'oilseed rape', 'winter oilseed rape', 'barley', 'winter barley'],
    risk_factors: 'Winter cropping, alkaline soils, reduced herbicide spectrum due to resistance, continuous cereal rotations, ALS resistance spreading',
    economic_impact: 'Yield losses generally low (2-5%) from direct competition. Increasing importance as ALS resistance limits herbicide options. Often co-occurs with resistant poppies and mayweed, compounding the resistance management challenge.',
    images_description: 'Small cream-white flowers with prominent stipules in winter cereal',
  },
  {
    id: 'common-fumitory',
    name: 'Common Fumitory',
    common_names: ['Fumitory', 'Fumaria officinalis'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Fumaria officinalis). Weak scrambling habit with finely divided grey-green leaves and tubular pink flowers tipped with dark red. Common on light soils in winter and spring crops.',
    lifecycle: 'Germinates in autumn and spring. Weak scrambling habit, climbing through crop. Flowers April-October. Each flower produces a single round nutlet. Seed bank long-lived (10+ years) with deep dormancy. Germination stimulated by soil disturbance.',
    identification: 'Finely divided, blue-grey-green leaves with a glaucous (waxy) appearance. Tubular pink flowers (6-7mm) tipped with dark red, in short racemes. Scrambling weak stems. Overall delicate, misty appearance — genus name means "smoke of the earth".',
    crops_affected: ['wheat', 'winter wheat', 'barley', 'spring barley', 'oilseed rape', 'peas', 'beans'],
    risk_factors: 'Light and chalky soils, spring and winter crops, alkaline pH, soil disturbance triggering germination, long-lived seed bank',
    economic_impact: 'Yield losses generally low (2-5%). More of a quality and nuisance weed than a competitive threat. Long-lived seed bank ensures persistence. Generally well-controlled by standard herbicide programmes.',
    images_description: 'Finely divided grey-green leaves and pink dark-tipped tubular flowers among crop',
  },
  {
    id: 'bindweed',
    name: 'Field Bindweed',
    common_names: ['Convolvulus arvensis'],
    pest_type: 'weed',
    description: 'Perennial climbing weed (Convolvulus arvensis) with extensive deep root system. Twines around crop stems causing lodging and harvest difficulties. White or pink funnel-shaped flowers. Roots can extend 5m deep, making eradication extremely difficult.',
    lifecycle: 'Perennial, spreading by deep creeping roots and seed. Roots regenerate from fragments as small as 5cm. Emerges in late spring, climbs by twining anti-clockwise around crop stems. Seeds long-lived (20+ years). Dormant in winter.',
    identification: 'Arrow-shaped leaves. White or pink funnel-shaped flowers (2-3cm). Twining anti-clockwise around crop stems. Distinguished from hedge bindweed (Calystegia sepium) by smaller flowers and leaves. Root system extensive and deep.',
    crops_affected: ['wheat', 'barley', 'oilseed rape', 'sugar beet', 'potatoes', 'beans', 'peas'],
    risk_factors: 'Minimum tillage (root fragments not disturbed), perennial problem in field patches, dry soils (deep roots access water), headlands and field margins, failure to treat in stubble',
    economic_impact: 'Yield losses of 5-15% in infested patches from competition and lodging. Causes combine blockage. Deep root system makes eradication near-impossible. Repeated glyphosate in stubble or fallow reduces but rarely eliminates. A persistent field weed.',
    images_description: 'White funnel-shaped flowers and arrow leaves twining anti-clockwise around cereal stems',
  },
  {
    id: 'thistles',
    name: 'Creeping Thistle',
    common_names: ['Cirsium arvense', 'Perennial thistle'],
    pest_type: 'weed',
    description: 'Perennial weed (Cirsium arvense) spreading by extensive lateral root system. Produces dense patches that suppress crops. Lilac-purple flower heads. Notifiable weed under UK Weeds Act 1959. One of the most difficult arable weeds to eliminate.',
    lifecycle: 'Perennial, spreading by horizontal roots at 15-30cm depth. Root fragments regenerate new plants. Also sets wind-dispersed seed (pappus). Shoots emerge in spring, flower July-September. Roots store reserves for winter dormancy.',
    identification: 'Spiny leaves with wavy, lobed margins. Lilac-purple flower heads in clusters. Erect stems to 120cm. Patches of uniform plants from clonal root spread. Distinguished from spear thistle by lack of spiny wings on stem and smaller flower heads.',
    crops_affected: ['wheat', 'barley', 'oilseed rape', 'peas', 'beans', 'potatoes', 'sugar beet'],
    risk_factors: 'Minimum tillage (root system not disrupted), perennial patches, organic systems (limited herbicide options), set-aside and field margins, failure to treat in stubble',
    economic_impact: 'Yield losses of 5-25% in dense patches. Combines cannot operate through dense thistle patches. UK Weeds Act requires land occupiers to prevent spread. Repeated clopyralid application or regular cultivation gradually depletes root reserves.',
    images_description: 'Dense thistle patch with lilac-purple flowers and spiny leaves in field',
  },
  {
    id: 'docks',
    name: 'Broad-Leaved Dock',
    common_names: ['Rumex obtusifolius', 'Docks'],
    pest_type: 'weed',
    description: 'Perennial broadleaved weed (Rumex obtusifolius) with a deep tap root. Common in grassland and increasingly in arable crops under minimum tillage. Large leaves shade out crop plants in patches. Tap root regenerates from fragments.',
    lifecycle: 'Perennial with a deep tap root (up to 1m). Emerges from root crown or root fragments in spring. Produces tall flowering spikes (60-120cm) with reddish-brown seed. Seeds long-lived (50+ years). Root fragments as small as 5cm regenerate.',
    identification: 'Large (up to 25cm), broad, oval leaves with rounded tips and wavy margins. Prominent reddish-brown flowering spike with whorled seed clusters. Thick yellow tap root. Seedlings have distinctive red-tinged cotyledons.',
    crops_affected: ['wheat', 'barley', 'sugar beet', 'potatoes', 'oilseed rape', 'peas', 'beans'],
    risk_factors: 'Following grass ley, minimum tillage, poorly drained soils, fertile conditions, organic systems, long-term set-aside',
    economic_impact: 'Yield losses of 5-15% in dense patches from shading and competition. Weed Act species. Deep tap root makes eradication difficult. Glyphosate in stubble is the most effective control. A persistent problem in grass-arable rotations.',
    images_description: 'Large broad leaves and reddish-brown flowering spike of dock in field',
  },
  {
    id: 'speedwells',
    name: 'Common Field-Speedwell',
    common_names: ['Veronica persica', 'Persian speedwell'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Veronica persica). Low sprawling habit with small bright blue flowers. Common in winter and spring crops across the UK. Generally a minor weed but can form dense carpets that smother crop seedlings.',
    lifecycle: 'Germinates in autumn and spring. Low sprawling habit, rooting at stem nodes. Flowers February-December (almost year-round). Each flower produces a heart-shaped capsule with many seeds. Seed bank short-lived (2-3 years).',
    identification: 'Low sprawling plant with bright blue flowers (8-12mm) with a white centre and darker veining. Lower petal smaller than upper three. Leaves ovate, toothed, pale green. Heart-shaped seed capsules. Rooting at stem nodes forms spreading mats.',
    crops_affected: ['wheat', 'winter wheat', 'oilseed rape', 'sugar beet', 'barley', 'spring barley'],
    risk_factors: 'Fertile moist soils, autumn and spring crops, minimum tillage, dense populations can smother seedlings, mild winters',
    economic_impact: 'Yield losses generally low (1-3%). Mainly a cosmetic and nuisance weed. Can smother crop seedlings in dense infestations. Generally well-controlled by standard herbicide programmes. Short seed bank means control effect is rapid.',
    images_description: 'Low sprawling plant with bright blue flowers and heart-shaped seed capsules',
  },
  {
    id: 'hemp-nettle',
    name: 'Common Hemp-Nettle',
    common_names: ['Galeopsis tetrahit'],
    pest_type: 'weed',
    description: 'Annual broadleaved weed (Galeopsis tetrahit). Erect plant with nettle-like leaves but without stinging hairs. Pink-purple lipped flowers. Common in spring crops and OSR in northern and western UK.',
    lifecycle: 'Germinates in spring (April-June). Erect branching growth to 50-80cm. Flowers July-September. Seeds mature August-October. Seed bank moderately persistent (3-5 years). Single plants can produce 500-1000 seeds.',
    identification: 'Erect, branching, with swollen stem nodes. Leaves opposite, nettle-like but not stinging, with toothed margins. Pink-purple two-lipped flowers in whorls at leaf axils. Stems square in cross-section with stiff downward-pointing hairs.',
    crops_affected: ['oilseed rape', 'spring barley', 'spring wheat', 'peas', 'beans', 'potatoes'],
    risk_factors: 'Spring cropping, acidic to neutral soils, northern and western regions, organic systems, recently converted grassland',
    economic_impact: 'Yield losses of 3-10% in spring crops. Locally important in northern and western UK. Can be competitive in spring cereals and OSR. Generally well-controlled by standard herbicide programmes in cereals.',
    images_description: 'Erect plant with swollen nodes and pink-purple lipped flowers among spring crop',
  },
];

// ── All Pests Combined ──────────────────────────────────────────

const ALL_PESTS: Pest[] = [...DISEASES, ...INSECT_PESTS, ...WEEDS];

// ── Symptoms ────────────────────────────────────────────────────

const SYMPTOMS: Symptom[] = [
  // Septoria Tritici Blotch (3 symptoms)
  { pest_id: 'septoria-tritici', symptom: 'Tan or grey lesions with dark pycnidia on leaves', plant_part: 'leaves', timing: 'autumn through spring', confidence: 'diagnostic' },
  { pest_id: 'septoria-tritici', symptom: 'Yellow patches on lower leaves', plant_part: 'leaves', timing: 'autumn and early spring', confidence: 'suggestive' },
  { pest_id: 'septoria-tritici', symptom: 'Reduced grain fill in severe cases', plant_part: 'ears', timing: 'summer', confidence: 'associated' },

  // Yellow Rust (4 symptoms)
  { pest_id: 'yellow-rust', symptom: 'Bright yellow-orange pustules arranged in stripes along leaf veins', plant_part: 'leaves', timing: 'spring and early summer', confidence: 'diagnostic' },
  { pest_id: 'yellow-rust', symptom: 'Yellow flecks or patches on leaves in cool moist conditions', plant_part: 'leaves', timing: 'late autumn to spring', confidence: 'suggestive' },
  { pest_id: 'yellow-rust', symptom: 'Green islands of tissue surrounding pustule stripes', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'yellow-rust', symptom: 'Premature leaf senescence reducing photosynthetic area', plant_part: 'leaves', timing: 'late spring to summer', confidence: 'associated' },

  // Brown Rust (3 symptoms)
  { pest_id: 'brown-rust', symptom: 'Scattered round orange-brown pustules randomly distributed on leaf surface', plant_part: 'leaves', timing: 'late spring to summer', confidence: 'diagnostic' },
  { pest_id: 'brown-rust', symptom: 'Orange-brown dust on fingers when touching infected leaves', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'brown-rust', symptom: 'Premature leaf senescence and reduced green leaf area', plant_part: 'leaves', timing: 'summer', confidence: 'associated' },

  // Fusarium Ear Blight (4 symptoms)
  { pest_id: 'fusarium-ear-blight', symptom: 'Bleached or pink-tinged spikelets on otherwise green ears', plant_part: 'ears', timing: 'after flowering (GS65+)', confidence: 'diagnostic' },
  { pest_id: 'fusarium-ear-blight', symptom: 'Orange sporodochia at spikelet bases in humid conditions', plant_part: 'ears', timing: 'late summer in humid weather', confidence: 'diagnostic' },
  { pest_id: 'fusarium-ear-blight', symptom: 'Shrivelled chalky-white or pink grains at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'suggestive' },
  { pest_id: 'fusarium-ear-blight', symptom: 'Musty smell from harvested grain samples', plant_part: 'grain', timing: 'harvest and storage', confidence: 'associated' },

  // Take-All (4 symptoms)
  { pest_id: 'take-all', symptom: 'Black runner hyphae on root surfaces and blackened root bases', plant_part: 'roots', timing: 'autumn through summer', confidence: 'diagnostic' },
  { pest_id: 'take-all', symptom: 'Whiteheads — prematurely ripened pale ears in green crop', plant_part: 'ears', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'take-all', symptom: 'Irregular patches of stunted pale plants in field', plant_part: 'whole plant', timing: 'spring and summer', confidence: 'suggestive' },
  { pest_id: 'take-all', symptom: 'Poor root development with blackened rotting roots when pulled', plant_part: 'roots', timing: 'spring', confidence: 'associated' },

  // Eyespot (3 symptoms)
  { pest_id: 'eyespot', symptom: 'Eye-shaped lesion with diffuse brown margin and pale centre at stem base', plant_part: 'stem base', timing: 'late winter through spring', confidence: 'diagnostic' },
  { pest_id: 'eyespot', symptom: 'Lodging in patches with weakened stem bases', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'eyespot', symptom: 'Soft rotting tissue at stem base when squeezed', plant_part: 'stem base', timing: 'spring to summer', confidence: 'associated' },

  // Powdery Mildew (4 symptoms)
  { pest_id: 'powdery-mildew', symptom: 'White to grey fluffy pustules on upper leaf surface', plant_part: 'leaves', timing: 'spring through summer', confidence: 'diagnostic' },
  { pest_id: 'powdery-mildew', symptom: 'Black cleistothecia visible on older pustules', plant_part: 'leaves', timing: 'mid to late summer', confidence: 'suggestive' },
  { pest_id: 'powdery-mildew', symptom: 'Yellow chlorosis beneath pustule areas on leaf', plant_part: 'leaves', timing: 'spring through summer', confidence: 'suggestive' },
  { pest_id: 'powdery-mildew', symptom: 'Reduced tillering and grain fill in severe early infections', plant_part: 'whole plant', timing: 'spring', confidence: 'associated' },

  // Light Leaf Spot (3 symptoms)
  { pest_id: 'light-leaf-spot', symptom: 'Small white or pale green spots with faint halo on OSR leaves', plant_part: 'leaves', timing: 'winter through spring', confidence: 'diagnostic' },
  { pest_id: 'light-leaf-spot', symptom: 'White acervuli dots visible on lesions under magnification', plant_part: 'leaves', timing: 'winter and spring', confidence: 'suggestive' },
  { pest_id: 'light-leaf-spot', symptom: 'Bleached patches on stems and pods reducing seed quality', plant_part: 'stems and pods', timing: 'spring and summer', confidence: 'associated' },

  // Phoma Stem Canker (4 symptoms)
  { pest_id: 'phoma-stem-canker', symptom: 'Pale round leaf spots with dark margin and grey centre containing pycnidia', plant_part: 'leaves', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'phoma-stem-canker', symptom: 'Dark sunken cracked canker lesion at OSR stem base', plant_part: 'stem base', timing: 'spring and summer', confidence: 'diagnostic' },
  { pest_id: 'phoma-stem-canker', symptom: 'Internal brown-black discolouration when stem is split', plant_part: 'stem base', timing: 'spring and summer', confidence: 'suggestive' },
  { pest_id: 'phoma-stem-canker', symptom: 'Premature ripening and lodging in patches', plant_part: 'whole plant', timing: 'summer', confidence: 'associated' },

  // Sclerotinia (4 symptoms)
  { pest_id: 'sclerotinia', symptom: 'Fluffy white mycelium on bleached rotting stem sections', plant_part: 'stems', timing: 'late spring through summer', confidence: 'diagnostic' },
  { pest_id: 'sclerotinia', symptom: 'Black sclerotia (hard resting bodies 1-10mm) inside or on stem surface', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'sclerotinia', symptom: 'Water-soaked bleached stem lesions expanding during humid weather', plant_part: 'stems', timing: 'during and after flowering', confidence: 'suggestive' },
  { pest_id: 'sclerotinia', symptom: 'Brittle shattering stems at harvest causing combine losses', plant_part: 'stems', timing: 'harvest', confidence: 'associated' },

  // Ramularia (3 symptoms)
  { pest_id: 'ramularia', symptom: 'Small rectangular brown spots bounded by leaf veins with yellow halo on barley', plant_part: 'leaves', timing: 'after ear emergence (GS49+)', confidence: 'diagnostic' },
  { pest_id: 'ramularia', symptom: 'Conidiophores visible on leaf undersurface under microscope', plant_part: 'leaves', timing: 'after ear emergence', confidence: 'suggestive' },
  { pest_id: 'ramularia', symptom: 'Rapid late-season leaf senescence reducing grain fill', plant_part: 'leaves', timing: 'late summer', confidence: 'associated' },

  // Net Blotch (4 symptoms)
  { pest_id: 'net-blotch', symptom: 'Dark brown net-like cross-hatching pattern on barley leaves', plant_part: 'leaves', timing: 'autumn through summer', confidence: 'diagnostic' },
  { pest_id: 'net-blotch', symptom: 'Dark brown circular spots with chlorotic halo (spot form)', plant_part: 'leaves', timing: 'autumn through summer', confidence: 'diagnostic' },
  { pest_id: 'net-blotch', symptom: 'Leaf tip necrosis progressing towards leaf base', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'net-blotch', symptom: 'Reduced grain weight and specific weight at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Rhynchosporium (3 symptoms)
  { pest_id: 'rhynchosporium', symptom: 'Blue-grey to pale brown water-soaked lesions on barley leaf margins', plant_part: 'leaves', timing: 'autumn through spring', confidence: 'diagnostic' },
  { pest_id: 'rhynchosporium', symptom: 'Lesions on leaf sheaths girdling and killing leaves', plant_part: 'leaf sheaths', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'rhynchosporium', symptom: 'Widespread leaf death in wet western field conditions', plant_part: 'leaves', timing: 'spring', confidence: 'associated' },

  // Grain Aphid (4 symptoms)
  { pest_id: 'grain-aphid', symptom: 'Clusters of small green-brown insects on ears and upper leaves', plant_part: 'ears', timing: 'late spring to summer', confidence: 'diagnostic' },
  { pest_id: 'grain-aphid', symptom: 'Sticky honeydew deposits and sooty mould on leaves', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'grain-aphid', symptom: 'Black siphunculi (cornicles) visible on aphid rear end', plant_part: 'ears', timing: 'late spring to summer', confidence: 'suggestive' },
  { pest_id: 'grain-aphid', symptom: 'Shrivelled grain from feeding damage during grain fill', plant_part: 'grain', timing: 'summer', confidence: 'associated' },

  // Bird Cherry-Oat Aphid (4 symptoms)
  { pest_id: 'bird-cherry-aphid', symptom: 'Small olive-green aphids with rusty-red patch near siphunculi on leaves', plant_part: 'leaves', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'bird-cherry-aphid', symptom: 'Yellow leaf discolouration in patches indicating BYDV infection', plant_part: 'leaves', timing: 'late autumn to spring', confidence: 'suggestive' },
  { pest_id: 'bird-cherry-aphid', symptom: 'Stunted tillering and reddish-purple leaf tips (BYDV symptoms)', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'bird-cherry-aphid', symptom: 'Irregular patches of poor crop growth from autumn virus infection', plant_part: 'whole plant', timing: 'spring', confidence: 'associated' },

  // Orange Wheat Blossom Midge (3 symptoms)
  { pest_id: 'orange-wheat-blossom-midge', symptom: 'Tiny orange flies swarming around wheat ears at dusk', plant_part: 'ears', timing: 'June-July evenings', confidence: 'diagnostic' },
  { pest_id: 'orange-wheat-blossom-midge', symptom: 'Small orange maggots visible between glumes when ears opened', plant_part: 'ears', timing: 'July', confidence: 'diagnostic' },
  { pest_id: 'orange-wheat-blossom-midge', symptom: 'Shrivelled grains at the embryo end at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'suggestive' },

  // Cabbage Stem Flea Beetle (4 symptoms)
  { pest_id: 'cabbage-stem-flea-beetle', symptom: 'Circular shot-holes in OSR cotyledons and first true leaves', plant_part: 'leaves', timing: 'September-October', confidence: 'diagnostic' },
  { pest_id: 'cabbage-stem-flea-beetle', symptom: 'Small metallic blue-black beetles jumping when disturbed', plant_part: 'whole plant', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'cabbage-stem-flea-beetle', symptom: 'White legless larvae inside petioles when stems are split', plant_part: 'petioles and stems', timing: 'winter and spring', confidence: 'suggestive' },
  { pest_id: 'cabbage-stem-flea-beetle', symptom: 'Crop thinning and plant death in severe autumn infestations', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'associated' },

  // Pollen Beetle (3 symptoms)
  { pest_id: 'pollen-beetle', symptom: 'Small shiny dark beetles present inside green-yellow OSR buds', plant_part: 'buds', timing: 'March-April', confidence: 'diagnostic' },
  { pest_id: 'pollen-beetle', symptom: 'Aborted or podless flower stalks where buds were damaged', plant_part: 'stems', timing: 'May', confidence: 'suggestive' },
  { pest_id: 'pollen-beetle', symptom: 'Uneven pod set with gaps on the raceme', plant_part: 'pods', timing: 'May-June', confidence: 'associated' },

  // Slugs (4 symptoms)
  { pest_id: 'slugs', symptom: 'Irregular ragged feeding damage on seedling leaves and stems', plant_part: 'leaves', timing: 'autumn after emergence', confidence: 'diagnostic' },
  { pest_id: 'slugs', symptom: 'Slime trails visible on soil surface and plant debris', plant_part: 'soil surface', timing: 'autumn, visible morning', confidence: 'diagnostic' },
  { pest_id: 'slugs', symptom: 'Hollowed-out seeds or missing seedlings with uneven emergence', plant_part: 'seeds and seedlings', timing: 'at and after drilling', confidence: 'suggestive' },
  { pest_id: 'slugs', symptom: 'Patches of missing plants with irregular gaps in crop rows', plant_part: 'whole plant', timing: 'autumn', confidence: 'associated' },

  // Wheat Bulb Fly (3 symptoms)
  { pest_id: 'wheat-bulb-fly', symptom: 'Deadhearts — central shoot yellows and pulls out easily from base', plant_part: 'stems', timing: 'February-March', confidence: 'diagnostic' },
  { pest_id: 'wheat-bulb-fly', symptom: 'White-cream maggot (up to 10mm) visible inside stem base below ground', plant_part: 'stem base', timing: 'February-April', confidence: 'diagnostic' },
  { pest_id: 'wheat-bulb-fly', symptom: 'Patches of thin crop from tillers destroyed by larvae', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Gout Fly (3 symptoms)
  { pest_id: 'gout-fly', symptom: 'Swollen gouty tiller bases with distorted growth in young wheat', plant_part: 'stems', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'gout-fly', symptom: 'Small yellow maggot inside swollen stem tissue when dissected', plant_part: 'stems', timing: 'winter', confidence: 'suggestive' },
  { pest_id: 'gout-fly', symptom: 'Stunted ears emerging from previously swollen tillers', plant_part: 'ears', timing: 'summer', confidence: 'associated' },

  // Blackgrass (4 symptoms)
  { pest_id: 'blackgrass', symptom: 'Dark purplish-black seed heads above crop canopy', plant_part: 'seed head', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'blackgrass', symptom: 'Seedlings with reddish-purple tinge at base emerging among crop', plant_part: 'seedlings', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'blackgrass', symptom: 'Patches of thin or stunted crop with grass weed competition', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'blackgrass', symptom: 'Herbicide-tolerant plants surviving post-emergence sprays', plant_part: 'whole plant', timing: 'spring', confidence: 'associated' },

  // Italian Ryegrass (3 symptoms)
  { pest_id: 'italian-ryegrass', symptom: 'Bright green glossy grass with flattened spike seed heads in crop', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'italian-ryegrass', symptom: 'Vigorous tufted grass plants competing with cereal tillers', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'italian-ryegrass', symptom: 'Crop yield depression and grain contamination at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Wild Oats (4 symptoms)
  { pest_id: 'wild-oats', symptom: 'Tall plants with open panicle and twisted hygroscopic awns above crop', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'wild-oats', symptom: 'Hairy leaf sheaths and counter-clockwise leaf twist', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'wild-oats', symptom: 'Seed shattering before crop harvest leaving debris', plant_part: 'seed head', timing: 'pre-harvest', confidence: 'suggestive' },
  { pest_id: 'wild-oats', symptom: 'Grain contamination with wild oat seeds at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Cleavers (3 symptoms)
  { pest_id: 'cleavers', symptom: 'Scrambling stems with whorled leaves and hooked hairs tangling crop', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'cleavers', symptom: 'Crop lodging caused by cleavers weight pulling stems down', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'cleavers', symptom: 'Combine blockage from sticky plant material', plant_part: 'whole plant', timing: 'harvest', confidence: 'associated' },

  // Charlock (3 symptoms)
  { pest_id: 'charlock', symptom: 'Bright yellow four-petalled flowers with bristly-hairy stems in crop', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'charlock', symptom: 'Rough bristly-haired rosette leaves competing with spring crop', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'charlock', symptom: 'Beaked seed pods contaminating harvested crop', plant_part: 'pods', timing: 'harvest', confidence: 'associated' },

  // Poppies (3 symptoms)
  { pest_id: 'poppies', symptom: 'Bright scarlet-red four-petalled flowers with dark basal blotch in crop', plant_part: 'whole plant', timing: 'June-August', confidence: 'diagnostic' },
  { pest_id: 'poppies', symptom: 'Deeply divided rosette leaves among autumn-sown crop', plant_part: 'leaves', timing: 'autumn and spring', confidence: 'suggestive' },
  { pest_id: 'poppies', symptom: 'Pepper-pot seed capsules dispersing small dark seeds', plant_part: 'seed head', timing: 'late summer', confidence: 'associated' },

  // Chickweed (3 symptoms)
  { pest_id: 'chickweed', symptom: 'Low spreading mat of bright green oval leaves with tiny white notched-petal flowers', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'chickweed', symptom: 'Single line of hairs alternating sides down the stem', plant_part: 'stems', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'chickweed', symptom: 'Smothered crop seedlings in dense patches', plant_part: 'whole plant', timing: 'autumn and spring', confidence: 'associated' },

  // Fat Hen (3 symptoms)
  { pest_id: 'fat-hen', symptom: 'Upright bushy plant with diamond-shaped leaves and mealy-white coating', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'fat-hen', symptom: 'Dense greenish flower clusters at stem tips above crop canopy', plant_part: 'flowers', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'fat-hen', symptom: 'Red-striped stems visible among spring crops', plant_part: 'stems', timing: 'summer', confidence: 'associated' },

  // Mayweed (3 symptoms)
  { pest_id: 'mayweed', symptom: 'White daisy-like flowers with solid receptacle and finely divided feathery leaves', plant_part: 'whole plant', timing: 'June-September', confidence: 'diagnostic' },
  { pest_id: 'mayweed', symptom: 'Feathery-leaved rosettes among winter crop rows', plant_part: 'leaves', timing: 'winter and spring', confidence: 'suggestive' },
  { pest_id: 'mayweed', symptom: 'Combine blockage from dense flower stands at harvest', plant_part: 'whole plant', timing: 'harvest', confidence: 'associated' },

  // ── Additional Cereal Disease Symptoms ─────────────────────────

  // Sharp Eyespot (3 symptoms)
  { pest_id: 'sharp-eyespot', symptom: 'Sharply defined elliptical lesions with dark border and grey-white centre on outer leaf sheaths', plant_part: 'stem base', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'sharp-eyespot', symptom: 'Lesions on outer sheaths not penetrating to the inner stem tissue', plant_part: 'stem base', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'sharp-eyespot', symptom: 'Lodging in patches on light sandy soils in second or third cereals', plant_part: 'whole plant', timing: 'summer', confidence: 'associated' },

  // Ergot (3 symptoms)
  { pest_id: 'ergot', symptom: 'Dark purple-black elongated sclerotia protruding from florets in place of grain', plant_part: 'ears', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'ergot', symptom: 'Sticky sweet honeydew exudate on ears during early infection', plant_part: 'ears', timing: 'during flowering', confidence: 'suggestive' },
  { pest_id: 'ergot', symptom: 'Contaminated grain samples with dark ergot bodies at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Loose Smut of Wheat (2 symptoms)
  { pest_id: 'loose-smut-wheat', symptom: 'Entire ear replaced by dark brown-black mass of powdery smut spores', plant_part: 'ears', timing: 'at heading', confidence: 'diagnostic' },
  { pest_id: 'loose-smut-wheat', symptom: 'Affected ears emerge slightly earlier than healthy ears in the crop', plant_part: 'ears', timing: 'at heading', confidence: 'suggestive' },

  // Covered Smut of Barley (2 symptoms)
  { pest_id: 'covered-smut-barley', symptom: 'Dark swollen barley ears with spore mass enclosed in intact grey-brown membrane', plant_part: 'ears', timing: 'at heading', confidence: 'diagnostic' },
  { pest_id: 'covered-smut-barley', symptom: 'Smut-contaminated grain at harvest when membranes rupture in combine', plant_part: 'grain', timing: 'harvest', confidence: 'suggestive' },

  // Barley Yellow Dwarf Virus (4 symptoms)
  { pest_id: 'barley-yellow-dwarf-virus', symptom: 'Bright yellowing of barley leaf tips progressing downward', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'barley-yellow-dwarf-virus', symptom: 'Reddish-purple leaf tips and margins in wheat', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'barley-yellow-dwarf-virus', symptom: 'Irregular patches of stunted plants with reduced tillering', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'barley-yellow-dwarf-virus', symptom: 'Poor root development and premature death in severely affected patches', plant_part: 'roots', timing: 'spring to summer', confidence: 'associated' },

  // Wheat Yellow Mosaic Virus (3 symptoms)
  { pest_id: 'wheat-yellow-mosaic-virus', symptom: 'Yellow mosaic or spindle-shaped streaks on young wheat leaves in spring', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'wheat-yellow-mosaic-virus', symptom: 'Stunted growth in patches corresponding to waterlogged areas of field', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'wheat-yellow-mosaic-virus', symptom: 'Symptoms fade and plants recover as spring temperatures rise', plant_part: 'leaves', timing: 'late spring', confidence: 'associated' },

  // Ear Blight Complex (3 symptoms)
  { pest_id: 'ear-blight-complex', symptom: 'Bleached or grey-white spikelets on ears from mixed Fusarium and Microdochium infection', plant_part: 'ears', timing: 'after flowering', confidence: 'diagnostic' },
  { pest_id: 'ear-blight-complex', symptom: 'Shrivelled and discoloured grains at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'suggestive' },
  { pest_id: 'ear-blight-complex', symptom: 'Reduced specific weight and germination in saved seed lots', plant_part: 'grain', timing: 'post-harvest', confidence: 'associated' },

  // Sooty Moulds (2 symptoms)
  { pest_id: 'sooty-moulds', symptom: 'Dark grey-black superficial fungal growth on wheat ears and exposed grain', plant_part: 'ears', timing: 'pre-harvest', confidence: 'diagnostic' },
  { pest_id: 'sooty-moulds', symptom: 'Association with aphid honeydew deposits on ear surface', plant_part: 'ears', timing: 'summer', confidence: 'suggestive' },

  // Crown Rot (3 symptoms)
  { pest_id: 'crown-rot', symptom: 'Honey-brown discolouration of stem base and crown extending 1-2 internodes', plant_part: 'stem base', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'crown-rot', symptom: 'Whiteheads in dry seasons from impaired water transport', plant_part: 'ears', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'crown-rot', symptom: 'Pink fungal growth on stem base visible in humid conditions', plant_part: 'stem base', timing: 'spring', confidence: 'associated' },

  // Snow Mould (3 symptoms)
  { pest_id: 'snow-mould', symptom: 'Circular patches of bleached or grey-white dead leaf tissue with pinkish-white mycelial fringe', plant_part: 'leaves', timing: 'winter and early spring', confidence: 'diagnostic' },
  { pest_id: 'snow-mould', symptom: 'Dead seedlings in patches after prolonged snow cover', plant_part: 'whole plant', timing: 'late winter', confidence: 'suggestive' },
  { pest_id: 'snow-mould', symptom: 'Thin crop patches visible after snow melts in late winter', plant_part: 'whole plant', timing: 'late winter to spring', confidence: 'associated' },

  // ── OSR Disease Symptoms ───────────────────────────────────────

  // Clubroot (3 symptoms)
  { pest_id: 'clubroot', symptom: 'Massively swollen and distorted club-shaped roots when plants pulled up', plant_part: 'roots', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'clubroot', symptom: 'Wilting on hot days with recovery at night in early stages', plant_part: 'whole plant', timing: 'spring and summer', confidence: 'suggestive' },
  { pest_id: 'clubroot', symptom: 'Stunted yellow plants with purple leaf discolouration in patches', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'associated' },

  // Alternaria Dark Leaf Spot (3 symptoms)
  { pest_id: 'alternaria-dark-leaf-spot', symptom: 'Dark brown-black spots with concentric rings (target pattern) on OSR leaves and pods', plant_part: 'leaves and pods', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'alternaria-dark-leaf-spot', symptom: 'Premature pod splitting and seed loss from pod infections', plant_part: 'pods', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'alternaria-dark-leaf-spot', symptom: 'Extensive leaf death from coalescing spots in humid weather', plant_part: 'leaves', timing: 'summer', confidence: 'associated' },

  // White Leaf Spot (2 symptoms)
  { pest_id: 'white-leaf-spot', symptom: 'Small white-grey spots on OSR leaves without green halo present in light leaf spot', plant_part: 'leaves', timing: 'winter to spring', confidence: 'diagnostic' },
  { pest_id: 'white-leaf-spot', symptom: 'Pale cream spots on stems and pods with superficial cracking', plant_part: 'stems and pods', timing: 'spring to summer', confidence: 'suggestive' },

  // Verticillium Wilt OSR (3 symptoms)
  { pest_id: 'verticillium-wilt-osr', symptom: 'One-sided (asymmetric) yellowing of OSR leaves progressing upward', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'verticillium-wilt-osr', symptom: 'Brown discolouration of vascular tissue visible in stem cross-section', plant_part: 'stems', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'verticillium-wilt-osr', symptom: 'Premature ripening of one side of plant with black microsclerotia on stem surface', plant_part: 'whole plant', timing: 'summer', confidence: 'associated' },

  // Downy Mildew OSR (3 symptoms)
  { pest_id: 'downy-mildew-osr', symptom: 'Angular yellow patches on upper leaf surface with white-grey sporulation on lower surface', plant_part: 'leaves', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'downy-mildew-osr', symptom: 'Stunted distorted seedlings from systemic infection', plant_part: 'whole plant', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'downy-mildew-osr', symptom: 'Uneven crop emergence in cool humid autumns', plant_part: 'whole plant', timing: 'autumn', confidence: 'associated' },

  // Turnip Yellows Virus (3 symptoms)
  { pest_id: 'turnip-yellows-virus', symptom: 'Interveinal yellowing and purple-red discolouration of older OSR leaves', plant_part: 'leaves', timing: 'late autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'turnip-yellows-virus', symptom: 'General lack of vigour and reduced canopy compared to uninfected areas', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'turnip-yellows-virus', symptom: 'Reduced pod fill and lower oil content at harvest', plant_part: 'pods', timing: 'summer', confidence: 'associated' },

  // ── Potato Disease Symptoms ────────────────────────────────────

  // Late Blight (4 symptoms)
  { pest_id: 'late-blight', symptom: 'Water-soaked dark brown-black lesions on leaves expanding rapidly in humid conditions', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'late-blight', symptom: 'White sporulation visible on lesion margins on leaf undersurface in humid weather', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'late-blight', symptom: 'Distinctive musty smell from rapidly collapsing potato foliage', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'late-blight', symptom: 'Firm reddish-brown granular tuber rot beneath skin', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'associated' },

  // Early Blight (3 symptoms)
  { pest_id: 'early-blight', symptom: 'Dark brown circular target-spot lesions with concentric rings on lower potato leaves', plant_part: 'leaves', timing: 'late summer', confidence: 'diagnostic' },
  { pest_id: 'early-blight', symptom: 'Dry papery lesions on lower leaves progressing upward in warm weather', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },
  { pest_id: 'early-blight', symptom: 'Premature defoliation starting from the base of the canopy', plant_part: 'whole plant', timing: 'late summer', confidence: 'associated' },

  // Potato Cyst Nematode (3 symptoms)
  { pest_id: 'potato-cyst-nematode', symptom: 'Irregular patches of stunted pale wilting potato plants', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'potato-cyst-nematode', symptom: 'Small white or brown spherical cysts visible on root surface when plants pulled', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'potato-cyst-nematode', symptom: 'Poor tuber yield with many small tubers in affected patches', plant_part: 'tubers', timing: 'harvest', confidence: 'associated' },

  // Blackleg (3 symptoms)
  { pest_id: 'blackleg', symptom: 'Wet slimy black rotting of potato stem base from soil level upward', plant_part: 'stem base', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'blackleg', symptom: 'Foul smell from decaying stem tissue and affected stems easily pulled away', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'blackleg', symptom: 'Soft wet cream-coloured tuber rot turning dark on exposure to air', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'associated' },

  // Common Scab (2 symptoms)
  { pest_id: 'common-scab', symptom: 'Raised rough corky brown lesions on tuber surface with sandpaper-like texture', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'common-scab', symptom: 'Variable scab severity across field correlating with dry areas and alkaline soil patches', plant_part: 'tubers', timing: 'harvest', confidence: 'suggestive' },

  // Silver Scurf (2 symptoms)
  { pest_id: 'silver-scurf', symptom: 'Silvery metallic sheen on tuber skin expanding during storage', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },
  { pest_id: 'silver-scurf', symptom: 'Excessive moisture loss and tuber shrivelling during long-term storage', plant_part: 'tubers', timing: 'storage', confidence: 'suggestive' },

  // ── Pulse Disease Symptoms ─────────────────────────────────────

  // Chocolate Spot (3 symptoms)
  { pest_id: 'chocolate-spot', symptom: 'Circular chocolate-brown spots (1-5mm) on bean leaves, stems, and pods', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'chocolate-spot', symptom: 'Aggressive phase: spots enlarge rapidly with dark grey sporulating mass, leaves blacken', plant_part: 'leaves', timing: 'summer in humid conditions', confidence: 'suggestive' },
  { pest_id: 'chocolate-spot', symptom: 'Rapid defoliation and plant death in warm humid canopy conditions', plant_part: 'whole plant', timing: 'summer', confidence: 'associated' },

  // Downy Mildew of Peas (3 symptoms)
  { pest_id: 'downy-mildew-peas', symptom: 'Yellow patches on pea upper leaf surface with grey-violet sporulation on lower surface', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'downy-mildew-peas', symptom: 'Systemically infected seedlings appear stunted, pale, and curled', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'downy-mildew-peas', symptom: 'Distorted poorly filled pods from systemically infected plants', plant_part: 'pods', timing: 'summer', confidence: 'associated' },

  // Ascochyta Blight (3 symptoms)
  { pest_id: 'ascochyta-blight', symptom: 'Dark brown-black spots with dark margin and visible pycnidia on pea and bean leaves', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'ascochyta-blight', symptom: 'Dark sunken lesions on stems and pods affecting seed quality', plant_part: 'stems and pods', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'ascochyta-blight', symptom: 'Brown-stained seeds in harvested lots indicating seed-borne infection', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Bean Rust (3 symptoms)
  { pest_id: 'bean-rust', symptom: 'Dark chocolate-brown round rust pustules scattered on bean leaf surfaces', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'bean-rust', symptom: 'Leaves yellowing and falling prematurely from heavy pustule development', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'bean-rust', symptom: 'Black telia replacing brown uredinia as season progresses', plant_part: 'leaves', timing: 'late summer', confidence: 'associated' },

  // ── Sugar Beet Disease Symptoms ────────────────────────────────

  // Cercospora Leaf Spot (3 symptoms)
  { pest_id: 'cercospora-leaf-spot', symptom: 'Small circular spots with grey-white centre and dark reddish-purple border on beet leaves', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'cercospora-leaf-spot', symptom: 'Spots coalescing causing extensive leaf death and regrowth', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },
  { pest_id: 'cercospora-leaf-spot', symptom: 'Reduced sugar content from repeated defoliation cycles', plant_part: 'roots', timing: 'autumn', confidence: 'associated' },

  // Powdery Mildew Beet (2 symptoms)
  { pest_id: 'powdery-mildew-beet', symptom: 'White powdery coating on upper and lower sugar beet leaf surfaces', plant_part: 'leaves', timing: 'late summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'powdery-mildew-beet', symptom: 'Premature leaf yellowing and death under heavy mildew pressure', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },

  // Rhizomania (3 symptoms)
  { pest_id: 'rhizomania', symptom: 'Tap root constricted with excessive fan-shaped proliferation of fine lateral roots', plant_part: 'roots', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'rhizomania', symptom: 'Wilting and yellowing of leaves in hot weather despite adequate soil moisture', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'rhizomania', symptom: 'Yellow discolouration of vascular tissue in root cross-section', plant_part: 'roots', timing: 'autumn', confidence: 'associated' },

  // Ramularia Beet (2 symptoms)
  { pest_id: 'ramularia-beet', symptom: 'Small pale brown angular spots limited by leaf veins on sugar beet leaves', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'ramularia-beet', symptom: 'Leaf death from coalescing spots in wet summers', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },

  // ── Additional Insect Pest Symptoms ────────────────────────────

  // Peach-Potato Aphid (3 symptoms)
  { pest_id: 'peach-potato-aphid', symptom: 'Small pale green aphids with converging frontal tubercles on leaf undersurfaces', plant_part: 'leaves', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'peach-potato-aphid', symptom: 'Leaf curling and yellowing from aphid feeding on OSR and potatoes', plant_part: 'leaves', timing: 'autumn to spring', confidence: 'suggestive' },
  { pest_id: 'peach-potato-aphid', symptom: 'TuYV symptoms (interveinal yellowing) developing weeks after aphid colonisation', plant_part: 'leaves', timing: 'late autumn to spring', confidence: 'associated' },

  // Cereal Leaf Beetle (3 symptoms)
  { pest_id: 'cereal-leaf-beetle', symptom: 'Parallel translucent window-pane strips on cereal leaves from epidermal feeding', plant_part: 'leaves', timing: 'May-June', confidence: 'diagnostic' },
  { pest_id: 'cereal-leaf-beetle', symptom: 'Larvae with dark faecal shield on back feeding on leaf surface', plant_part: 'leaves', timing: 'May-June', confidence: 'suggestive' },
  { pest_id: 'cereal-leaf-beetle', symptom: 'Small metallic blue-black beetles with orange thorax on upper leaves', plant_part: 'leaves', timing: 'April-May', confidence: 'suggestive' },

  // Saddle Gall Midge (3 symptoms)
  { pest_id: 'saddle-gall-midge', symptom: 'Saddle-shaped indentations (galls) on wheat and barley stems visible at ear emergence', plant_part: 'stems', timing: 'June-July', confidence: 'diagnostic' },
  { pest_id: 'saddle-gall-midge', symptom: 'Orange-red larvae (3-4mm) found behind leaf sheaths when peeled back', plant_part: 'stems', timing: 'June-July', confidence: 'suggestive' },
  { pest_id: 'saddle-gall-midge', symptom: 'Reduced grain size from galls restricting nutrient flow to ears', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Yellow Cereal Fly (2 symptoms)
  { pest_id: 'yellow-cereal-fly', symptom: 'Deadhearts in spring from larvae boring into stem base', plant_part: 'stems', timing: 'February-March', confidence: 'diagnostic' },
  { pest_id: 'yellow-cereal-fly', symptom: 'Creamy-white maggots inside stem base when dissected', plant_part: 'stem base', timing: 'spring', confidence: 'suggestive' },

  // Leatherjackets (3 symptoms)
  { pest_id: 'leatherjackets', symptom: 'Grey-brown legless larvae (up to 40mm) with tough skin found at soil surface', plant_part: 'roots', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'leatherjackets', symptom: 'Yellowing patches of crop with plants easily pulled out due to severed roots', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'leatherjackets', symptom: 'Starlings and rooks probing soil surface in affected areas', plant_part: 'soil surface', timing: 'autumn to spring', confidence: 'associated' },

  // Wireworms (3 symptoms)
  { pest_id: 'wireworms', symptom: 'Hard shiny orange-brown segmented larvae with 3 pairs of legs in soil near damaged plants', plant_part: 'roots', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'wireworms', symptom: 'Hollowed-out seeds and patchy crop establishment following grass ley', plant_part: 'seeds and seedlings', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'wireworms', symptom: 'Bore holes in potato tubers causing quality rejection', plant_part: 'tubers', timing: 'harvest', confidence: 'associated' },

  // Beet Cyst Nematode (3 symptoms)
  { pest_id: 'beet-cyst-nematode', symptom: 'Small white or brown lemon-shaped cysts on sugar beet root surface', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'beet-cyst-nematode', symptom: 'Patches of stunted wilted pale beet plants that do not recover after rain', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'beet-cyst-nematode', symptom: 'Excessive lateral root proliferation (bearding) and distorted tap root', plant_part: 'roots', timing: 'summer to autumn', confidence: 'associated' },

  // Colorado Potato Beetle (3 symptoms)
  { pest_id: 'colorado-potato-beetle', symptom: 'Distinctive 10mm yellow-orange beetle with five black stripes per wing cover on foliage', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'colorado-potato-beetle', symptom: 'Orange-yellow egg masses on leaf undersurfaces', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'colorado-potato-beetle', symptom: 'Rapid defoliation starting from top of canopy', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Pea Moth (3 symptoms)
  { pest_id: 'pea-moth', symptom: 'Creamy-white caterpillars with dark head found inside pea pods among seeds', plant_part: 'pods', timing: 'July-August', confidence: 'diagnostic' },
  { pest_id: 'pea-moth', symptom: 'Circular entry holes in pod wall with frass (excrement) inside', plant_part: 'pods', timing: 'July-August', confidence: 'suggestive' },
  { pest_id: 'pea-moth', symptom: 'Damaged and partially eaten pea seeds at harvest', plant_part: 'grain', timing: 'harvest', confidence: 'associated' },

  // Bean Seed Fly (2 symptoms)
  { pest_id: 'bean-seed-fly', symptom: 'White legless maggots (up to 7mm) found in or on germinating bean and pea seeds', plant_part: 'seeds and seedlings', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'bean-seed-fly', symptom: 'Patchy crop emergence with hollowed-out seeds in cold spring conditions', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Rape Winter Stem Weevil (3 symptoms)
  { pest_id: 'rape-winter-stem-weevil', symptom: 'White grub larvae found in stem pith galleries when OSR stems split in spring', plant_part: 'stems', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'rape-winter-stem-weevil', symptom: 'Small grey-brown weevils captured in autumn water traps at OSR crop edge', plant_part: 'whole plant', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'rape-winter-stem-weevil', symptom: 'Stems snapping at weakened points during frost or wind events', plant_part: 'stems', timing: 'winter to spring', confidence: 'associated' },

  // Seed Weevil OSR (3 symptoms)
  { pest_id: 'seed-weevil-osr', symptom: 'Small grey weevils (2.5-3mm) on flowering OSR racemes during pod development', plant_part: 'flowers and pods', timing: 'May-June', confidence: 'diagnostic' },
  { pest_id: 'seed-weevil-osr', symptom: 'Brown egg-laying puncture scars on green pod surface', plant_part: 'pods', timing: 'June', confidence: 'suggestive' },
  { pest_id: 'seed-weevil-osr', symptom: 'Small circular exit holes in mature pods allowing secondary pod midge entry', plant_part: 'pods', timing: 'June-July', confidence: 'associated' },

  // ── Additional Weed Symptoms ───────────────────────────────────

  // Annual Meadow-Grass (3 symptoms)
  { pest_id: 'annual-meadow-grass', symptom: 'Low tufted bright green grass with triangular panicle seed heads year-round', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'annual-meadow-grass', symptom: 'Boat-tipped (prow-shaped) leaf blades folded in the shoot', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'annual-meadow-grass', symptom: 'Dense patches in compacted headlands and tramlines', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'associated' },

  // Sterile Brome (3 symptoms)
  { pest_id: 'sterile-brome', symptom: 'Tall grass with large drooping panicle of long-awned spikelets in crop margins', plant_part: 'whole plant', timing: 'May-July', confidence: 'diagnostic' },
  { pest_id: 'sterile-brome', symptom: 'Broad hairy seedlings with characteristic leaf twist in autumn', plant_part: 'seedlings', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'sterile-brome', symptom: 'Headland and field margin concentration of tall grass weed patches', plant_part: 'whole plant', timing: 'summer', confidence: 'associated' },

  // Couch Grass (3 symptoms)
  { pest_id: 'couch-grass', symptom: 'Dense patches of erect grass with clasping auricles and white pointed-tip rhizomes at soil surface', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'couch-grass', symptom: 'White rhizomes with pointed tips brought to surface by cultivation', plant_part: 'roots', timing: 'after cultivation', confidence: 'suggestive' },
  { pest_id: 'couch-grass', symptom: 'Crop suppression in dense couch patches visible as lighter patches', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'associated' },

  // Volunteer OSR (2 symptoms)
  { pest_id: 'volunteer-osr', symptom: 'Blue-green waxy-leaved brassica rosettes growing among subsequent crop', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'volunteer-osr', symptom: 'Yellow flowers from bolting volunteers competing with cereal or pulse crop', plant_part: 'flowers', timing: 'spring to summer', confidence: 'suggestive' },

  // Crane's-Bill (2 symptoms)
  { pest_id: 'cranes-bill', symptom: 'Small pink-purple flowers and deeply dissected palmate leaves with reddish stems', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'cranes-bill', symptom: 'Beak-like fruit capsules splitting explosively to disperse seed', plant_part: 'seed head', timing: 'summer', confidence: 'suggestive' },

  // Field Pansy (2 symptoms)
  { pest_id: 'field-pansy', symptom: 'Small cream-white flowers with prominent stipules larger than the leaves', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'field-pansy', symptom: 'Low bushy rosettes among winter crop rows in autumn', plant_part: 'whole plant', timing: 'autumn', confidence: 'suggestive' },

  // Common Fumitory (2 symptoms)
  { pest_id: 'common-fumitory', symptom: 'Finely divided blue-grey-green leaves with tubular pink flowers tipped dark red', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'common-fumitory', symptom: 'Weak scrambling habit climbing through crop canopy on light soils', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'suggestive' },

  // Bindweed (3 symptoms)
  { pest_id: 'bindweed', symptom: 'White or pink funnel-shaped flowers with arrow-shaped leaves twining anti-clockwise', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'bindweed', symptom: 'Crop stems pulled down and lodged by climbing bindweed growth', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'bindweed', symptom: 'Persistent patches returning each year from deep perennial root system', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'associated' },

  // Thistles (3 symptoms)
  { pest_id: 'thistles', symptom: 'Dense clonal patches of spiny-leaved plants with lilac-purple flower heads', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'thistles', symptom: 'Expanding circular patches from horizontal root spread visible in crop', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'thistles', symptom: 'Combine unable to operate through dense thistle patches at harvest', plant_part: 'whole plant', timing: 'harvest', confidence: 'associated' },

  // Docks (3 symptoms)
  { pest_id: 'docks', symptom: 'Large broad oval leaves with wavy margins and tall reddish-brown flowering spike', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'docks', symptom: 'Thick yellow tap root visible when plants pulled or cultivated', plant_part: 'roots', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'docks', symptom: 'Crop suppression from large leaf canopy shading out surrounding plants', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'associated' },

  // Speedwells (2 symptoms)
  { pest_id: 'speedwells', symptom: 'Low sprawling mat with bright blue flowers (white centre) and heart-shaped seed capsules', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'speedwells', symptom: 'Dense smothering mats among crop seedlings in moist conditions', plant_part: 'whole plant', timing: 'autumn and spring', confidence: 'suggestive' },

  // Hemp-Nettle (2 symptoms)
  { pest_id: 'hemp-nettle', symptom: 'Erect plant with swollen stem nodes, square stems, and pink-purple lipped flowers', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'hemp-nettle', symptom: 'Nettle-like leaves without stinging hairs and stiff downward-pointing stem hairs', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
];

// ── Treatments ──────────────────────────────────────────────────

const TREATMENTS: Treatment[] = [
  // Septoria Tritici Blotch
  { pest_id: 'septoria-tritici', approach: 'chemical', treatment: 'Foliar fungicide application (T1/T2 timing)', active_substance: 'prothioconazole + bixafen', timing: 'T1 (GS30-32) and T2 (GS39-49)', dose_rate: 'See product label', efficacy_notes: 'Good protectant and curative activity. Best applied preventatively. SDHI + azole mixtures provide broad-spectrum control.', resistance_risk: 'Azole resistance increasing. Use mixtures and alternate modes of action. Monitor FRAG-UK resistance data.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'septoria-tritici', approach: 'cultural', treatment: 'Variety resistance and delayed drilling', active_substance: null, timing: 'Pre-planting and variety selection', dose_rate: null, efficacy_notes: 'Choose varieties with high septoria resistance rating (7+). Delay drilling to late October to reduce autumn infection.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Yellow Rust
  { pest_id: 'yellow-rust', approach: 'chemical', treatment: 'Foliar fungicide at first symptoms or T1', active_substance: 'tebuconazole + prothioconazole', timing: 'At first symptoms or T1 (GS30-32)', dose_rate: 'See product label', efficacy_notes: 'Azoles give good curative activity on yellow rust. Apply promptly when pustules seen on susceptible varieties. Flag leaf fungicide (T2) protects yield.', resistance_risk: 'Low current resistance in Puccinia striiformis but new races frequently overcome variety resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'yellow-rust', approach: 'cultural', treatment: 'Resistant varieties and volunteer destruction', active_substance: null, timing: 'Variety selection and autumn management', dose_rate: null, efficacy_notes: 'Choose varieties with high yellow rust resistance (8+). Destroy volunteers and self-sown cereals to break green bridge. Monitor AHDB Recommended List resistance ratings annually.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Brown Rust
  { pest_id: 'brown-rust', approach: 'chemical', treatment: 'Foliar fungicide at T2 or when symptoms develop', active_substance: 'epoxiconazole + pyraclostrobin', timing: 'T2 (GS39-49) or at first symptoms', dose_rate: 'See product label', efficacy_notes: 'Strobilurin + azole provides good control. Most effective as protectant. Late-season brown rust on flag leaf requires prompt treatment.', resistance_risk: 'Strobilurin resistance (G143A mutation) is present in UK Puccinia triticina populations. Monitor sensitivity data.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'brown-rust', approach: 'cultural', treatment: 'Variety resistance', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'Select varieties with high brown rust resistance rating. Most important in southern and eastern England where brown rust risk is highest.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Fusarium Ear Blight
  { pest_id: 'fusarium-ear-blight', approach: 'chemical', treatment: 'T3 ear wash fungicide at mid-flowering', active_substance: 'prothioconazole + tebuconazole', timing: 'T3 at mid-flowering (GS63-65)', dose_rate: 'See product label', efficacy_notes: 'Azole-based T3 sprays reduce DON mycotoxin levels by 40-70%. Prothioconazole is the most effective active. Timing at mid-flowering is critical.', resistance_risk: 'Low resistance risk in Fusarium. Main risk is incorrect timing reducing efficacy.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'fusarium-ear-blight', approach: 'cultural', treatment: 'Crop rotation, residue management, and variety choice', active_substance: null, timing: 'Rotation planning and post-harvest', dose_rate: null, efficacy_notes: 'Avoid wheat after maize (highest risk). Plough or chop maize/cereal residues. Choose varieties with moderate FEB resistance. Avoid continuous cereal rotations.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Take-All
  { pest_id: 'take-all', approach: 'chemical', treatment: 'Seed treatment with silthiofam', active_substance: 'silthiofam', timing: 'Seed treatment before drilling', dose_rate: 'See product label', efficacy_notes: 'Only chemical option for take-all. Reduces root infection severity. Most cost-effective in second wheats on light soils. Does not eliminate the disease.', resistance_risk: 'Single site of action. Use as part of integrated strategy with rotation.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'take-all', approach: 'cultural', treatment: 'Break crop rotation (minimum 1-year break)', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'The most effective control. Any non-cereal break crop (OSR, beans, peas, sugar beet) for one year virtually eliminates take-all inoculum. First wheats after a break rarely suffer damage.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Eyespot
  { pest_id: 'eyespot', approach: 'chemical', treatment: 'Stem base fungicide at T0-T1', active_substance: 'prochloraz + cyprodinil', timing: 'T0 (GS25-30) to early T1 (GS30-31)', dose_rate: 'See product label', efficacy_notes: 'Apply when eyespot risk is high (wet autumn, second cereal, susceptible variety). Products need to reach stem base. Best applied before stem extension.', resistance_risk: 'O. acuformis less sensitive to some azoles. Cyprodinil adds efficacy against both species.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'eyespot', approach: 'cultural', treatment: 'Break crop rotation and variety resistance', active_substance: null, timing: 'Rotation and variety selection', dose_rate: null, efficacy_notes: 'Non-cereal break reduces inoculum. Some varieties carry Pch1 eyespot resistance gene (check Recommended List). Delay drilling to reduce autumn infection.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Powdery Mildew
  { pest_id: 'powdery-mildew', approach: 'chemical', treatment: 'Foliar fungicide when mildew active', active_substance: 'fenpropimorph + prothioconazole', timing: 'T1-T2 when mildew active on upper leaves', dose_rate: 'See product label', efficacy_notes: 'Morpholine fungicides (fenpropimorph) give good mildew control. Include in programme if variety susceptible. SDHIs have limited mildew activity.', resistance_risk: 'DMI (azole) resistance present in Blumeria graminis. Morpholines remain effective.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'powdery-mildew', approach: 'cultural', treatment: 'Variety resistance and balanced nitrogen', active_substance: null, timing: 'Variety selection and nitrogen management', dose_rate: null, efficacy_notes: 'Variety resistance is the primary management tool. Avoid excessive nitrogen promoting dense canopy. Destroy volunteer cereals.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Light Leaf Spot
  { pest_id: 'light-leaf-spot', approach: 'chemical', treatment: 'Autumn or spring fungicide application', active_substance: 'prothioconazole', timing: 'Autumn (November) or spring (February-March)', dose_rate: 'See product label', efficacy_notes: 'Autumn spray protects during latent infection period. Spring spray targets visible disease. Prothioconazole and tebuconazole are most effective actives.', resistance_risk: 'Limited resistance data. Use as part of programme with different modes of action.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'light-leaf-spot', approach: 'cultural', treatment: 'Resistant varieties and rotation', active_substance: null, timing: 'Variety selection and rotation planning', dose_rate: null, efficacy_notes: 'Choose varieties with good LLS resistance (7+). Maintain minimum 3-year gap between OSR crops. Most important in northern and western regions.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Phoma Stem Canker
  { pest_id: 'phoma-stem-canker', approach: 'chemical', treatment: 'Autumn fungicide at phoma leaf spot stage', active_substance: 'prothioconazole', timing: 'Autumn when 10-20% plants have phoma leaf spots', dose_rate: 'See product label', efficacy_notes: 'Aim to prevent systemic growth from leaf to stem. Most effective when applied to phoma leaf spots before stem colonisation. AHDB forecast model guides timing.', resistance_risk: 'Azole sensitivity shifts reported. Use as part of integrated approach with variety resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'phoma-stem-canker', approach: 'cultural', treatment: 'Variety resistance (Rlm genes) and rotation', active_substance: null, timing: 'Variety selection and rotation planning', dose_rate: null, efficacy_notes: 'Resistance genes (Rlm1-Rlm11) provide race-specific resistance. QTL-based resistance more durable. Minimum 3-4 year rotation gap for OSR.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Sclerotinia
  { pest_id: 'sclerotinia', approach: 'chemical', treatment: 'Fungicide spray at mid-flowering', active_substance: 'boscalid + dimoxystrobin', timing: 'Mid-flowering when petal fall begins', dose_rate: 'See product label', efficacy_notes: 'Timing at petal fall is critical — protects stem from petal-borne infection. AHDB sclerotinia forecast tool guides spray decisions. Single spray at peak petal fall.', resistance_risk: 'SDHI resistance reported in some European populations. Monitor sensitivity.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'sclerotinia', approach: 'cultural', treatment: 'Extended rotation and canopy management', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Minimum 4-year gap between susceptible crops (OSR, beans). Sclerotia survive 5-8 years, so longer rotations help. Open canopy (wider rows, lower seed rate) reduces humidity.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Ramularia
  { pest_id: 'ramularia', approach: 'chemical', treatment: 'Foliar fungicide at T2 in barley', active_substance: 'prothioconazole + fluxapyroxad', timing: 'T2 at flag leaf emergence to ear emergence (GS37-49)', dose_rate: 'See product label', efficacy_notes: 'Multi-site fungicides (e.g. folpet) may add value against ramularia. Post-chlorothalonil withdrawal, SDHI+azole at T2 is the main option. Protectant timing before symptom expression.', resistance_risk: 'Reduced SDHI and azole sensitivity reported. Multi-site partners increasingly important.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'ramularia', approach: 'cultural', treatment: 'Variety resistance and certified seed', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'Choose varieties with good ramularia resistance rating. Use certified seed to reduce seed-borne inoculum. Avoid very high nitrogen levels.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Net Blotch
  { pest_id: 'net-blotch', approach: 'chemical', treatment: 'Foliar fungicide at T1 in barley', active_substance: 'prothioconazole + pyraclostrobin', timing: 'T1 (GS25-31) when disease active on leaves 3-4', dose_rate: 'See product label', efficacy_notes: 'Azole + strobilurin provides good net blotch control. Most effective as protectant. Follow up at T2 if pressure continues.', resistance_risk: 'Strobilurin insensitivity (QoI) reported. Azoles remain effective. Mix modes of action.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'net-blotch', approach: 'cultural', treatment: 'Crop rotation and resistant varieties', active_substance: null, timing: 'Rotation and variety selection', dose_rate: null, efficacy_notes: 'Avoid barley-after-barley. Use certified seed (seed-borne inoculum). Choose varieties with good net blotch resistance. Plough or chop barley stubble.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Rhynchosporium
  { pest_id: 'rhynchosporium', approach: 'chemical', treatment: 'Foliar fungicide at T1 in barley', active_substance: 'prothioconazole + chlorothalonil', timing: 'T1 (GS25-31) when disease active', dose_rate: 'See product label. Note: chlorothalonil withdrawn — alternatives include folpet.', efficacy_notes: 'Prothioconazole is the most effective azole. Multi-site partners (folpet) add value. Post-chlorothalonil withdrawal requires adjusted programmes.', resistance_risk: 'Azole sensitivity declining. CYP51 mutations in Rhynchosporium commune well documented. Use multi-site partners.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'rhynchosporium', approach: 'cultural', treatment: 'Variety resistance and rotation', active_substance: null, timing: 'Variety selection and rotation', dose_rate: null, efficacy_notes: 'Strong variety resistance available — primary management tool. Avoid barley-after-barley. Use certified seed. Most important in wet western and northern regions.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Grain Aphid
  { pest_id: 'grain-aphid', approach: 'chemical', treatment: 'Pyrethroid insecticide spray', active_substance: 'lambda-cyhalothrin', timing: 'When threshold exceeded (66% of tillers with aphids during grain fill)', dose_rate: 'See product label', efficacy_notes: 'Fast knockdown. Avoid broad-spectrum use to preserve natural enemies. Apply only when threshold reached. Consider aphid-specific products to reduce impact on beneficials.', resistance_risk: 'Low current resistance but broad-spectrum impact on beneficials.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'grain-aphid', approach: 'cultural', treatment: 'Conservation biological control', active_substance: null, timing: 'Season-long', dose_rate: null, efficacy_notes: 'Maintain field margins and beetle banks to support natural enemies (ladybirds, parasitoid wasps, hoverflies). Avoid unnecessary insecticide sprays. Natural enemy populations typically control aphids by mid-July.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bird Cherry-Oat Aphid
  { pest_id: 'bird-cherry-aphid', approach: 'chemical', treatment: 'Pyrethroid insecticide in autumn', active_substance: 'lambda-cyhalothrin', timing: 'Autumn when aphids colonising crop (October-November), before BYDV transmission', dose_rate: 'See product label', efficacy_notes: 'Apply when aphid numbers rising in autumn. Protects against BYDV transmission. Most important for early-drilled crops. May need repeat spray if migration continues.', resistance_risk: 'Low current resistance. Neonicotinoid seed treatments no longer available (withdrawn 2018).', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'bird-cherry-aphid', approach: 'cultural', treatment: 'Delayed drilling and BYDV-tolerant varieties', active_substance: null, timing: 'Drilling date and variety selection', dose_rate: null, efficacy_notes: 'Delay drilling until late October to avoid peak aphid migration. BYDV-tolerant winter barley varieties available (e.g. BYDV1 resistance). Remove volunteer cereals as green bridge.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Orange Wheat Blossom Midge
  { pest_id: 'orange-wheat-blossom-midge', approach: 'chemical', treatment: 'Pyrethroid spray at ear emergence', active_substance: 'lambda-cyhalothrin', timing: 'At ear emergence (GS59) when midges observed at dusk (>120 midges per 10 ears)', dose_rate: 'See product label', efficacy_notes: 'Spray in the evening when midges are active. Threshold is 1 midge per 3 ears (or pheromone trap threshold). Resistant varieties are preferred over chemical control.', resistance_risk: 'Low. Resistance mechanism in varieties (Sm1 gene) is the preferred management route.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'orange-wheat-blossom-midge', approach: 'cultural', treatment: 'OWBM-resistant varieties (Sm1 gene)', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'Sm1 gene provides antibiosis resistance (larvae die on first feeding). Widely deployed in UK varieties. Check Recommended List for resistance status. Rotate with non-resistant varieties to delay resistance breakdown.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Cabbage Stem Flea Beetle
  { pest_id: 'cabbage-stem-flea-beetle', approach: 'chemical', treatment: 'Foliar pyrethroid spray at establishment', active_substance: 'lambda-cyhalothrin', timing: 'When cotyledons emerging and >25% leaf area lost to shot-holing', dose_rate: 'See product label', efficacy_notes: 'Pyrethroids provide limited and short-lived control. CSFB pyrethroid resistance is increasing. Apply in evening when beetles active. May need repeat applications.', resistance_risk: 'Pyrethroid resistance widespread in UK CSFB populations. kdr resistance well documented. Efficacy declining.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'cabbage-stem-flea-beetle', approach: 'cultural', treatment: 'Rapid crop establishment and companion cropping', active_substance: null, timing: 'Drilling and establishment', dose_rate: null, efficacy_notes: 'Drill early enough for rapid establishment before beetle peak. Ensure good seedbed and soil moisture. Companion crops (buckwheat, berseem clover) may reduce damage. Higher seed rates compensate for plant loss. Defoliation trap cropping under investigation.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Pollen Beetle
  { pest_id: 'pollen-beetle', approach: 'chemical', treatment: 'Insecticide spray at green-yellow bud stage', active_substance: 'pymetrozine or indoxacarb', timing: 'Green-yellow bud (GS3.3-3.5) when threshold exceeded (15 per plant for winter OSR)', dose_rate: 'See product label', efficacy_notes: 'Avoid pyrethroids where resistance confirmed — use alternative chemistry (pymetrozine, indoxacarb). Pyrethroids are ineffective against resistant populations. Once flowering starts, no treatment needed.', resistance_risk: 'Pyrethroid resistance widespread in UK pollen beetle populations. Use IRAG-recommended alternatives.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'pollen-beetle', approach: 'cultural', treatment: 'Early-flowering varieties and trap cropping', active_substance: null, timing: 'Variety selection and field margins', dose_rate: null, efficacy_notes: 'Early-flowering varieties pass through susceptible bud stage before peak beetle migration. Turnip rape trap crops on field edges attract beetles away from main crop.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Slugs
  { pest_id: 'slugs', approach: 'chemical', treatment: 'Ferric phosphate slug pellets', active_substance: 'ferric phosphate', timing: 'At or immediately after drilling when slug risk is high', dose_rate: '5-7 kg/ha (see product label)', efficacy_notes: 'Ferric phosphate is now the primary molluscicide after metaldehyde withdrawal (2022). Apply evenly. Most effective when applied to moist soil when slugs are active. May need repeat application.', resistance_risk: 'No known resistance. Ferric phosphate breaks down to iron and phosphate in soil.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'slugs', approach: 'cultural', treatment: 'Seedbed consolidation and cultivation', active_substance: null, timing: 'Pre-drilling and drilling', dose_rate: null, efficacy_notes: 'Consolidate seedbed to remove air spaces where slugs shelter. Roll after drilling. Avoid cloddy seedbeds. Min-till increases slug risk — consider strategic ploughing in high-risk fields. Remove cover crop residues before drilling.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Wheat Bulb Fly
  { pest_id: 'wheat-bulb-fly', approach: 'chemical', treatment: 'Pyrethroid spray or chlorpyrifos treatment', active_substance: 'lambda-cyhalothrin', timing: 'February when larvae hatching (egg counts guide decision, threshold 250 eggs/m2)', dose_rate: 'See product label', efficacy_notes: 'Apply when eggs hatching and before larvae enter stems. Egg counts in January guide treatment decisions. Treatment less effective once larvae inside stems.', resistance_risk: 'Low resistance risk.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'wheat-bulb-fly', approach: 'cultural', treatment: 'Avoid late drilling after fallow or early-lifted potatoes', active_substance: null, timing: 'Drilling date and rotation planning', dose_rate: null, efficacy_notes: 'Drill before mid-October so crop has sufficient tillers to compensate. Avoid fields left bare in July-August (fallow, set-aside, early potatoes). Egg counts available from ADAS/AHDB monitoring.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Gout Fly
  { pest_id: 'gout-fly', approach: 'chemical', treatment: 'No approved chemical treatments available', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'No specific insecticides approved for gout fly in cereals. Seed treatments for other pests may provide incidental control.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'gout-fly', approach: 'cultural', treatment: 'Delayed drilling and crop hygiene', active_substance: null, timing: 'October drilling preferred', dose_rate: null, efficacy_notes: 'Delay autumn drilling to late October to avoid peak egg-laying by autumn generation. Remove grass margins that serve as alternative hosts if severe. Vigorous crops compensate for some tiller loss.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Blackgrass
  { pest_id: 'blackgrass', approach: 'chemical', treatment: 'Pre-emergence herbicide stack', active_substance: 'flufenacet + diflufenican', timing: 'Pre-emergence (within 48h of drilling)', dose_rate: 'See product label', efficacy_notes: 'Residual activity. Best on moist seedbeds. Stack with pendimethalin or prosulfocarb for enhanced control. Pre-em + peri-em sequence gives best grass weed control. Reduced efficacy on dry soils.', resistance_risk: 'Metabolic resistance widespread. Stack sequences and cultural controls essential. Herbicide alone insufficient for resistant populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'blackgrass', approach: 'cultural', treatment: 'Delayed drilling and spring cropping', active_substance: null, timing: 'Autumn planting decisions', dose_rate: null, efficacy_notes: 'Delay drilling to late October or switch to spring crops. Stale seedbeds before drilling (allow flushes then destroy with glyphosate). Plough to bury seed >5cm. Spring cropping reduces blackgrass by 70-80%. Rotation is the most effective control.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Italian Ryegrass
  { pest_id: 'italian-ryegrass', approach: 'chemical', treatment: 'Pre-emergence herbicide application', active_substance: 'flufenacet + pendimethalin', timing: 'Pre-emergence', dose_rate: 'See product label', efficacy_notes: 'Similar herbicide strategy to blackgrass control. Pre-em residual chemistry is the foundation. Follow up with post-em options (pyroxsulam in wheat) if needed. Resistance testing recommended.', resistance_risk: 'ACCase (fop and dim) and ALS resistance confirmed in UK populations. Metabolic resistance also present.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'italian-ryegrass', approach: 'cultural', treatment: 'Rotation with spring crops and hand-roguing', active_substance: null, timing: 'Rotation and in-crop', dose_rate: null, efficacy_notes: 'Spring cropping breaks the cycle. Roguing small infestations before seed set prevents seed bank build-up. Avoid contaminating fields with infested straw or combine.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Wild Oats
  { pest_id: 'wild-oats', approach: 'chemical', treatment: 'Post-emergence graminicide', active_substance: 'pinoxaden or clodinafop-propargyl', timing: 'Post-emergence spring (March-April) at 2-3 leaf wild oat stage', dose_rate: 'See product label', efficacy_notes: 'ACCase inhibitors (fops and dens) are the main chemical options. Apply at 2-3 leaf stage for best efficacy. Second application may be needed for late-germinating plants.', resistance_risk: 'ACCase target-site resistance (Ile-1781-Leu, etc.) confirmed in UK Avena populations. Test before relying on ACCase herbicides.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'wild-oats', approach: 'cultural', treatment: 'Hand-roguing and rotation with competitive crops', active_substance: null, timing: 'Before seed set in field, rotation planning', dose_rate: null, efficacy_notes: 'Rogue plants before seed set (May-June). Use competitive varieties and high seed rates to suppress wild oats. Spring-sown crops allow pre-drilling cultivation to destroy autumn-germinated plants.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Cleavers
  { pest_id: 'cleavers', approach: 'chemical', treatment: 'Post-emergence broadleaved herbicide', active_substance: 'fluroxypyr + clopyralid', timing: 'Post-emergence spring (March-April) at small cleavers stage (1-3 whorls)', dose_rate: 'See product label', efficacy_notes: 'Fluroxypyr is the most effective active against cleavers. Apply early when cleavers are small. Large cleavers are difficult to control. ALS inhibitors also effective but resistance developing.', resistance_risk: 'ALS resistance reported in UK cleavers populations. Fluroxypyr resistance not yet confirmed.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'cleavers', approach: 'cultural', treatment: 'Spring cropping and competitive crops', active_substance: null, timing: 'Rotation', dose_rate: null, efficacy_notes: 'Spring cropping allows pre-drilling cultivation of autumn-germinated cleavers. Competitive crops and high seed rates reduce cleaver growth. OSR is a poor competitor against cleavers.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Charlock
  { pest_id: 'charlock', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'MCPA + mecoprop-P', timing: 'Post-emergence spring when charlock at rosette stage', dose_rate: 'See product label', efficacy_notes: 'Hormone herbicides (MCPA, 2,4-D, mecoprop) give good control when applied to young rosettes. ALS inhibitors also effective. Apply before stem extension.', resistance_risk: 'ALS resistance reported in some European populations. Hormone herbicide resistance rare.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'charlock', approach: 'cultural', treatment: 'Rotation and prevention of seed return', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Prevent seed return to reduce the extremely long-lived seed bank. Ploughing buries seeds deeply where they remain dormant. Avoid disturbing soil in infested fields more than necessary.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Poppies
  { pest_id: 'poppies', approach: 'chemical', treatment: 'Post-emergence broadleaved herbicide', active_substance: 'fluroxypyr or metsulfuron-methyl', timing: 'Post-emergence autumn or spring when poppies at rosette stage', dose_rate: 'See product label', efficacy_notes: 'ALS inhibitors (metsulfuron, tribenuron) give good control. Fluroxypyr provides moderate control. Apply to small rosettes for best results.', resistance_risk: 'ALS-resistant poppy populations confirmed in UK. Test fields with known resistance history.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'poppies', approach: 'cultural', treatment: 'Spring cropping and competitive sowing', active_substance: null, timing: 'Rotation', dose_rate: null, efficacy_notes: 'Spring cropping reduces poppy problems as most germinate in autumn. High seed rates and competitive varieties suppress poppy growth. Extremely long seed bank persistence (80+ years) means long-term management needed.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Chickweed
  { pest_id: 'chickweed', approach: 'chemical', treatment: 'Post-emergence broadleaved herbicide', active_substance: 'fluroxypyr or mecoprop-P', timing: 'Autumn or spring when chickweed actively growing', dose_rate: 'See product label', efficacy_notes: 'Most broadleaved herbicides give good chickweed control. Apply when actively growing. Contact herbicides less effective in cold weather.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'chickweed', approach: 'cultural', treatment: 'Cultivation and competitive crop canopy', active_substance: null, timing: 'Pre-drilling and season-long', dose_rate: null, efficacy_notes: 'Pre-drilling cultivation destroys existing plants. Rapid canopy closure suppresses new germination. Short seed bank persistence means 2-3 years of good control depletes population.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Fat Hen
  { pest_id: 'fat-hen', approach: 'chemical', treatment: 'Residual or post-emergence herbicide in spring crops', active_substance: 'pendimethalin or mesotrione', timing: 'Pre- or post-emergence in spring crops', dose_rate: 'See product label', efficacy_notes: 'Residual herbicides give best control. In sugar beet, contact/residual sequences are standard. In cereals, hormone herbicides give good control.', resistance_risk: 'Triazine resistance in some European populations. UK resistance levels low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'fat-hen', approach: 'cultural', treatment: 'Stale seedbeds and competitive crop establishment', active_substance: null, timing: 'Pre-drilling', dose_rate: null, efficacy_notes: 'Stale seedbed technique: prepare seedbed early, allow fat hen flush, destroy with glyphosate or cultivation before drilling. Rapid crop establishment and early canopy closure limit fat hen competition.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Mayweed
  { pest_id: 'mayweed', approach: 'chemical', treatment: 'ALS-inhibitor or hormone herbicide', active_substance: 'metsulfuron-methyl or fluroxypyr', timing: 'Post-emergence autumn or spring at rosette stage', dose_rate: 'See product label', efficacy_notes: 'ALS inhibitors (metsulfuron, tribenuron) give good control of sensitive populations. Fluroxypyr provides alternative mode of action. Apply to rosettes.', resistance_risk: 'ALS resistance well documented in UK scentless mayweed populations. Increasing in frequency.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'mayweed', approach: 'cultural', treatment: 'Rotation and preventing seed return', active_substance: null, timing: 'Rotation and in-crop', dose_rate: null, efficacy_notes: 'Prevent seed set in field by timely herbicide or mechanical control. Spring cropping and ploughing disrupt the cycle. Avoid allowing dense stands to mature and shed seed.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Additional Cereal Disease Treatments ───────────────────────

  // Sharp Eyespot
  { pest_id: 'sharp-eyespot', approach: 'chemical', treatment: 'No specific fungicide recommendation — incidental control from eyespot sprays', active_substance: 'prochloraz', timing: 'T0-T1 as part of stem base programme', dose_rate: 'See product label', efficacy_notes: 'No specific products for sharp eyespot. Stem base fungicides for eyespot may provide incidental control. Often superficial and does not justify specific treatment.', resistance_risk: null, approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'sharp-eyespot', approach: 'cultural', treatment: 'Break crop rotation and ploughing', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Non-cereal break crop reduces inoculum. Ploughing buries infected debris. Avoid grass leys immediately before cereals. Encourage good soil structure.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Ergot
  { pest_id: 'ergot', approach: 'chemical', treatment: 'No direct chemical control — manage grass weed hosts', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'No fungicide effectively controls ergot infection. Manage by controlling grass weeds (inoculum source), using clean certified seed, and removing field margin grasses that flower at the same time as the crop.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'ergot', approach: 'cultural', treatment: 'Grass weed control, certified seed, and grain cleaning', active_substance: null, timing: 'Pre- and post-harvest', dose_rate: null, efficacy_notes: 'Control grass weeds (especially blackgrass, ryegrass) to reduce inoculum. Use certified seed. Clean grain at harvest to remove ergot bodies. Avoid rye and triticale in high-risk situations.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Loose Smut Wheat
  { pest_id: 'loose-smut-wheat', approach: 'chemical', treatment: 'Systemic seed treatment', active_substance: 'carboxin + thiram', timing: 'Seed treatment before drilling', dose_rate: 'See product label', efficacy_notes: 'Systemic seed treatments eradicate the dormant fungus within the seed embryo. Essential for farm-saved seed. Certified seed is treated by default.', resistance_risk: 'Low — seed treatment is highly effective.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'loose-smut-wheat', approach: 'cultural', treatment: 'Use certified seed', active_substance: null, timing: 'Seed sourcing', dose_rate: null, efficacy_notes: 'Certified seed is treated and tested, eliminating loose smut risk. If saving seed, use systemic seed treatment. Inspect crops at heading to detect infected plants.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Covered Smut Barley
  { pest_id: 'covered-smut-barley', approach: 'chemical', treatment: 'Seed treatment fungicide', active_substance: 'fludioxonil + sedaxane', timing: 'Seed treatment before drilling', dose_rate: 'See product label', efficacy_notes: 'Standard seed treatment fungicides effective against covered smut. Most commercial certified seed is treated. Farm-saved seed must be treated.', resistance_risk: 'Low — good control from standard seed treatments.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'covered-smut-barley', approach: 'cultural', treatment: 'Certified seed and combine hygiene', active_substance: null, timing: 'Seed sourcing and harvest', dose_rate: null, efficacy_notes: 'Use certified seed. Clean combine between fields if smut detected. Avoid saving seed from infected crops without treatment.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Barley Yellow Dwarf Virus
  { pest_id: 'barley-yellow-dwarf-virus', approach: 'chemical', treatment: 'Pyrethroid spray to control aphid vectors in autumn', active_substance: 'lambda-cyhalothrin', timing: 'October-November when aphids colonising crop', dose_rate: 'See product label', efficacy_notes: 'Apply when aphid numbers rising in autumn to prevent virus transmission. May need repeat application if migration continues. Only prevents new infections — does not cure infected plants.', resistance_risk: 'Low aphid resistance to pyrethroids but efficacy window is limited.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'barley-yellow-dwarf-virus', approach: 'cultural', treatment: 'Delayed drilling and BYDV-tolerant varieties', active_substance: null, timing: 'Drilling date and variety selection', dose_rate: null, efficacy_notes: 'Delay drilling until late October to avoid peak aphid migration. BYDV-tolerant winter barley varieties available. Destroy volunteer cereals to break green bridge.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Wheat Yellow Mosaic Virus
  { pest_id: 'wheat-yellow-mosaic-virus', approach: 'cultural', treatment: 'Tolerant varieties and drainage improvement', active_substance: null, timing: 'Variety selection and field management', dose_rate: null, efficacy_notes: 'No chemical control for virus or vector. Use tolerant varieties where virus confirmed. Improve field drainage to reduce vector activity. Avoid continuous wheat on infested fields.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Ear Blight Complex
  { pest_id: 'ear-blight-complex', approach: 'chemical', treatment: 'T3 azole fungicide at mid-flowering', active_substance: 'prothioconazole + tebuconazole', timing: 'T3 at mid-flowering (GS63-65)', dose_rate: 'See product label', efficacy_notes: 'Same timing as Fusarium ear blight. Prothioconazole is the most effective active. Effective against both Fusarium and Microdochium. Timing at mid-flowering is critical.', resistance_risk: 'Low current resistance. Main risk is incorrect timing.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'ear-blight-complex', approach: 'cultural', treatment: 'Residue management and rotation', active_substance: null, timing: 'Post-harvest and rotation planning', dose_rate: null, efficacy_notes: 'Plough or chop cereal residues. Avoid wheat after maize. Choose varieties with moderate ear blight resistance. Rotation with non-cereal break crops reduces inoculum.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Sooty Moulds
  { pest_id: 'sooty-moulds', approach: 'cultural', treatment: 'Control aphid populations to prevent honeydew', active_substance: null, timing: 'Season-long aphid management', dose_rate: null, efficacy_notes: 'Primary control is aphid management — no honeydew means no sooty mould substrate. Timely harvest before wet weather reduces mould development. No direct fungicide control needed.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Crown Rot
  { pest_id: 'crown-rot', approach: 'cultural', treatment: 'Crop rotation and residue management', active_substance: null, timing: 'Rotation planning and post-harvest', dose_rate: null, efficacy_notes: 'Non-cereal break crop (minimum 1 year) reduces inoculum. Plough or chop cereal stubble to accelerate decomposition. Avoid wheat-after-wheat. No effective chemical control available for crown rot.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Snow Mould
  { pest_id: 'snow-mould', approach: 'chemical', treatment: 'Seed treatment to reduce seed-borne inoculum', active_substance: 'fludioxonil', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Seed treatment reduces seed-borne Microdochium. Foliar fungicides during autumn may provide some protection but are rarely justified for snow mould alone.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'snow-mould', approach: 'cultural', treatment: 'Avoid excessive autumn nitrogen and use certified seed', active_substance: null, timing: 'Autumn management', dose_rate: null, efficacy_notes: 'Avoid high autumn nitrogen applications. Use certified treated seed. Good drainage reduces prolonged waterlogging. Not much can be done about prolonged snow cover.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── OSR Disease Treatments ─────────────────────────────────────

  // Clubroot
  { pest_id: 'clubroot', approach: 'cultural', treatment: 'Liming and resistant varieties', active_substance: null, timing: 'Pre-planting soil management', dose_rate: null, efficacy_notes: 'Raise soil pH above 7.2 with lime to suppress clubroot. Use resistant varieties. Minimum 5-year OSR rotation on infested land. Clean machinery between fields. No effective chemical control in the field.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Alternaria Dark Leaf Spot
  { pest_id: 'alternaria-dark-leaf-spot', approach: 'chemical', treatment: 'Fungicide application during pod development', active_substance: 'prothioconazole + tebuconazole', timing: 'During pod development if risk is high', dose_rate: 'See product label', efficacy_notes: 'Fungicide programmes for phoma and sclerotinia may provide incidental Alternaria control. Specific Alternaria timing is during pod development in warm humid weather.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'alternaria-dark-leaf-spot', approach: 'cultural', treatment: 'Rotation and residue destruction', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Maintain minimum 3-year gap between OSR crops. Chop or plough OSR stubble. Use certified seed. Avoid damaged or stressed crops.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // White Leaf Spot
  { pest_id: 'white-leaf-spot', approach: 'chemical', treatment: 'Autumn or spring fungicide (same programme as LLS)', active_substance: 'prothioconazole', timing: 'Autumn (November) or spring (February-March)', dose_rate: 'See product label', efficacy_notes: 'Same fungicide programme as for light leaf spot provides incidental white leaf spot control. Prothioconazole and tebuconazole effective.', resistance_risk: 'Limited data — similar to LLS.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'white-leaf-spot', approach: 'cultural', treatment: 'Rotation and variety choice', active_substance: null, timing: 'Rotation and variety selection', dose_rate: null, efficacy_notes: 'Extended rotation (3-4 years between OSR). Choose varieties with good disease resistance package. Most effective in combination with fungicide.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Verticillium Wilt OSR
  { pest_id: 'verticillium-wilt-osr', approach: 'cultural', treatment: 'Extended rotation and resistant varieties', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'No chemical control available. Minimum 4-5 year rotation gap reduces soil inoculum. Resistant varieties becoming available. Microsclerotia persist 10+ years so long rotations essential.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Downy Mildew OSR
  { pest_id: 'downy-mildew-osr', approach: 'chemical', treatment: 'Metalaxyl seed treatment for early protection', active_substance: 'metalaxyl-M', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Seed treatment with metalaxyl provides early seedling protection. Rarely justified as a standalone spray. Usually outgrown by established plants.', resistance_risk: 'Metalaxyl resistance reported in some oomycete populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'downy-mildew-osr', approach: 'cultural', treatment: 'Good ventilation and certified seed', active_substance: null, timing: 'Establishment management', dose_rate: null, efficacy_notes: 'Avoid excessively dense plant populations. Good air circulation reduces humidity. Use certified seed. Older plants develop natural resistance. Rarely a significant yield-limiting disease.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Turnip Yellows Virus
  { pest_id: 'turnip-yellows-virus', approach: 'chemical', treatment: 'Pyrethroid spray to control Myzus persicae vectors', active_substance: 'lambda-cyhalothrin', timing: 'Autumn when peach-potato aphids detected', dose_rate: 'See product label', efficacy_notes: 'Spray timing against Myzus persicae in autumn. Pyrethroid resistance (kdr) widespread in Myzus persicae — check sensitivity. Efficacy variable. TuYV-resistant varieties are the preferred approach.', resistance_risk: 'High — Myzus persicae has widespread pyrethroid (kdr), carbamate (MACE), and metabolic resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'turnip-yellows-virus', approach: 'cultural', treatment: 'TuYV-resistant varieties and brassica weed control', active_substance: null, timing: 'Variety selection and weed management', dose_rate: null, efficacy_notes: 'TuYV-resistant varieties (AHDB Recommended List) are the most effective control. Destroy brassica volunteers and weeds (virus reservoirs). Delay drilling slightly to reduce aphid exposure window.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Potato Disease Treatments ──────────────────────────────────

  // Late Blight
  { pest_id: 'late-blight', approach: 'chemical', treatment: 'Protectant fungicide programme from blight risk period', active_substance: 'fluazinam or mandipropamid + difenoconazole', timing: 'Every 7-14 days from first Smith Period', dose_rate: 'See product label', efficacy_notes: 'Protectant programme is the foundation. Alternate modes of action to manage resistance. Shorter intervals (7 days) in high-risk periods. Include tuber blight protectant at canopy closure.', resistance_risk: 'New Phytophthora genotypes (EU_36_A2, EU_43_A1) with fluazinam insensitivity. Monitor BlightSpy/CRD alerts.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'late-blight', approach: 'cultural', treatment: 'Certified seed, volunteer destruction, and waste heap management', active_substance: null, timing: 'Pre-planting', dose_rate: null, efficacy_notes: 'Use healthy certified seed tubers. Destroy volunteer potatoes (green bridge). Cover or treat potato waste heaps. Early crops set up before blight season. Late canopy destruction limits tuber blight infection.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Early Blight
  { pest_id: 'early-blight', approach: 'chemical', treatment: 'Fungicide within late blight programme', active_substance: 'difenoconazole or azoxystrobin', timing: 'As part of blight programme when early blight risk develops', dose_rate: 'See product label', efficacy_notes: 'Most blight programmes provide incidental early blight control. Specific actives (difenoconazole, azoxystrobin) have good Alternaria activity. Target lower canopy protection.', resistance_risk: 'QoI (strobilurin) resistance in some Alternaria populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'early-blight', approach: 'cultural', treatment: 'Balanced nutrition and crop stress management', active_substance: null, timing: 'Season-long crop management', dose_rate: null, efficacy_notes: 'Maintain adequate nitrogen and potassium nutrition. Avoid crop stress (drought, nutrient deficiency). Irrigate to prevent drought stress. Rotate fields to reduce debris inoculum.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Potato Cyst Nematode
  { pest_id: 'potato-cyst-nematode', approach: 'chemical', treatment: 'Granular nematicide at planting', active_substance: 'fosthiazate', timing: 'Applied in-furrow at planting', dose_rate: 'See product label', efficacy_notes: 'Reduces nematode root invasion and provides yield protection. Does not eradicate the population — combine with resistant varieties and rotation. Most cost-effective in moderate-high infestations.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'potato-cyst-nematode', approach: 'cultural', treatment: 'Resistant varieties and extended rotation', active_substance: null, timing: 'Rotation planning and variety selection', dose_rate: null, efficacy_notes: 'Use PCN-resistant varieties (check Recommended List for G. pallida and G. rostochiensis resistance). Minimum 5-year potato rotation in infested fields. Soil test before planting to determine species and population.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Blackleg
  { pest_id: 'blackleg', approach: 'cultural', treatment: 'Certified seed and hygiene', active_substance: null, timing: 'Seed sourcing and harvest management', dose_rate: null, efficacy_notes: 'No chemical control for bacterial blackleg. Use certified seed tested for Pectobacterium. Avoid mechanical damage at harvest. Do not harvest in waterlogged conditions. Store dry with adequate ventilation.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Common Scab
  { pest_id: 'common-scab', approach: 'cultural', treatment: 'Irrigation during tuber initiation and variety choice', active_substance: null, timing: '2-4 week period after tuber initiation', dose_rate: null, efficacy_notes: 'Maintain soil moisture during the scab-susceptible period (2-4 weeks after tuber initiation). Apply 25mm irrigation per week during this window. Choose scab-resistant varieties. Avoid liming before potatoes.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Silver Scurf
  { pest_id: 'silver-scurf', approach: 'chemical', treatment: 'Seed tuber treatment at planting', active_substance: 'fludioxonil + fluxapyroxad', timing: 'Seed treatment at planting', dose_rate: 'See product label', efficacy_notes: 'Seed tuber treatment reduces transmission from mother to daughter tubers. Post-harvest tuber treatment also available. Cold-store hygiene is important for limiting spread in store.', resistance_risk: 'Some reduced sensitivity to thiabendazole in UK H. solani.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'silver-scurf', approach: 'cultural', treatment: 'Certified seed and store hygiene', active_substance: null, timing: 'Seed sourcing and storage management', dose_rate: null, efficacy_notes: 'Use certified seed with low silver scurf levels. Maintain low humidity in store. Harvest promptly. Clean and disinfect stores between seasons. Rapid cool-down after loading.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Pulse Disease Treatments ───────────────────────────────────

  // Chocolate Spot
  { pest_id: 'chocolate-spot', approach: 'chemical', treatment: 'Protectant fungicide at early flower', active_substance: 'tebuconazole + azoxystrobin', timing: 'At first flower when chocolate spot detected', dose_rate: 'See product label', efficacy_notes: 'Apply at early flowering before aggressive phase develops. Protectant timing is critical — difficult to control once aggressive phase established. May need repeat spray if wet conditions persist.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'chocolate-spot', approach: 'cultural', treatment: 'Open canopy management and rotation', active_substance: null, timing: 'Drilling and rotation planning', dose_rate: null, efficacy_notes: 'Lower seed rate and wider rows to reduce canopy humidity. Avoid excessive nitrogen. Minimum 4-year bean rotation. Spring beans generally less affected than winter beans.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Downy Mildew Peas
  { pest_id: 'downy-mildew-peas', approach: 'chemical', treatment: 'Metalaxyl seed treatment', active_substance: 'metalaxyl-M', timing: 'Seed treatment before drilling', dose_rate: 'See product label', efficacy_notes: 'Seed treatment with metalaxyl provides protection against soil-borne systemic infection. No foliar fungicide specifically for pea downy mildew.', resistance_risk: 'Metalaxyl resistance reported in some oomycete pathogens.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'downy-mildew-peas', approach: 'cultural', treatment: 'Rotation and certified seed', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Minimum 5-year pea rotation on infested fields. Use certified seed. Good field drainage reduces vector (Polymyxa-like) activity. Avoid fields with known downy mildew history.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Ascochyta Blight
  { pest_id: 'ascochyta-blight', approach: 'chemical', treatment: 'Fungicide spray at flowering', active_substance: 'tebuconazole', timing: 'At early flowering and repeat if needed during pod fill', dose_rate: 'See product label', efficacy_notes: 'Protects pods from infection during the susceptible period. Most important in wet seasons. Seed treatment also reduces seed-borne inoculum.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'ascochyta-blight', approach: 'cultural', treatment: 'Certified seed and rotation', active_substance: null, timing: 'Seed sourcing and rotation', dose_rate: null, efficacy_notes: 'Use certified tested seed to break the seed-borne cycle. Minimum 4-year rotation. Remove crop debris. Seed testing available to quantify Ascochyta seed infection levels.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bean Rust
  { pest_id: 'bean-rust', approach: 'chemical', treatment: 'Fungicide spray at first rust pustules', active_substance: 'tebuconazole + azoxystrobin', timing: 'When first pustules seen, before or during flowering for best yield protection', dose_rate: 'See product label', efficacy_notes: 'Apply promptly at first pustules. Triazoles and strobilurins both effective. Late-season rust (after pod fill) causes less yield loss and may not justify treatment.', resistance_risk: 'Low current resistance in Uromyces viciae-fabae.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'bean-rust', approach: 'cultural', treatment: 'Volunteer destruction and rotation', active_substance: null, timing: 'Post-harvest and rotation', dose_rate: null, efficacy_notes: 'Destroy volunteer beans that host the rust between crops. Minimum 3-year bean rotation. Earlier sowing of winter beans can shift susceptible growth stage away from peak rust season.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Sugar Beet Disease Treatments ──────────────────────────────

  // Cercospora Leaf Spot
  { pest_id: 'cercospora-leaf-spot', approach: 'chemical', treatment: 'Fungicide spray at first symptoms', active_substance: 'epoxiconazole or difenoconazole', timing: 'At first symptoms, repeat at 3-4 week intervals', dose_rate: 'See product label', efficacy_notes: 'Triazole fungicides are the backbone of Cercospora programmes. Early detection and prompt treatment is essential. In continental Europe, multiple sprays may be needed. UK currently lower pressure.', resistance_risk: 'Widespread azole and strobilurin resistance in continental European CLS populations. Monitor UK sensitivity data.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'cercospora-leaf-spot', approach: 'cultural', treatment: 'Rotation, resistant varieties, and residue destruction', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Minimum 3-year beet rotation. Use tolerant varieties. Destroy beet debris promptly after harvest. Avoid returning beet tops to infested fields.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Powdery Mildew Beet
  { pest_id: 'powdery-mildew-beet', approach: 'chemical', treatment: 'Fungicide spray when mildew established before August', active_substance: 'tetraconazole or sulphur', timing: 'When mildew confirmed on crop before mid-August', dose_rate: 'See product label', efficacy_notes: 'Treat if mildew established before mid-August for maximum yield benefit. Late infections (September+) cause less sugar yield loss. Sulphur provides multi-site activity.', resistance_risk: 'Some reduced azole sensitivity in Erysiphe betae.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'powdery-mildew-beet', approach: 'cultural', treatment: 'Resistant varieties', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'Choose varieties with good mildew resistance from the BBRO Recommended List. Variety resistance is the most cost-effective management tool.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Rhizomania
  { pest_id: 'rhizomania', approach: 'cultural', treatment: 'Resistant varieties (Rz1) and extended rotation', active_substance: null, timing: 'Variety selection and rotation', dose_rate: null, efficacy_notes: 'All UK sugar beet varieties carry Rz1 resistance gene. No chemical control exists. Maintain beet rotation minimum 4 years. Clean machinery to avoid spreading infested soil. Soil testing available to confirm presence.', resistance_risk: null, approval_status: null, source: 'BBRO' },

  // Ramularia Beet
  { pest_id: 'ramularia-beet', approach: 'chemical', treatment: 'Fungicide spray within sugar beet leaf disease programme', active_substance: 'difenoconazole', timing: 'When leaf spots confirmed and weather favourable for disease', dose_rate: 'See product label', efficacy_notes: 'Co-managed with Cercospora and powdery mildew in foliar fungicide programmes. Triazoles effective. Timing guided by overall foliar disease pressure.', resistance_risk: 'Some reduced efficacy to certain actives reported.', approval_status: 'approved', source: 'BBRO' },
  { pest_id: 'ramularia-beet', approach: 'cultural', treatment: 'Rotation and resistant varieties', active_substance: null, timing: 'Rotation and variety selection', dose_rate: null, efficacy_notes: 'Extended beet rotation reduces soil and debris inoculum. Choose varieties with good foliar disease resistance. Destroy beet debris after harvest.', resistance_risk: null, approval_status: null, source: 'BBRO' },

  // ── Additional Insect Pest Treatments ──────────────────────────

  // Peach-Potato Aphid
  { pest_id: 'peach-potato-aphid', approach: 'chemical', treatment: 'Selective aphicide spray', active_substance: 'spirotetramat or pymetrozine', timing: 'When aphid colonies detected on OSR or potato crops', dose_rate: 'See product label', efficacy_notes: 'Pyrethroid resistance (kdr, MACE) widespread in Myzus persicae. Use non-pyrethroid alternatives. Spirotetramat has systemic activity. Pymetrozine is selective aphicide.', resistance_risk: 'High — multiple resistance mechanisms. Test populations if available. Avoid pyrethroids where resistance confirmed.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'peach-potato-aphid', approach: 'cultural', treatment: 'TuYV-resistant OSR varieties and weed host management', active_substance: null, timing: 'Variety selection and weed control', dose_rate: null, efficacy_notes: 'TuYV-resistant varieties tolerate virus even when aphids present. Remove brassica weeds (virus reservoirs). Maintain field margins to support natural enemies.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Cereal Leaf Beetle
  { pest_id: 'cereal-leaf-beetle', approach: 'chemical', treatment: 'Pyrethroid spray when threshold reached', active_substance: 'lambda-cyhalothrin', timing: 'When >1 egg or larva per flag leaf', dose_rate: 'See product label', efficacy_notes: 'Threshold: 1 egg or larva per flag leaf at T2 timing. Spray targets larvae before pupation. Natural enemies (Tetrastichus julis) often provide adequate control — assess before spraying.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'cereal-leaf-beetle', approach: 'cultural', treatment: 'Conservation biological control', active_substance: null, timing: 'Season-long', dose_rate: null, efficacy_notes: 'Parasitoid wasp Tetrastichus julis provides significant biological control. Maintain field margins. Avoid unnecessary broad-spectrum insecticide that depletes natural enemy populations.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Saddle Gall Midge
  { pest_id: 'saddle-gall-midge', approach: 'chemical', treatment: 'Pyrethroid spray at peak adult emergence', active_substance: 'lambda-cyhalothrin', timing: 'Evening spray when pheromone traps confirm adult emergence', dose_rate: 'See product label', efficacy_notes: 'Timing is critical — spray must target egg-laying adults. Pheromone traps guide timing. Apply in the evening when adults are active. Once larvae are behind leaf sheaths, chemical control is ineffective.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'saddle-gall-midge', approach: 'cultural', treatment: 'Ploughing and break crops', active_substance: null, timing: 'Post-harvest and rotation', dose_rate: null, efficacy_notes: 'Ploughing buries overwintering larvae below emergence depth. Non-cereal break crops deny host. Pheromone monitoring helps identify high-risk fields.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Yellow Cereal Fly
  { pest_id: 'yellow-cereal-fly', approach: 'cultural', treatment: 'Delayed drilling and crop vigour', active_substance: null, timing: 'Drilling date management', dose_rate: null, efficacy_notes: 'No specific insecticide approved. Delay autumn drilling to avoid peak adult egg-laying period. Vigorous crops compensate for tiller losses through extra tillering. Ensure good nutrition.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Leatherjackets
  { pest_id: 'leatherjackets', approach: 'chemical', treatment: 'Limited chemical options post-chlorpyrifos withdrawal', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'Chlorpyrifos (previously the main chemical control) withdrawn. No approved insecticides with good efficacy against leatherjackets in arable crops as of 2024. Research on biological control (Metarhizium) ongoing.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'leatherjackets', approach: 'cultural', treatment: 'Ploughing, consolidation, and crop selection', active_substance: null, timing: 'Pre-drilling and drilling', dose_rate: null, efficacy_notes: 'Plough grassland 4-6 weeks before drilling to expose larvae to desiccation and predation. Consolidate (roll) after drilling. Consider spring crop after grass ley. Soil sampling (threshold: 100 larvae/m2) guides risk assessment.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Wireworms
  { pest_id: 'wireworms', approach: 'chemical', treatment: 'Limited chemical options — seed treatment may help', active_substance: null, timing: 'Seed treatment', dose_rate: null, efficacy_notes: 'No highly effective approved insecticide for wireworms in arable crops. Some seed treatments (clothianidin — withdrawn) previously helped. Research on biological agents ongoing. Focus on cultural management.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'wireworms', approach: 'cultural', treatment: 'Soil sampling and crop management after grass ley', active_substance: null, timing: 'Pre-planting assessment', dose_rate: null, efficacy_notes: 'Soil sampling to assess wireworm numbers before planting high-value crops (potatoes). Avoid potatoes in first 3 years after grass. Ploughing exposes larvae. Populations decline naturally after grass is removed from rotation.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Beet Cyst Nematode
  { pest_id: 'beet-cyst-nematode', approach: 'chemical', treatment: 'Granular nematicide at drilling', active_substance: 'fosthiazate', timing: 'Applied in-furrow at drilling', dose_rate: 'See product label', efficacy_notes: 'Reduces root invasion and yield loss. Does not eradicate population. Combine with tolerant varieties and rotation for best results.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'BBRO' },
  { pest_id: 'beet-cyst-nematode', approach: 'cultural', treatment: 'Extended rotation and resistant mustard trap crops', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Minimum 4-year sugar beet rotation. BCN-resistant mustard cover crops stimulate hatch without allowing reproduction, reducing populations by 50-80%. Soil sampling to quantify populations. Nematode-tolerant beet varieties available.', resistance_risk: null, approval_status: null, source: 'BBRO' },

  // Colorado Potato Beetle
  { pest_id: 'colorado-potato-beetle', approach: 'chemical', treatment: 'Statutory eradication treatment', active_substance: 'spinosad or chlorantraniliprole', timing: 'Immediate on detection under APHA direction', dose_rate: 'As directed by APHA', efficacy_notes: 'UK quarantine pest — any detection triggers statutory response by APHA. Treatment directed by plant health authorities. In established populations (outside UK), insecticide resistance is widespread.', resistance_risk: 'High in established populations — multiple resistance mechanisms globally.', approval_status: 'emergency use', source: 'APHA' },

  // Pea Moth
  { pest_id: 'pea-moth', approach: 'chemical', treatment: 'Pyrethroid spray at peak moth flight', active_substance: 'lambda-cyhalothrin', timing: 'When pheromone trap threshold exceeded (5 per trap per week during flowering)', dose_rate: 'See product label', efficacy_notes: 'Timing based on pheromone trap data. Spray 7-10 days after threshold is exceeded (targeting egg hatch). Most effective for vining peas with narrow harvest window.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'pea-moth', approach: 'cultural', treatment: 'Early sowing to avoid peak moth flight', active_substance: null, timing: 'Drilling date management', dose_rate: null, efficacy_notes: 'Early-sown crops may finish flowering before peak moth emergence. Increase distance from previous pea crops. Plough pea stubble to bury overwintering larvae.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bean Seed Fly
  { pest_id: 'bean-seed-fly', approach: 'cultural', treatment: 'Warm seedbed conditions and shallow drilling', active_substance: null, timing: 'Drilling management', dose_rate: null, efficacy_notes: 'No approved seed treatment. Drill into warm soil for rapid germination. Avoid deep drilling. Consolidate seedbed. Do not drill into recently incorporated green manure (attracts egg-laying adults).', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Rape Winter Stem Weevil
  { pest_id: 'rape-winter-stem-weevil', approach: 'chemical', treatment: 'Pyrethroid spray when adult migration detected', active_substance: 'lambda-cyhalothrin', timing: 'Autumn when water traps detect weevil migration', dose_rate: 'See product label', efficacy_notes: 'Apply as adults migrate to OSR crop in autumn. Water trap monitoring guides timing. Once larvae are inside stems, chemical control is ineffective. Pyrethroid resistance increasing.', resistance_risk: 'Pyrethroid resistance increasing in Ceutorhynchus species.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'rape-winter-stem-weevil', approach: 'cultural', treatment: 'Crop vigour and spatial separation from previous OSR', active_substance: null, timing: 'Crop management', dose_rate: null, efficacy_notes: 'Vigorous crops tolerate more larval damage. Maximise distance from previous year OSR crops. Consider companion crops. Avoid earliest drilling dates.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Seed Weevil OSR
  { pest_id: 'seed-weevil-osr', approach: 'chemical', treatment: 'Pyrethroid or alternative insecticide during flowering', active_substance: 'lambda-cyhalothrin or indoxacarb', timing: 'During flowering when threshold exceeded (1 weevil per 2 plants)', dose_rate: 'See product label', efficacy_notes: 'Threshold: 1 weevil per 2 plants. Pyrethroids effective where resistance not present. Indoxacarb as alternative. Spray also controls brassica pod midge if applied at pod set.', resistance_risk: 'Pyrethroid resistance emerging in Ceutorhynchus obstrictus populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'seed-weevil-osr', approach: 'cultural', treatment: 'Spatial separation and early-flowering varieties', active_substance: null, timing: 'Variety and crop placement', dose_rate: null, efficacy_notes: 'Maximise distance from previous OSR crops. Early-flowering varieties may escape peak weevil migration. Manage alongside pollen beetle and pod midge as part of the OSR pest complex.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Additional Weed Treatments ─────────────────────────────────

  // Annual Meadow-Grass
  { pest_id: 'annual-meadow-grass', approach: 'chemical', treatment: 'Pre-emergence herbicide in cereals', active_substance: 'flufenacet + diflufenican', timing: 'Pre-emergence', dose_rate: 'See product label', efficacy_notes: 'Same pre-em herbicides used for blackgrass also control annual meadow-grass. Post-em options more limited. Propyzamide in OSR effective against AMG.', resistance_risk: 'ALS and ACCase resistance confirmed in some AMG populations. Glyphosate resistance reported outside UK.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'annual-meadow-grass', approach: 'cultural', treatment: 'Stale seedbeds and crop competition', active_substance: null, timing: 'Pre-drilling', dose_rate: null, efficacy_notes: 'Stale seedbed technique. Competitive crop establishment. Spring cropping helps. Ploughing buries seed below germination depth. Short seed bank means 2-3 years of good control can deplete populations.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Sterile Brome
  { pest_id: 'sterile-brome', approach: 'chemical', treatment: 'No selective herbicide in cereals — glyphosate in stubble', active_substance: 'glyphosate', timing: 'Post-harvest stubble or pre-drilling stale seedbed', dose_rate: 'See product label', efficacy_notes: 'No selective grass herbicide controls sterile brome in cereals. Glyphosate in stubble or stale seedbed is the main chemical tool. Propyzamide in OSR provides in-crop control.', resistance_risk: 'No known glyphosate resistance in sterile brome.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'sterile-brome', approach: 'cultural', treatment: 'Ploughing and spring cropping', active_substance: null, timing: 'Post-harvest and rotation', dose_rate: null, efficacy_notes: 'Single plough inverts seed below germination depth — highly effective due to short seed bank (1-2 years). Spring cropping allows autumn cultivation to destroy germinated plants. Manage field margins.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Couch Grass
  { pest_id: 'couch-grass', approach: 'chemical', treatment: 'Glyphosate in stubble period', active_substance: 'glyphosate', timing: 'Post-harvest when couch is actively growing (August-October)', dose_rate: 'See product label — full rate needed for perennial grasses', efficacy_notes: 'Apply when couch is actively growing with 4+ new leaves (about 15cm). Do not cultivate for 7-10 days after application. Full label rate required. Repeat treatments may be needed for dense infestations.', resistance_risk: 'No known glyphosate resistance in couch grass.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'couch-grass', approach: 'cultural', treatment: 'Repeated cultivation or smothering cover crops', active_substance: null, timing: 'Fallow or stubble period', dose_rate: null, efficacy_notes: 'Repeated shallow cultivation in dry weather desiccates rhizome fragments (traditional fallow approach). Each fragment must be brought to the surface. Minimum tillage spreads couch — avoid. Deep ploughing less effective as rhizome fragments at depth remain viable.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Volunteer OSR
  { pest_id: 'volunteer-osr', approach: 'chemical', treatment: 'Graminicide/broadleaved herbicide in subsequent cereal crop', active_substance: 'fluroxypyr or MCPA', timing: 'Post-emergence in cereals when volunteers at rosette stage', dose_rate: 'See product label', efficacy_notes: 'Hormone herbicides (MCPA, 2,4-D) and fluroxypyr control volunteer OSR in cereals. In pulses, check label for safe options. Clearfield (imazamox-tolerant) volunteers require non-ALS herbicides.', resistance_risk: 'Clearfield-tolerant volunteers resist ALS herbicides.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'volunteer-osr', approach: 'cultural', treatment: 'Stale seedbed and delayed cultivation', active_substance: null, timing: 'Post-harvest and pre-drilling', dose_rate: null, efficacy_notes: 'Leave OSR stubble undisturbed to allow volunteer germination, then destroy with glyphosate or shallow cultivation. Avoid deep burial of OSR seeds which extends dormancy. Spring cropping allows autumn volunteer flushes to be destroyed.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Crane's-Bill
  { pest_id: 'cranes-bill', approach: 'chemical', treatment: 'Post-emergence broadleaved herbicide', active_substance: 'fluroxypyr or MCPA', timing: 'Post-emergence spring at rosette stage', dose_rate: 'See product label', efficacy_notes: 'Fluroxypyr provides good control. Hormone herbicides (MCPA) also effective on young plants. Apply when plants are small — larger plants more difficult to control.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'cranes-bill', approach: 'cultural', treatment: 'Spring cropping and competitive varieties', active_substance: null, timing: 'Rotation', dose_rate: null, efficacy_notes: 'Spring cropping allows autumn-germinated plants to be destroyed. Competitive crop varieties and higher seed rates suppress cranesbill growth.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Field Pansy
  { pest_id: 'field-pansy', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals or OSR', active_substance: 'fluroxypyr or metsulfuron-methyl', timing: 'Post-emergence autumn or spring', dose_rate: 'See product label', efficacy_notes: 'ALS inhibitors (metsulfuron) effective on sensitive populations. Check for ALS resistance. Fluroxypyr provides alternative mode of action.', resistance_risk: 'ALS resistance increasing in UK field pansy populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'field-pansy', approach: 'cultural', treatment: 'Rotation and weed management', active_substance: null, timing: 'Rotation', dose_rate: null, efficacy_notes: 'Spring cropping reduces autumn-germinating field pansy. Competitive crop canopy suppresses growth. Manage as part of the broadleaved weed complex.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Common Fumitory
  { pest_id: 'common-fumitory', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'fluroxypyr', timing: 'Post-emergence when fumitory actively growing', dose_rate: 'See product label', efficacy_notes: 'Fluroxypyr provides good control. Most standard broadleaved herbicide programmes include adequate fumitory activity. Apply to small plants for best results.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'common-fumitory', approach: 'cultural', treatment: 'Avoid soil disturbance on infested fields', active_substance: null, timing: 'Cultivation management', dose_rate: null, efficacy_notes: 'Reduce unnecessary soil disturbance that triggers dormant seed germination. Long-lived seed bank (10+ years) means even infrequent germination maintains the population.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bindweed
  { pest_id: 'bindweed', approach: 'chemical', treatment: 'Glyphosate in stubble targeting actively growing bindweed', active_substance: 'glyphosate', timing: 'Post-harvest when bindweed actively growing (July-September)', dose_rate: 'See product label — full rate for perennial weeds', efficacy_notes: 'Glyphosate applied to actively growing bindweed in stubble. Repeat annually for 3+ years to deplete root reserves. In-crop options limited to clopyralid (in cereals) which provides suppression not eradication.', resistance_risk: 'No known glyphosate resistance in Convolvulus.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'bindweed', approach: 'cultural', treatment: 'Repeated cultivation and fallow management', active_substance: null, timing: 'Fallow or long stubble period', dose_rate: null, efficacy_notes: 'Repeated cultivation in dry weather desiccates root fragments but deep roots survive. Fallow cropping year with repeated treatments most effective. Combine chemical and cultural approaches over multiple years.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Thistles
  { pest_id: 'thistles', approach: 'chemical', treatment: 'Clopyralid in cereals or glyphosate in stubble', active_substance: 'clopyralid', timing: 'Post-emergence spring in cereals when thistles at rosette stage, or glyphosate in stubble', dose_rate: 'See product label', efficacy_notes: 'Clopyralid is the most effective in-crop option. Apply to thistle rosettes in spring. Repeat annually to deplete root reserves. Glyphosate in stubble provides additional control.', resistance_risk: 'No known resistance to clopyralid in creeping thistle.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'thistles', approach: 'cultural', treatment: 'Repeated cutting or cultivation to exhaust root reserves', active_substance: null, timing: 'Multiple interventions per year for 3+ years', dose_rate: null, efficacy_notes: 'Cut or cultivate before flowering to prevent seed set. Repeated cutting (3-4 times per year) exhausts root reserves over 2-3 years. Fallow year with repeated cultivation is effective but costly.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Docks
  { pest_id: 'docks', approach: 'chemical', treatment: 'Glyphosate spot treatment or clopyralid in cereals', active_substance: 'glyphosate (spot) or clopyralid (in-crop)', timing: 'Stubble period (glyphosate) or spring in cereals (clopyralid)', dose_rate: 'See product label', efficacy_notes: 'Glyphosate spot treatment in stubble is most effective. Clopyralid in cereals provides suppression. Docks require repeated treatment over several years due to tap root reserves.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'docks', approach: 'cultural', treatment: 'Deep ploughing and removal of root fragments', active_substance: null, timing: 'Post-harvest cultivation', dose_rate: null, efficacy_notes: 'Deep ploughing buries root crown below regeneration depth. Manual removal (forking out) effective for small populations. Prevent seed set from flowering plants. Regular management over multiple years required.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Speedwells
  { pest_id: 'speedwells', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'fluroxypyr or mecoprop-P', timing: 'Post-emergence when speedwell actively growing', dose_rate: 'See product label', efficacy_notes: 'Most standard broadleaved herbicide programmes provide adequate speedwell control. Fluroxypyr, mecoprop-P, and ALS inhibitors all effective.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'speedwells', approach: 'cultural', treatment: 'Competitive crop canopy and cultivation', active_substance: null, timing: 'Crop management', dose_rate: null, efficacy_notes: 'Competitive crop canopy suppresses low-growing speedwells. Cultivation destroys existing plants. Short seed bank means populations decline rapidly with good management.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Hemp-Nettle
  { pest_id: 'hemp-nettle', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals or OSR', active_substance: 'mecoprop-P or MCPA', timing: 'Post-emergence spring when hemp-nettle small', dose_rate: 'See product label', efficacy_notes: 'Hormone herbicides (MCPA, mecoprop-P) give good control when applied to small plants. Most broadleaved herbicide mixes include adequate hemp-nettle control.', resistance_risk: 'Low current resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'hemp-nettle', approach: 'cultural', treatment: 'Spring cultivation and crop competition', active_substance: null, timing: 'Pre-drilling', dose_rate: null, efficacy_notes: 'Spring-germinating weed so spring cultivation is effective. Competitive crops and high seed rates suppress growth. Short to moderate seed bank.', resistance_risk: null, approval_status: null, source: 'AHDB' },
];

// ── IPM Guidance ────────────────────────────────────────────────

const IPM_GUIDANCE: IpmGuidance[] = [
  // Winter Wheat x Septoria
  { crop_id: 'winter-wheat', pest_id: 'septoria-tritici', threshold: 'Septoria on upper 3 leaves by GS32; >20% leaf area affected on leaf 3', monitoring_method: 'Regular leaf assessments from GS30. Check rain splash infection risk using AHDB disease risk tool. Monitor rainfall and temperature for infection events.', cultural_controls: 'Resistant varieties (rating 7+), delayed drilling, wider row spacing for air circulation, avoid second wheat', prevention: 'Select varieties with high septoria resistance. Avoid very early drilling in high-risk areas. Break cereal rotation to reduce stubble inoculum.', decision_guide: 'Base T1 decision on variety resistance, autumn/winter rainfall, and leaf infection levels. T2 protects flag leaf — apply regardless in most seasons. Reduce fungicide rate on resistant varieties.', source: 'AHDB' },

  // Winter Wheat x Yellow Rust
  { crop_id: 'winter-wheat', pest_id: 'yellow-rust', threshold: 'First pustules seen on susceptible variety; or predicted by AHDB disease forecasting', monitoring_method: 'Visual inspection of susceptible varieties from GS25 onwards. Check AHDB yellow rust risk alerts. Inspect field hotspots (hedgerow sides, low-lying areas).', cultural_controls: 'Grow varieties with high yellow rust resistance (8+). Destroy volunteer cereals. Monitor AHDB Recommended List for resistance rating changes.', prevention: 'Variety resistance is the most effective tool. New races can overcome resistance — review variety ratings annually. Monitor UKCPVS rust surveys.', decision_guide: 'Apply fungicide at first pustules on susceptible varieties. On resistant varieties, only treat if pustules spreading. Yellow rust responds well to curative azoles if caught early.', source: 'AHDB' },

  // Winter Wheat x Blackgrass
  { crop_id: 'winter-wheat', pest_id: 'blackgrass', threshold: 'Economic threshold depends on resistance status — in resistant populations, even low numbers justify cultural control. AHDB Black-grass tool estimates population change over rotation.', monitoring_method: 'Count blackgrass heads/m2 in June. Map infested patches. Test seed for herbicide resistance. Autumn assessments after pre-em herbicide.', cultural_controls: 'Delayed drilling (late October), spring cropping, ploughing, stale seedbeds, competitive varieties, higher seed rates, rotation with spring break crops', prevention: 'Avoid continuous winter cropping. Rotate with spring crops every 2-3 years on infested fields. Use all available cultural tools — no single method is sufficient for resistant blackgrass.', decision_guide: 'In fields with confirmed herbicide resistance: prioritise cultural control, use robust pre-em stacks, accept some yield loss from delayed drilling rather than relying on herbicides alone. Spring cropping is the strongest single intervention.', source: 'AHDB' },

  // Winter Wheat x Grain Aphid
  { crop_id: 'winter-wheat', pest_id: 'grain-aphid', threshold: 'Average 5 aphids per ear during grain fill (GS61-71). 66% of tillers with at least one aphid.', monitoring_method: 'Walk W pattern through crop. Inspect 20 ears at each of 5 positions. Count aphids per ear. Record natural enemy presence. Use suction trap data for migration timing.', cultural_controls: 'Maintain field margins and beetle banks to support natural enemies (ladybirds, parasitoids, hoverflies). Avoid prophylactic insecticide.', prevention: 'Establish flower-rich margins to support hoverflies and parasitoids. Avoid broad-spectrum insecticide use earlier in season that depletes natural enemy populations. Conservation biocontrol is the primary IPM tool.', decision_guide: 'Only treat when threshold exceeded AND natural enemy ratio unfavourable. If ladybirds/parasitoids are present at >1:50 ratio to aphids, delay treatment — natural control likely within 7-10 days.', source: 'AHDB' },

  // Winter Wheat x Fusarium Ear Blight
  { crop_id: 'winter-wheat', pest_id: 'fusarium-ear-blight', threshold: 'Risk-based: previous crop maize or cereals + rain during flowering = high risk. No in-field threshold — prophylactic T3 based on risk assessment.', monitoring_method: 'Monitor weather at flowering (GS59-65). Check AHDB FEB risk tool. Assess previous crop residue on soil surface. No practical in-field assessment before damage occurs.', cultural_controls: 'Avoid wheat after maize. Plough or chop cereal residues. Choose varieties with moderate FEB resistance. Avoid very early-flowering varieties in high-risk fields.', prevention: 'Rotation is the strongest tool. Residue management (ploughing or chopping) reduces surface inoculum. Variety choice and T3 fungicide reduce DON contamination.', decision_guide: 'Apply T3 azole (prothioconazole) at mid-flowering in high-risk situations (previous maize, rain at flowering, susceptible variety). On low-risk situations (ploughed, resistant variety, dry flowering), T3 may be omitted.', source: 'AHDB' },

  // Winter Barley x Ramularia
  { crop_id: 'winter-barley', pest_id: 'ramularia', threshold: 'No practical threshold — disease often latent until GS49+. Base fungicide decisions on variety susceptibility and regional disease pressure.', monitoring_method: 'Assess upper leaves from GS45 onwards. Ramularia spots appear late. Microscopy may be needed to distinguish from physiological spotting. Use regional disease alerts.', cultural_controls: 'Choose varieties with good ramularia resistance. Use certified seed. Avoid excessive nitrogen.', prevention: 'Variety resistance is the primary tool. Robust T2 fungicide timing (protectant at GS39-45) before symptoms appear.', decision_guide: 'Protect flag leaf and leaf 2 at T2 with SDHI+azole. Post-chlorothalonil withdrawal, multi-site partners (folpet) may add value. Resistant varieties can tolerate reduced fungicide input.', source: 'AHDB' },

  // Winter Barley x Rhynchosporium
  { crop_id: 'winter-barley', pest_id: 'rhynchosporium', threshold: 'Treat at T1 when >25% of leaf 3 affected in wet western areas. Lower threshold on susceptible varieties.', monitoring_method: 'Assess lower leaves from GS25. Check leaf 3 at T1 timing. Most important in western and northern regions with frequent rainfall.', cultural_controls: 'Grow resistant varieties. Avoid barley-after-barley. Use certified seed.', prevention: 'Variety resistance is the cornerstone. Most new malting barley varieties have good resistance ratings.', decision_guide: 'In wet western regions, T1 fungicide on susceptible varieties is routine. In eastern regions or resistant varieties, spray only if disease active. Prothioconazole + multi-site is the standard programme.', source: 'AHDB' },

  // Winter OSR x CSFB
  { crop_id: 'winter-osr', pest_id: 'cabbage-stem-flea-beetle', threshold: 'Adult: >25% cotyledon area lost OR >2 beetles per plant on backward crops. Larval: >5 larvae per plant at petiole assessment in November.', monitoring_method: 'Place yellow water traps in field at crop emergence. Count beetles and assess leaf damage weekly. Petiole dissection in November to assess larval numbers.', cultural_controls: 'Rapid establishment, companion crops (buckwheat, berseem clover), defoliation trap cropping, higher seed rates, optimum drilling date for area', prevention: 'Good seedbed preparation for rapid emergence. Adequate soil moisture for establishment. Consider trap crops and companion plants. Plan for pyrethroid resistance.', decision_guide: 'Treatment decisions are difficult due to pyrethroid resistance. If applying pyrethroid, spray in evening when beetles active. Consider crop sacrifice threshold — is re-drilling more cost-effective than repeated spray applications with declining efficacy?', source: 'AHDB' },

  // Winter OSR x Sclerotinia
  { crop_id: 'winter-osr', pest_id: 'sclerotinia', threshold: 'Risk-based: use AHDB Sclerotinia forecast. Treat if predicted risk >20% AND canopy dense with petal fall in progress.', monitoring_method: 'Use AHDB sclerotinia forecast tool (weather-based). Check for petal accumulation in leaf axils. History of sclerotinia in field increases baseline risk.', cultural_controls: 'Extended rotation (>4 years between susceptible crops). Open canopy management (wider rows, lower seed rate). Avoid very early flowering.', prevention: 'Rotation is the foundation. Sclerotia survive 5-8 years, so long gaps between susceptible crops are needed. AHDB forecast tool guides spray decisions.', decision_guide: 'Only spray at mid-flowering when forecast indicates risk >20%. Single spray at petal fall. Not cost-effective in dry seasons or open canopies. SDHI or strobilurin-based products.', source: 'AHDB' },

  // Winter OSR x Phoma Stem Canker
  { crop_id: 'winter-osr', pest_id: 'phoma-stem-canker', threshold: 'Treat when 10-20% plants have phoma leaf spots in autumn, before systemic stem invasion begins.', monitoring_method: 'Assess 25 plants across the field from October. Count plants with phoma leaf spots. Use AHDB phoma forecast for regional risk. Assess canker severity at harvest for future rotation planning.', cultural_controls: 'Resistant varieties (check Rlm gene rating). Minimum 3-4 year OSR rotation gap. Manage stubble to reduce spore release.', prevention: 'Variety resistance genes (Rlm) and quantitative resistance are the primary tools. Extended rotation gaps reduce inoculum.', decision_guide: 'Spray at 10-20% leaf infection threshold in autumn. On resistant varieties in low-risk areas, spray may be unnecessary. High-risk: susceptible variety, close rotation, near previous OSR stubble, warm wet autumn.', source: 'AHDB' },

  // ── Additional IPM Guidance ────────────────────────────────────

  // Winter Wheat x Take-All
  { crop_id: 'winter-wheat', pest_id: 'take-all', threshold: 'Visual assessment of root blackening at GS30-31 on second and third wheat crops. No formal spray threshold — management is rotation-based.', monitoring_method: 'Pull plants in spring, wash roots, assess degree of root blackening. Score 0-3 scale. Compare first wheat with second wheat. DNA soil tests available to quantify inoculum.', cultural_controls: 'One-year non-cereal break eliminates take-all inoculum. First wheat after break has negligible risk. Silthiofam seed treatment on second wheats.', prevention: 'Crop rotation is the most effective control — any non-cereal break for one year virtually eliminates take-all. First wheats after break rarely suffer damage.', decision_guide: 'Avoid third consecutive wheat. In second wheats, consider silthiofam seed treatment on light soils or fields with known take-all history. Spring-sown crops suffer less as root infection occurs mainly in cool wet conditions.', source: 'AHDB' },

  // Potatoes x Late Blight
  { crop_id: 'potatoes', pest_id: 'late-blight', threshold: 'Risk-based: commence protectant sprays from first Smith Period (2 consecutive days >10C, >90% humidity for 11+ hours). No in-field threshold — prophylactic protection.', monitoring_method: 'Monitor BlightSpy and CRD alerts for Smith Periods. Inspect crop weekly from June. Check volunteer potatoes and waste heaps as inoculum sources. Spore traps available for research/monitoring.', cultural_controls: 'Certified seed, destroy volunteer potatoes, cover waste heaps, early canopy destruction at harvest', prevention: 'Prophylactic fungicide programme is essential from Smith Period. Remove all inoculum sources (volunteers, waste heaps). Variety resistance reduces spray intensity.', decision_guide: 'Begin spray programme at first Smith Period. 7-day intervals in high-risk conditions, extending to 10-14 days in dry weather or on resistant varieties. Alternate modes of action. Include tuber blight protectant. Do not rely on eradicant activity alone.', source: 'AHDB' },

  // Sugar Beet x Cercospora
  { crop_id: 'sugar-beet', pest_id: 'cercospora-leaf-spot', threshold: 'Treat at first confirmed symptoms. No formal UK threshold due to limited experience — follow continental European guidance (1-5 spots per leaf on 5% of plants).', monitoring_method: 'Weekly leaf inspection from July. Focus on lower canopy leaves. Confirm Cercospora vs Ramularia by laboratory testing if uncertain. Regional disease alerts from BBRO.', cultural_controls: 'Extended rotation, destroy beet tops, choose tolerant varieties from BBRO Recommended List', prevention: 'Choose tolerant varieties. Minimum 3-year beet rotation. Destroy beet debris after harvest. Monitor for early symptoms.', decision_guide: 'In confirmed Cercospora areas, apply first fungicide at detection. Repeat at 3-4 week intervals if conditions favour disease. Rotate fungicide modes of action. UK risk currently concentrated in warm southern and eastern areas.', source: 'BBRO' },

  // Winter Beans x Chocolate Spot
  { crop_id: 'winter-beans', pest_id: 'chocolate-spot', threshold: 'Treat at first signs of chocolate spot if conditions favour aggressive phase (warm, humid, dense canopy). Monitor carefully from flowering onwards.', monitoring_method: 'Inspect leaves weekly from early spring. Distinguish non-aggressive phase (discrete spots) from aggressive phase (rapidly expanding spots with grey sporulation). Assess canopy density.', cultural_controls: 'Lower seed rate for open canopy, avoid excessive nitrogen, minimum 4-year bean rotation, spring beans less affected', prevention: 'Open canopy management reduces humidity. Choose varieties with moderate chocolate spot tolerance. Spring beans less exposed than winter beans.', decision_guide: 'Spray at first signs if conditions favour aggressive phase (warm, humid). Protectant application at early flowering is the standard timing. Wet weather during flowering increases disease risk. Consider a second spray if wet conditions persist.', source: 'AHDB' },

  // Spring Peas x Pea Moth
  { crop_id: 'spring-peas', pest_id: 'pea-moth', threshold: 'Pheromone trap: spray when cumulative catch exceeds 5 moths per trap per week during the flowering period (approximately 7-10 days after threshold exceeded to target egg hatch).', monitoring_method: 'Place delta pheromone traps at crop edge from early June. Check traps twice weekly. Record cumulative catch. Relate trap catches to crop flowering stage.', cultural_controls: 'Early sowing to avoid peak moth flight, increase distance from previous pea crops, plough pea stubble', prevention: 'Early sowing of combining peas so flowering finishes before peak moth emergence. Maximise distance from previous pea crop fields. Plough pea stubble to bury overwintering larvae.', decision_guide: 'For vining peas (zero tolerance for damage): spray 7-10 days after trap threshold. For combining peas: assess expected damage level against spray cost. Late-sown peas most at risk. Single well-timed spray normally sufficient.', source: 'AHDB' },

  // Winter Wheat x Barley Yellow Dwarf Virus
  { crop_id: 'winter-wheat', pest_id: 'barley-yellow-dwarf-virus', threshold: 'Spray when aphid vectors (bird cherry-oat aphid, grain aphid) detected on crop in autumn at >2% of plants infested. T-sum model (accumulated day-degrees above 3C from 1 Aug) guides first spray timing.', monitoring_method: 'Walk W pattern through crop from emergence to December. Inspect 20 plants at each of 5 positions. Count plants with aphids. Use Rothamsted Insect Survey suction trap data for migration timing. T-sum model predicts spray need.', cultural_controls: 'Delay drilling until late October, BYDV-tolerant varieties in barley, destroy volunteer cereals, maintain field margins for natural enemies', prevention: 'Delayed drilling (post mid-October) avoids peak aphid migration. BYDV-tolerant barley varieties available. Remove volunteer cereals (green bridge). In wheat, no variety tolerance available — rely on aphid control.', decision_guide: 'Spray when aphids detected on emerging crop in October-November. The T-sum model (170 day-degrees for first spray) helps decide timing. A second spray may be needed 3-4 weeks later if aphid migration continues in mild weather. Prioritise early-drilled fields.', source: 'AHDB' },

  // Winter OSR x Turnip Yellows Virus
  { crop_id: 'winter-osr', pest_id: 'turnip-yellows-virus', threshold: 'No formal threshold — virus incidence is near-universal in most years. Management is primarily through variety resistance rather than aphid spray thresholds.', monitoring_method: 'Monitor peach-potato aphid presence in autumn. AHDB/Rothamsted aphid monitoring data available. Virus testing of plant samples to confirm TuYV. Most fields have >80% infection by spring.', cultural_controls: 'TuYV-resistant varieties (AHDB Recommended List), brassica weed control, delayed drilling slightly', prevention: 'TuYV-resistant varieties are the primary and most effective tool. Destroy brassica weeds and volunteer OSR that serve as virus reservoirs between crops.', decision_guide: 'Prioritise TuYV-resistant varieties over insecticide-based management. Pyrethroid resistance in Myzus persicae makes chemical control unreliable. If spraying, use non-pyrethroid alternatives (pymetrozine, spirotetramat) and target peak aphid immigration.', source: 'AHDB' },

  // Winter OSR x Clubroot
  { crop_id: 'winter-osr', pest_id: 'clubroot', threshold: 'No in-season threshold — prevention-based. Soil testing before OSR confirms clubroot presence. If confirmed, use resistant variety or do not grow OSR.', monitoring_method: 'Soil bait test using susceptible brassica seedlings before planting OSR. Pull plants from suspect patches and inspect roots for clubs. Field mapping of affected areas.', cultural_controls: 'Lime to pH >7.2, resistant varieties, minimum 5-year OSR rotation on infested land, clean machinery', prevention: 'Soil pH management (lime above 7.2). Use clubroot-resistant varieties. Extended rotation (5+ years). Machinery hygiene to prevent spreading infested soil between fields.', decision_guide: 'Do not grow OSR on confirmed clubroot fields unless using a resistant variety AND pH is above 7.0. Resistance breakdown risk means do not rely on a single resistance source repeatedly. Rotate resistant and susceptible varieties across the rotation.', source: 'AHDB' },

  // Potatoes x Potato Cyst Nematode
  { crop_id: 'potatoes', pest_id: 'potato-cyst-nematode', threshold: 'Soil sample before planting: >10 eggs/g soil (G. pallida) or >20 eggs/g (G. rostochiensis) warrants management intervention. Species identification is essential.', monitoring_method: 'Soil sampling (20 cores per ha at 20cm depth) in autumn before intended potato crop. Laboratory extraction and counting. Species identification by PCR or morphology. Map field distribution of populations.', cultural_controls: 'Resistant varieties (check Recommended List for G. rostochiensis Ro1 resistance, partial G. pallida resistance), minimum 5-year potato rotation, biofumigation, trap cropping', prevention: 'Soil testing is the foundation — know your population before planting. Use resistant varieties appropriate to the species present. Extended rotation (5+ years) between potato crops. Consider nematicide in moderate-high infestations.', decision_guide: 'G. rostochiensis: use Ro1-resistant varieties — provides excellent control. G. pallida: use partially resistant varieties + nematicide in high infestations. Below 10 eggs/g: resistant variety alone is adequate. Above 30 eggs/g: consider nematicide + resistant variety. Above 100 eggs/g: avoid potatoes or use extended rotation.', source: 'AHDB' },
];

// ── Approved Products ───────────────────────────────────────────

const APPROVED_PRODUCTS: ApprovedProduct[] = [
  { product_name: 'Aviator 235 Xpro', active_substance: 'prothioconazole + bixafen', target_pests: 'Septoria, rusts, ramularia, net blotch, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2027-12-31', registration_number: 'MAPP 16054', source: 'CRD' },
  { product_name: 'Proline 275', active_substance: 'prothioconazole', target_pests: 'Septoria, eyespot, phoma, sclerotinia, light leaf spot', approved_crops: 'wheat, barley, oilseed rape, beans', approval_expiry: '2027-12-31', registration_number: 'MAPP 14006', source: 'CRD' },
  { product_name: 'Elatus Era', active_substance: 'solatenol (benzovindiflupyr) + prothioconazole', target_pests: 'Septoria, rusts, net blotch, ramularia, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2028-04-30', registration_number: 'MAPP 18299', source: 'CRD' },
  { product_name: 'Revystar XE', active_substance: 'mefentrifluconazole + fluxapyroxad', target_pests: 'Septoria, rusts, ramularia, net blotch', approved_crops: 'wheat, barley', approval_expiry: '2031-01-31', registration_number: 'MAPP 20214', source: 'CRD' },
  { product_name: 'Ascra Xpro', active_substance: 'bixafen + fluopyram + prothioconazole', target_pests: 'Septoria, rusts, eyespot, ramularia', approved_crops: 'wheat, barley', approval_expiry: '2028-07-31', registration_number: 'MAPP 18651', source: 'CRD' },
  { product_name: 'Liberator', active_substance: 'flufenacet + diflufenican', target_pests: 'Blackgrass, annual meadow-grass, ryegrass, broadleaved weeds', approved_crops: 'wheat, barley, oilseed rape', approval_expiry: '2028-06-30', registration_number: 'MAPP 14217', source: 'CRD' },
  { product_name: 'Crystal', active_substance: 'flufenacet + pendimethalin', target_pests: 'Blackgrass, annual meadow-grass, ryegrass', approved_crops: 'wheat, barley', approval_expiry: '2028-06-30', registration_number: 'MAPP 17344', source: 'CRD' },
  { product_name: 'Broadway Star', active_substance: 'pyroxsulam + florasulam', target_pests: 'Blackgrass, ryegrass, broadleaved weeds', approved_crops: 'winter wheat', approval_expiry: '2027-12-31', registration_number: 'MAPP 15777', source: 'CRD' },
  { product_name: 'Stomp Aqua', active_substance: 'pendimethalin', target_pests: 'Blackgrass, annual meadow-grass, broadleaved weeds', approved_crops: 'wheat, barley, peas, beans, oilseed rape', approval_expiry: '2029-01-31', registration_number: 'MAPP 15048', source: 'CRD' },
  { product_name: 'Hallmark with Zeon Technology', active_substance: 'lambda-cyhalothrin', target_pests: 'Aphids, OWBM, flea beetles, pollen beetles', approved_crops: 'wheat, barley, oilseed rape, beans, peas', approval_expiry: '2028-10-31', registration_number: 'MAPP 12814', source: 'CRD' },
  { product_name: 'Sluxx HP', active_substance: 'ferric phosphate', target_pests: 'Slugs (all species)', approved_crops: 'all crops', approval_expiry: '2029-08-31', registration_number: 'MAPP 17714', source: 'CRD' },
  { product_name: 'Pirimor', active_substance: 'pirimicarb', target_pests: 'Aphids (selective — preserves beneficial insects)', approved_crops: 'wheat, barley, oilseed rape, beans, peas, sugar beet', approval_expiry: '2026-12-31', registration_number: 'MAPP 10636', source: 'CRD' },
  { product_name: 'Starane XL', active_substance: 'fluroxypyr + florasulam', target_pests: 'Cleavers, chickweed, poppies, mayweed, broadleaved weeds', approved_crops: 'wheat, barley, oats', approval_expiry: '2027-10-31', registration_number: 'MAPP 13540', source: 'CRD' },
  { product_name: 'Axial Pro', active_substance: 'pinoxaden', target_pests: 'Wild oats, ryegrass, blackgrass (some populations)', approved_crops: 'wheat, barley', approval_expiry: '2028-03-31', registration_number: 'MAPP 16564', source: 'CRD' },
  { product_name: 'Movento', active_substance: 'spirotetramat', target_pests: 'Aphids (systemic, two-directional translocation)', approved_crops: 'oilseed rape, potatoes', approval_expiry: '2028-05-31', registration_number: 'MAPP 15632', source: 'CRD' },
  { product_name: 'Kerb Flo', active_substance: 'propyzamide', target_pests: 'Blackgrass, ryegrass, meadow-grass, annual grasses in OSR', approved_crops: 'oilseed rape, beans', approval_expiry: '2028-12-31', registration_number: 'MAPP 12174', source: 'CRD' },
  { product_name: 'Plenum WG', active_substance: 'pymetrozine', target_pests: 'Pollen beetle (non-pyrethroid alternative), aphids', approved_crops: 'oilseed rape', approval_expiry: '2026-07-31', registration_number: 'MAPP 12403', source: 'CRD' },
  { product_name: 'Latitude', active_substance: 'silthiofam', target_pests: 'Take-all (Gaeumannomyces tritici)', approved_crops: 'wheat (seed treatment)', approval_expiry: '2027-03-31', registration_number: 'MAPP 12141', source: 'CRD' },
  { product_name: 'Phoenix', active_substance: 'folpet', target_pests: 'Septoria (multi-site, anti-resistance), ramularia', approved_crops: 'wheat, barley', approval_expiry: '2028-06-30', registration_number: 'MAPP 18430', source: 'CRD' },
  { product_name: 'Harmony M SX', active_substance: 'metsulfuron-methyl + thifensulfuron-methyl', target_pests: 'Broadleaved weeds including poppies, mayweed, charlock', approved_crops: 'wheat, barley, oats', approval_expiry: '2027-07-31', registration_number: 'MAPP 12549', source: 'CRD' },

  // ── Additional Approved Products ───────────────────────────────

  // Fungicides
  { product_name: 'Siltra Xpro', active_substance: 'bixafen + prothioconazole', target_pests: 'Septoria, rusts, net blotch, ramularia, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2028-07-31', registration_number: 'MAPP 17192', source: 'CRD' },
  { product_name: 'Prosaro', active_substance: 'prothioconazole + tebuconazole', target_pests: 'Septoria, rusts, eyespot, Fusarium ear blight, phoma', approved_crops: 'wheat, barley, oilseed rape', approval_expiry: '2027-12-31', registration_number: 'MAPP 14143', source: 'CRD' },
  { product_name: 'Adexar', active_substance: 'epoxiconazole + fluxapyroxad', target_pests: 'Septoria, rusts, net blotch, rhynchosporium, ramularia', approved_crops: 'wheat, barley', approval_expiry: '2027-06-30', registration_number: 'MAPP 16235', source: 'CRD' },
  { product_name: 'Fandango', active_substance: 'prothioconazole + fluoxastrobin', target_pests: 'Septoria, rusts, eyespot, rhynchosporium, net blotch', approved_crops: 'wheat, barley', approval_expiry: '2028-01-31', registration_number: 'MAPP 15003', source: 'CRD' },
  { product_name: 'Imtrex', active_substance: 'fluxapyroxad', target_pests: 'Septoria, net blotch, ramularia, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2028-04-30', registration_number: 'MAPP 16236', source: 'CRD' },
  { product_name: 'Revystar XL', active_substance: 'mefentrifluconazole + pyraclostrobin', target_pests: 'Septoria, rusts, powdery mildew, net blotch', approved_crops: 'wheat, barley', approval_expiry: '2031-01-31', registration_number: 'MAPP 20388', source: 'CRD' },
  { product_name: 'Proline Gold', active_substance: 'prothioconazole + tebuconazole', target_pests: 'Phoma stem canker, light leaf spot, sclerotinia, Alternaria', approved_crops: 'oilseed rape', approval_expiry: '2027-12-31', registration_number: 'MAPP 17017', source: 'CRD' },
  { product_name: 'Amistar', active_substance: 'azoxystrobin', target_pests: 'Septoria, net blotch, powdery mildew, Alternaria, Cercospora', approved_crops: 'wheat, barley, potatoes, sugar beet', approval_expiry: '2028-03-31', registration_number: 'MAPP 10834', source: 'CRD' },
  { product_name: 'Infinito', active_substance: 'fluopicolide + propamocarb', target_pests: 'Potato late blight, downy mildew', approved_crops: 'potatoes', approval_expiry: '2028-09-30', registration_number: 'MAPP 15364', source: 'CRD' },
  { product_name: 'Revus', active_substance: 'mandipropamid', target_pests: 'Potato late blight (protectant)', approved_crops: 'potatoes', approval_expiry: '2028-07-31', registration_number: 'MAPP 15168', source: 'CRD' },
  { product_name: 'Nativo 75WG', active_substance: 'trifloxystrobin + tebuconazole', target_pests: 'Net blotch, rhynchosporium, powdery mildew, rust, ramularia', approved_crops: 'barley', approval_expiry: '2028-01-31', registration_number: 'MAPP 14779', source: 'CRD' },
  { product_name: 'Signum', active_substance: 'boscalid + pyraclostrobin', target_pests: 'Sclerotinia, chocolate spot, Alternaria, Botrytis', approved_crops: 'beans, peas, oilseed rape', approval_expiry: '2028-06-30', registration_number: 'MAPP 14364', source: 'CRD' },
  { product_name: 'Folicur', active_substance: 'tebuconazole', target_pests: 'Septoria, rusts, phoma, bean rust, chocolate spot', approved_crops: 'wheat, barley, oilseed rape, beans', approval_expiry: '2027-08-31', registration_number: 'MAPP 12318', source: 'CRD' },
  { product_name: 'Ranman Top', active_substance: 'cyazofamid', target_pests: 'Potato late blight (protectant)', approved_crops: 'potatoes', approval_expiry: '2028-12-31', registration_number: 'MAPP 15942', source: 'CRD' },
  { product_name: 'Shirlan', active_substance: 'fluazinam', target_pests: 'Potato late blight (protectant and tuber blight)', approved_crops: 'potatoes', approval_expiry: '2027-06-30', registration_number: 'MAPP 11450', source: 'CRD' },
  { product_name: 'Tern', active_substance: 'fludioxonil + sedaxane', target_pests: 'Seed-borne diseases: Microdochium, Fusarium, smuts, bunt', approved_crops: 'wheat, barley (seed treatment)', approval_expiry: '2028-10-31', registration_number: 'MAPP 17488', source: 'CRD' },
  { product_name: 'Vibrance Duo', active_substance: 'fludioxonil + sedaxane', target_pests: 'Seed-borne Microdochium, smuts, Rhizoctonia', approved_crops: 'wheat, barley (seed treatment)', approval_expiry: '2028-10-31', registration_number: 'MAPP 17489', source: 'CRD' },

  // Herbicides
  { product_name: 'Atlantis Star', active_substance: 'mesosulfuron-methyl + propoxycarbazone-sodium', target_pests: 'Blackgrass, ryegrass, brome grasses', approved_crops: 'winter wheat', approval_expiry: '2027-12-31', registration_number: 'MAPP 19147', source: 'CRD' },
  { product_name: 'Othello', active_substance: 'iodosulfuron + mesosulfuron-methyl + diflufenican', target_pests: 'Blackgrass, ryegrass, broadleaved weeds', approved_crops: 'winter wheat', approval_expiry: '2028-06-30', registration_number: 'MAPP 17082', source: 'CRD' },
  { product_name: 'Firebird', active_substance: 'flufenacet + diflufenican + flurtamone', target_pests: 'Blackgrass, annual meadow-grass, broadleaved weeds', approved_crops: 'wheat, barley', approval_expiry: '2028-03-31', registration_number: 'MAPP 18276', source: 'CRD' },
  { product_name: 'Defy', active_substance: 'prosulfocarb', target_pests: 'Blackgrass, annual meadow-grass, ryegrass', approved_crops: 'wheat, barley', approval_expiry: '2028-12-31', registration_number: 'MAPP 13753', source: 'CRD' },
  { product_name: 'Butisan S', active_substance: 'metazachlor', target_pests: 'Cleavers, chickweed, shepherd\'s purse, volunteer cereals in OSR', approved_crops: 'oilseed rape', approval_expiry: '2027-10-31', registration_number: 'MAPP 11092', source: 'CRD' },
  { product_name: 'Astrokerb', active_substance: 'propyzamide + aminopyralid', target_pests: 'Blackgrass, ryegrass, cleavers, crane\'s-bill in OSR', approved_crops: 'oilseed rape', approval_expiry: '2028-12-31', registration_number: 'MAPP 18509', source: 'CRD' },
  { product_name: 'Roundup ProVantage', active_substance: 'glyphosate', target_pests: 'All weeds — pre-planting, stubble, stale seedbed, desiccation', approved_crops: 'all crops (pre-plant), cereals (desiccation)', approval_expiry: '2027-12-15', registration_number: 'MAPP 17457', source: 'CRD' },
  { product_name: 'Betanal maxxPro', active_substance: 'desmedipham + ethofumesate + lenacil + phenmedipham', target_pests: 'Fat hen, charlock, fumitory, polygonums in sugar beet', approved_crops: 'sugar beet', approval_expiry: '2027-09-30', registration_number: 'MAPP 16045', source: 'CRD' },
  { product_name: 'Centurion Max', active_substance: 'clethodim', target_pests: 'Volunteer cereals, blackgrass, ryegrass in broadleaved crops', approved_crops: 'oilseed rape, beans, peas, sugar beet, potatoes', approval_expiry: '2027-12-31', registration_number: 'MAPP 18033', source: 'CRD' },
  { product_name: 'Callisto', active_substance: 'mesotrione', target_pests: 'Fat hen, annual broadleaved weeds in maize', approved_crops: 'maize', approval_expiry: '2028-06-30', registration_number: 'MAPP 12727', source: 'CRD' },

  // Insecticides
  { product_name: 'Biscaya', active_substance: 'thiacloprid', target_pests: 'Pollen beetle, seed weevil, CSFB', approved_crops: 'oilseed rape (emergency authorisation where applicable)', approval_expiry: '2027-04-30', registration_number: 'MAPP 14774', source: 'CRD' },
  { product_name: 'Decis Forte', active_substance: 'deltamethrin', target_pests: 'Aphids, flea beetles, pollen beetle, weevils', approved_crops: 'wheat, barley, oilseed rape', approval_expiry: '2028-10-31', registration_number: 'MAPP 18683', source: 'CRD' },
  { product_name: 'Steward', active_substance: 'indoxacarb', target_pests: 'Pollen beetle (non-pyrethroid alternative), caterpillars', approved_crops: 'oilseed rape', approval_expiry: '2028-01-31', registration_number: 'MAPP 14569', source: 'CRD' },
  { product_name: 'Teppeki', active_substance: 'flonicamid', target_pests: 'Aphids (selective — safe to beneficials)', approved_crops: 'wheat, barley, potatoes, oilseed rape', approval_expiry: '2028-06-30', registration_number: 'MAPP 16033', source: 'CRD' },
  { product_name: 'Insyst', active_substance: 'acetamiprid', target_pests: 'Aphids, whitefly, pollen beetle', approved_crops: 'oilseed rape, potatoes', approval_expiry: '2028-08-31', registration_number: 'MAPP 15891', source: 'CRD' },

  // Nematicides and molluscicides
  { product_name: 'Nemathorin 10G', active_substance: 'fosthiazate', target_pests: 'Potato cyst nematode, free-living nematodes', approved_crops: 'potatoes', approval_expiry: '2027-12-31', registration_number: 'MAPP 11815', source: 'CRD' },
  { product_name: 'Ironmax Pro', active_substance: 'ferric phosphate', target_pests: 'Slugs (all species)', approved_crops: 'all crops', approval_expiry: '2029-06-30', registration_number: 'MAPP 19522', source: 'CRD' },
];

// ── Ingestion ───────────────────────────────────────────────────

function ingest(db: Database): void {
  const now = new Date().toISOString().split('T')[0];

  // Clear existing data
  console.log('Clearing existing data...');
  db.run('DELETE FROM search_index');
  db.run('DELETE FROM ipm_guidance');
  db.run('DELETE FROM treatments');
  db.run('DELETE FROM symptoms');
  db.run('DELETE FROM approved_products');
  db.run('DELETE FROM pests');

  // Insert pests
  console.log('Inserting pests...');
  for (const p of ALL_PESTS) {
    db.run(
      `INSERT INTO pests (id, name, common_names, pest_type, description, lifecycle, identification, crops_affected, risk_factors, economic_impact, images_description, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [p.id, p.name, JSON.stringify(p.common_names), p.pest_type, p.description, p.lifecycle, p.identification, JSON.stringify(p.crops_affected), p.risk_factors, p.economic_impact, p.images_description]
    );
  }
  console.log(`  ${ALL_PESTS.length} pests inserted (${DISEASES.length} diseases, ${INSECT_PESTS.length} insect pests, ${WEEDS.length} weeds).`);

  // Insert symptoms
  console.log('Inserting symptoms...');
  for (const s of SYMPTOMS) {
    db.run(
      `INSERT INTO symptoms (pest_id, symptom, plant_part, timing, confidence)
       VALUES (?, ?, ?, ?, ?)`,
      [s.pest_id, s.symptom, s.plant_part, s.timing, s.confidence]
    );
  }
  console.log(`  ${SYMPTOMS.length} symptoms inserted.`);

  // Insert treatments
  console.log('Inserting treatments...');
  for (const t of TREATMENTS) {
    db.run(
      `INSERT INTO treatments (pest_id, approach, treatment, active_substance, timing, dose_rate, efficacy_notes, resistance_risk, approval_status, source, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [t.pest_id, t.approach, t.treatment, t.active_substance, t.timing, t.dose_rate, t.efficacy_notes, t.resistance_risk, t.approval_status, t.source]
    );
  }
  console.log(`  ${TREATMENTS.length} treatments inserted.`);

  // Insert IPM guidance
  console.log('Inserting IPM guidance...');
  for (const g of IPM_GUIDANCE) {
    db.run(
      `INSERT INTO ipm_guidance (crop_id, pest_id, threshold, monitoring_method, cultural_controls, prevention, decision_guide, source, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [g.crop_id, g.pest_id, g.threshold, g.monitoring_method, g.cultural_controls, g.prevention, g.decision_guide, g.source]
    );
  }
  console.log(`  ${IPM_GUIDANCE.length} IPM guidance records inserted.`);

  // Insert approved products
  console.log('Inserting approved products...');
  for (const ap of APPROVED_PRODUCTS) {
    db.run(
      `INSERT INTO approved_products (product_name, active_substance, target_pests, approved_crops, approval_expiry, registration_number, source, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [ap.product_name, ap.active_substance, ap.target_pests, ap.approved_crops, ap.approval_expiry, ap.registration_number, ap.source]
    );
  }
  console.log(`  ${APPROVED_PRODUCTS.length} approved products inserted.`);

  // Build FTS5 search index
  console.log('Building FTS5 search index...');
  for (const p of ALL_PESTS) {
    db.run(
      `INSERT INTO search_index (name, common_names, description, identification, pest_type, jurisdiction)
       VALUES (?, ?, ?, ?, ?, 'GB')`,
      [p.name, p.common_names.join(', '), p.description, p.identification, p.pest_type]
    );
  }

  // Also index symptoms for richer search
  for (const s of SYMPTOMS) {
    const pest = ALL_PESTS.find(p => p.id === s.pest_id);
    if (!pest) continue;
    db.run(
      `INSERT INTO search_index (name, common_names, description, identification, pest_type, jurisdiction)
       VALUES (?, ?, ?, ?, ?, 'GB')`,
      [
        pest.name,
        pest.common_names.join(', '),
        `${s.symptom}. ${pest.description}`,
        `${s.plant_part}: ${s.symptom} (${s.confidence} confidence)`,
        pest.pest_type,
      ]
    );
  }

  const totalFts = ALL_PESTS.length + SYMPTOMS.length;
  console.log(`  ${totalFts} FTS5 entries created.`);

  // Update db_metadata
  console.log('Updating db_metadata...');
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('pest_count', ?)", [String(ALL_PESTS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('disease_count', ?)", [String(DISEASES.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('insect_pest_count', ?)", [String(INSECT_PESTS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('weed_count', ?)", [String(WEEDS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('symptom_count', ?)", [String(SYMPTOMS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('treatment_count', ?)", [String(TREATMENTS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('ipm_guidance_count', ?)", [String(IPM_GUIDANCE.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('approved_product_count', ?)", [String(APPROVED_PRODUCTS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('fts_entry_count', ?)", [String(totalFts)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('source', 'AHDB Knowledge Library, HSE CRD Pesticide Register, AHDB IPM Guidance')", []);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('data_version', '2.0.0')", []);

  // Write coverage.json
  const coverage = {
    mcp_name: 'Pest Management MCP',
    jurisdiction: 'GB',
    build_date: now,
    pests: {
      total: ALL_PESTS.length,
      diseases: DISEASES.length,
      insect_pests: INSECT_PESTS.length,
      weeds: WEEDS.length,
    },
    symptoms: SYMPTOMS.length,
    treatments: TREATMENTS.length,
    ipm_guidance: IPM_GUIDANCE.length,
    approved_products: APPROVED_PRODUCTS.length,
    fts_entries: totalFts,
    source_hash: createHash('sha256')
      .update(JSON.stringify({ ALL_PESTS, SYMPTOMS, TREATMENTS, IPM_GUIDANCE, APPROVED_PRODUCTS }))
      .digest('hex')
      .slice(0, 16),
  };
  writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
  console.log('Wrote data/coverage.json');

  // Summary
  console.log('\nIngestion complete.');
  console.log(`  Pests: ${ALL_PESTS.length} (${DISEASES.length} diseases, ${INSECT_PESTS.length} insect pests, ${WEEDS.length} weeds)`);
  console.log(`  Symptoms: ${SYMPTOMS.length}`);
  console.log(`  Treatments: ${TREATMENTS.length}`);
  console.log(`  IPM guidance: ${IPM_GUIDANCE.length}`);
  console.log(`  Approved products: ${APPROVED_PRODUCTS.length}`);
  console.log(`  FTS5 entries: ${totalFts}`);
}

// ── Main ────────────────────────────────────────────────────────

mkdirSync('data', { recursive: true });

// Remove existing database to start fresh
const { existsSync, unlinkSync } = await import('fs');
const dbPath = 'data/database.db';
if (existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log('Removed existing database.');
}

const db = createDatabase(dbPath);
ingest(db);
db.close();
