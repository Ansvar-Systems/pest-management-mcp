/**
 * UK Pest Management MCP — Data Ingestion Script
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
  // ── Grassland Diseases ─────────────────────────────────────────
  {
    id: 'ryegrass-crown-rust',
    name: 'Crown Rust of Ryegrass',
    common_names: ['Crown rust', 'Puccinia coronata'],
    pest_type: 'disease',
    description: 'Foliar rust disease caused by Puccinia coronata f. sp. lolii. Produces orange pustules on perennial and Italian ryegrass leaves. The most common disease of ryegrass swards in the UK, reducing forage quality and palatability.',
    lifecycle: 'Pustules produce urediniospores that spread by wind. Favoured by warm, humid weather in late summer and autumn. Alternate host is buckthorn (Rhamnus spp.) for the sexual cycle, but the asexual cycle on grass is most important in the UK.',
    identification: 'Bright orange uredinia (pustules) scattered across the leaf surface and sheaths. Pustules surrounded by a torn leaf epidermis. Crown-shaped teliospores (diagnostic under microscope) develop late in season. Heavy infections cause leaves to yellow and die.',
    crops_affected: ['ryegrass', 'perennial ryegrass', 'Italian ryegrass', 'grassland'],
    risk_factors: 'Warm humid late summer and autumn, susceptible ryegrass varieties, dense swards, nitrogen-rich growth, delayed cutting or grazing',
    economic_impact: 'Reduces dry matter yield by 5-15% in affected swards. Lowers palatability and digestibility of forage. Most damaging in seed crops and newly established leys. Resistant varieties available on the BSPB Recommended Grass and Clover List.',
    images_description: 'Bright orange rust pustules scattered across ryegrass leaf blades',
  },
  {
    id: 'timothy-leaf-streak',
    name: 'Leaf Streak of Timothy',
    common_names: ['Timothy leaf streak', 'Drechslera phlei'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Drechslera phlei affecting timothy grass. Produces dark brown elongated streaks on leaves, reducing photosynthetic area and forage quality. Most common in cool, wet conditions typical of northern and western UK.',
    lifecycle: 'Conidia produced on infected leaf tissue spread by rain splash and wind. Survives on infected plant debris between seasons. Most active in cool, wet weather (10-20C). Seed-borne infection also possible.',
    identification: 'Dark brown to black elongated streaks running parallel to leaf veins. Lesions may coalesce, causing extensive leaf browning. Older lesions may have a lighter grey centre. Distinguished from other grass leaf diseases by host specificity.',
    crops_affected: ['timothy', 'grassland'],
    risk_factors: 'Cool wet conditions, dense swards, northern and western regions, prolonged leaf wetness, susceptible varieties',
    economic_impact: 'Yield losses of 5-15% in seed crops and intensively managed swards. Reduces forage digestibility. Managed primarily through variety choice and cutting regime.',
    images_description: 'Dark brown elongated streaks running parallel to veins on timothy grass leaves',
  },

  // ── Horticultural Diseases ──────────────────────────────────────
  {
    id: 'lettuce-downy-mildew',
    name: 'Lettuce Downy Mildew',
    common_names: ['Bremia lactucae'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Bremia lactucae. Produces angular yellow patches on lettuce leaves with white sporulation on the underside. Extremely variable — new races constantly overcome resistance genes. The most important disease of UK lettuce production.',
    lifecycle: 'Sporangia produced on infected tissue under cool, humid conditions (5-20C). Spread by wind and rain splash. Oospores survive in soil and crop debris. Rapid disease cycles possible — 5-7 days from infection to sporulation in favourable conditions.',
    identification: 'Angular yellow patches on upper leaf surface, delimited by veins. White downy sporulation on corresponding lower surface. Older lesions turn brown and papery. Inner leaves may show systemic infection in severe cases.',
    crops_affected: ['lettuce', 'endive'],
    risk_factors: 'Cool humid conditions, high density plantings, protected cropping with poor ventilation, new virulent races overcoming resistance genes, spring and autumn production',
    economic_impact: 'Can cause complete crop rejection if outer wrapper leaves are infected. New Bremia races appear frequently, overcoming Dm resistance genes. UK lettuce industry spends significantly on monitoring and breeding for resistance.',
    images_description: 'Angular yellow patches on lettuce leaf with white sporulation on underside',
  },
  {
    id: 'white-rot-onion',
    name: 'White Rot of Onion',
    common_names: ['Allium white rot', 'Stromatinia cepivora', 'Sclerotium cepivorum'],
    pest_type: 'disease',
    description: 'Devastating soil-borne disease caused by Stromatinia cepivora affecting all Allium crops. Produces fluffy white mycelium at the bulb base with tiny black sclerotia. Sclerotia persist in soil for 15-20 years, making infested fields permanently unsuitable for Allium crops.',
    lifecycle: 'Sclerotia in soil stimulated to germinate by sulphur-containing compounds released by Allium root exudates. Mycelium infects roots and bulb base. White fluffy growth colonises the bulb, producing masses of sclerotia (0.2-0.5mm) that return to soil at harvest.',
    identification: 'Yellowing and wilting of foliage, starting from leaf tips downward. White fluffy mycelium at bulb base when plants are pulled. Tiny black sclerotia (poppy seed-sized) embedded in the mycelium. Roots destroyed. Affected plants easily pulled from soil.',
    crops_affected: ['onions', 'garlic', 'leeks', 'shallots'],
    risk_factors: 'Previously infested soil, short Allium rotation, cool soil temperatures (10-20C), contaminated soil on equipment, high soil moisture',
    economic_impact: 'Yield losses of 10-100% in infested fields. No effective chemical control once established in soil. Can make fields permanently unsuitable for onions. One of the most feared soil-borne diseases in vegetable production.',
    images_description: 'White fluffy mycelium with tiny black sclerotia at base of yellowed onion plant',
  },
  {
    id: 'brassica-ring-spot',
    name: 'Ring Spot',
    common_names: ['Mycosphaerella brassicicola'],
    pest_type: 'disease',
    description: 'Foliar disease caused by Mycosphaerella brassicicola affecting brassica vegetables. Produces distinctive round grey-brown spots with concentric rings on outer leaves. Most damaging on Brussels sprouts and other overwintering brassicas in the UK.',
    lifecycle: 'Ascospores released from pseudothecia on old brassica debris in autumn. Rain-splashed to new crops. Infection occurs through stomata in wet conditions. Most active at 12-18C. Disease progresses slowly through autumn and winter.',
    identification: 'Round grey-brown spots (5-15mm) with concentric rings of darker tissue giving a target-board appearance. Spots may coalesce, causing large areas of dead tissue on outer wrapper leaves. Black pseudothecia may be visible within old lesions.',
    crops_affected: ['Brussels sprouts', 'cabbage', 'cauliflower', 'broccoli'],
    risk_factors: 'Overwintering brassica crops, wet autumn and winter, proximity to old brassica debris, susceptible varieties, cool temperatures 12-18C',
    economic_impact: 'Outer leaf damage in Brussels sprouts can require excessive trimming, increasing harvest costs and reducing marketable yield by 5-20%. Important quality disease in UK brassica production.',
    images_description: 'Round grey-brown spots with concentric rings on Brussels sprout outer leaves',
  },
  {
    id: 'white-blister',
    name: 'White Blister',
    common_names: ['White rust', 'Albugo candida'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Albugo candida affecting brassica crops. Produces white raised blisters (pustules) on leaf undersurfaces that burst to release chalky-white spores. Can cause distortion of stems and flower parts (stagheads).',
    lifecycle: 'Zoospores released from pustules in wet conditions. Spread by rain splash. Oospores survive in soil and debris for several years. Systemic infection causes stem and flower distortion. Favoured by cool, wet conditions.',
    identification: 'White raised pustules (blisters) on leaf undersurface, appearing as white patches on upper surface. Pustules burst to release chalky-white spore mass. Systemic infection causes distorted thickened stems and flower parts (stagheads).',
    crops_affected: ['Brussels sprouts', 'cabbage', 'cauliflower', 'broccoli', 'oilseed rape'],
    risk_factors: 'Cool wet conditions, dense brassica plantings, proximity to infected brassica debris or weeds, susceptible varieties',
    economic_impact: 'Foliar infection mainly cosmetic but reduces quality. Systemic staghead infection causes total loss of affected plants. Localised outbreaks can be severe. Managed through rotation and variety resistance.',
    images_description: 'White raised blisters on brassica leaf underside with chalky-white spore mass',
  },
  {
    id: 'botrytis-grey-mould',
    name: 'Grey Mould',
    common_names: ['Botrytis cinerea', 'Grey mould'],
    pest_type: 'disease',
    description: 'Ubiquitous fungal disease caused by Botrytis cinerea. Attacks a wide range of crops, producing grey fuzzy mould on infected tissue. Enters through wounds, senescing tissue, and flower parts. Important in both field and stored produce.',
    lifecycle: 'Conidia produced on grey sporulating mould, wind-dispersed. Sclerotia survive in soil and debris for years. Enters through wounds, dead tissue, or senescing flowers. Grows rapidly in cool, humid conditions (15-20C). Can spread in storage.',
    identification: 'Grey fuzzy mould (sporulating mycelium) on infected tissue. Soft watery rot beneath. Can affect any above-ground plant part. On fruit, produces typical grey fluffy mould. On lettuce, causes stem rot from dead lower leaves. Hard black sclerotia may form.',
    crops_affected: ['strawberries', 'raspberries', 'lettuce', 'beans', 'peas', 'tomatoes', 'grapes'],
    risk_factors: 'High humidity, poor air circulation, dense canopy, wounds, senescing tissue, cool temperatures 15-20C, rain during flowering and fruit ripening',
    economic_impact: 'Major cause of post-harvest losses in soft fruit, lettuce, and stored produce. Pre-harvest infection of strawberries can cause 20-50% loss in wet seasons. Resistance to many fungicide groups is widespread in UK Botrytis populations.',
    images_description: 'Grey fuzzy mould growing on strawberry fruit and lettuce stem base',
  },

  // ── Fruit Diseases ──────────────────────────────────────────────
  {
    id: 'apple-scab',
    name: 'Apple Scab',
    common_names: ['Venturia inaequalis'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Venturia inaequalis. The most important disease of apples in the UK. Produces olive-brown scabby lesions on leaves and fruit, causing fruit cracking and quality rejection. Primary infection from overwintered pseudothecia on leaf litter.',
    lifecycle: 'Ascospores released from pseudothecia in leaf litter from March to June during rain events. Primary infection establishes on young leaves and fruit. Conidia from primary lesions cause secondary infections throughout summer. Pseudothecia form on fallen leaves in autumn.',
    identification: 'Olive-brown to black velvety lesions on leaves, typically starting on upper surface. On fruit, dark scabby patches that may crack as fruit expands. Severe infections cause leaf curling, premature defoliation, and fruit cracking.',
    crops_affected: ['apples', 'crab apples'],
    risk_factors: 'Frequent rainfall during April-June, heavy inoculum from leaf litter, susceptible varieties, dense orchards with poor air circulation, mild wet spring',
    economic_impact: 'Scabbed fruit rejected by supermarkets and fresh market. Untreated orchards can have 50-80% fruit affected. UK apple growers apply 8-15 fungicide sprays per season. Costs GBP 500-1000 per hectare in fungicide alone.',
    images_description: 'Olive-brown velvety scab lesions on apple fruit surface and leaves',
  },
  {
    id: 'fire-blight',
    name: 'Fire Blight',
    common_names: ['Erwinia amylovora'],
    pest_type: 'disease',
    description: 'Devastating bacterial disease caused by Erwinia amylovora affecting pome fruit trees. Causes rapid wilting and blackening of blossoms, shoots, and branches as if scorched by fire. A notifiable disease in the UK with statutory controls.',
    lifecycle: 'Bacteria overwinter in cankers on branches. Ooze produced in spring is spread by rain, insects, and contaminated tools to open blossoms. Enters through nectaries and wounds. Rapid spread during warm wet weather (>18C with rain).',
    identification: 'Blossoms wilt and turn brown-black. Shoots wilt from tip, curving into a characteristic shepherds crook shape. Bacterial ooze (milky droplets) may appear on infected tissue. Bark on cankers turns dark and sunken. Affected tissue looks fire-scorched.',
    crops_affected: ['apples', 'pears', 'hawthorn', 'cotoneaster', 'pyracantha'],
    risk_factors: 'Warm wet weather during blossoming (>18C), hail damage creating wounds, vigorous growth from excessive nitrogen, contaminated pruning tools, proximity to infected hawthorn hedges',
    economic_impact: 'Can destroy entire orchards if not controlled. Notifiable disease under UK Plant Health legislation. Statutory eradication measures may require tree removal. Economic impact varies from localised branch loss to total orchard destruction.',
    images_description: 'Blackened fire-scorched appearance of apple blossoms and shepherds crook wilted shoot tips',
  },
  {
    id: 'brown-rot',
    name: 'Brown Rot',
    common_names: ['Monilinia fructigena', 'Monilinia laxa'],
    pest_type: 'disease',
    description: 'Fruit rot disease caused by Monilinia fructigena (primarily on apples and pears) and M. laxa (on stone fruit). Produces expanding brown rot with concentric rings of buff-coloured sporulation on fruit. Major cause of pre- and post-harvest fruit losses in the UK.',
    lifecycle: 'Conidia produced on mummified fruit remaining in tree or on ground. Spread by wind, rain, and insects. Enters through wounds (bird pecking, insect damage, cracking). Infected fruit mummify and persist as inoculum source. Can spread rapidly in storage.',
    identification: 'Expanding brown soft rot on fruit, typically starting from a wound. Concentric rings of buff or grey-brown spore cushions (sporodochia) develop on rotting surface. Fruit eventually mummifies to a hard black shrivelled form that persists on the tree.',
    crops_affected: ['apples', 'pears', 'plums', 'cherries'],
    risk_factors: 'Wounds from bird damage, codling moth, wasp damage, cracking; wet weather near harvest; fruit left on tree after maturity; mummified fruit not removed',
    economic_impact: 'Pre-harvest losses of 5-20% of fruit. Post-harvest storage losses can be higher if infected fruit enters store. Mummified fruit in tree provides persistent inoculum. Reduce by wound prevention, hygiene, and storage management.',
    images_description: 'Expanding brown rot with concentric rings of buff-coloured spore cushions on apple',
  },
  {
    id: 'canker',
    name: 'Apple and Pear Canker',
    common_names: ['Neonectria ditissima', 'European canker'],
    pest_type: 'disease',
    description: 'Bark disease caused by Neonectria ditissima. Produces sunken, cracked cankers on branches and trunk of apple and pear trees. Cankers girdle and kill branches. Also causes eye rot of fruit at harvest. The most damaging bark disease of UK apple orchards.',
    lifecycle: 'Ascospores and conidia released from canker margins year-round but peaks in autumn (October-November) during leaf fall wound period. Enters through leaf scars, pruning cuts, wounds, and fruit scars. Cankers expand, potentially girdling branches.',
    identification: 'Sunken, cracked bark that flakes away in concentric rings around the infection point. Exposed wood may be red-brown. White or red sporodochia on canker margins. Branch dieback above girdling canker. Eye rot of fruit appears as a brown rot at the calyx end.',
    crops_affected: ['apples', 'pears'],
    risk_factors: 'Wet sites with heavy rainfall, poor drainage, susceptible varieties (e.g. Cox, Gala), pruning during wet weather, woolly aphid damage creating wounds, waterlogged or poorly structured soils',
    economic_impact: 'Cumulative branch loss reduces tree productivity. Severe canker can kill young trees. Eye rot causes fruit rejection at harvest and in storage. One of the most persistent and damaging diseases in wet UK apple-growing regions.',
    images_description: 'Sunken cracked bark canker with concentric rings on apple branch and red sporodochia',
  },
  {
    id: 'vine-downy-mildew',
    name: 'Vine Downy Mildew',
    common_names: ['Plasmopara viticola'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Plasmopara viticola. Produces yellow oily spots on vine leaf upper surface with white downy sporulation beneath. Increasing in importance in UK viticulture as the industry expands. Can cause complete crop loss if uncontrolled.',
    lifecycle: 'Oospores in fallen leaf litter germinate in spring when soil temperature exceeds 10C and rainfall occurs. Zoospores splash to lower leaves. Secondary cycles from sporangia during warm wet weather (>10C with 10mm rain). Rapid disease development in summer.',
    identification: 'Yellow oily spots (oil spots) on upper leaf surface. White downy sporulation on corresponding lower surface in humid conditions. Infected berries turn grey-brown (leather berries). Shoots and tendrils may also be infected.',
    crops_affected: ['grapevines', 'wine grapes'],
    risk_factors: 'Warm wet weather (>10C with rain), expanding UK viticulture industry, susceptible Vitis vinifera cultivars, spring rainfall triggering primary infection, poor canopy management',
    economic_impact: 'Can destroy 50-100% of crop if uncontrolled. UK vineyards require 5-10 fungicide applications per season. Increasing importance as English and Welsh wine industry expands to 4000+ hectares.',
    images_description: 'Yellow oily spots on vine leaf upper surface with white downy sporulation beneath',
  },

  // ── Soil-Borne Diseases ─────────────────────────────────────────
  {
    id: 'pythium',
    name: 'Damping Off',
    common_names: ['Pythium spp.', 'Damping off'],
    pest_type: 'disease',
    description: 'Seedling disease caused primarily by Pythium spp. (and Rhizoctonia, Fusarium). Attacks germinating seeds and young seedlings, causing pre- and post-emergence damping off. Ubiquitous soil-borne pathogen affecting a wide range of crops.',
    lifecycle: 'Oospores survive in soil indefinitely. Zoospores released in wet conditions swim to host roots. Infects through root tips and hypocotyl. Rapid tissue destruction in cold, wet, poorly drained soils. Multiple species with different host preferences.',
    identification: 'Pre-emergence: seeds rot in soil, no seedling appears. Post-emergence: seedlings collapse at soil level, stem becomes water-soaked and constricted (wire-stem). Affected seedlings topple over. White mycelium may be visible on soil surface in humid conditions.',
    crops_affected: ['sugar beet', 'peas', 'beans', 'lettuce', 'brassicas', 'cereals'],
    risk_factors: 'Cold wet soils, waterlogging, deep drilling, compacted soils, poor drainage, low soil temperature at germination, untreated seed, high organic matter soils',
    economic_impact: 'Losses typically 5-20% plant stand reduction. Worst in cold wet springs causing slow germination. Seed treatments provide early protection. Most important in sugar beet, vegetables, and spring-sown crops on heavy soils.',
    images_description: 'Collapsed seedlings with water-soaked constriction at soil level',
  },
  {
    id: 'rhizoctonia',
    name: 'Rhizoctonia Root Rot',
    common_names: ['Rhizoctonia solani', 'Bottom rot'],
    pest_type: 'disease',
    description: 'Soil-borne disease caused by Rhizoctonia solani, a highly variable fungus with many anastomosis groups (AGs) affecting different crops. Causes damping off, root rot, stem canker, and storage rots. Major pathogen of potatoes, sugar beet, and lettuce.',
    lifecycle: 'Survives as sclerotia and mycelium in soil and on crop debris. Infects through direct contact with roots and stems at soil level. Does not produce airborne spores. Spread by soil movement, infected plant material, and growing mycelium through soil.',
    identification: 'Varies by crop: on potatoes, black scurf (sclerotia on tuber surface) and stem canker; on sugar beet, crown and root rot; on lettuce, bottom rot (brown rotting of lower leaves at soil contact). Brown web-like mycelium may be visible at soil surface.',
    crops_affected: ['potatoes', 'sugar beet', 'lettuce', 'brassicas', 'cereals', 'beans'],
    risk_factors: 'Soil compaction, poor drainage, cool wet conditions, crop debris, short rotations, deep or shallow planting, susceptible varieties',
    economic_impact: 'Highly variable depending on crop. In potatoes, black scurf affects 10-30% of tubers (quality rejection). In sugar beet, crown rot reduces yield by 5-15%. In lettuce, bottom rot causes 5-20% losses in wet conditions.',
    images_description: 'Black sclerotia on potato tuber surface and brown bottom rot on lettuce',
  },
  {
    id: 'fusarium-wilt',
    name: 'Fusarium Wilt',
    common_names: ['Fusarium oxysporum'],
    pest_type: 'disease',
    description: 'Vascular wilt disease caused by Fusarium oxysporum (various formae speciales). Enters through roots, colonises vascular tissue, blocking water transport. Produces yellowing, wilting, and death, typically one side of the plant first. Host-specific forms affect different crops.',
    lifecycle: 'Chlamydospores persist in soil for 10+ years. Root exudates stimulate germination. Fungus enters through root tips and wounds, colonises xylem vessels. Toxins and physical blockage cause wilting. New chlamydospores produced in decaying host tissue.',
    identification: 'Progressive wilting starting from lower or one side of plant. Yellowing follows vein pattern. Cross-section of stem shows brown discolouration of vascular bundles (ring of brown dots). Plants may appear drought-stressed despite adequate moisture. Wilting irreversible.',
    crops_affected: ['tomatoes', 'lettuce', 'peas', 'beans', 'brassicas', 'onions'],
    risk_factors: 'Warm soil temperatures (>20C), acidic soils, short rotations with susceptible crops, contaminated soil or transplants, poor drainage',
    economic_impact: 'Yield losses of 10-50% in affected crops. Soil persistence of 10+ years makes affected fields a long-term problem. Resistant varieties and soil-less growing systems are the main management approaches for high-value crops.',
    images_description: 'One-sided wilting with brown vascular discolouration visible in stem cross-section',
  },
  {
    id: 'verticillium-wilt',
    name: 'Verticillium Wilt',
    common_names: ['Verticillium dahliae', 'Verticillium wilt'],
    pest_type: 'disease',
    description: 'Vascular wilt disease caused by Verticillium dahliae. Produces microsclerotia that persist in soil for 10-15 years. Wide host range including strawberries, potatoes, oilseed rape, and many vegetable and ornamental crops. Causes one-sided wilting and yield loss.',
    lifecycle: 'Microsclerotia in soil germinate when stimulated by root exudates. Hyphae penetrate roots, colonise xylem vessels, and spread upward. Microsclerotia form in dying tissue, returning to soil at harvest. One infection cycle per season.',
    identification: 'Yellowing and wilting of lower leaves, often one-sided. Leaf margins may curl upward. Stem cross-section shows brown discolouration of vascular tissue. Plants stunted with reduced fruit/seed. Symptoms worsen in warm weather.',
    crops_affected: ['strawberries', 'potatoes', 'oilseed rape', 'lettuce', 'tomatoes', 'hops'],
    risk_factors: 'Short rotations with susceptible crops, high soil inoculum, warm soil temperatures, weed hosts maintaining inoculum, contaminated transplants',
    economic_impact: 'Major problem in UK strawberry production, causing 10-30% yield loss. Long soil persistence makes it a permanent field problem. Soil fumigation, resistant varieties, and substrate growing are the main management tools.',
    images_description: 'One-sided leaf yellowing and wilting on strawberry plant with brown vascular tissue',
  },

  // ── Strawberry Disease ──────────────────────────────────────────
  {
    id: 'strawberry-grey-mould',
    name: 'Strawberry Grey Mould',
    common_names: ['Strawberry Botrytis', 'Botrytis cinerea on strawberry'],
    pest_type: 'disease',
    description: 'Grey mould of strawberry caused by Botrytis cinerea. The most damaging disease of UK strawberry production. Infects flowers and developing fruit, causing soft brown rot covered in grey fuzzy mould. Losses worst in wet weather during flowering and fruiting.',
    lifecycle: 'Conidia produced on overwintering plant debris and dead leaves within the row. Infects open flowers through stigma and petals. Latent infection develops as fruit ripens. Grey sporulation appears on ripe and overripe fruit. Rapid spread in humid polytunnel conditions.',
    identification: 'Soft brown rot on fruit, rapidly covered with grey fuzzy mould (sporulating mycelium). Green fruit may have firm dry brown patches (latent infection). Flower petals brown and wilt. Hard black sclerotia may form on mummified fruit.',
    crops_affected: ['strawberries'],
    risk_factors: 'Wet weather during flowering, high humidity in polytunnels, poor air circulation, dense planting, fruit contact with soil or mulch, overripe fruit left unharvested',
    economic_impact: 'Pre-harvest losses of 10-40% in wet seasons. Post-harvest losses during marketing and retail add further. UK strawberry growers spend significantly on Botrytis fungicide programmes. Fungicide resistance is a growing concern.',
    images_description: 'Strawberry fruit with expanding brown rot covered in grey fuzzy Botrytis mould',
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
  // ── Grassland Pests ──────────────────────────────────────────────
  {
    id: 'frit-fly',
    name: 'Frit Fly',
    common_names: ['Oscinella frit'],
    pest_type: 'pest',
    description: 'Small fly (Oscinella frit) whose larvae bore into grass tillers, causing yellowing and death of the central shoot (deadheart). Three generations per year. First generation attacks spring cereals and grass; third generation attacks autumn-sown crops and newly reseeded grass.',
    lifecycle: 'Adults lay eggs at the base of grass and cereal plants. Larvae bore into tillers, feeding on growing point. Three generations: spring (April-May), summer (July), and autumn (September-October). Overwinters as larvae inside grass tillers.',
    identification: 'Adults: tiny (2-3mm) shiny black flies. Larvae: white legless maggots (4mm) inside tiller base. Damage: deadheart in central shoot (pulls out easily), yellowing of individual tillers, patchy thinning of reseeded swards.',
    crops_affected: ['ryegrass', 'grassland', 'oats', 'spring oats', 'maize'],
    risk_factors: 'Newly reseeded grassland, early autumn reseeding coinciding with third generation, grass-to-grass reseeding, oat crops, warm summers producing large third-generation populations',
    economic_impact: 'Yield losses of 5-20% in newly reseeded swards. Most damaging to autumn-sown grass establishing from September. Can thin out new leys, requiring overseeding. Oat crops occasionally affected by first generation.',
    images_description: 'Tiny shiny black fly and deadheart tillers in newly reseeded grassland',
  },
  {
    id: 'grass-weevil',
    name: 'Grass and Clover Weevil',
    common_names: ['Sitona lineatus', 'Sitona spp.'],
    pest_type: 'pest',
    description: 'Weevil species (Sitona lineatus and related species) whose adults cause characteristic U-shaped notching of leaf margins on clover, peas, and beans. Larvae feed on root nodules, reducing nitrogen fixation. Important pest of grassland clover.',
    lifecycle: 'Adults overwinter in field margins and hedgerows. Migrate to host crops in spring. Eggs laid in soil near roots. Larvae feed on root nodules for 4-6 weeks, then pupate. One generation per year. Adults active April-September.',
    identification: 'Adults: small (4-5mm) brown-grey weevils with striped wing cases. Characteristic U-shaped notches on leaf margins (adult feeding). Larvae: white C-shaped grubs feeding on root nodules underground.',
    crops_affected: ['clover', 'grassland', 'peas', 'beans', 'lucerne'],
    risk_factors: 'Warm dry spring, proximity to overwintering sites, newly established clover leys, pea and bean crops, light soils',
    economic_impact: 'Adult leaf notching is mainly cosmetic. Larval damage to root nodules reduces nitrogen fixation by 10-30% in clover. In peas and beans, larval feeding reduces yield by 5-10%. Loss of root nodules increases fertiliser nitrogen requirements.',
    images_description: 'U-shaped notches on clover leaf margins from adult weevil feeding',
  },
  {
    id: 'stem-nematode',
    name: 'Stem Nematode',
    common_names: ['Ditylenchus dipsaci'],
    pest_type: 'pest',
    description: 'Plant-parasitic nematode (Ditylenchus dipsaci) that feeds within stems and bulbs of many crops. Causes swelling, distortion, and rot. Different biological races specialise on different host groups. Important pest of clover, onions, beans, and oats in the UK.',
    lifecycle: 'Nematodes survive in soil, plant debris, and dry plant tissue for years (as desiccated fourth-stage juveniles). Enter plants through stomata and wounds. Feed within tissue, causing cell enlargement and tissue breakdown. Multiple generations per year within the plant.',
    identification: 'Symptoms vary by host: in clover, swollen distorted stems and petioles (clover sickness); in onions, bloated soft bulbs with brown rings; in beans, brown stem lesions; in oats, twisted distorted leaves. Nematodes visible under microscope from macerated tissue.',
    crops_affected: ['clover', 'onions', 'beans', 'oats', 'lucerne'],
    risk_factors: 'Short rotations with susceptible hosts, wet conditions, heavy soils, contaminated seed, infested soil, variety susceptibility',
    economic_impact: 'Clover stands can be destroyed within 2-3 years (clover sickness). Onion stem nematode causes 10-50% loss. Bean stem nematode causes variable damage. Soil persistence makes long rotations necessary.',
    images_description: 'Swollen distorted clover stems and petioles from stem nematode infection',
  },
  {
    id: 'rabbits',
    name: 'Rabbits',
    common_names: ['European rabbit', 'Oryctolagus cuniculus'],
    pest_type: 'pest',
    description: 'Wild European rabbit (Oryctolagus cuniculus). Causes significant grazing damage to arable and grassland crops, particularly near field margins, hedgerows, and woodland. Population recovered after myxomatosis and rabbit haemorrhagic disease outbreaks.',
    lifecycle: 'Breeds January-August. 3-5 litters per year, 3-7 kits per litter. Live in warrens near field edges. Graze within 100-200m of cover. Population growth rapid where predation pressure is low. Active dawn and dusk.',
    identification: 'Grey-brown mammals with white tail flash. Damage: close-cropped grazing patches extending from field margins, bark stripping of young trees, excavated burrows in field margins and banks, droppings (round pellets) in clusters.',
    crops_affected: ['wheat', 'barley', 'oilseed rape', 'grassland', 'sugar beet', 'carrots', 'lettuce'],
    risk_factors: 'Proximity to woodland, hedgerows, or rabbit warrens; sandy soils suitable for burrowing; low predator numbers; lack of fencing; young crops at establishment',
    economic_impact: 'UK agricultural rabbit damage estimated at GBP 100+ million annually. Crop losses of 5-30% in affected field margins. Damage concentrated in first 50-100m from cover. Management includes fencing, shooting, and ferreting.',
    images_description: 'Close-cropped grazing damage extending from hedgerow into wheat field with rabbit droppings',
  },
  {
    id: 'moles',
    name: 'Moles',
    common_names: ['European mole', 'Talpa europaea'],
    pest_type: 'pest',
    description: 'European mole (Talpa europaea). Creates extensive tunnel systems and surface molehills in grassland and arable fields. Soil contamination of silage from molehills introduces Listeria risk in livestock feed. Root disturbance can damage crop establishment.',
    lifecycle: 'Solitary and territorial. Breed February-June, single litter of 3-4. Tunnel system of surface runs and deep permanent tunnels. Active year-round. Push excavated soil to surface as molehills. Feed on earthworms, leatherjackets, and soil invertebrates.',
    identification: 'Characteristic molehills (cone-shaped soil mounds). Surface tunnel ridges visible in soft soil. Root disturbance causing wilting of plants above shallow tunnels. Soil contamination of grass swards and silage.',
    crops_affected: ['grassland', 'wheat', 'barley', 'vegetables'],
    risk_factors: 'Moist soils rich in earthworms, permanent grassland, new grass leys, silage fields, amenity turf, organic systems with high soil biology',
    economic_impact: 'Silage contaminated with molehill soil increases Listeria risk in livestock (listeriosis). Damaged swards produce lower quality forage. Molehill soil blunts mowing equipment and contaminates crops. Control costs for trapping average GBP 5-10 per mole.',
    images_description: 'Cone-shaped soil molehills in grassland with surface tunnel ridges',
  },

  // ── Horticultural Pests ─────────────────────────────────────────
  {
    id: 'carrot-fly',
    name: 'Carrot Fly',
    common_names: ['Psila rosae'],
    pest_type: 'pest',
    description: 'Fly species (Psila rosae) whose larvae tunnel into carrot roots, causing rusty-brown mining damage and secondary soft rot. Two generations per year. The most important pest of UK carrot production. Also attacks parsnip, celery, and parsley.',
    lifecycle: 'Adults emerge from overwintering pupae in May. Low-level flight — females attracted by volatile compounds released when carrot foliage is bruised. Eggs laid near carrot crowns. Larvae feed on root surface then mine inward. Second generation: August-September.',
    identification: 'Adults: small (6mm) black flies with yellow head, rarely seen. Larvae: creamy-white legless maggots (up to 8mm) mining in root surface. Damage: rusty-brown tunnels in outer root surface. Secondary bacterial soft rot often follows. Foliage may yellow and wilt.',
    crops_affected: ['carrots', 'parsnips', 'celery', 'parsley'],
    risk_factors: 'Sheltered sites, proximity to hedgerows, thinning operations releasing volatile attractants, continuous carrot cropping, wet conditions favouring egg survival, first and second generation overlap',
    economic_impact: 'Larvae damage renders carrots unmarketable. Losses of 20-80% in unprotected crops. UK carrot growers rely heavily on insecticide or fleece barriers. Resistance breeding is ongoing. Quality thresholds are strict for supermarket supply.',
    images_description: 'Rusty-brown mining tunnels on carrot root surface with cream-coloured larva',
  },
  {
    id: 'cabbage-root-fly',
    name: 'Cabbage Root Fly',
    common_names: ['Delia radicum'],
    pest_type: 'pest',
    description: 'Fly species (Delia radicum) whose larvae feed on roots of brassica crops. Causes wilting, stunting, and death of brassica transplants and direct-drilled crops. Three generations per year, with the first (May-June) and third (September-October) most damaging.',
    lifecycle: 'Adults emerge from overwintering pupae in April-May. Eggs laid on soil surface at base of brassica plants. Larvae mine into main root and stem base, destroying root system. Three generations per year (May, July, September).',
    identification: 'Adults: small (6mm) grey flies resembling house flies. Larvae: white legless maggots (up to 8mm) feeding on roots. Damage: wilting plants (especially in warm weather), brown-grey mining damage on roots when pulled, plants easily rocked in soil.',
    crops_affected: ['cabbage', 'cauliflower', 'Brussels sprouts', 'broccoli', 'turnips', 'swedes', 'oilseed rape'],
    risk_factors: 'Spring brassica transplants, warm sunny weather during egg-laying, fields with previous brassica crops, organic matter in soil, sheltered field positions',
    economic_impact: 'Untreated spring brassicas can lose 20-50% of plants. Module-raised transplants with root drench are standard protection. Fleece and mesh covers used in organic production. First and third generation most damaging.',
    images_description: 'White maggots feeding on brassica root surface with wilted transplant above',
  },
  {
    id: 'cabbage-white',
    name: 'Large Cabbage White',
    common_names: ['Large white', 'Pieris brassicae'],
    pest_type: 'pest',
    description: 'Butterfly (Pieris brassicae) whose caterpillars defoliate brassica crops. Lays eggs in clusters of 20-100 on leaf undersurfaces. Caterpillars are gregarious, feeding together and rapidly stripping leaves to skeletons. Two generations per year plus immigrant butterflies.',
    lifecycle: 'Adults emerge in April-May (first generation). Eggs laid in clusters on brassica leaf undersurfaces. Caterpillars feed gregariously for 3-4 weeks, then pupate on fences, walls, and plant stems. Second generation August-September, augmented by immigrants from continental Europe.',
    identification: 'Adults: large white butterfly (60mm wingspan) with black wing tips. Eggs: yellow, bottle-shaped, in clusters on leaf underside. Caterpillars: yellow-green with black spots, gregarious, up to 40mm. Damage: skeletonised leaves, large holes, frass (excrement).',
    crops_affected: ['cabbage', 'Brussels sprouts', 'cauliflower', 'broccoli', 'nasturtiums'],
    risk_factors: 'Warm summers, immigrant reinforcement from continental Europe, unprotected brassica crops, garden and allotment settings, absence of parasitoid control',
    economic_impact: 'Complete defoliation possible in severe outbreaks. Commercial crops protected by insecticide or biocontrol (Bacillus thuringiensis). Main pest of garden and allotment brassicas. Natural parasitoid Cotesia glomerata provides significant control.',
    images_description: 'Cluster of yellow-green caterpillars with black spots defoliating cabbage leaf',
  },
  {
    id: 'diamond-back-moth',
    name: 'Diamond-back Moth',
    common_names: ['Plutella xylostella', 'DBM'],
    pest_type: 'pest',
    description: 'Small moth (Plutella xylostella) whose larvae feed on brassica crops. Cannot overwinter in the UK — relies on spring immigration from southern Europe. In major immigration years, can cause devastating damage to brassica and oilseed rape crops. Notorious for insecticide resistance.',
    lifecycle: 'Immigrant adults arrive on warm southerly airflows in May-June. Eggs laid on brassica leaves. Small green caterpillars feed on leaf undersurface, creating windowpane damage. Multiple rapid generations possible (21-day cycle in warm weather).',
    identification: 'Adults: small (8mm) grey-brown moths with diamond-shaped pattern when wings folded. Larvae: small (10-12mm) bright green caterpillars that wriggle backwards when disturbed. Damage: small holes and windowpane feeding on leaf undersurface.',
    crops_affected: ['oilseed rape', 'cabbage', 'Brussels sprouts', 'cauliflower', 'broccoli'],
    risk_factors: 'Warm southerly airflows in spring bringing immigrant populations, warm dry summers allowing rapid population build-up, brassica crop concentration, insecticide resistance in immigrants',
    economic_impact: 'Highly variable — devastating in major immigration years (e.g. 2016). In outbreak years, losses of 20-50% on brassica crops. Insecticide resistance to pyrethroids and organophosphates common in immigrant populations. Bacillus thuringiensis remains effective.',
    images_description: 'Small green caterpillar and diamond-patterned moth on brassica leaf',
  },
  {
    id: 'onion-fly',
    name: 'Onion Fly',
    common_names: ['Delia antiqua'],
    pest_type: 'pest',
    description: 'Fly species (Delia antiqua) whose larvae mine into onion and leek bulbs and leaf bases, causing yellowing, wilting, and soft rot. First generation (May-June) most damaging to establishing crops. Can cause complete crop failure.',
    lifecycle: 'Adults emerge in May from overwintering pupae. Attracted to onion odour. Eggs laid at base of onion plants. Larvae mine into bulb, feeding for 3 weeks, then pupate in soil. Two generations per year (May-June and August).',
    identification: 'Adults: small (6mm) grey flies. Larvae: white legless maggots mining into onion bulb base. Damage: yellowing and wilting of leaves, soft bulb rot, plants easily pulled from soil. Secondary bacterial rot follows larval damage.',
    crops_affected: ['onions', 'leeks', 'garlic', 'shallots'],
    risk_factors: 'Spring-sown onion crops at seedling stage, warm dry weather during adult flight, fields near previous Allium crops, organic matter attracting egg-laying females, thinning operations releasing onion volatile',
    economic_impact: 'Losses of 10-50% in unprotected spring onion crops. Module-raised transplants less susceptible than direct-drilled. Seed treatment and mesh covers are the main protection. Second generation damages maturing bulbs.',
    images_description: 'White maggots mining into onion bulb base with yellowed wilted foliage',
  },
  {
    id: 'beet-leaf-miner',
    name: 'Beet Leaf Miner',
    common_names: ['Mangold fly', 'Pegomya hyoscyami'],
    pest_type: 'pest',
    description: 'Fly species (Pegomya hyoscyami) whose larvae mine between the upper and lower leaf surfaces of sugar beet, beetroot, and spinach. Creates blister-like mines that can destroy significant leaf area. Multiple generations per year.',
    lifecycle: 'Adults emerge in May. Eggs laid on leaf undersurface in clusters of 3-6. Larvae mine between leaf surfaces, creating expanding blisters. Pupate in soil. Two to three generations per year (May, July, September).',
    identification: 'Adults: small (6mm) grey-brown flies. Larvae: pale green-white maggots visible within leaf mines when held to light. Damage: large pale blister-like mines on leaves. Multiple mines can destroy entire leaf. Eggs visible as small white elongated objects on leaf undersurface.',
    crops_affected: ['sugar beet', 'beetroot', 'spinach', 'chard'],
    risk_factors: 'Warm springs, proximity to previous beet crops, fields near hedgerows providing overwintering sites, no insecticide treatment, dense crop stands',
    economic_impact: 'Yield losses of 5-15% when first-generation damage coincides with young beet plants (4-8 true leaf stage). Later generations cause less yield loss as plants have more leaf area. Previously controlled by neonicotinoid seed treatment.',
    images_description: 'Pale blister-like leaf mines on sugar beet with larvae visible when backlit',
  },
  {
    id: 'cutworms',
    name: 'Cutworms',
    common_names: ['Turnip moth larvae', 'Agrotis segetum'],
    pest_type: 'pest',
    description: 'Larvae of the turnip moth (Agrotis segetum) and heart and dart moth (Agrotis exclamationis). Soil-dwelling caterpillars that sever seedling stems at or below ground level at night. Curl into a C-shape when disturbed. Damage concentrated in patches.',
    lifecycle: 'Moths fly in June-July. Eggs laid on low-growing vegetation or bare soil. Young larvae feed on leaves initially, then move into soil. Larger larvae feed at night, cutting stems at ground level. Overwinter as pupae in soil. One generation per year.',
    identification: 'Larvae: grey-brown caterpillars (up to 40mm) that curl into C-shape when disturbed. Feed at night, hide in soil by day. Damage: severed stems at ground level, plants cut off and lying on soil surface, irregular patches of missing plants.',
    crops_affected: ['sugar beet', 'lettuce', 'carrots', 'potatoes', 'brassicas', 'cereals'],
    risk_factors: 'Dry warm summers following wet spring (good moth flight, poor egg survival in wet soil), weedy fields providing egg-laying sites, light sandy soils, late-sown crops at vulnerable stage during larval feeding peak',
    economic_impact: 'Patchy plant losses of 5-25% in affected crops. Most damaging in sugar beet and lettuce where individual plants represent significant value. Monitoring pheromone traps guides risk assessment. Damage often patchy and localised.',
    images_description: 'Grey-brown C-shaped caterpillar beside severed sugar beet seedling stem at soil level',
  },
  {
    id: 'red-spider-mite',
    name: 'Two-spotted Spider Mite',
    common_names: ['Red spider mite', 'Tetranychus urticae'],
    pest_type: 'pest',
    description: 'Tiny mite (Tetranychus urticae) that feeds on plant cells on leaf undersurfaces, causing stippling, yellowing, and leaf death. Extremely polyphagous. Major pest of strawberries, hops, and protected crops. Rapid reproduction in hot, dry conditions.',
    lifecycle: 'Overwintering females (orange-red) in soil litter and crevices. Emerge in spring. Feed on leaf undersurfaces, producing fine webbing. Rapid reproduction (egg to adult in 7 days at 30C). Multiple generations per year. Migrate on wind currents.',
    identification: 'Mites: tiny (0.5mm) pale green with two dark spots (summer form) or orange-red (overwintering form). Fine silk webbing on leaf undersurface. Damage: pale stippling on upper leaf surface, progressing to bronzing and leaf death. Mites visible with hand lens.',
    crops_affected: ['strawberries', 'hops', 'beans', 'cucumbers', 'tomatoes'],
    risk_factors: 'Hot dry conditions, protected cropping, pesticide disruption of biological control, pyrethroid use killing predatory mites, water-stressed plants',
    economic_impact: 'Yield losses of 10-40% in strawberries and hops if uncontrolled. Biological control with Phytoseiulus persimilis is the standard approach in protected crops. Acaricide resistance widespread. Integrated pest management is essential.',
    images_description: 'Fine silk webbing on strawberry leaf underside with pale stippling on upper surface',
  },
  {
    id: 'whitefly',
    name: 'Glasshouse Whitefly',
    common_names: ['Trialeurodes vaporariorum'],
    pest_type: 'pest',
    description: 'Tiny white-winged insect (Trialeurodes vaporariorum) that feeds on plant sap on leaf undersurfaces. Major pest of protected vegetable and ornamental crops. Produces honeydew supporting sooty mould. Can transmit plant viruses.',
    lifecycle: 'Eggs laid on young leaf undersurfaces. Nymphs (scales) settle on leaves and feed on phloem sap. Adults (2mm) with white waxy wings fly when plants disturbed. Continuous generations in heated glasshouses year-round. Development takes 3-4 weeks at 20C.',
    identification: 'Adults: tiny (2mm) white-winged flies on leaf undersurfaces, fly in clouds when plants disturbed. Nymphs: flat pale green-white scales on leaf undersurface. Damage: yellowing, honeydew deposits, sooty mould on lower leaves, leaf curl.',
    crops_affected: ['tomatoes', 'cucumbers', 'peppers', 'lettuce', 'ornamentals'],
    risk_factors: 'Heated glasshouses year-round, poor hygiene between crops, insecticide resistance, disruption of biological control, infested transplants',
    economic_impact: 'Sooty mould reduces fruit quality and marketability. Heavy infestations reduce yield by 10-30%. Biological control with Encarsia formosa parasitoid wasp is the standard IPM approach. Insecticide resistance common.',
    images_description: 'Cloud of tiny white-winged flies rising from tomato plant undersurface when disturbed',
  },
  {
    id: 'thrips',
    name: 'Western Flower Thrips',
    common_names: ['WFT', 'Frankliniella occidentalis'],
    pest_type: 'pest',
    description: 'Tiny insect (Frankliniella occidentalis) that feeds on flower and leaf tissue using rasping-sucking mouthparts. Major pest of protected crops. Transmits Tomato Spotted Wilt Virus (TSWV). Widespread insecticide resistance. Not native to the UK — established since 1986.',
    lifecycle: 'Adults (1-2mm) feed and lay eggs in plant tissue. Larvae feed on leaves and flowers for 4-8 days, then pupate in growing media. Development from egg to adult in 11-15 days at 25C. Continuous generations in protected crops.',
    identification: 'Adults: tiny (1-2mm) yellow to dark brown elongated insects. Damage: silvery feeding scars on leaves and petals, distorted flowers, scarring on fruit. Black frass spots on leaves. Flower discolouration and premature petal drop.',
    crops_affected: ['peppers', 'cucumbers', 'strawberries', 'ornamentals', 'lettuce'],
    risk_factors: 'Protected cropping, imported plant material, warm conditions, insecticide resistance, proximity to ornamental crops (reservoir hosts)',
    economic_impact: 'Cosmetic damage reduces marketability of fruit and ornamentals. TSWV transmission causes severe yield loss in susceptible hosts. Insecticide resistance to organophosphates, pyrethroids, and spinosad documented. Biological control with predatory mites (Amblyseius, Orius) is standard.',
    images_description: 'Silvery feeding scars on pepper leaf and tiny elongated thrips on flower',
  },

  // ── Stored Grain Pests ──────────────────────────────────────────
  {
    id: 'grain-weevil',
    name: 'Grain Weevil',
    common_names: ['Sitophilus granarius'],
    pest_type: 'pest',
    description: 'Beetle (Sitophilus granarius) that breeds within stored grain. Female bores hole in grain, deposits single egg, and seals it. Larva develops entirely within the grain kernel. The most important primary pest of stored grain in UK temperate conditions.',
    lifecycle: 'Female drills hole in grain kernel, lays single egg, seals with secretion. Larva develops inside grain, consuming the endosperm. Pupates within the grain. Adult chews exit hole. Development takes 5-8 weeks at 25C. Cannot fly — spread by movement of infested grain.',
    identification: 'Adults: small (3-5mm) dark brown-black weevil with elongated snout (rostrum). Cannot fly. Larvae: white legless grubs found inside grain when split open. Damage: circular exit holes in grain. Infested grain is warm and damp with dusty residue.',
    crops_affected: ['wheat', 'barley', 'maize', 'oats'],
    risk_factors: 'Warm grain stores (>15C), high grain moisture content (>14%), residual infestation in stores from previous season, poor store hygiene, slow drying after harvest',
    economic_impact: 'Weight loss of 5-15% in heavily infested stores. Quality downgrading from insect fragments, frass, and heating. UK grain store inspections by Red Tractor and TASCC require pest-free storage. Management through store hygiene, drying, and cooling.',
    images_description: 'Small dark brown weevil with elongated snout on wheat grain with exit holes',
  },
  {
    id: 'saw-toothed-grain-beetle',
    name: 'Saw-toothed Grain Beetle',
    common_names: ['Oryzaephilus surinamensis'],
    pest_type: 'pest',
    description: 'Flat beetle (Oryzaephilus surinamensis) that infests stored grain and processed cereal products. Named for the saw-toothed projections on the thorax. A secondary pest — feeds on damaged grain, mould, and grain dust. Very flat body allows penetration of sealed packaging.',
    lifecycle: 'Female lays eggs loosely among grain or in crevices. Larvae feed on grain dust, damaged kernels, and mould. Development takes 3-10 weeks depending on temperature. Adults live 6-12 months. Does not develop well in undamaged whole grain — secondary pest.',
    identification: 'Adults: small (2.5-3.5mm) flat brown beetle with six saw-tooth projections on each side of the thorax. Very flat body. Larvae: small yellowish-white grubs in grain residue. Adults active and fast-moving. Found in grain dust and between kernels.',
    crops_affected: ['wheat', 'barley', 'oats', 'flour', 'cereals'],
    risk_factors: 'Warm stores, broken grain providing food source, residual infestation, stored grain products and flour, poor store hygiene',
    economic_impact: 'Indicates poor storage conditions or grain quality issues. Causes quality rejection of grain lots at intake. Weight loss minimal but contamination unacceptable. Store hygiene and grain cooling are the main controls.',
    images_description: 'Small flat brown beetle with saw-toothed thorax projections on grain surface',
  },
  {
    id: 'rust-red-flour-beetle',
    name: 'Rust Red Flour Beetle',
    common_names: ['Tribolium castaneum'],
    pest_type: 'pest',
    description: 'Flour beetle (Tribolium castaneum) that infests stored grain products, flour, and animal feed. Cannot attack whole grain — requires damaged or milled grain. Produces quinone secretions that taint flour and products. Indicator of poor storage hygiene.',
    lifecycle: 'Eggs laid among grain dust and flour. Larvae feed for 1-4 months depending on temperature. Adults long-lived (1-3 years). Can fly in warm conditions. Produces defensive quinone secretions that cause off-flavours in flour.',
    identification: 'Adults: small (3-4mm) reddish-brown flattened beetle. Antennae with distinct 3-segment club. Larvae: yellowish-white, elongated. Distinguished from confused flour beetle by antenna shape. Often found in flour deposits and grain dust.',
    crops_affected: ['flour', 'grain products', 'animal feed', 'wheat', 'barley'],
    risk_factors: 'Warm stores, accumulated grain dust and spillage, residual infestation in store fabric, imported grain products, flour mill environments',
    economic_impact: 'Quinone tainting renders flour products unacceptable. Indicates hygiene failure. Major pest of flour mills and food manufacturing. Zero tolerance in food industry. Managed through fumigation, hygiene, and temperature control.',
    images_description: 'Small reddish-brown flour beetle on grain dust with 3-segment antennal club',
  },
  {
    id: 'indian-meal-moth',
    name: 'Indian Meal Moth',
    common_names: ['Plodia interpunctella'],
    pest_type: 'pest',
    description: 'Stored product moth (Plodia interpunctella) whose larvae feed on the surface of stored grain, dried fruit, nuts, and cereal products. Larvae spin silken webbing over the grain surface. The most common stored product moth in UK food premises.',
    lifecycle: 'Adults lay eggs on food surface. Larvae feed on grain germ and surface, spinning silken webbing as they move. Mature larvae leave food to pupate in crevices and on store walls. Development takes 4-10 weeks at 25C. Adults live 1-2 weeks.',
    identification: 'Adults: small moth (8-10mm) with distinctive wing pattern — inner half pale grey, outer half reddish-brown with coppery sheen. Larvae: cream-white caterpillars (up to 12mm) with brown head capsule. Webbing on grain surface is diagnostic.',
    crops_affected: ['wheat', 'barley', 'dried fruit', 'nuts', 'cereal products'],
    risk_factors: 'Warm storage (>20C), long storage periods, residual infestation, imported commodities, poor store sealing, grain surface not treated',
    economic_impact: 'Surface webbing and frass contamination cause grain rejection. Webbing can block grain handling equipment. Important in food processing and retail environments. Pheromone traps used for monitoring.',
    images_description: 'Moth with pale grey inner and reddish-brown outer wing halves, and silken webbing on grain',
  },
  {
    id: 'grain-mite',
    name: 'Grain Mite',
    common_names: ['Acarus siro', 'Flour mite'],
    pest_type: 'pest',
    description: 'Tiny mite (Acarus siro) that feeds on grain germ and mould on stored grain. Populations build rapidly in damp grain (>14% moisture), causing heating and musty tainting. Produces allergenic waste products. Indicator of poor drying or storage conditions.',
    lifecycle: 'Eggs laid among grain. Development from egg to adult takes 9-28 days depending on temperature and humidity. Explosive population growth possible — from low numbers to millions in weeks on damp grain. Can enter hypopus (dispersal) stage when conditions deteriorate.',
    identification: 'Adults: tiny (0.5mm) translucent white mites, barely visible individually. Large populations give grain a dusty, moving appearance and sweet musty smell. Brown dust (mite frass) on grain surface. Hypopus stage mites are harder, darker, and resistant to drying.',
    crops_affected: ['wheat', 'barley', 'oats', 'flour', 'animal feed'],
    risk_factors: 'Grain moisture above 14%, relative humidity above 65%, warm temperatures, poor ventilation, mould growth on grain, residual populations in store',
    economic_impact: 'Musty taint renders grain unsuitable for milling. Allergenic mite proteins cause bakers asthma and dermatitis. Weight loss is minimal but quality impact is total — infested grain is rejected. Prevention through drying and cooling.',
    images_description: 'Dusty moving grain surface covered with tiny translucent white mites',
  },
  {
    id: 'confused-flour-beetle',
    name: 'Confused Flour Beetle',
    common_names: ['Tribolium confusum'],
    pest_type: 'pest',
    description: 'Close relative of the rust-red flour beetle (Tribolium confusum). Similar biology but cannot fly. Important pest of flour mills and grain stores. Distinguished from T. castaneum by gradually expanding antennae (no distinct 3-segment club).',
    lifecycle: 'Similar to rust-red flour beetle. Eggs laid in flour and grain dust. Larvae feed on processed grain products and damaged grain. Adults long-lived (up to 3 years). Cannot fly — dispersal by movement of infested products. Produces quinone taint.',
    identification: 'Adults: small (3-4mm) reddish-brown flattened beetle. Antennae gradually expand toward tip (no distinct club — distinguishing from T. castaneum). Larvae: yellowish-white. Found in flour and grain processing residues.',
    crops_affected: ['flour', 'grain products', 'animal feed', 'wheat'],
    risk_factors: 'Flour mills, food processing premises, warm stored products, accumulated flour dust and residue, long-term storage',
    economic_impact: 'Same as rust-red flour beetle — quinone tainting and contamination. Common in UK flour mills. Managed through regular cleaning, fumigation schedules, and temperature management.',
    images_description: 'Small reddish-brown beetle with gradually expanding antennae on flour surface',
  },
  {
    id: 'lesser-grain-borer',
    name: 'Lesser Grain Borer',
    common_names: ['Rhyzopertha dominica'],
    pest_type: 'pest',
    description: 'Boring beetle (Rhyzopertha dominica) that can attack whole sound grain. Adults and larvae bore directly into grain kernels. A primary stored grain pest — unlike many store pests, it does not require damaged grain. Can cause severe losses in warm grain stores.',
    lifecycle: 'Female bores into grain and lays eggs loosely in grain mass. Larvae bore into grain to feed and develop. Adults also feed on grain, producing copious flour dust. Development takes 4-8 weeks at 25-30C. Requires temperatures above 18C for development.',
    identification: 'Adults: small (2.5-3mm) dark brown cylindrical beetle with head tucked under thorax (visible from above as hooded shape). Strong flier. Larvae: white C-shaped grubs inside grain. Produces large amounts of flour dust. Circular bore holes in grain.',
    crops_affected: ['wheat', 'barley', 'maize', 'rice'],
    risk_factors: 'Warm grain stores (>20C), imported grain, long storage periods, inadequate cooling and ventilation, carry-over infestation from previous seasons',
    economic_impact: 'One of the most destructive grain beetles globally. Weight losses of 10-30% possible in warm uncontrolled stores. Less common in UK than in tropical regions but found in heated stores and imported grain. Zero tolerance at intake.',
    images_description: 'Small dark brown cylindrical beetle with hooded thorax and bore holes in grain',
  },
  {
    id: 'warehouse-moth',
    name: 'Warehouse Moth',
    common_names: ['Ephestia elutella', 'Tobacco moth'],
    pest_type: 'pest',
    description: 'Stored product moth (Ephestia elutella) whose larvae feed on grain surface, cocoa, dried fruit, and tobacco in storage. Closely related to Indian meal moth but generally more cold-tolerant. Larvae produce dense webbing in grain and products.',
    lifecycle: 'Adults lay eggs on food surface. Larvae spin webbing and feed on grain germ, surface, and mould. Can develop at lower temperatures than Indian meal moth. Mature larvae leave food to pupate in store structure. One to two generations per year in UK conditions.',
    identification: 'Adults: small moth (8-10mm) grey-brown with faint darker cross-bands on forewings. Less distinctly marked than Indian meal moth. Larvae: grey-white caterpillars (up to 14mm). Dense webbing in grain and on store surfaces.',
    crops_affected: ['wheat', 'barley', 'cocoa', 'dried fruit', 'tobacco'],
    risk_factors: 'Cooler storage (tolerates lower temperatures than many store pests), long storage periods, organic and heritage grain stores, residual infestation in store structure',
    economic_impact: 'Webbing and frass contamination cause quality rejection. More cold-tolerant than Indian meal moth, making it important in UK unheated stores. Managed through store hygiene, grain surface treatment, and temperature control.',
    images_description: 'Grey-brown moth with faint cross-bands on wings and dense webbing on stored grain',
  },

  // ── Fruit Pests ─────────────────────────────────────────────────
  {
    id: 'codling-moth',
    name: 'Codling Moth',
    common_names: ['Cydia pomonella'],
    pest_type: 'pest',
    description: 'Moth (Cydia pomonella) whose larvae bore into apple and pear fruit, feeding on the core. The most important insect pest of UK apple orchards. Larvae leave characteristic frass at the entry hole. One to two generations per year depending on temperature.',
    lifecycle: 'Adults emerge May-July. Eggs laid on fruit or adjacent leaves on warm evenings. Larvae enter fruit through calyx or side of fruit, tunnelling to the core. Feed for 3-4 weeks, then exit fruit and pupate under bark scales or in soil. One generation in UK (two in warm years).',
    identification: 'Adults: small grey-brown moth (15-20mm wingspan) with distinctive copper-coloured patch at wing tip. Larvae: pink-white caterpillars (up to 20mm) with brown head, found inside fruit core. Damage: entry hole with reddish-brown frass (excrement) at surface.',
    crops_affected: ['apples', 'pears', 'walnuts'],
    risk_factors: 'Warm summers, historic orchards with established populations, poor spray timing, organic orchards relying on codling moth granulosis virus, proximity to unmanaged apple trees',
    economic_impact: 'Maggoty fruit is unmarketable — 5-40% loss in untreated orchards. UK apple growers rely on insecticide or mating disruption. Pheromone trapping guides spray timing. Codling moth granulosis virus (CpGV) used in organic orchards.',
    images_description: 'Pink-white larva inside apple core with frass at entry hole and adult moth on bark',
  },
  {
    id: 'apple-aphid',
    name: 'Rosy Apple Aphid',
    common_names: ['Dysaphis plantaginea'],
    pest_type: 'pest',
    description: 'Aphid species (Dysaphis plantaginea) that feeds on apple leaves and developing fruitlets. Causes severe leaf curling and fruit distortion (bumpy, misshapen apples). The most damaging aphid pest of UK apple production. Low numbers can cause significant damage.',
    lifecycle: 'Eggs overwinter on apple twigs. Hatch at bud burst. Spring colonies cause leaf curling and damage developing fruitlets. Winged migrants move to plantain (Plantago) as summer host. Return to apple in autumn to lay overwintering eggs.',
    identification: 'Adults: pinkish-grey aphids with waxy bloom, found in curled apple leaves. Damage: severe leaf curling and rolling on fruit-bearing spurs. Fruitlets distorted — bumpy, flattened, misshapen. Honeydew and sooty mould. Colonies hidden inside curled leaves.',
    crops_affected: ['apples'],
    risk_factors: 'Mild winters favouring egg survival, susceptible varieties, late detection (colonies hidden in curled leaves), inadequate pre-blossom spray timing, proximity to plantain weeds (summer host)',
    economic_impact: 'Fruit distortion causes 10-30% rejection in affected blocks. Very low populations (10 aphids per cluster) cause significant damage. Pre-blossom spray timing (green cluster to pink bud) is critical. Late sprays are ineffective as colonies are protected inside curled leaves.',
    images_description: 'Curled apple leaves with pinkish-grey aphids and distorted bumpy fruitlets',
  },
  {
    id: 'raspberry-beetle',
    name: 'Raspberry Beetle',
    common_names: ['Byturus tomentosus'],
    pest_type: 'pest',
    description: 'Small beetle (Byturus tomentosus) whose larvae feed inside raspberry (and loganberry, blackberry) fruit. The principal insect pest of UK raspberry production. Larvae cause quality rejection of fruit destined for fresh market and processing.',
    lifecycle: 'Adults emerge from soil in May-June. Feed on blossom buds and flowers. Eggs laid on flowers and developing fruit. Larvae feed inside the developing fruit for 5-6 weeks, then drop to soil to pupate and overwinter. One generation per year.',
    identification: 'Adults: small (3.5-4mm) pale brown hairy beetles found on flowers and fruit. Larvae: pale yellow-brown grubs (up to 8mm) with brown head, found inside fruit around the plug (receptacle). Damage: small brown grub inside raspberry — detected at harvest or by consumers.',
    crops_affected: ['raspberries', 'blackberries', 'loganberries'],
    risk_factors: 'Main-season summer-fruiting varieties, warm springs for adult emergence, proximity to wild bramble (reservoir), organic production with limited insecticide options',
    economic_impact: 'Fruit containing larvae is rejected by retailers (zero tolerance for fresh market). Pre-harvest inspection required. Losses of 5-30% in untreated crops. Autumn-fruiting varieties escape peak beetle flight. Chemical or biological control at white bud stage.',
    images_description: 'Small pale brown beetle on raspberry flower and yellow-brown larva inside fruit plug',
  },
  {
    id: 'plum-moth',
    name: 'Plum Moth',
    common_names: ['Grapholita funebrana'],
    pest_type: 'pest',
    description: 'Moth (Grapholita funebrana) whose larvae bore into plum, damson, and cherry fruit, feeding on the flesh around the stone. Fruit may appear externally normal until larva exits, leaving a hole with frass. One generation per year.',
    lifecycle: 'Adults fly June-July. Eggs laid on developing fruit. Larvae bore into fruit, feeding on flesh around the stone for 4-6 weeks. Mature larvae exit fruit, drop to soil, and pupate in the top few centimetres of soil. Overwinter as pupae.',
    identification: 'Adults: small (12-15mm wingspan) grey-brown moths, rarely seen. Larvae: pink-red caterpillars (up to 12mm) found in fruit flesh around the stone. Damage: internal tunnelling of fruit flesh, frass-filled cavity around stone, exit hole at fruit surface.',
    crops_affected: ['plums', 'damsons', 'cherries'],
    risk_factors: 'Established orchards with historical populations, warm summers, fruit thinning delays (more egg-laying targets), proximity to wild plum and damson',
    economic_impact: 'Losses of 10-50% of fruit in untreated orchards. Internal damage not visible externally, causing consumer complaints. Pheromone trapping guides spray timing. Spinosad and deltamethrin are the main chemical options.',
    images_description: 'Pink-red caterpillar inside plum fruit flesh around stone with frass-filled tunnel',
  },

  // ── Additional Oilseed/Pulse Pests ──────────────────────────────
  {
    id: 'pea-aphid',
    name: 'Pea Aphid',
    common_names: ['Acyrthosiphon pisum'],
    pest_type: 'pest',
    description: 'Large aphid (Acyrthosiphon pisum) that feeds on peas, beans, and other legumes. Causes direct feeding damage and can transmit pea enation mosaic virus and other viruses. One of the largest UK aphid species at 4-5mm body length.',
    lifecycle: 'Overwinters as eggs on clover and lucerne. Spring migrants colonise pea and bean crops. Rapid parthenogenetic reproduction. Colonies build on growing tips, flowers, and developing pods. Winged migrants produced as populations become crowded.',
    identification: 'Adults: large (4-5mm) bright green or pink aphids on pea and bean growing tips and pods. Long legs and siphunculi. Distinguished from other aphids by large size and preference for legumes. Colonies can be dense on shoot tips.',
    crops_affected: ['peas', 'beans', 'clover', 'lucerne'],
    risk_factors: 'Warm dry spring and early summer, proximity to clover and lucerne (overwintering hosts), absence of natural enemies, late-sown peas coinciding with peak migration',
    economic_impact: 'Direct feeding reduces yield by 5-15% in severe infestations. Virus transmission can cause additional losses. Natural enemies (parasitoid wasps, ladybirds) often provide adequate control. Threshold: colonies on 50% of plants.',
    images_description: 'Large bright green aphids clustered on pea growing tips and developing pods',
  },
  {
    id: 'bruchid-beetle',
    name: 'Bruchid Beetle',
    common_names: ['Bean bruchid', 'Bruchus rufimanus'],
    pest_type: 'pest',
    description: 'Seed-feeding beetle (Bruchus rufimanus) whose larvae develop inside bean seeds. Adults feed on pollen during bean flowering. Female lays eggs on developing pods; larvae bore through pod wall into seed. Causes quality rejection of beans for human consumption.',
    lifecycle: 'Adults emerge from beans in spring (from previous season stored beans or field-overwintered pupae). Feed on bean pollen. Eggs laid on developing pods. Larvae bore through pod wall into seed, feeding on cotyledon. Pupate inside the seed. One generation per year.',
    identification: 'Adults: small (4-5mm) brown-grey beetle with white-spotted wing cases. Larvae: white C-shaped grubs developing inside bean seeds. Damage: circular exit hole in seed surface (3mm diameter). Seed may appear normal externally until exit hole appears.',
    crops_affected: ['beans', 'winter beans', 'spring beans'],
    risk_factors: 'Warm weather during flowering, fields near previous bean crops, stored beans from previous harvest (adults emerge and reinfest), food-grade bean production with zero defect tolerance',
    economic_impact: 'Damage renders beans unsuitable for human consumption market (zero tolerance for bruchid holes in export-quality beans). Feed-grade beans accept some damage. Losses of 5-20% of seed weight from larval feeding. Important for UK bean exports.',
    images_description: 'Brown-grey beetle on bean flower and circular exit hole in harvested bean seed',
  },
  {
    id: 'cabbage-aphid',
    name: 'Cabbage Aphid',
    common_names: ['Brevicoryne brassicae', 'Mealy cabbage aphid'],
    pest_type: 'pest',
    description: 'Aphid species (Brevicoryne brassicae) that forms dense grey-blue mealy colonies on brassica crops. Distinctive waxy grey bloom covers the body. Causes severe leaf curling and contamination of harvested brassica heads. Important pest of Brussels sprouts and other headed brassicas.',
    lifecycle: 'Overwinters as eggs on brassica stems. Spring colonies build on young growth. Reproduces parthenogenetically through summer with rapid population growth. Dense colonies on leaves, flowers, and growing points. Winged migrants spread to new crops.',
    identification: 'Adults: small (2mm) grey-green aphids covered in grey-white waxy mealy bloom. Dense colonies appear as grey-blue masses. Distinguished from peach-potato aphid by waxy coating and preference for brassicas only. Causes severe leaf curling.',
    crops_affected: ['Brussels sprouts', 'cabbage', 'cauliflower', 'broccoli', 'oilseed rape'],
    risk_factors: 'Warm dry summers, brassica crop concentration, overwintering on brassica stumps, difficulty of spray penetration into curled leaves',
    economic_impact: 'Dense colonies in Brussels sprout buttons render them unmarketable. Cleaning contaminated heads adds labour cost. Losses of 10-40% on untreated brassica crops. Aphid-specific insecticides or biological control (Diaeretiella rapae parasitoid) are the main approaches.',
    images_description: 'Dense grey-blue mealy aphid colonies on Brussels sprout leaves and buttons',
  },
  {
    id: 'brassica-pod-midge',
    name: 'Brassica Pod Midge',
    common_names: ['Dasineura brassicae'],
    pest_type: 'pest',
    description: 'Tiny midge (Dasineura brassicae) whose larvae feed inside OSR pods, causing premature pod splitting and seed loss. Often enters through seed weevil exit holes. Can cause significant combine harvest losses through pod shatter.',
    lifecycle: 'Adults emerge from soil in May-June. Eggs laid inside pods through wounds (seed weevil holes, natural splits). Larvae (up to 20 per pod) feed on inner pod wall. Pods ripen prematurely and split. Mature larvae drop to soil. Two generations per year.',
    identification: 'Adults: tiny (1.5mm) brownish midges, rarely seen. Larvae: white-orange maggots inside premature-yellowing pods. Damage: pods ripen early, turning yellow while rest of crop still green. Pods split prematurely, shedding seed before harvest.',
    crops_affected: ['oilseed rape', 'winter oilseed rape', 'spring oilseed rape'],
    risk_factors: 'Seed weevil damage providing entry points, warm weather during pod development, fields near previous OSR crops, high pod midge populations from previous season',
    economic_impact: 'Yield losses of 5-15% from premature pod split and seed loss. Often works in association with seed weevil (weevil exit holes provide midge entry). Combined pest management of both species is needed. Spray timing at pod set targets both pests.',
    images_description: 'Premature-yellowing OSR pod with white-orange midge larvae inside',
  },
  {
    id: 'turnip-sawfly',
    name: 'Turnip Sawfly',
    common_names: ['Athalia rosae'],
    pest_type: 'pest',
    description: 'Sawfly (Athalia rosae) whose larvae rapidly defoliate brassica crops. Not reliably established in the UK — periodic immigration from continental Europe. In immigration years, can cause rapid and devastating defoliation of OSR, turnips, and other brassicas.',
    lifecycle: 'Adults are orange-bodied sawflies. Eggs laid in leaf tissue. Larvae (up to 20mm) feed gregariously on leaves, moving rapidly between plants. Can strip plants to bare stems in 2-3 days. Multiple generations possible in warm weather.',
    identification: 'Adults: orange-bodied sawflies (7-8mm). Larvae: dark grey-black caterpillars (not true caterpillars — sawfly larvae have more prolegs) with pale underside, up to 20mm. Feeding damage: rapid defoliation from leaf margins inward, plants reduced to stems and veins.',
    crops_affected: ['oilseed rape', 'turnips', 'swedes', 'cabbage'],
    risk_factors: 'Warm southerly airflows bringing immigrants, hot summers allowing rapid generation times, brassica crop concentration, late-summer crops at vulnerable stage',
    economic_impact: 'Sporadic but can be devastating in immigration years. Complete defoliation in 2-3 days. UK outbreaks in 2006 and 2014 caused significant OSR losses. Pyrethroids effective but timing is critical — larvae develop very rapidly.',
    images_description: 'Dark grey-black sawfly larvae rapidly defoliating OSR leaf from margins inward',
  },

  // ── Soil-borne Pests ────────────────────────────────────────────
  {
    id: 'free-living-nematodes',
    name: 'Free-living Nematodes',
    common_names: ['Root lesion nematode', 'Pratylenchus spp.'],
    pest_type: 'pest',
    description: 'Plant-parasitic nematodes (Pratylenchus spp.) that feed on and within roots of many crops, causing brown root lesions. Unlike cyst nematodes, they do not form cysts and are not host-specific. Wide host range makes them difficult to manage by rotation alone.',
    lifecycle: 'All stages live freely in soil and within roots. Enter roots, feed, lay eggs, and can exit and re-enter. Several generations per year. No dormant cyst stage — populations decline without hosts but more slowly than cyst nematodes.',
    identification: 'Above ground: patchy stunted growth, yellowing, poor establishment. Below ground: dark brown lesions on roots. Roots shortened and discoloured. Nematodes extracted from soil or root samples and identified by microscopy.',
    crops_affected: ['potatoes', 'cereals', 'carrots', 'strawberries', 'grassland'],
    risk_factors: 'Continuous cropping, poor soil structure, wet heavy soils, high organic matter, lack of fallow period',
    economic_impact: 'Yield losses of 5-20% in affected fields, often undiagnosed. Contributes to general crop decline and poor establishment. Soil sampling and nematode counting required for diagnosis. Long rotations and soil health management are the main tools.',
    images_description: 'Brown root lesions on potato root system with stunted patchy crop growth',
  },
  {
    id: 'springtails',
    name: 'Springtails',
    common_names: ['Collembola', 'Onychiurus spp.'],
    pest_type: 'pest',
    description: 'Tiny soil-dwelling arthropods (Onychiurus spp. and others) that occasionally damage germinating seeds and young seedlings. Feed primarily on soil organic matter and fungi. Become pests when populations are very high and preferred food is scarce.',
    lifecycle: 'Year-round activity in soil. Eggs laid in soil organic matter. Multiple generations per year. Populations build in high organic matter soils. Jump using a spring-like furcula when disturbed (hence the name). Most are 1-3mm in length.',
    identification: 'Tiny (1-3mm) white to grey soil-dwelling arthropods. Jump when disturbed. Found in soil crevices and around germinating seed. Damage: small holes in germinating seeds and young roots. Generally only damaging at very high populations.',
    crops_affected: ['sugar beet', 'peas', 'beans', 'cereals'],
    risk_factors: 'High soil organic matter, recently incorporated green manure, minimum tillage, wet conditions, slow germination in cold soils',
    economic_impact: 'Minor pest in most situations. Occasional losses of 5-10% plant stand in sugar beet and peas in high organic matter soils. Damage often attributed to other causes. Seed treatment provides some protection.',
    images_description: 'Tiny white springtails around germinating seed in high organic matter soil',
  },
  {
    id: 'millipedes',
    name: 'Spotted Snake Millipede',
    common_names: ['Blaniulus guttulatus'],
    pest_type: 'pest',
    description: 'Spotted snake millipede (Blaniulus guttulatus) that feeds on germinating seeds, young roots, and tubers. Found in soil with high organic matter. Extends damage initiated by slugs and other pests rather than causing primary damage. Can bore into potato tubers and strawberry fruit.',
    lifecycle: 'Year-round in soil. Eggs laid in soil in clusters. Slow development — juveniles take 1-2 years to mature. Found in soil with high organic matter. Move through existing channels and slug holes rather than creating new ones.',
    identification: 'Pale cream-white elongated body (15-20mm) with rows of red-pink spots along the sides (repugnatorial glands). Many legs. Coils into a flat spiral when disturbed. Found in soil, in slug holes on tubers, and in rotting organic matter.',
    crops_affected: ['potatoes', 'sugar beet', 'strawberries', 'cereals'],
    risk_factors: 'High soil organic matter, wet conditions, slug damage providing entry points, minimum tillage, heavy soils',
    economic_impact: 'Minor pest that extends damage from other causes. In potatoes, bores into tubers through slug holes, enlarging damage. In sugar beet, feeds on germinating seeds. Rarely justifies specific control. Good slug management reduces millipede damage.',
    images_description: 'Pale cream millipede with pink spots coiled beside potato tuber with bore holes',
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

  // ── Additional Pests (expansion) ──────────────────────────────
  {
    id: 'symphylids',
    name: 'Symphylids',
    common_names: ['Glasshouse symphylid', 'Scutigerella immaculata'],
    pest_type: 'pest',
    description: 'Small soil-dwelling arthropod (Scutigerella immaculata) that feeds on fine root hairs and root tips of seedlings and transplants. Causes stunting, wilting, and poor establishment. Found in high organic matter soils, particularly in glasshouse and horticultural situations.',
    lifecycle: 'Year-round activity in soil. Eggs laid in small clusters in soil. Develop through 12 moults over several months. Adults (6-8mm) white, fast-moving with 12 pairs of legs. Long-lived (up to 4 years). Populations build in undisturbed organic soils.',
    identification: 'Small (6-8mm) white, fast-moving soil arthropods with 12 pairs of legs and prominent antennae. Distinguished from centipedes by fewer legs and smaller size. Found in root zone when soil is carefully examined. Damage: stunted root system with feeding scars on root tips.',
    crops_affected: ['lettuce', 'sugar beet', 'potatoes', 'tomatoes', 'strawberries'],
    risk_factors: 'High organic matter soils, glasshouse production, minimum tillage, wet conditions, long-term vegetable rotations, undisturbed soil',
    economic_impact: 'Yield losses of 5-15% in affected crops. Often undiagnosed as cause of poor establishment. Major pest in some glasshouse situations. Soil flooding and cultivation reduce populations. No approved chemical control in most field crops.',
    images_description: 'Small white fast-moving arthropod with 12 leg pairs and long antennae in soil near roots',
  },
  {
    id: 'pea-weevil',
    name: 'Pea and Bean Weevil',
    common_names: ['Pea leaf weevil', 'Sitona lineatus'],
    pest_type: 'pest',
    description: 'Weevil (Sitona lineatus) whose adults cause characteristic U-shaped notching of pea and bean leaf margins. Larvae feed on nitrogen-fixing root nodules underground, reducing the crop capacity to fix atmospheric nitrogen. Widespread on all UK pea and bean crops.',
    lifecycle: 'Adults overwinter in field margins and hedgerows. Migrate to pea and bean crops in spring when temperatures exceed 12C. Eggs laid in soil near plants. Larvae feed on root nodules for 4-6 weeks, then pupate. One generation per year. Adults active April-August.',
    identification: 'Adults: small (4-5mm) grey-brown weevils with striped wing cases. U-shaped notches on leaf margins from adult feeding. Larvae: white C-shaped grubs feeding on root nodules below ground. Adults feign death when disturbed.',
    crops_affected: ['peas', 'spring peas', 'beans', 'spring beans', 'winter beans'],
    risk_factors: 'Warm dry spring promoting adult activity, proximity to overwintering sites (hedgerows, woodland), newly emerged crops at vulnerable seedling stage',
    economic_impact: 'Adult leaf feeding is mainly cosmetic. Larval damage to root nodules reduces nitrogen fixation by 10-30%, increasing fertiliser nitrogen requirements. Direct yield loss from larval feeding estimated at 5-10% in peas and beans.',
    images_description: 'Small grey-brown striped weevil beside U-shaped leaf notches on pea leaf margin',
  },
  {
    id: 'spotted-wing-drosophila',
    name: 'Spotted Wing Drosophila',
    common_names: ['SWD', 'Drosophila suzukii'],
    pest_type: 'pest',
    description: 'Invasive fruit fly (Drosophila suzukii) from East Asia, first detected in the UK in 2012. Unlike other Drosophila, females have a serrated ovipositor that cuts into healthy, ripening fruit to lay eggs. Larvae develop inside the fruit, causing soft rot and collapse.',
    lifecycle: 'Overwinters as adults in sheltered locations. Multiple generations per year (8-13 in UK conditions). Eggs laid inside ripening fruit. Larvae develop inside fruit in 3-13 days depending on temperature. Adults live 2-9 weeks. Rapid population build-up from late summer.',
    identification: 'Adults: small (2-3mm) fruit fly. Males have distinctive dark spot on each wing tip. Females have serrated ovipositor visible under magnification. Larvae: small white maggots inside fruit. Oviposition scars on fruit surface. Soft, sunken areas on ripe fruit.',
    crops_affected: ['strawberries', 'raspberries', 'blackberries', 'cherries', 'plums', 'grapes'],
    risk_factors: 'Late-season soft fruit, ripe fruit left unharvested, mild winters increasing overwintering survival, proximity to wild fruit hosts (bramble, elderberry)',
    economic_impact: 'Losses of 10-40% in unmanaged soft fruit crops in late season. Major threat to UK berry production. Monitoring with apple cider vinegar traps is standard. Chemical control limited by harvest intervals. Cold storage and hygiene reduce post-harvest losses.',
    images_description: 'Small fruit fly with spotted wing tips on ripe raspberry and larva inside fruit flesh',
  },
  {
    id: 'capsid-bugs',
    name: 'Common Green Capsid',
    common_names: ['Capsid bug', 'Lygocoris pabulinus'],
    pest_type: 'pest',
    description: 'Plant bug (Lygocoris pabulinus) that feeds on developing fruit, leaves, and shoot tips of many crops using piercing-sucking mouthparts. Feeding causes characteristic distorted growth, raised bumps (capsid dimples) on fruit, and tattered holes in leaves.',
    lifecycle: 'Eggs overwinter on woody hosts (currants, apples). Nymphs hatch in spring and feed on new growth. Adults (6mm) move to herbaceous hosts in summer. Return to woody hosts in autumn to lay overwintering eggs. One generation per year.',
    identification: 'Adults: bright green shield-shaped bugs (6mm). Nymphs: smaller, pale green, wingless. Damage: tattered holes in leaves, distorted shoot tips, raised bumps (dimples) on fruit surface, corky scarring. Damage appears well after the bug has moved on.',
    crops_affected: ['apples', 'pears', 'currants', 'potatoes', 'beans', 'lettuce'],
    risk_factors: 'Proximity to hedgerows and wild hosts, organic orchards, reduced spray programmes, warm springs accelerating nymph development',
    economic_impact: 'Fruit dimpling and distortion causes cosmetic rejection in apple and pear production. Yield loss typically 5-15% in affected orchards. Monitoring with sticky traps guides spray timing. Damage threshold is low for premium fresh fruit.',
    images_description: 'Bright green shield-shaped bug on apple fruitlet with dimpled fruit damage',
  },
  {
    id: 'apple-blossom-weevil',
    name: 'Apple Blossom Weevil',
    common_names: ['Anthonomus pomorum'],
    pest_type: 'pest',
    description: 'Small weevil (Anthonomus pomorum) whose larvae develop inside apple blossom buds, preventing them from opening. Female lays a single egg inside each bud; the larva feeds on the reproductive parts, creating a characteristic brown capped bud.',
    lifecycle: 'Adults overwinter in leaf litter and bark crevices. Emerge in spring at green cluster stage. Feed on buds by puncturing them. Female lays one egg per bud. Larva feeds inside the sealed bud for 2-3 weeks. New generation adults emerge in June.',
    identification: 'Adults: small (3.5-4.5mm) brown weevil with pale V-shaped mark on wing cases. Damaged buds fail to open — brown capped appearance. When capped bud is opened, a white C-shaped grub or pale brown pupa is found inside.',
    crops_affected: ['apples', 'pears'],
    risk_factors: 'Old orchards with established populations, mild winters favouring adult survival, heavy blossom years providing ample egg-laying sites, proximity to hedgerow and wild apple',
    economic_impact: 'In years with moderate blossom, loss of 10-30% of blossoms from weevil damage can reduce crop load. In heavy blossom years, some natural thinning from weevil may be tolerated. Chemical control at green cluster stage if populations high.',
    images_description: 'Small brown weevil with V-mark on wing cases and brown capped unopened apple bud',
  },
  {
    id: 'asparagus-beetle',
    name: 'Asparagus Beetle',
    common_names: ['Crioceris asparagi'],
    pest_type: 'pest',
    description: 'Leaf beetle (Crioceris asparagi) that feeds on asparagus spears and fern. Adults and larvae strip the bark and foliage, reducing photosynthetic capacity and weakening crowns for the following season. The primary insect pest of UK asparagus.',
    lifecycle: 'Adults overwinter in soil and plant debris. Emerge in April-May when asparagus spears appear. Eggs laid on spears and fern. Larvae feed gregariously on fern for 2-3 weeks, then pupate in soil. Two generations per year possible in warm seasons.',
    identification: 'Adults: distinctive 6-7mm beetle with red-orange body and black cross markings on wing cases. Eggs: dark, cylindrical, laid upright on stems. Larvae: grey-green, soft-bodied, with dark head. Damage: bark stripping on spears, defoliated fern.',
    crops_affected: ['asparagus'],
    risk_factors: 'Established asparagus beds, warm springs, proximity to wild asparagus, failure to destroy crop debris, prolonged fern standing',
    economic_impact: 'Spear damage causes marketability rejection. Fern damage reduces crown vigour and next season yield by 10-20%. Hand-picking effective in small plantings. Pyrethroid sprays applied to fern after harvest period ends.',
    images_description: 'Red-orange beetle with black cross markings on asparagus spear and defoliated fern',
  },
  {
    id: 'vine-weevil',
    name: 'Vine Weevil',
    common_names: ['Black vine weevil', 'Otiorhynchus sulcatus'],
    pest_type: 'pest',
    description: 'Weevil (Otiorhynchus sulcatus) whose larvae feed on roots of strawberries, container plants, and ornamentals. Adults feed on leaf margins at night, causing characteristic notching. Larvae are the more damaging stage, destroying root systems and killing plants.',
    lifecycle: 'All adults are female (parthenogenetic reproduction). Active April-October, feeding at night. Eggs laid in growing media near plant crowns. Larvae feed on roots from autumn through spring. Pupate in soil in spring. One generation per year.',
    identification: 'Adults: 9-12mm dull black weevil with fused wing cases (cannot fly). Active at night, hides in debris by day. Larvae: white C-shaped grubs (up to 10mm) with brown head, found in root zone. Leaf notching from adult feeding. Wilting plants from root destruction.',
    crops_affected: ['strawberries', 'ornamentals', 'soft fruit', 'container plants'],
    risk_factors: 'Container growing media, protected cropping, polytunnels, perennial plantings, peat-based substrates, previous infestations',
    economic_impact: 'Larval root feeding kills plants — losses of 10-50% in containerised production. Major pest of strawberry table-top systems. Biological control with Steinernema kraussei or Heterorhabditis nematodes is standard. Thiacloprid drench previously used.',
    images_description: 'Dull black weevil with fused wing cases and white C-shaped larva in root zone of strawberry',
  },
  {
    id: 'lily-beetle',
    name: 'Lily Beetle',
    common_names: ['Red lily beetle', 'Lilioceris lilii'],
    pest_type: 'pest',
    description: 'Bright red leaf beetle (Lilioceris lilii) that feeds on lilies and fritillaries. Both adults and larvae defoliate plants. Larvae cover themselves in excrement as a deterrent to predators. An invasive species that has spread across the UK since the 1990s.',
    lifecycle: 'Adults overwinter in soil and debris. Emerge in March-April. Eggs laid in rows on leaf undersurfaces. Larvae feed for 2-3 weeks, then pupate in soil. One to two generations per year. Adults long-lived.',
    identification: 'Adults: bright scarlet-red beetles (6-8mm) with black head and legs. Eggs: orange-red, laid in rows on leaf undersurface. Larvae: orange-red but covered in dark excrement giving a dirty appearance. Damage: large holes in leaves, skeletonised foliage.',
    crops_affected: ['lilies', 'fritillaries', 'ornamentals'],
    risk_factors: 'Established lily plantings, mild winters, garden and nursery settings, lack of natural enemies in the UK',
    economic_impact: 'Complete defoliation of lily crops in severe infestations. Major pest of commercial lily production and garden lilies. Hand-picking effective at low densities. Neem-based sprays and biological control (parasitoid Tetrastichus setifer) under research.',
    images_description: 'Bright scarlet-red beetle on lily leaf and excrement-covered larva on defoliated stem',
  },
  {
    id: 'rosemary-beetle',
    name: 'Rosemary Beetle',
    common_names: ['Chrysolina americana'],
    pest_type: 'pest',
    description: 'Leaf beetle (Chrysolina americana) that feeds on rosemary, lavender, sage, and thyme. Adults and larvae strip leaves and flowers. First recorded in the UK in 1994, now widespread across southern England. An increasing pest of herb production.',
    lifecycle: 'Adults active autumn to spring (unusual for a leaf beetle). Eggs laid on host plants in spring. Larvae feed on foliage and flowers. Pupate in soil in late spring. New adults appear in late summer, feed, then become dormant during hot summer weather.',
    identification: 'Adults: distinctive 8mm beetle with metallic green and purple stripes. Eggs: yellowish, laid singly on leaves. Larvae: grey-white with darker stripes. Damage: stripped leaves and flower buds on rosemary, lavender, and related herbs.',
    crops_affected: ['rosemary', 'lavender', 'sage', 'thyme'],
    risk_factors: 'Established herb plantings, southern England, mild winters, urban and garden settings',
    economic_impact: 'Causes significant damage to herb production and amenity plantings. Losses of 10-30% of harvestable product. Hand-picking is the main control. Pyrethroid sprays effective but limited by harvest intervals on edible herbs. Expanding range northward.',
    images_description: 'Metallic green and purple striped beetle on rosemary sprig with stripped foliage',
  },
  {
    id: 'box-tree-moth',
    name: 'Box Tree Moth',
    common_names: ['Cydalima perspectalis'],
    pest_type: 'pest',
    description: 'Invasive moth (Cydalima perspectalis) from East Asia whose caterpillars defoliate and kill box (Buxus) plants. First found in the UK in 2007, now widespread in southern England. Can completely defoliate hedges and topiary, often killing the plant.',
    lifecycle: 'Two to three generations per year in the UK. Adults are white moths with brown wing borders. Caterpillars feed inside webbing on box leaves and bark. Pupate in silken cocoons within the box plant. Overwinter as small caterpillars in webbing.',
    identification: 'Adults: white moths (40mm wingspan) with brown wing borders. Caterpillars: green with black head and black and white stripes, up to 40mm. Dense webbing and frass between leaves. Damage: total defoliation, bark stripping.',
    crops_affected: ['box', 'Buxus'],
    risk_factors: 'Southern England, imported box plants, established box hedging and topiary, warm summers allowing three generations, lack of natural enemies',
    economic_impact: 'Destruction of box hedging and topiary represents significant amenity and heritage value. No effective biological control established in the UK. Bacillus thuringiensis effective if applied when caterpillars small. Pheromone traps for monitoring.',
    images_description: 'Green caterpillar with black stripes in webbing on defoliated box hedge',
  },
  {
    id: 'oak-processionary-moth',
    name: 'Oak Processionary Moth',
    common_names: ['OPM', 'Thaumetopoea processionea'],
    pest_type: 'pest',
    description: 'Invasive moth (Thaumetopoea processionea) whose caterpillars defoliate oak trees and carry urticating hairs that cause skin rashes and respiratory problems in humans. A notifiable pest in the UK with statutory control in some areas.',
    lifecycle: 'One generation per year. Adults fly July-August. Eggs laid in flat plaques on oak twigs. Caterpillars hatch in spring, feed gregariously on oak leaves, forming processions and silk nests. Pupate in nests on tree trunks. Urticating hairs from third instar onwards.',
    identification: 'Caterpillars: grey with white tufts of urticating hairs, up to 30mm, feeding in head-to-tail processions on oak. White silk nests on oak trunks and branches. Adults: grey-brown moths rarely seen. Defoliated oak canopy.',
    crops_affected: ['oak trees'],
    risk_factors: 'London and south-east England (established zone), imported oak trees, warm summers, urban and amenity settings, public health risk from urticating hairs',
    economic_impact: 'Repeated defoliation weakens trees. Public health risk from urticating hairs (skin rash, eye irritation, respiratory distress) is the primary concern. Nest removal costs GBP 500-2000 per tree. Forestry Commission manages the statutory control programme.',
    images_description: 'Caterpillars in head-to-tail procession on oak branch with white silk nest on trunk',
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
  // ── Grassland Weeds ──────────────────────────────────────────────
  {
    id: 'rush',
    name: 'Soft Rush',
    common_names: ['Juncus effusus', 'Rush'],
    pest_type: 'weed',
    description: 'Perennial tussock-forming plant (Juncus effusus) that colonises wet, poorly drained grassland. Indicator of compaction, poor drainage, and low soil fertility. Dense rush growth reduces productive grass area and livestock carrying capacity.',
    lifecycle: 'Perennial tussock. Flowers June-August, producing enormous quantities of tiny seeds (up to 8500 per stem). Seeds viable in soil for 60+ years. Spreads by seed and by expansion of existing tussocks. Seeds germinate in bare, wet patches.',
    identification: 'Dense tussocks of smooth, dark green cylindrical stems (50-100cm). Stems soft and pithy when squeezed (distinguishes from hard rush J. inflexus which is ridged and tough). Brown flower clusters appear to emerge from side of stem. Livestock avoid rush.',
    crops_affected: ['grassland', 'silage', 'hay'],
    risk_factors: 'Poor drainage, soil compaction, low soil pH, overgrazing creating bare patches, wet field corners, heavy clay soils, neglected grassland',
    economic_impact: 'Reduces grazing area by 10-40% in heavily infested fields. Rush has no nutritional value for livestock. Indicator of larger drainage and management problems. Control requires combined drainage improvement, topping, and targeted herbicide application.',
    images_description: 'Dense dark green tussocks of soft cylindrical rush stems in wet grassland',
  },
  {
    id: 'creeping-buttercup',
    name: 'Creeping Buttercup',
    common_names: ['Ranunculus repens'],
    pest_type: 'weed',
    description: 'Perennial weed (Ranunculus repens) that spreads aggressively by creeping stolons across grassland surfaces. Glossy yellow flowers. Indicates compacted, wet, or overgrazed swards. Mildly toxic to livestock (contains ranunculin) but usually avoided in fresh grazing.',
    lifecycle: 'Perennial spreading by stolons that root at nodes. Flowers May-August. Also produces seed. Stoloniferous spread can colonise large areas rapidly. Tolerates close grazing and trampling. Favoured by wet, compacted conditions.',
    identification: 'Glossy bright yellow flowers (15-25mm) with 5 petals. Leaves divided into 3 lobed segments, often with pale blotches. Creeping stolons root at nodes, forming new plants. Distinguished from bulbous buttercup by stolons and habitat preference for wet ground.',
    crops_affected: ['grassland', 'silage', 'hay'],
    risk_factors: 'Wet compacted soils, overgrazing, poached gateways and tracks, poor drainage, low fertility, open sward allowing establishment',
    economic_impact: 'Reduces productive grass area by 10-30% in heavily infested swards. Toxic to livestock if consumed in quantity (rarely grazed when fresh). Reduces hay and silage quality. Control requires improved drainage and targeted herbicide.',
    images_description: 'Glossy yellow buttercup flowers with creeping stolons rooting across wet grassland',
  },
  {
    id: 'ragwort',
    name: 'Common Ragwort',
    common_names: ['Senecio jacobaea', 'Tansy ragwort'],
    pest_type: 'weed',
    description: 'Biennial or short-lived perennial weed (Senecio jacobaea) containing pyrrolizidine alkaloids that are toxic to horses and cattle, causing irreversible liver damage. Listed under the UK Weeds Act 1959 and Ragwort Control Act 2003. Most dangerous in hay and silage.',
    lifecycle: 'Biennial: rosette in year 1, flowering stem in year 2. Flowers July-October producing wind-dispersed pappus seeds. Also regenerates from root fragments after cutting. Seeds remain viable in soil for 15-20 years. Dies after seeding but root fragments persist.',
    identification: 'Flat rosette of deeply lobed dark green leaves in year 1. Erect flowering stems (30-100cm) with flat-topped clusters of bright yellow daisy-like flowers (15-25mm) in year 2. Distinctive deeply divided lower leaves. Strong unpleasant smell.',
    crops_affected: ['grassland', 'hay', 'silage', 'horse pastures'],
    risk_factors: 'Overgrazed or neglected pasture, horse paddocks, set-aside, road verges, railway embankments, bare patches in sward, sandy and well-drained soils',
    economic_impact: 'Toxic to horses and cattle — cumulative liver damage is irreversible and fatal. Most dangerous in conserved forage (hay, silage) where animals cannot avoid it. Statutory control obligations. Management costs significant on horse properties.',
    images_description: 'Bright yellow flat-topped flower clusters and deeply lobed leaves of ragwort in pasture',
  },
  {
    id: 'nettle',
    name: 'Common Nettle',
    common_names: ['Stinging nettle', 'Urtica dioica'],
    pest_type: 'weed',
    description: 'Perennial weed (Urtica dioica) with stinging hairs that colonises field margins, waste ground, and neglected grassland. Indicates high nitrogen and phosphorus levels. Spreads by rhizomes and seed. Livestock avoid nettle patches due to stinging hairs.',
    lifecycle: 'Perennial spreading by extensive yellow rhizome system. Shoots emerge in spring, grow to 50-150cm. Flowers June-September (wind-pollinated). Produces many seeds. Dies back to rhizomes in winter. Vigorous regeneration from rhizome fragments after cultivation.',
    identification: 'Erect stems with opposite pairs of toothed, pointed leaves covered in stinging hairs. Drooping greenish flower catkins in leaf axils. Stems square. Yellow rhizomes spread extensively underground. Strong nettle smell.',
    crops_affected: ['grassland', 'orchards', 'field margins'],
    risk_factors: 'High soil nitrogen and phosphorus, neglected pasture, field margins, woodland edges, damp fertile soils, areas where mowing is infrequent',
    economic_impact: 'Reduces grazing area in pastures. Livestock avoid nettle patches. Dense colonies expand from field margins into productive areas. Control requires repeated cutting or herbicide treatment of established colonies.',
    images_description: 'Dense nettle colony with toothed leaves and drooping flower catkins at field margin',
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

  // ── Additional Weeds (expansion) ──────────────────────────────
  {
    id: 'spear-thistle',
    name: 'Spear Thistle',
    common_names: ['Bull thistle', 'Cirsium vulgare'],
    pest_type: 'weed',
    description: 'Biennial weed (Cirsium vulgare) with spiny leaves and large purple flower heads. Listed under the UK Weeds Act 1959 along with creeping thistle. Forms a rosette in year one and flowers in year two. Produces wind-dispersed seed via pappus.',
    lifecycle: 'Biennial. Year 1: rosette of spiny leaves close to ground. Year 2: erect flowering stem (60-150cm) with large purple flower heads. Seeds dispersed by wind (pappus). Seeds viable in soil for 5-10 years. Dies after flowering but produces 5000-8000 seeds per plant.',
    identification: 'Large spiny rosette in year 1. In year 2, erect stems with spiny wings running down the stem (distinguishes from creeping thistle which lacks winged stems). Large purple flower heads (3-5cm) with spiny bracts. Leaves deeply lobed with sharp spines at tips.',
    crops_affected: ['grassland', 'hay', 'silage', 'set-aside', 'arable margins'],
    risk_factors: 'Overgrazed or neglected pasture, bare patches in sward, set-aside, arable reversion, road verges, recently cultivated land',
    economic_impact: 'Reduces productive grazing area. Weeds Act species — land occupiers must prevent spread. Spiny leaves reduce forage palatability. Produces large quantities of wind-dispersed seed. Control by cutting before flowering and spot-treating with herbicide.',
    images_description: 'Large purple flower head with spiny bracts on stem with spiny wings running down it',
  },
  {
    id: 'curled-dock',
    name: 'Curled Dock',
    common_names: ['Rumex crispus'],
    pest_type: 'weed',
    description: 'Perennial broadleaved weed (Rumex crispus) with distinctive narrow leaves with strongly wavy (crisped) margins. Deep tap root. Common in grassland and arable systems across the UK. Often co-occurs with broad-leaved dock. Weeds Act species.',
    lifecycle: 'Perennial with a deep tap root (up to 1m). Emerges from root crown in spring. Produces tall reddish-brown flowering spikes (50-100cm). Seeds long-lived (50+ years in soil). Root fragments regenerate. More tolerant of dry conditions than broad-leaved dock.',
    identification: 'Narrow lance-shaped leaves (up to 30cm long) with distinctive strongly wavy (crisped or curled) margins — distinguishing feature from broad-leaved dock. Reddish-brown flowering spike. Tap root thick and yellow when cut.',
    crops_affected: ['grassland', 'wheat', 'barley', 'oilseed rape', 'sugar beet'],
    risk_factors: 'Following grass ley, minimum tillage, light to medium soils, coastal areas, disturbed ground, organic systems',
    economic_impact: 'Similar to broad-leaved dock — reduces productive area, difficult to eradicate due to deep tap root. Weeds Act species. Glyphosate in stubble is the most effective control. Slightly more tolerant of dry conditions than R. obtusifolius.',
    images_description: 'Narrow leaves with strongly wavy curled margins and reddish-brown flowering spike',
  },
  {
    id: 'marsh-thistle',
    name: 'Marsh Thistle',
    common_names: ['Cirsium palustre'],
    pest_type: 'weed',
    description: 'Biennial weed (Cirsium palustre) of wet grassland and poorly drained fields. Tall, spiny plant with continuously winged stems. Small purple flower heads in clusters at the top. Indicator of poor drainage and waterlogging.',
    lifecycle: 'Biennial. Year 1: spiny rosette flat to the ground. Year 2: tall erect stem (60-150cm) with continuous spiny wings. Multiple small purple flower heads clustered at stem tips. Seeds pappus-dispersed. Dies after flowering.',
    identification: 'Tall, erect, with continuously spiny-winged stems from base to top. Leaves deeply lobed and very spiny. Small purple flower heads (10-15mm) in dense clusters at stem top. Distinguished from spear thistle by continuous stem wings and smaller, clustered flowers.',
    crops_affected: ['grassland', 'hay', 'silage'],
    risk_factors: 'Wet poorly drained grassland, marsh edges, ditch banks, neglected pasture, acidic soils, woodland clearings',
    economic_impact: 'Indicator of poor drainage — presence signals need for drainage improvement. Reduces grazing value of wet grassland. Less competitive than creeping or spear thistle. Control through drainage improvement, cutting, and targeted herbicide.',
    images_description: 'Tall spiny-winged stem with clusters of small purple flowers at top in wet grassland',
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

  // ── New Pest Symptoms ─────────────────────────────────────────

  // Grassland Diseases
  { pest_id: 'ryegrass-crown-rust', symptom: 'Bright orange uredinia (pustules) scattered on ryegrass leaf blades and sheaths', plant_part: 'leaves', timing: 'late summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'ryegrass-crown-rust', symptom: 'Yellowing and premature death of heavily infected leaves reducing sward quality', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'timothy-leaf-streak', symptom: 'Dark brown elongated streaks running parallel to leaf veins on timothy grass', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'timothy-leaf-streak', symptom: 'Extensive leaf browning from coalescing lesions in wet weather', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Horticultural Diseases
  { pest_id: 'lettuce-downy-mildew', symptom: 'Angular yellow patches on lettuce leaf upper surface with white downy sporulation beneath', plant_part: 'leaves', timing: 'spring and autumn', confidence: 'diagnostic' },
  { pest_id: 'lettuce-downy-mildew', symptom: 'Brown papery dead patches on outer wrapper leaves of lettuce head', plant_part: 'leaves', timing: 'at harvest', confidence: 'suggestive' },
  { pest_id: 'lettuce-downy-mildew', symptom: 'Stunted inner leaves from systemic infection in severe cases', plant_part: 'whole plant', timing: 'season-long', confidence: 'associated' },
  { pest_id: 'white-rot-onion', symptom: 'Fluffy white mycelium with tiny black sclerotia at onion bulb base', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'white-rot-onion', symptom: 'Yellowing and wilting of outer leaves from tip downward', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'white-rot-onion', symptom: 'Plants easily pulled from soil due to destroyed root system', plant_part: 'roots', timing: 'summer', confidence: 'associated' },
  { pest_id: 'brassica-ring-spot', symptom: 'Round grey-brown spots with concentric rings on brassica outer leaves', plant_part: 'leaves', timing: 'autumn to winter', confidence: 'diagnostic' },
  { pest_id: 'brassica-ring-spot', symptom: 'Black pseudothecia visible within old lesions under magnification', plant_part: 'leaves', timing: 'winter', confidence: 'suggestive' },
  { pest_id: 'white-blister', symptom: 'White raised blisters on brassica leaf undersurface bursting to release chalky-white spores', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'white-blister', symptom: 'Distorted thickened stems and flowers (stagheads) from systemic infection', plant_part: 'stems', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'botrytis-grey-mould', symptom: 'Grey fuzzy sporulating mould on soft rotting plant tissue', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'botrytis-grey-mould', symptom: 'Soft watery brown rot beneath grey mould on fruit and stems', plant_part: 'fruit', timing: 'summer to autumn', confidence: 'suggestive' },
  { pest_id: 'botrytis-grey-mould', symptom: 'Hard black sclerotia on mummified fruit and dead tissue', plant_part: 'fruit', timing: 'autumn to winter', confidence: 'associated' },

  // Fruit Diseases
  { pest_id: 'apple-scab', symptom: 'Olive-brown velvety lesions on apple leaf upper surface and fruit', plant_part: 'leaves and fruit', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'apple-scab', symptom: 'Dark scabby cracking patches on expanding fruit', plant_part: 'fruit', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'apple-scab', symptom: 'Premature defoliation from severe leaf infections', plant_part: 'leaves', timing: 'summer', confidence: 'associated' },
  { pest_id: 'fire-blight', symptom: 'Blossoms and shoots wilting and turning black as if fire-scorched with shepherds crook shoot tips', plant_part: 'shoots', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'fire-blight', symptom: 'Milky bacterial ooze droplets on infected tissue in humid conditions', plant_part: 'shoots', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'fire-blight', symptom: 'Dark sunken bark cankers with amber-coloured ooze at branch junctions', plant_part: 'branches', timing: 'year-round', confidence: 'associated' },
  { pest_id: 'brown-rot', symptom: 'Expanding brown soft rot with concentric rings of buff spore cushions on fruit', plant_part: 'fruit', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'brown-rot', symptom: 'Mummified hard black shrivelled fruit persisting on tree over winter', plant_part: 'fruit', timing: 'winter', confidence: 'suggestive' },
  { pest_id: 'canker', symptom: 'Sunken cracked bark flaking in concentric rings around infection point on apple branch', plant_part: 'branches', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'canker', symptom: 'Red or white sporodochia on canker margins and branch dieback above girdling canker', plant_part: 'branches', timing: 'autumn to spring', confidence: 'suggestive' },
  { pest_id: 'canker', symptom: 'Brown eye rot at calyx end of fruit at harvest or in storage', plant_part: 'fruit', timing: 'harvest', confidence: 'associated' },
  { pest_id: 'vine-downy-mildew', symptom: 'Yellow oily spots on vine leaf upper surface with white downy sporulation beneath', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'vine-downy-mildew', symptom: 'Grey-brown leather berries from infected grape clusters', plant_part: 'fruit', timing: 'summer', confidence: 'suggestive' },

  // Soil-borne Diseases
  { pest_id: 'pythium', symptom: 'Seedlings collapsed at soil level with water-soaked constricted stem (wire-stem)', plant_part: 'seedlings', timing: 'at emergence', confidence: 'diagnostic' },
  { pest_id: 'pythium', symptom: 'Patchy emergence with seeds rotting in cold wet soil', plant_part: 'seeds', timing: 'at germination', confidence: 'suggestive' },
  { pest_id: 'rhizoctonia', symptom: 'Black sclerotia (black scurf) on potato tuber surface or brown stem canker at ground level', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'rhizoctonia', symptom: 'Brown rotting of lower lettuce leaves at soil contact (bottom rot)', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'fusarium-wilt', symptom: 'Progressive one-sided wilting with brown vascular discolouration in stem cross-section', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'fusarium-wilt', symptom: 'Yellowing following vein pattern despite adequate soil moisture', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'verticillium-wilt', symptom: 'Lower leaf yellowing and wilting with brown vascular staining in stem cross-section', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'verticillium-wilt', symptom: 'Stunted growth with reduced fruit set and upward-curling leaf margins', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'strawberry-grey-mould', symptom: 'Soft brown rot on strawberry fruit rapidly covered with grey fuzzy Botrytis mould', plant_part: 'fruit', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'strawberry-grey-mould', symptom: 'Brown wilted flower petals with latent infection developing on green fruit', plant_part: 'flowers', timing: 'spring', confidence: 'suggestive' },

  // Grassland Pests
  { pest_id: 'frit-fly', symptom: 'Deadheart tillers in newly reseeded grass — central shoot yellows and pulls out easily', plant_part: 'stems', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'frit-fly', symptom: 'White legless maggots (4mm) inside base of affected grass tillers', plant_part: 'stems', timing: 'autumn to spring', confidence: 'suggestive' },
  { pest_id: 'grass-weevil', symptom: 'Characteristic U-shaped notches on clover and legume leaf margins from adult feeding', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'grass-weevil', symptom: 'Reduced clover vigour from larval damage to root nodules', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'stem-nematode', symptom: 'Swollen distorted stems and petioles of clover (clover sickness)', plant_part: 'stems', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'stem-nematode', symptom: 'Thinning and death of clover within established grass sward', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'rabbits', symptom: 'Close-cropped grazing damage extending from field margins and hedgerows', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'rabbits', symptom: 'Round pellet droppings in clusters and excavated burrow entrances at field margins', plant_part: 'soil surface', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'moles', symptom: 'Cone-shaped soil mound molehills in grassland and arable fields', plant_part: 'soil surface', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'moles', symptom: 'Surface tunnel ridges visible in soft soil with wilting plants above', plant_part: 'roots', timing: 'spring to autumn', confidence: 'suggestive' },

  // Horticultural Pests
  { pest_id: 'carrot-fly', symptom: 'Rusty-brown tunnels and mining damage on carrot root surface', plant_part: 'roots', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'carrot-fly', symptom: 'Foliage yellowing and wilting from root damage with secondary soft rot', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'carrot-fly', symptom: 'Creamy-white legless maggots in root surface when roots washed', plant_part: 'roots', timing: 'summer to autumn', confidence: 'suggestive' },
  { pest_id: 'cabbage-root-fly', symptom: 'Wilting brassica transplants that rock easily in soil from destroyed root system', plant_part: 'whole plant', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'cabbage-root-fly', symptom: 'White legless maggots (up to 8mm) on root surface when plant pulled and washed', plant_part: 'roots', timing: 'May to September', confidence: 'suggestive' },
  { pest_id: 'cabbage-white', symptom: 'Gregarious yellow-green caterpillars with black spots defoliating brassica leaves', plant_part: 'leaves', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'cabbage-white', symptom: 'Skeletonised leaves with only veins remaining in severe infestations', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'diamond-back-moth', symptom: 'Small bright green caterpillars that wriggle backwards when disturbed on brassica undersurface', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'diamond-back-moth', symptom: 'Windowpane feeding damage on leaf undersurface leaving upper epidermis intact', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'onion-fly', symptom: 'White legless maggots mining into onion bulb base causing soft rot', plant_part: 'roots', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'onion-fly', symptom: 'Yellowing and wilting of onion leaves from first-generation attack on establishing crop', plant_part: 'leaves', timing: 'June', confidence: 'suggestive' },
  { pest_id: 'beet-leaf-miner', symptom: 'Large pale blister-like mines between upper and lower sugar beet leaf surfaces', plant_part: 'leaves', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'beet-leaf-miner', symptom: 'Pale green-white maggots visible inside leaf when held to light', plant_part: 'leaves', timing: 'May to September', confidence: 'suggestive' },
  { pest_id: 'cutworms', symptom: 'Seedling stems severed at ground level with plants lying on soil surface', plant_part: 'stems', timing: 'July to September', confidence: 'diagnostic' },
  { pest_id: 'cutworms', symptom: 'Grey-brown C-shaped caterpillars found in soil near damaged plants when dug', plant_part: 'soil surface', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'red-spider-mite', symptom: 'Fine silk webbing on leaf undersurface with pale stippling on upper surface', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'red-spider-mite', symptom: 'Leaf bronzing and death in hot dry conditions from heavy infestations', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'whitefly', symptom: 'Clouds of tiny white-winged flies rising from leaf undersurface when plants disturbed', plant_part: 'leaves', timing: 'year-round in glasshouse', confidence: 'diagnostic' },
  { pest_id: 'whitefly', symptom: 'Honeydew deposits and sooty mould on lower leaves from feeding above', plant_part: 'leaves', timing: 'year-round in glasshouse', confidence: 'suggestive' },
  { pest_id: 'thrips', symptom: 'Silvery feeding scars on leaves and flower petals from rasping mouthparts', plant_part: 'leaves and flowers', timing: 'year-round in protected crops', confidence: 'diagnostic' },
  { pest_id: 'thrips', symptom: 'Distorted flowers and scarred fruit with black frass spots on leaves', plant_part: 'flowers and fruit', timing: 'summer', confidence: 'suggestive' },

  // Stored Grain Pests
  { pest_id: 'grain-weevil', symptom: 'Circular exit holes in stored grain kernels with dusty residue', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'grain-weevil', symptom: 'Warm damp spots in grain bulk (hotspots) from insect metabolic activity', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'saw-toothed-grain-beetle', symptom: 'Small flat brown beetles with saw-toothed thorax active among stored grain', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'saw-toothed-grain-beetle', symptom: 'Grain dust accumulation and musty smell indicating poor storage conditions', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'rust-red-flour-beetle', symptom: 'Small reddish-brown beetles in flour and grain dust with quinone taint odour', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'rust-red-flour-beetle', symptom: 'Off-flavour and pungent smell in flour products from quinone secretions', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'indian-meal-moth', symptom: 'Silken webbing on grain surface and in storage crevices from larval activity', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'indian-meal-moth', symptom: 'Small moths with distinctive two-toned wings (pale inner, reddish outer) in store', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'grain-mite', symptom: 'Dusty moving grain surface and sweet musty smell from mite populations', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'grain-mite', symptom: 'Brown mite frass dust on grain surface in damp (>14% MC) grain', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'confused-flour-beetle', symptom: 'Reddish-brown beetles with gradually expanding antennae in flour deposits', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'confused-flour-beetle', symptom: 'Quinone contamination and off-flavour in stored flour products', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'lesser-grain-borer', symptom: 'Copious flour dust from boring activity and circular bore holes in whole grain', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'lesser-grain-borer', symptom: 'Characteristic hooded dark brown cylindrical beetles in grain bulk', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },
  { pest_id: 'warehouse-moth', symptom: 'Dense webbing and grey-white caterpillars on grain surface and store walls', plant_part: 'grain', timing: 'in storage', confidence: 'diagnostic' },
  { pest_id: 'warehouse-moth', symptom: 'Grey-brown moths with faint cross-bands on wings in storage areas', plant_part: 'grain', timing: 'in storage', confidence: 'suggestive' },

  // Fruit Pests
  { pest_id: 'codling-moth', symptom: 'Entry hole in apple with reddish-brown frass at surface and larva inside core', plant_part: 'fruit', timing: 'July to September', confidence: 'diagnostic' },
  { pest_id: 'codling-moth', symptom: 'Pink-white caterpillars (up to 20mm) with brown head found in fruit core when cut open', plant_part: 'fruit', timing: 'July to September', confidence: 'suggestive' },
  { pest_id: 'apple-aphid', symptom: 'Severe leaf curling on apple fruit-bearing spurs with pinkish-grey aphids inside', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'apple-aphid', symptom: 'Distorted bumpy misshapen fruitlets from early-season feeding damage', plant_part: 'fruit', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'raspberry-beetle', symptom: 'Pale yellow-brown grubs (up to 8mm) inside raspberry fruit around the plug', plant_part: 'fruit', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'raspberry-beetle', symptom: 'Small pale brown hairy beetles feeding on raspberry flowers', plant_part: 'flowers', timing: 'June', confidence: 'suggestive' },
  { pest_id: 'plum-moth', symptom: 'Pink-red caterpillar and frass-filled cavity in plum flesh around the stone', plant_part: 'fruit', timing: 'July to August', confidence: 'diagnostic' },
  { pest_id: 'plum-moth', symptom: 'Fruit with exit hole and premature fruit drop', plant_part: 'fruit', timing: 'August', confidence: 'suggestive' },

  // Additional Oilseed/Pulse Pests
  { pest_id: 'pea-aphid', symptom: 'Large (4-5mm) bright green aphids on pea growing tips and developing pods', plant_part: 'whole plant', timing: 'June to August', confidence: 'diagnostic' },
  { pest_id: 'pea-aphid', symptom: 'Honeydew deposits and associated sooty mould on pea pods and leaves', plant_part: 'pods', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'bruchid-beetle', symptom: 'Circular exit holes (3mm) in harvested bean seeds from emerging adult beetles', plant_part: 'grain', timing: 'harvest and storage', confidence: 'diagnostic' },
  { pest_id: 'bruchid-beetle', symptom: 'Small brown-grey beetles with white-spotted wing cases on bean flowers', plant_part: 'flowers', timing: 'June to July', confidence: 'suggestive' },
  { pest_id: 'cabbage-aphid', symptom: 'Dense grey-blue mealy aphid colonies covered in waxy bloom on brassica leaves', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'cabbage-aphid', symptom: 'Severe leaf curling and contamination of Brussels sprout buttons with aphid colonies', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'suggestive' },
  { pest_id: 'brassica-pod-midge', symptom: 'Premature yellowing pods with white-orange midge larvae inside when opened', plant_part: 'pods', timing: 'June to July', confidence: 'diagnostic' },
  { pest_id: 'brassica-pod-midge', symptom: 'Pods splitting prematurely and shedding seed before rest of crop is ready', plant_part: 'pods', timing: 'July', confidence: 'suggestive' },
  { pest_id: 'turnip-sawfly', symptom: 'Dark grey-black sawfly larvae rapidly defoliating brassica plants from leaf margins inward', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'turnip-sawfly', symptom: 'Plants stripped to bare stems and veins within 2-3 days of infestation', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Soil-borne Pests
  { pest_id: 'free-living-nematodes', symptom: 'Brown root lesions with shortened discoloured root system and patchy stunted growth', plant_part: 'roots', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'free-living-nematodes', symptom: 'General crop decline and poor establishment not explained by other causes', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'springtails', symptom: 'Tiny white jumping arthropods around germinating seeds and in soil crevices', plant_part: 'seeds', timing: 'at germination', confidence: 'diagnostic' },
  { pest_id: 'springtails', symptom: 'Small holes in germinating seeds and young root tips in high organic matter soil', plant_part: 'seeds', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'millipedes', symptom: 'Pale cream millipede with pink spots coiled in slug holes on potato tubers', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'millipedes', symptom: 'Enlarged bore holes on tubers and germinating seeds following initial slug damage', plant_part: 'tubers', timing: 'autumn', confidence: 'suggestive' },

  // Grassland Weeds
  { pest_id: 'rush', symptom: 'Dense dark green tussocks of smooth cylindrical stems in wet poorly drained grassland', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'rush', symptom: 'Brown flower clusters appearing to emerge from side of stem in summer', plant_part: 'flowers', timing: 'June to August', confidence: 'suggestive' },
  { pest_id: 'creeping-buttercup', symptom: 'Glossy bright yellow 5-petalled flowers with creeping stolons rooting at nodes', plant_part: 'whole plant', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'creeping-buttercup', symptom: 'Dense patches replacing productive grass in wet compacted areas', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'ragwort', symptom: 'Flat-topped clusters of bright yellow daisy-like flowers on erect stems with deeply lobed leaves', plant_part: 'whole plant', timing: 'July to October', confidence: 'diagnostic' },
  { pest_id: 'ragwort', symptom: 'Dark green rosettes of deeply lobed leaves in pasture during first year of growth', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'ragwort', symptom: 'Livestock liver damage and poor condition from cumulative pyrrolizidine alkaloid poisoning', plant_part: 'whole plant', timing: 'ongoing', confidence: 'associated' },
  { pest_id: 'nettle', symptom: 'Dense colony of erect stems with toothed stinging leaves and drooping flower catkins', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'nettle', symptom: 'Expanding patches from field margins reducing productive grazing area', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'suggestive' },

  // ── Expansion Pest Symptoms ────────────────────────────────────

  // Symphylids
  { pest_id: 'symphylids', symptom: 'Small (6-8mm) white fast-moving arthropods with 12 leg pairs in root zone when soil carefully examined', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'symphylids', symptom: 'Stunted root system with feeding scars on fine root tips', plant_part: 'roots', timing: 'spring to autumn', confidence: 'suggestive' },
  { pest_id: 'symphylids', symptom: 'Patchy poor crop establishment not explained by other pests or disease', plant_part: 'whole plant', timing: 'spring', confidence: 'associated' },

  // Pea Weevil
  { pest_id: 'pea-weevil', symptom: 'U-shaped notches on leaf margins of peas and beans from adult weevil feeding', plant_part: 'leaves', timing: 'April to June', confidence: 'diagnostic' },
  { pest_id: 'pea-weevil', symptom: 'Small grey-brown weevils on foliage feigning death when disturbed', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'pea-weevil', symptom: 'Reduced plant vigour from larval damage to nitrogen-fixing root nodules', plant_part: 'roots', timing: 'summer', confidence: 'associated' },

  // Spotted Wing Drosophila
  { pest_id: 'spotted-wing-drosophila', symptom: 'Small white maggots inside ripe or ripening soft fruit when cut open', plant_part: 'fruit', timing: 'July to October', confidence: 'diagnostic' },
  { pest_id: 'spotted-wing-drosophila', symptom: 'Soft sunken areas on ripe fruit with tiny oviposition puncture scars', plant_part: 'fruit', timing: 'summer to autumn', confidence: 'suggestive' },
  { pest_id: 'spotted-wing-drosophila', symptom: 'Fruit collapse and secondary fungal rot developing around oviposition wounds', plant_part: 'fruit', timing: 'late summer', confidence: 'associated' },

  // Capsid Bugs
  { pest_id: 'capsid-bugs', symptom: 'Raised bumps (capsid dimples) on developing apple and pear fruit from feeding punctures', plant_part: 'fruit', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'capsid-bugs', symptom: 'Tattered holes in young leaves and distorted shoot tips from piercing-sucking feeding', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },

  // Apple Blossom Weevil
  { pest_id: 'apple-blossom-weevil', symptom: 'Brown capped apple buds that fail to open — bud sealed shut with larva or pupa inside', plant_part: 'buds', timing: 'April to May', confidence: 'diagnostic' },
  { pest_id: 'apple-blossom-weevil', symptom: 'Small brown weevil with pale V-mark on wing cases on blossom trusses at green cluster', plant_part: 'buds', timing: 'March to April', confidence: 'suggestive' },

  // Asparagus Beetle
  { pest_id: 'asparagus-beetle', symptom: 'Distinctive red-orange beetles with black cross markings feeding on asparagus spears and fern', plant_part: 'stems', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'asparagus-beetle', symptom: 'Bark stripping on spears and defoliated brown fern later in season', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Vine Weevil
  { pest_id: 'vine-weevil', symptom: 'White C-shaped grubs (up to 10mm) with brown head in root zone of wilting plants', plant_part: 'roots', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'vine-weevil', symptom: 'Characteristic notching of leaf margins from nocturnal adult feeding', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'suggestive' },
  { pest_id: 'vine-weevil', symptom: 'Sudden plant collapse from root destruction especially in container-grown strawberries', plant_part: 'whole plant', timing: 'winter to spring', confidence: 'associated' },

  // Lily Beetle
  { pest_id: 'lily-beetle', symptom: 'Bright scarlet-red beetles (6-8mm) with black head and legs on lily foliage', plant_part: 'leaves', timing: 'April to August', confidence: 'diagnostic' },
  { pest_id: 'lily-beetle', symptom: 'Excrement-covered larvae and large irregular holes in lily and fritillary leaves', plant_part: 'leaves', timing: 'May to July', confidence: 'suggestive' },

  // Rosemary Beetle
  { pest_id: 'rosemary-beetle', symptom: 'Metallic green and purple striped beetles (8mm) on rosemary and lavender foliage', plant_part: 'leaves', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'rosemary-beetle', symptom: 'Stripped leaves and flower buds with grey-white striped larvae on herb plants', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },

  // Box Tree Moth
  { pest_id: 'box-tree-moth', symptom: 'Dense webbing and frass among box leaves with green caterpillars with black and white stripes inside', plant_part: 'leaves', timing: 'April to October', confidence: 'diagnostic' },
  { pest_id: 'box-tree-moth', symptom: 'Complete defoliation and bark stripping of box plants with brown skeletal remains', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'box-tree-moth', symptom: 'White moths with brown wing borders flying near box hedging at dusk', plant_part: 'whole plant', timing: 'June to September', confidence: 'associated' },

  // Oak Processionary Moth
  { pest_id: 'oak-processionary-moth', symptom: 'Grey caterpillars with white urticating hairs moving in head-to-tail procession on oak branches', plant_part: 'leaves', timing: 'April to June', confidence: 'diagnostic' },
  { pest_id: 'oak-processionary-moth', symptom: 'White silk nests on oak trunks and branches containing pupae or larval skins', plant_part: 'branches', timing: 'May to August', confidence: 'suggestive' },
  { pest_id: 'oak-processionary-moth', symptom: 'Defoliated oak canopy and skin rash or respiratory irritation in people nearby', plant_part: 'leaves', timing: 'spring to summer', confidence: 'associated' },

  // Spear Thistle
  { pest_id: 'spear-thistle', symptom: 'Large purple flower heads with spiny bracts on stems with continuous spiny wings', plant_part: 'whole plant', timing: 'July to September', confidence: 'diagnostic' },
  { pest_id: 'spear-thistle', symptom: 'Flat spiny rosette in first year of growth occupying bare patches in sward', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Curled Dock
  { pest_id: 'curled-dock', symptom: 'Narrow lance-shaped leaves with strongly wavy curled margins and reddish-brown flowering spike', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'curled-dock', symptom: 'Thick yellow tap root visible when plant pulled from soil', plant_part: 'roots', timing: 'year-round', confidence: 'suggestive' },

  // Marsh Thistle
  { pest_id: 'marsh-thistle', symptom: 'Tall erect stems with continuous spiny wings and clusters of small purple flowers at top in wet grassland', plant_part: 'whole plant', timing: 'June to September', confidence: 'diagnostic' },
  { pest_id: 'marsh-thistle', symptom: 'Flat spiny rosette in wet poorly drained areas of grassland', plant_part: 'leaves', timing: 'year one', confidence: 'suggestive' },
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

  // ── Expansion Pest Treatments ──────────────────────────────────

  // Symphylids
  { pest_id: 'symphylids', approach: 'cultural', treatment: 'Soil flooding and cultivation', active_substance: null, timing: 'Pre-planting', dose_rate: null, efficacy_notes: 'Flooding soil for 2-3 weeks reduces populations. Repeated cultivation exposes symphylids to desiccation and predation. Remove crop debris. Soil compaction reduces habitat.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'symphylids', approach: 'biological', treatment: 'Entomopathogenic nematodes', active_substance: 'Steinernema feltiae', timing: 'When soil temperatures above 10C and symphylids detected', dose_rate: 'See product label', efficacy_notes: 'Steinernema feltiae nematodes applied as soil drench can reduce populations. Soil must be moist. Most effective in glasshouse conditions. Repeat applications may be needed.', resistance_risk: null, approval_status: 'approved', source: 'AHDB' },

  // Pea Weevil
  { pest_id: 'pea-weevil', approach: 'chemical', treatment: 'Pyrethroid spray on emerging pea and bean crops', active_substance: 'lambda-cyhalothrin', timing: 'When leaf notching detected on newly emerged seedlings', dose_rate: 'See product label', efficacy_notes: 'Treat when leaf notching visible on seedlings if population is high. Threshold not well defined — most crops tolerate significant leaf notching without yield loss. Target spring migration of adults.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'pea-weevil', approach: 'cultural', treatment: 'Crop vigour and field margins for natural enemies', active_substance: null, timing: 'Season-long', dose_rate: null, efficacy_notes: 'Rapid crop establishment outgrows leaf notching damage. Maintain field margins to support parasitoid wasps. Larval damage to root nodules is the main yield impact but cannot be controlled directly.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Spotted Wing Drosophila
  { pest_id: 'spotted-wing-drosophila', approach: 'chemical', treatment: 'Spinosad spray during fruiting', active_substance: 'spinosad', timing: 'When SWD detected in monitoring traps and fruit is ripening', dose_rate: 'See product label', efficacy_notes: 'Spinosad is effective and has short harvest interval. Apply when monitoring traps confirm SWD presence. Repeat at 7-day intervals during harvest. Alternate with other actives to manage resistance.', resistance_risk: 'Spinosad resistance reported in some European populations.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'spotted-wing-drosophila', approach: 'cultural', treatment: 'Hygiene, exclusion netting, and cold chain', active_substance: null, timing: 'Season-long', dose_rate: null, efficacy_notes: 'Remove overripe and damaged fruit promptly. Insect-proof netting over tunnels. Rapid cooling of harvested fruit to 2C. Short pick-to-cool times. Monitor with apple cider vinegar traps. Destroy wild bramble near production.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Capsid Bugs
  { pest_id: 'capsid-bugs', approach: 'chemical', treatment: 'Pyrethroid spray at petal fall', active_substance: 'lambda-cyhalothrin', timing: 'At petal fall targeting nymphs before they cause fruit damage', dose_rate: 'See product label', efficacy_notes: 'Spray at petal fall when nymphs are exposed on fruit clusters. Later sprays less effective as capsids are mobile. Check petal fall timing for each variety. Avoid disrupting biological control.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'capsid-bugs', approach: 'cultural', treatment: 'Orchard hygiene and weed management', active_substance: null, timing: 'Winter to spring', dose_rate: null, efficacy_notes: 'Remove weedy hosts beneath trees (capsids use weeds as intermediate hosts). Prune to open canopy. Monitor with sticky traps from bud burst. Fruit dimpling threshold varies — fresh market less tolerant than processing.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Apple Blossom Weevil
  { pest_id: 'apple-blossom-weevil', approach: 'chemical', treatment: 'Pyrethroid spray at green cluster', active_substance: 'lambda-cyhalothrin', timing: 'Green cluster stage when adults detected on blossom trusses', dose_rate: 'See product label', efficacy_notes: 'Apply at green cluster before egg-laying. Once eggs are laid inside buds, chemical control is ineffective. Tap branches over a white tray — threshold approximately 10 weevils per 100 trusses.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'apple-blossom-weevil', approach: 'cultural', treatment: 'Monitoring and tolerance in heavy blossom years', active_substance: null, timing: 'Spring', dose_rate: null, efficacy_notes: 'In heavy blossom years, some weevil damage provides natural thinning. Only treat if crop load is expected to be light. Tap branches over a white tray to assess adult numbers at green cluster.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Asparagus Beetle
  { pest_id: 'asparagus-beetle', approach: 'chemical', treatment: 'Pyrethroid spray on fern after harvest', active_substance: 'deltamethrin', timing: 'After harvest when adults and larvae on fern', dose_rate: 'See product label', efficacy_notes: 'Apply to fern after the harvest cutting period ends. Do not spray during the harvest period. Target adult beetles and larvae on fern. Repeat if re-infestation occurs.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'asparagus-beetle', approach: 'cultural', treatment: 'Crop debris removal and hand-picking', active_substance: null, timing: 'Autumn and spring', dose_rate: null, efficacy_notes: 'Destroy crop debris in autumn to remove overwintering sites. Hand-pick beetles and larvae from spears during harvest in small plantings. Remove dead fern in winter.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Vine Weevil
  { pest_id: 'vine-weevil', approach: 'biological', treatment: 'Entomopathogenic nematodes against larvae', active_substance: 'Steinernema kraussei or Heterorhabditis megidis', timing: 'Autumn or spring when soil temperature above 5C (S. kraussei) or 12C (H. megidis)', dose_rate: 'See product label', efficacy_notes: 'Apply nematodes as drench to growing media targeting larvae. S. kraussei effective at lower soil temperatures. H. megidis for warmer conditions. Keep media moist after application. Standard IPM approach in containerised production.', resistance_risk: null, approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'vine-weevil', approach: 'cultural', treatment: 'Hygiene and physical barriers', active_substance: null, timing: 'Year-round', dose_rate: null, efficacy_notes: 'Inspect root balls of bought-in plants. Use clean growing media. Sticky barriers on pot rims or bench legs trap flightless adults. Remove daytime hiding places (mulch, debris). Night-time inspection with torch to find adults.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Lily Beetle
  { pest_id: 'lily-beetle', approach: 'chemical', treatment: 'Contact insecticide on adults and larvae', active_substance: 'deltamethrin', timing: 'When adults or larvae seen on lily foliage', dose_rate: 'See product label', efficacy_notes: 'Apply when beetles first seen in spring. Repeat when larvae appear. Hand-picking is effective at low populations. Adults drop to ground when disturbed — hold a container beneath when hand-picking.', resistance_risk: 'Low.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'lily-beetle', approach: 'cultural', treatment: 'Hand-picking and crop inspection', active_substance: null, timing: 'Spring to summer', dose_rate: null, efficacy_notes: 'Regular inspection from March onwards. Hand-pick adults and squash egg batches on leaf undersurfaces. Remove excrement-covered larvae. Adults drop to ground when disturbed — approach carefully.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Rosemary Beetle
  { pest_id: 'rosemary-beetle', approach: 'cultural', treatment: 'Hand-picking and shaking onto newspaper', active_substance: null, timing: 'Autumn to spring when adults active', dose_rate: null, efficacy_notes: 'Shake plants over light-coloured cloth or newspaper to dislodge beetles. Hand-pick adults and larvae. Most active in autumn and early spring. Limited approved chemical options on edible herbs.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Box Tree Moth
  { pest_id: 'box-tree-moth', approach: 'biological', treatment: 'Bacillus thuringiensis spray on caterpillars', active_substance: 'Bacillus thuringiensis var. kurstaki', timing: 'When small caterpillars detected in webbing', dose_rate: 'See product label', efficacy_notes: 'Apply Bt when caterpillars are small (under 20mm) for best efficacy. Thorough coverage inside dense box hedging is essential. Repeat at 7-14 day intervals. Most effective when combined with pheromone trap monitoring.', resistance_risk: 'Low.', approval_status: 'approved', source: 'RHS' },
  { pest_id: 'box-tree-moth', approach: 'cultural', treatment: 'Pheromone trapping and physical removal', active_substance: null, timing: 'March to October', dose_rate: null, efficacy_notes: 'Pheromone traps detect adult moth flight periods — time treatments accordingly. Hand-pick caterpillars. Prune out heavily infested sections. Inspect new box plants before introducing to gardens.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Oak Processionary Moth
  { pest_id: 'oak-processionary-moth', approach: 'biological', treatment: 'Bacillus thuringiensis spray by licensed contractors', active_substance: 'Bacillus thuringiensis var. kurstaki', timing: 'When young caterpillars first detected (April-May), before urticating hairs develop', dose_rate: 'As directed by Forestry Commission', efficacy_notes: 'Bt most effective on young caterpillars before third instar. Professional application required due to public health risk from urticating hairs. Nest removal by licensed operatives wearing PPE.', resistance_risk: null, approval_status: 'approved', source: 'Forestry Commission' },
  { pest_id: 'oak-processionary-moth', approach: 'cultural', treatment: 'Nest removal and statutory reporting', active_substance: null, timing: 'Year-round — nests remain hazardous even when old', dose_rate: null, efficacy_notes: 'Report sightings to Forestry Commission via TreeAlert. Do not touch nests or caterpillars — urticating hairs cause skin rash and respiratory distress. Professional nest removal required. Old nests remain hazardous for years.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Spear Thistle
  { pest_id: 'spear-thistle', approach: 'chemical', treatment: 'MCPA or 2,4-D in grassland or clopyralid in cereals', active_substance: 'MCPA or 2,4-D', timing: 'Rosette stage in spring before stem elongation', dose_rate: 'See product label', efficacy_notes: 'Apply to rosettes in spring when actively growing. Cut flowering stems before seed set if herbicide missed. Spot treatment effective for scattered plants. Repeat treatment needed as seed bank replenishes.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'spear-thistle', approach: 'cultural', treatment: 'Cutting before flowering and improved sward management', active_substance: null, timing: 'Before flowering (June-July)', dose_rate: null, efficacy_notes: 'Cut before seed set to prevent seed bank replenishment. Biennial — will not regenerate from cut root like creeping thistle. Improve sward density through reseeding and drainage to prevent establishment in bare patches.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Curled Dock
  { pest_id: 'curled-dock', approach: 'chemical', treatment: 'Glyphosate spot treatment or clopyralid in cereals', active_substance: 'glyphosate (spot) or clopyralid (in-crop)', timing: 'Stubble period (glyphosate) or spring in cereals (clopyralid)', dose_rate: 'See product label', efficacy_notes: 'Same management as broad-leaved dock. Glyphosate spot treatment in stubble is most effective. Clopyralid in cereals provides suppression. Deep tap root requires repeated treatment over years.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'curled-dock', approach: 'cultural', treatment: 'Deep ploughing and prevention of seed set', active_substance: null, timing: 'Post-harvest cultivation', dose_rate: null, efficacy_notes: 'Deep ploughing buries root crown below regeneration depth. Prevent flowering and seed production. Long-lived seed bank (50+ years) means persistence is the main challenge.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Marsh Thistle
  { pest_id: 'marsh-thistle', approach: 'chemical', treatment: 'MCPA or 2,4-D on rosettes in grassland', active_substance: 'MCPA or 2,4-D', timing: 'Rosette stage in spring', dose_rate: 'See product label', efficacy_notes: 'Apply to rosettes in spring. Biennial — cut flowering stems before seed set prevents seed bank build-up. Drainage improvement is the long-term solution as marsh thistle indicates waterlogging.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'marsh-thistle', approach: 'cultural', treatment: 'Drainage improvement and cutting before flowering', active_substance: null, timing: 'Before flowering (June-July)', dose_rate: null, efficacy_notes: 'Marsh thistle is an indicator of poor drainage — address underlying drainage problems. Cut before seed set. Biennial life cycle means preventing seed production over 2-3 years depletes the population.', resistance_risk: null, approval_status: null, source: 'AHDB' },
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

  // ── Expansion IPM Guidance ─────────────────────────────────────

  // Grassland x Ragwort
  { crop_id: 'grassland', pest_id: 'ragwort', threshold: 'Any ragwort on horse pasture or silage fields requires action. On cattle pasture, treat patches before flowering. Statutory weed — must prevent spread.', monitoring_method: 'Walk pastures in spring to identify rosettes and returning plants. Focus on bare patches, gateways, and field margins. Map infested areas. Check hay and silage fields before cutting.', cultural_controls: 'Maintain dense productive sward, avoid overgrazing, reseed bare patches, remove pulled plants from the field (seeds mature after pulling)', prevention: 'Dense sward prevents ragwort establishment. Address bare patches from poaching, drought, or overgrazing promptly. Hand-pull or spot-treat rosettes before flowering.', decision_guide: 'On horse pasture: zero tolerance — pull or spray all rosettes annually. On cattle pasture: prevent seed set by cutting or spraying before July flowering. In hay/silage fields: spray or pull before cutting. Pulled plants must be removed from field — they remain toxic and seeds can mature on pulled stems.', source: 'DEFRA' },

  // Grassland x Creeping Thistle
  { crop_id: 'grassland', pest_id: 'thistles', threshold: 'Expanding patches indicate declining sward quality. Treat when thistle patches are impeding grazing or machinery access. Statutory weed.', monitoring_method: 'Map thistle patches annually. Assess rate of expansion. Check whether cultural issues (drainage, compaction, overgrazing) are driving thistle invasion.', cultural_controls: 'Address underlying sward problems (drainage, compaction, fertility). Overseed bare areas. Competitive grass growth suppresses thistle seedlings. Cut patches 3-4 times per year.', prevention: 'Maintain productive dense sward. Address drainage and compaction. Avoid overgrazing. Topping at 15cm before flowering prevents seed set but does not kill root system.', decision_guide: 'Clopyralid in grassland provides good control — apply in spring to rosettes. Combine with cutting 4-6 weeks later. Repeat annually for 3+ years to deplete root reserves. Spot treatment with glyphosate is effective but kills grass.', source: 'AHDB' },

  // Grassland x Rush
  { crop_id: 'grassland', pest_id: 'rush', threshold: 'Treat when rush covers more than 10% of field area. Rush indicates underlying drainage problems that should be addressed first.', monitoring_method: 'Visual assessment of rush coverage. Map wet areas. Soil structure assessment with spade to identify compaction layers. Monitor after drainage works.', cultural_controls: 'Improve drainage (mole ploughing, sub-soiling), raise soil pH with lime, increase soil fertility, topping in summer', prevention: 'Address field drainage before rush becomes established. Sub-soil compacted areas. Lime acidic soils. Maintain productive grass to compete with rush seedlings.', decision_guide: 'Weed-wipe with glyphosate when rush is taller than the surrounding grass (typically July-August). Alternatively, spot-spray with MCPA. Combine with drainage improvement — herbicide alone provides only temporary control if waterlogging persists.', source: 'AHDB' },

  // Stored Grain x Grain Weevil
  { crop_id: 'stored-grain', pest_id: 'grain-weevil', threshold: 'Zero tolerance for live insects at grain intake for milling wheat and malting barley. Red Tractor and TASCC standards require pest-free storage.', monitoring_method: 'Sticky traps and pitfall traps in empty stores before loading. Grain temperature monitoring — hotspots indicate insect activity. Sieve grain samples (1kg per 25 tonnes) for live insects. Check insect trap catches monthly.', cultural_controls: 'Clean and treat empty stores before harvest. Dry grain to <14% MC rapidly. Cool grain below 15C within 2 weeks. Maintain below 12C for long-term storage. Good store sealing.', prevention: 'Pre-harvest store treatment with residual insecticide on walls and floor. Rapid drying and cooling after loading. Aeration to maintain even temperature. Inspect regularly. Remove spillage.', decision_guide: 'If live grain weevils detected post-loading: cool grain to below 12C to halt development. If infestation is established, consider approved fumigation. Phosphine fumigation requires trained operator. Pirimiphos-methyl grain admixture protects against re-infestation.', source: 'AHDB' },

  // Strawberries x Spotted Wing Drosophila
  { crop_id: 'strawberries', pest_id: 'spotted-wing-drosophila', threshold: 'Commence control when first SWD adults detected in monitoring traps and fruit is turning colour. Zero tolerance for larvae in marketed fruit.', monitoring_method: 'Bait traps (apple cider vinegar + drop of soap, or commercial Cha-Landolt lure) placed at crop edge from late June. Check traps twice weekly. Identify male SWD by wing spots. Fruit sampling by salt float test.', cultural_controls: 'Remove overripe and damaged fruit, insect-proof netting on tunnels, rapid cooling to 2C within 1 hour of harvest, short marketing chain', prevention: 'Exclusion netting (0.9mm mesh) is the most effective prevention. Keep harvest intervals short — pick every other day. Destroy wild bramble near production. Post-harvest cold chain management.', decision_guide: 'Begin spinosad sprays when first male SWD caught in traps and fruit is colouring. Rotate with other approved actives. Maintain 7-day spray intervals during harvest. Cold chain from field to retail is essential — fruit contaminated at oviposition but larvae not visible until days later.', source: 'AHDB' },

  // Apple x Brown Rot
  { crop_id: 'apples', pest_id: 'brown-rot', threshold: 'No formal spray threshold. Management is hygiene-based — remove mummified fruit and treat wounds to prevent infection.', monitoring_method: 'Inspect orchard for mummified fruit on trees and ground from harvest onwards. Assess wound levels (bird pecking, codling moth, cracking) as entry points. Monitor storage for developing rot.', cultural_controls: 'Remove mummified fruit from trees during winter pruning. Control codling moth and bird damage to reduce wound entry points. Harvest at correct maturity. Handle fruit carefully.', prevention: 'Wound prevention is the foundation — brown rot enters through existing damage. Good codling moth control reduces entry points. Remove mummies (source of spores). Store only sound fruit.', decision_guide: 'Focus management on reducing wounds and removing mummified fruit. No highly effective fungicide targeting brown rot specifically. Captan in the spray programme provides some incidental protection. Post-harvest dipping with approved products reduces storage losses.', source: 'AHDB' },

  // Grassland x Spear Thistle
  { crop_id: 'grassland', pest_id: 'spear-thistle', threshold: 'Statutory weed — must prevent spread. Treat rosettes before stem elongation. Any flowering plants should be cut before seed set.', monitoring_method: 'Walk pastures in spring to identify rosettes. Biennial cycle means new rosettes appear each year from seed bank. Focus on bare patches and recently cultivated areas.', cultural_controls: 'Maintain dense sward, reseed bare patches, avoid overgrazing, cut before flowering', prevention: 'Dense productive sward prevents seedling establishment. Address bare patches promptly. Unlike creeping thistle, spear thistle does not spread by roots — seed control is the key.', decision_guide: 'Spot-spray rosettes with MCPA in spring. Cut flowering stems before seed set in July. Biennial lifecycle means consistent management for 2-3 years can eliminate from a field. Focus on preventing seed production.', source: 'AHDB' },

  // Peas x Pea Weevil
  { crop_id: 'spring-peas', pest_id: 'pea-weevil', threshold: 'Cosmetic leaf notching is generally tolerated. Spray only if seedlings are very small and heavily attacked — well-established crops compensate.', monitoring_method: 'Assess leaf notching on seedlings at emergence. Count plants with more than 50% leaf margin notched. Monitor for adult weevils on warm days in spring.', cultural_controls: 'Rapid crop establishment, maintain field margins for natural enemies, crop vigour through good nutrition', prevention: 'Early sowing for rapid establishment past the vulnerable seedling stage. Good seedbed preparation. Maintain natural enemy populations.', decision_guide: 'Spray only on backward crops with heavy adult activity at seedling stage. Most crops tolerate significant leaf notching without yield loss. Larval damage to root nodules is the main economic impact but cannot be targeted by chemical control.', source: 'AHDB' },

  // Apple x Apple Scab
  { crop_id: 'apples', pest_id: 'apple-scab', threshold: 'Risk-based: commence protective programme from green cluster (March) when rain washes ascospores from leaf litter. Mills Period model (temperature + wetting duration) predicts infection events.', monitoring_method: 'Use Mills Period criteria: duration of leaf wetness and temperature determine if infection has occurred. Monitor weather station data. Inspect leaves for first lesions from petal fall. Spore traps in research orchards.', cultural_controls: 'Leaf litter removal or urea spray in autumn to reduce overwintering inoculum. Choose scab-resistant varieties. Maintain open canopy for air circulation.', prevention: 'Variety resistance is the strongest tool — resistant varieties (e.g., scab-immune) need few or no fungicide sprays. Autumn urea application accelerates leaf litter decomposition. Remove heavily infected shoots during winter pruning.', decision_guide: 'On susceptible varieties: protective fungicide programme from green cluster to mid-June (primary scab season). Captan or dithianon as multi-site protectants. Kresoxim-methyl or difenoconazole as curatives after infection events. Reduce programme intensity on resistant varieties.', source: 'AHDB' },

  // Soft Fruit x Vine Weevil
  { crop_id: 'strawberries', pest_id: 'vine-weevil', threshold: 'Zero tolerance for larvae in containerised production. Monitor for adult leaf notching from April. Apply nematode drench preventatively in autumn.', monitoring_method: 'Inspect leaf margins for adult notching from April-May. Night inspection with torch to find adults (active 21:00-02:00). Check root balls of wilting plants for larvae. Monitor bought-in plants.', cultural_controls: 'Inspect all bought-in plants. Use clean growing media. Physical barriers on bench legs. Remove daytime hiding places.', prevention: 'Preventative nematode drench in autumn before larval damage occurs. Steinernema kraussei at soil temperature above 5C. Inspect plant root balls before planting.', decision_guide: 'In containerised strawberry production: apply S. kraussei nematodes in September as standard preventative. If adults detected in spring, apply H. megidis or S. feltiae in April-May. Combine biological control with cultural hygiene.', source: 'AHDB' },
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

  // ── Expansion Approved Products ────────────────────────────────

  // Grassland herbicides
  { product_name: 'Agritox', active_substance: 'MCPA', target_pests: 'Buttercups, thistles, docks, nettles, ragwort in grassland', approved_crops: 'grassland, cereals', approval_expiry: '2027-12-31', registration_number: 'MAPP 11278', source: 'CRD' },
  { product_name: 'Depitox', active_substance: '2,4-D', target_pests: 'Docks, thistles, nettles, ragwort, plantains in grassland', approved_crops: 'grassland, cereals', approval_expiry: '2028-06-30', registration_number: 'MAPP 11635', source: 'CRD' },
  { product_name: 'Clopyralid 200', active_substance: 'clopyralid', target_pests: 'Creeping thistle, cleavers, mayweed in cereals and grassland', approved_crops: 'cereals, grassland, oilseed rape', approval_expiry: '2028-12-31', registration_number: 'MAPP 14438', source: 'CRD' },
  { product_name: 'Hurler', active_substance: 'fluroxypyr', target_pests: 'Cleavers, volunteer OSR, docks, nettles, broadleaved weeds', approved_crops: 'cereals, grassland', approval_expiry: '2028-03-31', registration_number: 'MAPP 15182', source: 'CRD' },
  { product_name: 'Thrust', active_substance: 'fluroxypyr + clopyralid + MCPA', target_pests: 'Buttercups, docks, thistles, ragwort, nettles in grassland', approved_crops: 'grassland', approval_expiry: '2028-10-31', registration_number: 'MAPP 16743', source: 'CRD' },
  { product_name: 'Pastor Trio', active_substance: 'fluroxypyr + clopyralid + triclopyr', target_pests: 'Docks, thistles, nettles, rush, ragwort, bramble in grassland', approved_crops: 'grassland', approval_expiry: '2028-06-30', registration_number: 'MAPP 17552', source: 'CRD' },

  // Vegetable insecticides
  { product_name: 'Tracer', active_substance: 'spinosad', target_pests: 'Caterpillars, thrips, leaf miners on vegetables and fruit', approved_crops: 'lettuce, brassicas, peppers, tomatoes, strawberries', approval_expiry: '2028-09-30', registration_number: 'MAPP 13805', source: 'CRD' },
  { product_name: 'Dipel DF', active_substance: 'Bacillus thuringiensis var. kurstaki', target_pests: 'Caterpillars — diamond-back moth, cabbage white, box tree moth', approved_crops: 'brassicas, lettuce, box', approval_expiry: '2028-12-31', registration_number: 'MAPP 14507', source: 'CRD' },
  { product_name: 'Decis Protech', active_substance: 'deltamethrin', target_pests: 'Aphids, caterpillars, beetles, thrips on vegetables and fruit', approved_crops: 'brassicas, lettuce, peas, beans, carrots, potatoes', approval_expiry: '2028-10-31', registration_number: 'MAPP 18683', source: 'CRD' },
  { product_name: 'Majestik', active_substance: 'maltodextrin', target_pests: 'Aphids, whitefly, spider mites (physical mode of action)', approved_crops: 'all edible and ornamental crops', approval_expiry: '2029-03-31', registration_number: 'MAPP 14411', source: 'CRD' },

  // Stored grain
  { product_name: 'Actellic 50 EC', active_substance: 'pirimiphos-methyl', target_pests: 'Grain weevil, flour beetles, mites, moths in stored grain', approved_crops: 'stored wheat, barley, oats (grain admixture and fabric treatment)', approval_expiry: '2027-12-31', registration_number: 'MAPP 12187', source: 'CRD' },

  // Fruit fungicides
  { product_name: 'Captan 80 WDG', active_substance: 'captan', target_pests: 'Apple scab, brown rot, Botrytis on fruit', approved_crops: 'apples, pears, strawberries', approval_expiry: '2028-06-30', registration_number: 'MAPP 15362', source: 'CRD' },
  { product_name: 'Systhane 20 EW', active_substance: 'myclobutanil', target_pests: 'Apple scab, powdery mildew, rust on fruit and ornamentals', approved_crops: 'apples, pears, strawberries, ornamentals', approval_expiry: '2028-01-31', registration_number: 'MAPP 12534', source: 'CRD' },
  { product_name: 'Delan Pro', active_substance: 'dithianon + potassium phosphonates', target_pests: 'Apple scab (protectant)', approved_crops: 'apples, pears', approval_expiry: '2029-04-30', registration_number: 'MAPP 19112', source: 'CRD' },

  // Biological control agents
  { product_name: 'Nemasys', active_substance: 'Steinernema kraussei', target_pests: 'Vine weevil larvae (soil application)', approved_crops: 'strawberries, ornamentals, container plants', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Nemasys H', active_substance: 'Heterorhabditis megidis', target_pests: 'Vine weevil larvae, chafer grubs (soil application)', approved_crops: 'strawberries, ornamentals, turf', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Encarsia formosa', active_substance: 'Encarsia formosa (parasitoid wasp)', target_pests: 'Glasshouse whitefly (biological control)', approved_crops: 'tomatoes, cucumbers, peppers, ornamentals', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Phytoseiulus persimilis', active_substance: 'Phytoseiulus persimilis (predatory mite)', target_pests: 'Two-spotted spider mite (biological control)', approved_crops: 'strawberries, cucumbers, tomatoes, ornamentals', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Amblyseius cucumeris', active_substance: 'Amblyseius cucumeris (predatory mite)', target_pests: 'Western flower thrips (biological control)', approved_crops: 'peppers, cucumbers, strawberries, ornamentals', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'CpGV (Carpovirusine)', active_substance: 'Cydia pomonella granulovirus', target_pests: 'Codling moth (biological control)', approved_crops: 'apples, pears', approval_expiry: '2028-06-30', registration_number: 'MAPP 16108', source: 'CRD' },

  // Carrot fly and root fly
  { product_name: 'Hallmark with Zeon (carrots)', active_substance: 'lambda-cyhalothrin', target_pests: 'Carrot fly adults', approved_crops: 'carrots, parsnips', approval_expiry: '2028-10-31', registration_number: 'MAPP 12814', source: 'CRD' },

  // Mating disruption
  { product_name: 'Isomate-CLR', active_substance: 'codlemone (codling moth pheromone)', target_pests: 'Codling moth (mating disruption)', approved_crops: 'apples, pears', approval_expiry: '2028-12-31', registration_number: 'MAPP 17332', source: 'CRD' },
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
    mcp_name: 'UK Pest Management MCP',
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
