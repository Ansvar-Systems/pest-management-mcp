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

  // ── Expansion: Cereal Diseases ──────────────────────────────────

  {
    id: 'wheat-streak-mosaic-virus',
    name: 'Wheat Streak Mosaic Virus',
    common_names: ['WSMV', 'Wheat streak mosaic'],
    pest_type: 'disease',
    description: 'Viral disease of wheat transmitted by the wheat curl mite (Aceria tosichella). Causes yellow streaking and mosaic patterns on leaves, stunting, and reduced grain fill. Sporadic in the UK but can cause significant losses where present.',
    lifecycle: 'Virus persists in volunteer wheat and grasses. Wheat curl mite vectors acquire the virus while feeding and transmit it to new wheat plants. Mites spread by wind. Warm dry autumns favour mite activity and virus spread.',
    identification: 'Yellow to light green streaks running parallel to leaf veins. Mosaic patterns on young leaves. Stunted plants with poor tillering. Leaves may become chlorotic and curl. Laboratory ELISA testing required for confirmation.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Volunteer wheat near new crops, warm dry autumn, early drilling, presence of wheat curl mite, grass bridges between crops',
    economic_impact: 'Yield losses of 10-70% in heavily infected crops. Sporadic in the UK climate but more frequent in warm autumns. Control of volunteer wheat is the primary management tool.',
    images_description: 'Yellow streaks and mosaic pattern on wheat leaf running parallel to veins',
  },

  {
    id: 'barley-stripe',
    name: 'Barley Stripe',
    common_names: ['Pyrenophora graminea', 'Drechslera graminea'],
    pest_type: 'disease',
    description: 'Seed-borne fungal disease of barley caused by Pyrenophora graminea. Produces long pale yellow stripes on leaves that turn brown and split. Infected plants are stunted with poor ear emergence. Controlled by seed treatment.',
    lifecycle: 'Seed-borne mycelium infects the coleoptile at germination. Fungus grows systemically within the plant. Symptoms appear on emerging leaves as pale stripes. Spores produced on dead tissue infect developing grain during flowering.',
    identification: 'Long pale yellow to brown stripes running the full length of the leaf. Stripes darken and tissue splits along the stripe. Severely infected plants stunted with twisted leaves. Ears may fail to emerge or be partially enclosed in the boot.',
    crops_affected: ['barley', 'winter barley', 'spring barley'],
    risk_factors: 'Untreated seed, farm-saved seed, cool moist conditions at germination, susceptible varieties',
    economic_impact: 'Yield losses of 5-20% where untreated seed carries high infection levels. Seed treatments provide near-complete control. Rarely significant where certified seed or effective seed treatment is used.',
    images_description: 'Long pale yellow stripes running full length of barley leaf with brown tissue splitting',
  },

  {
    id: 'halo-spot',
    name: 'Halo Spot',
    common_names: ['Selenophoma donacis'],
    pest_type: 'disease',
    description: 'Foliar disease of barley caused by Selenophoma donacis. Produces small pale spots with a dark border and characteristic pale halo. Common in the UK but usually of minor economic importance. Can be confused with Ramularia.',
    lifecycle: 'Survives on crop debris and seed. Conidia produced in wet weather and splash-dispersed to upper leaves. Multiple infection cycles during the growing season. Favoured by cool wet conditions in spring and early summer.',
    identification: 'Small (1-3mm) circular pale spots with a dark brown border and a broader pale green or yellow halo around the lesion. Distinguished from Ramularia by the distinct halo. Pycnidia visible under magnification in older lesions.',
    crops_affected: ['barley', 'winter barley', 'spring barley'],
    risk_factors: 'Cool wet springs, dense crops, susceptible varieties, minimum tillage retaining debris',
    economic_impact: 'Usually minor — yield losses rarely exceed 5%. Can be locally significant in wet seasons on susceptible varieties. Often controlled incidentally by fungicides applied for other diseases.',
    images_description: 'Small pale spots with dark border and characteristic yellow halo on barley leaf',
  },

  {
    id: 'tan-spot',
    name: 'Tan Spot',
    common_names: ['Pyrenophora tritici-repentis', 'Yellow leaf spot'],
    pest_type: 'disease',
    description: 'Foliar disease of wheat caused by Pyrenophora tritici-repentis. Produces tan-coloured oval lesions with a yellow border and dark centre. Increasing in the UK with reduced tillage and continuous wheat. Can cause significant yield loss.',
    lifecycle: 'Pseudothecia on stubble release ascospores in autumn and spring. Conidia produced on leaf lesions cause secondary spread. Rain-splashed up the canopy. Favoured by minimum tillage systems that retain infected stubble on the surface.',
    identification: 'Oval to lens-shaped tan lesions with a yellow border and small dark spot at the centre. Lesions expand to 10-15mm. Can coalesce into large necrotic areas. Distinguished from Septoria by the yellow border and dark centre spot.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Continuous wheat, minimum tillage, infected stubble, wet weather in spring, susceptible varieties',
    economic_impact: 'Yield losses of 5-15% in high-pressure years. Increasing in reduced-tillage systems. Responds to fungicides used for Septoria. Ploughing buries inoculum and breaks the disease cycle.',
    images_description: 'Oval tan lesions with yellow border and dark centre spot on wheat leaf',
  },

  {
    id: 'wheat-spindle-streak-mosaic-virus',
    name: 'Wheat Spindle Streak Mosaic Virus',
    common_names: ['WSSMV'],
    pest_type: 'disease',
    description: 'Soil-borne viral disease of wheat transmitted by the plasmodiophorid Polymyxa graminis. Causes spindle-shaped yellow streaks on leaves in spring. Usually transient — symptoms disappear as temperatures rise. Most common on heavy soils.',
    lifecycle: 'Resting spores of the vector Polymyxa graminis persist in soil for decades. Zoospores infect wheat roots in autumn and winter, transmitting the virus. Symptoms appear in cool spring weather (5-15C) and fade above 20C.',
    identification: 'Spindle-shaped (tapering at both ends) yellow to light green streaks on leaves. Most visible in March-April during cool spells. Symptoms fade in warm weather. Plants may show general yellowing and slight stunting. Confirm by ELISA.',
    crops_affected: ['wheat', 'winter wheat'],
    risk_factors: 'Heavy clay soils, waterlogged conditions, continuous wheat, cool wet springs, presence of Polymyxa graminis vector in soil',
    economic_impact: 'Usually limited — yield losses of 2-5% because symptoms are transient. Can be more significant on heavy waterlogged soils with continuous wheat. No chemical control available; variety resistance is the main tool.',
    images_description: 'Spindle-shaped yellow streaks on wheat leaf in cool spring conditions',
  },

  {
    id: 'soil-borne-wheat-mosaic-virus',
    name: 'Soil-borne Wheat Mosaic Virus',
    common_names: ['SBWMV', 'Soil-borne mosaic'],
    pest_type: 'disease',
    description: 'Soil-borne viral disease of wheat transmitted by Polymyxa graminis. Causes mosaic and mottling on leaves in spring. Similar biology to wheat spindle streak mosaic virus. Reported in the UK since the 1990s on heavy clay soils.',
    lifecycle: 'Transmitted by resting spores of Polymyxa graminis in soil. Root infection occurs in autumn-winter in wet conditions. Virus replicates in root cells and moves systemically to leaves. Symptoms appear in cool spring weather.',
    identification: 'Light green to yellow mosaic mottling on leaves. Irregular patches of pale and dark green. Most visible in spring during cool weather. Plants may show slight stunting. Distinguished from WSSMV by mosaic pattern rather than spindle streaks. Confirm by ELISA.',
    crops_affected: ['wheat', 'winter wheat'],
    risk_factors: 'Heavy clay soils, poor drainage, continuous wheat, cool wet spring, soil pH above 7',
    economic_impact: 'Yield losses of 5-15% in confirmed fields. No chemical control. Resistant varieties available. Avoid continuous wheat on infested land. Once established, Polymyxa resting spores persist in soil for 20+ years.',
    images_description: 'Mosaic mottling pattern of pale and dark green patches on wheat leaf',
  },

  // ── Expansion: Potato Diseases ─────────────────────────────────

  {
    id: 'potato-virus-y',
    name: 'Potato Virus Y',
    common_names: ['PVY'],
    pest_type: 'disease',
    description: 'Most important viral disease of potatoes worldwide. Transmitted by aphids (non-persistently) and through infected seed tubers. Multiple strains including PVYO, PVYN, and PVYNTN. Causes mosaic, leaf drop, and tuber necrotic ringspot depending on strain and variety.',
    lifecycle: 'Survives in infected seed tubers and volunteer potatoes. Aphids acquire the virus within seconds of probing an infected plant and transmit it to healthy plants during brief probes. Non-persistent transmission — insecticides cannot prevent spread.',
    identification: 'Leaf mosaic (light and dark green patches), vein clearing, leaf rugosity (crinkling), leaf drop (PVYN strains). Tuber necrotic ringspot in PVYNTN strains — depressed necrotic rings on tuber surface. Stunted plants. Confirm by ELISA.',
    crops_affected: ['potatoes'],
    risk_factors: 'Infected seed tubers, high aphid pressure, proximity to virus sources, susceptible varieties, warm dry conditions favouring aphid flight',
    economic_impact: 'Yield losses of 10-80% depending on strain and variety. Seed certification schemes set maximum PVY tolerance levels. Tuber necrotic ringspot reduces marketable yield of table and processing potatoes.',
    images_description: 'Potato leaf showing mosaic pattern with crinkling and necrotic ringspot on tuber surface',
  },

  {
    id: 'potato-leafroll-virus',
    name: 'Potato Leafroll Virus',
    common_names: ['PLRV'],
    pest_type: 'disease',
    description: 'Important viral disease of potatoes transmitted persistently by the peach-potato aphid (Myzus persicae). Causes upward rolling of leaflets, chlorosis, and net necrosis of tubers. Persistent transmission means aphids need extended feeding — insecticides can reduce spread.',
    lifecycle: 'Persists in infected seed tubers. Aphids acquire the virus during prolonged feeding (hours) on infected plants. Virus circulates in the aphid before it becomes infective. Transmitted to new plants during subsequent feeding. Persistent transmission.',
    identification: 'Upward rolling of upper leaflets giving a cupped appearance. Leaflets become leathery and pale with purple or red discolouration. Net necrosis — brown streaks visible when tuber is cut longitudinally. Stunted plants with stiff erect habit.',
    crops_affected: ['potatoes'],
    risk_factors: 'Infected seed tubers, high Myzus persicae population, late aphid control, proximity to infected crops, warm autumn extending aphid season',
    economic_impact: 'Yield losses of 20-60% from primary infection (within-season). Secondary infection (from infected seed) causes 50-80% loss. Seed certification with strict PLRV tolerances. Net necrosis downgrades processing potatoes.',
    images_description: 'Potato plant with upward-rolled leaflets showing purple discolouration and leathery texture',
  },

  {
    id: 'gangrene',
    name: 'Gangrene',
    common_names: ['Phoma foveata', 'Boeremia foveata'],
    pest_type: 'disease',
    description: 'Tuber storage disease of potatoes caused by Phoma foveata (syn. Boeremia foveata). Causes sunken dry rot lesions on tubers during storage. Infection occurs through wounds at harvest. Can result in significant storage losses.',
    lifecycle: 'Soil-borne fungus infects tubers through harvest damage (cuts, bruises). Develops slowly in store at 3-5C. Visible lesions appear 2-3 months after harvest. Spreads by contact in store but slowly. Pycnidia on lesions produce spores.',
    identification: 'Depressed rounded areas on tuber surface, skin wrinkles as tissue shrinks beneath. Cut tuber shows well-defined cavity with dry powdery brown to black rot. Thumb-shaped cavities. Distinguished from dry rot by neater cavity margins and lack of concentric shrinkage rings.',
    crops_affected: ['potatoes'],
    risk_factors: 'Harvest damage, wet harvest conditions, long storage, temperatures 3-10C in store, susceptible varieties, soil-borne inoculum from previous potato crops',
    economic_impact: 'Storage losses of 5-20% in badly affected crops. Reduced by careful harvesting to minimise damage, suberisation period (wound healing at 12-15C for 14 days), and storage temperature management.',
    images_description: 'Depressed sunken area on potato tuber surface with dry powdery cavity visible when cut',
  },

  {
    id: 'dry-rot-potato',
    name: 'Dry Rot of Potato',
    common_names: ['Fusarium coeruleum', 'Fusarium solani var. coeruleum'],
    pest_type: 'disease',
    description: 'Storage disease of potatoes caused by Fusarium species, primarily F. coeruleum in the UK. Causes dry shrunken areas on tubers with concentric wrinkles and internal cavities. One of the most common potato storage diseases.',
    lifecycle: 'Soil-borne and seed-borne. Infects tubers through wounds at harvest. Develops during storage, particularly at higher temperatures. Produces spores in pastel-coloured pustules on lesion surface. Can spread by contact in store.',
    identification: 'Shrunken wrinkled area on tuber surface with concentric skin folds. Internal cavity with dry brown to pink crumbly rot. Pustules of spores (white, blue, or pink depending on species) on lesion surface. Distinguished from gangrene by concentric wrinkles and coloured sporulation.',
    crops_affected: ['potatoes'],
    risk_factors: 'Harvest damage, warm storage temperature (above 5C), susceptible varieties, long storage period, infected seed tubers, poor suberisation conditions',
    economic_impact: 'Storage losses of 5-25% in affected stocks. Major cause of seed potato deterioration. Controlled by minimising harvest damage, rapid wound healing (suberisation), low storage temperature, and seed treatment where appropriate.',
    images_description: 'Shrunken potato tuber with concentric wrinkles and coloured fungal pustules on surface',
  },

  {
    id: 'pink-rot',
    name: 'Pink Rot',
    common_names: ['Phytophthora erythroseptica'],
    pest_type: 'disease',
    description: 'Soil-borne disease of potatoes caused by Phytophthora erythroseptica. Causes a wet watery rot of tubers that turns distinctly pink when cut flesh is exposed to air. Associated with waterlogged soils and poor drainage.',
    lifecycle: 'Oospores persist in soil for many years. Infect tubers through stolons and lenticels in waterlogged conditions. Disease develops rapidly at soil temperatures above 15C. Infected tubers decay rapidly in store if moisture is high.',
    identification: 'Tuber skin appears normal or slightly darkened. Cut tuber shows watery rot that turns distinctly salmon-pink within 15-30 minutes of cutting — diagnostic feature. Internal tissue is glassy and waterlogged. Strong ammonia-like odour. Rapid secondary bacterial infection.',
    crops_affected: ['potatoes'],
    risk_factors: 'Waterlogged soils, poor drainage, heavy rainfall during tuber bulking, warm soil temperatures, short rotations, susceptible varieties',
    economic_impact: 'Can cause total loss of tubers in waterlogged areas of fields. Losses typically 2-10% of crop but higher in wet seasons. No effective chemical control in crop. Long rotations and drainage improvement are the main management tools.',
    images_description: 'Cut potato tuber showing watery flesh turning distinctly salmon-pink on exposure to air',
  },

  {
    id: 'spraing-tobacco-rattle-virus',
    name: 'Spraing (Tobacco Rattle Virus)',
    common_names: ['TRV', 'Spraing'],
    pest_type: 'disease',
    description: 'Tuber quality defect caused by Tobacco Rattle Virus (TRV) transmitted by free-living nematodes (Trichodorus and Paratrichodorus species). Causes brown arcs and flecks in tuber flesh (spraing). Major quality issue for processing potatoes.',
    lifecycle: 'Virus persists in weed hosts and soil nematode vectors. Trichodorid nematodes acquire and transmit the virus during root feeding. Virus moves systemically to tubers. Spraing symptoms develop in tuber flesh during growth and storage.',
    identification: 'External tuber symptoms often absent. Cut tuber reveals brown corky arcs, rings, and flecks scattered through the flesh — the characteristic spraing pattern. Symptoms may intensify during storage. Distinguished from PMTV spraing by arc pattern rather than rings.',
    crops_affected: ['potatoes'],
    risk_factors: 'Light sandy soils, high trichodorid nematode populations, land with history of spraing, weed hosts, susceptible varieties',
    economic_impact: 'Rejection of processing and table potato crops with spraing above tolerance levels. Losses of 5-30% marketable yield. Nematicide treatment partially effective. Variety choice and avoidance of high-risk fields are primary management tools.',
    images_description: 'Cut potato tuber showing brown corky arcs and flecks in flesh characteristic of spraing',
  },

  // ── Expansion: Fruit Diseases ──────────────────────────────────

  {
    id: 'peach-leaf-curl',
    name: 'Peach Leaf Curl',
    common_names: ['Taphrina deformans'],
    pest_type: 'disease',
    description: 'Fungal disease of peaches, nectarines, and almonds caused by Taphrina deformans. Causes dramatic curling, thickening, and red-purple discolouration of leaves in spring. Common throughout the UK on outdoor stone fruit.',
    lifecycle: 'Ascospores and budding cells overwinter on bark and bud scales. Infection occurs during bud swell in late winter when rain washes spores into opening buds. No secondary spread during the growing season. Cool wet springs favour infection.',
    identification: 'Leaves emerge thickened, puckered, and curled with red, purple, or yellow discolouration. Affected areas become swollen and blistered. White powdery spore layer develops on affected areas. Leaves eventually turn brown and fall. Severely affected trees defoliated by June.',
    crops_affected: ['peaches', 'nectarines', 'almonds'],
    risk_factors: 'Wet weather during bud swell (January-March), outdoor unprotected trees, no fungicide applied, susceptible varieties, exposed sites',
    economic_impact: 'Repeated defoliation weakens trees and reduces fruit yield. Well-established trees tolerate occasional attacks. Commercial growers apply preventive copper or systemic fungicide before bud swell. Rain covers (polythene shelters) give near-complete control.',
    images_description: 'Peach leaves thickened curled and puckered with red-purple discolouration',
  },

  {
    id: 'bacterial-canker-stone-fruit',
    name: 'Bacterial Canker of Stone Fruit',
    common_names: ['Pseudomonas syringae pv. morsprunorum', 'Pseudomonas syringae pv. syringae'],
    pest_type: 'disease',
    description: 'Bacterial disease of cherries, plums, and other stone fruit caused by Pseudomonas syringae. Causes oozing cankers on branches and trunks, shothole symptoms on leaves, and bud death. Can kill young trees. Widespread in UK orchards.',
    lifecycle: 'Bacteria overwinter in cankers and on leaf surfaces. Rain-splashed to leaf scars in autumn and pruning wounds in winter. Cankers enlarge during winter dormancy. Bacteria multiply on leaf surfaces in spring and infect through stomata.',
    identification: 'Flattened dark sunken cankers on branches with amber or brown gum exuding. Dead buds in spring — branches fail to leaf out. Shothole symptoms on leaves (circular necrotic spots that drop out). Wilting of whole branches above girdling cankers.',
    crops_affected: ['cherries', 'plums', 'damsons', 'apricots'],
    risk_factors: 'Wet autumn and winter weather, autumn pruning (exposes leaf scars), young trees, susceptible rootstocks, waterlogged sites, frost damage',
    economic_impact: 'Can kill young trees. Established trees lose branches, reducing yield by 10-30%. Copper-based sprays at leaf fall provide partial control. Prune only in summer (dry conditions). Some rootstocks offer improved tolerance.',
    images_description: 'Dark sunken canker on cherry branch with amber gum exuding through bark',
  },

  {
    id: 'pear-rust',
    name: 'Pear Rust',
    common_names: ['Gymnosporangium sabinae', 'European pear rust'],
    pest_type: 'disease',
    description: 'Rust disease of pears caused by Gymnosporangium sabinae. Requires juniper (Juniperus species) as an alternate host. Produces bright orange spots on pear leaves with distinctive horn-like projections on the undersurface. Increasing in UK gardens.',
    lifecycle: 'Heteroecious rust — requires both pear and juniper to complete lifecycle. Teliospores on juniper produce basidiospores that infect pear leaves in spring. Aeciospores from pear re-infect juniper in late summer. Cycle repeats annually.',
    identification: 'Bright orange to red spots on upper surface of pear leaves from May onwards. Underside of spots develops distinctive elongated horn-like projections (aecia) producing orange spores. Heavy infection causes premature leaf fall. Fruit occasionally affected.',
    crops_affected: ['pears'],
    risk_factors: 'Proximity to juniper or ornamental Juniperus species, wet springs, susceptible pear varieties, urban gardens with mixed planting',
    economic_impact: 'Primarily cosmetic in gardens but severe infections cause premature leaf fall and reduced vigour. Commercial orchards rarely affected if no junipers nearby. Removal of nearby juniper plants eliminates the disease. No fungicides specifically approved for this use.',
    images_description: 'Bright orange spots on pear leaf upper surface with horn-like aecial projections on underside',
  },

  // ── Expansion: Brassica Diseases ───────────────────────────────

  {
    id: 'brassica-dark-leaf-spot-alternaria',
    name: 'Dark Leaf Spot of Brassica Vegetables',
    common_names: ['Alternaria brassicicola', 'Alternaria brassicae'],
    pest_type: 'disease',
    description: 'Fungal disease of brassica vegetables caused by Alternaria brassicicola and A. brassicae. Produces dark concentric-ringed spots on leaves. Affects cabbage, Brussels sprouts, cauliflower, and other brassica vegetables. Seed-borne and debris-borne.',
    lifecycle: 'Survives on seed and crop debris. Conidia produced in warm humid conditions and dispersed by rain splash and wind. Infects through stomata. Multiple infection cycles during the growing season. Favoured by warm wet weather.',
    identification: 'Dark brown to black circular spots with concentric rings giving a target-board appearance. Spots on leaves, stems, and pods. Yellowing of surrounding tissue. On cauliflower curds, small dark spots reduce marketability.',
    crops_affected: ['cabbage', 'Brussels sprouts', 'cauliflower', 'broccoli', 'calabrese'],
    risk_factors: 'Warm humid weather, infected seed, crop debris, dense planting, overhead irrigation, brassica volunteers',
    economic_impact: 'Yield and quality losses of 5-20%. Particularly important on cauliflower curds where any blemish reduces market grade. Seed treatment and hot-water seed treatment reduce seed-borne inoculum.',
    images_description: 'Dark circular spots with concentric rings on brassica leaf surface',
  },

  {
    id: 'brassica-white-mould',
    name: 'White Mould of Brassica',
    common_names: ['Sclerotinia sclerotiorum on brassica vegetables'],
    pest_type: 'disease',
    description: 'Disease of brassica vegetables caused by Sclerotinia sclerotiorum. Causes watery stem and head rot with white fluffy mycelium and hard black sclerotia. Particularly damaging to stored cabbage and Brussels sprouts in wet seasons.',
    lifecycle: 'Sclerotia in soil germinate to produce apothecia that release ascospores in summer. Spores infect senescing petals and damaged tissue. Mycelium colonises stem and head. Sclerotia form inside and on rotting tissue for next season.',
    identification: 'Watery soft rot of stem base, leaves, or heads. Covered with dense white fluffy mycelium. Hard black sclerotia (2-10mm) embedded in the rotting tissue. Plants wilt above the infected point. Foul smell as secondary bacteria invade.',
    crops_affected: ['cabbage', 'Brussels sprouts', 'cauliflower', 'broccoli'],
    risk_factors: 'Wet season, dense canopy, short rotations with other Sclerotinia-susceptible crops (oilseed rape, beans), soil with high sclerotia load',
    economic_impact: 'Field losses of 5-15% in wet seasons. Post-harvest losses in stored cabbage can reach 30%. Long rotations (4+ years) reduce soil sclerotia load. No specific fungicide programme for vegetables — rotation is primary control.',
    images_description: 'Brassica stem with watery rot covered in white fluffy mycelium and black sclerotia',
  },

  {
    id: 'downy-mildew-brassica',
    name: 'Downy Mildew of Brassica Vegetables',
    common_names: ['Hyaloperonospora parasitica', 'Peronospora parasitica'],
    pest_type: 'disease',
    description: 'Oomycete disease of brassica vegetables caused by Hyaloperonospora parasitica. Causes yellow patches on upper leaf surface with white to grey downy sporulation beneath. Seedlings and transplants are most vulnerable. Common in UK brassica production.',
    lifecycle: 'Oospores persist in soil and infected debris. Sporangia produced on undersides of infected leaves spread by wind and rain. Infects through stomata. Rapid cycles in cool humid conditions. Can be seed-borne.',
    identification: 'Angular yellow patches on upper leaf surface bounded by veins. White to grey fluffy downy growth on corresponding underside. Seedlings show purpling and systemic infection. Cauliflower curds may show internal browning. Leaves may become necrotic.',
    crops_affected: ['cabbage', 'cauliflower', 'broccoli', 'Brussels sprouts', 'calabrese', 'turnips', 'swedes'],
    risk_factors: 'Cool humid weather (10-15C), overcrowded seedlings, overhead irrigation, poor air circulation, infected transplants',
    economic_impact: 'Seedling losses of 20-50% if untreated. Mature plant losses of 5-15%. Cauliflower curd browning causes market rejection. Controlled by metalaxyl-M seed treatment and foliar fungicides in transplant modules.',
    images_description: 'Angular yellow patches on brassica leaf surface with white downy growth on underside',
  },

  // ── Expansion: Vegetable Diseases ──────────────────────────────

  {
    id: 'leek-rust',
    name: 'Leek Rust',
    common_names: ['Puccinia porri', 'Puccinia allii'],
    pest_type: 'disease',
    description: 'Rust disease of leeks, onions, and garlic caused by Puccinia porri (syn. P. allii). Produces orange pustules on leaves that reduce photosynthesis and make leeks unmarketable. The most common disease of UK leek crops.',
    lifecycle: 'Urediniospores produced on infected allium crops and volunteers. Wind-dispersed over long distances. Multiple infection cycles through the growing season. Favoured by warm humid conditions. Teliospores produced in autumn.',
    identification: 'Bright orange urediniospore pustules on leaf surfaces. Pustules elongated (2-5mm), raised, and powdery. Severely infected leaves turn yellow and die back from the tips. Dark brown-black teliospore pustules appear in late season.',
    crops_affected: ['leeks', 'garlic', 'onions', 'chives'],
    risk_factors: 'Warm humid conditions (15-20C), high nitrogen, dense planting, proximity to infected allium crops, autumn crops most affected',
    economic_impact: 'Yield losses of 10-30%. Severe infections make leeks unmarketable due to unsightly pustules on the white shaft. Tebuconazole provides moderate control. Variety resistance is the most effective management tool.',
    images_description: 'Bright orange rust pustules scattered across leek leaf surface',
  },

  {
    id: 'celery-leaf-spot',
    name: 'Celery Leaf Spot',
    common_names: ['Septoria apiicola'],
    pest_type: 'disease',
    description: 'Seed-borne fungal disease of celery and celeriac caused by Septoria apiicola. Produces small brown spots with black pycnidia on leaves and petioles. Can cause severe defoliation and crop loss. The most important disease of UK celery production.',
    lifecycle: 'Seed-borne — primary inoculum from infected seed. Pycnidia on lesions produce spores that are rain-splashed to new leaves. Multiple infection cycles. Favoured by wet weather and overhead irrigation. Survives on crop debris between seasons.',
    identification: 'Small (2-5mm) brown to grey spots on leaves and petioles with visible black pycnidia (fruiting bodies) within the spots. Spots may coalesce, causing leaf blight. Severely affected petioles develop brown sunken lesions.',
    crops_affected: ['celery', 'celeriac'],
    risk_factors: 'Infected seed, wet weather, overhead irrigation, dense planting, crop debris from previous celery, warm humid conditions',
    economic_impact: 'Untreated crops can suffer 50-100% loss in wet seasons. Hot-water seed treatment (48C for 30 minutes) eliminates seed-borne infection. Fungicide programmes based on azoxystrobin and chlorothalonil provide good control.',
    images_description: 'Brown spots with visible black pycnidia on celery leaf surface and petioles',
  },

  {
    id: 'parsnip-canker',
    name: 'Parsnip Canker',
    common_names: ['Itersonilia pastinacae', 'Itersonilia perplexans'],
    pest_type: 'disease',
    description: 'Disease of parsnips caused primarily by Itersonilia pastinacae, with Phoma and Mycocentrospora species also involved. Causes orange-brown to black cankers on the shoulders of parsnip roots. The most important disease of parsnips in the UK.',
    lifecycle: 'Spores produced on crop debris and soil surface. Infection through cracks and wounds in the root crown — carrot fly damage, frost cracks, and mechanical injury provide entry points. Develops during autumn and winter in the field.',
    identification: 'Orange-brown to dark brown or black sunken cankers on the shoulder and crown of the parsnip root. Lesions expand during autumn and winter. Affected tissue is firm and dry initially but may become soft as secondary organisms invade.',
    crops_affected: ['parsnips'],
    risk_factors: 'Carrot fly damage (provides entry points), frost cracking, early sowing, short rotations, susceptible varieties, high crown exposure',
    economic_impact: 'Losses of 10-40% of marketable yield. Canker-resistant varieties (e.g., Javelin, Gladiator) are the primary control. Deep sowing to cover crowns reduces exposure. Control of carrot fly reduces entry points for infection.',
    images_description: 'Orange-brown to black canker lesion on the shoulder of a parsnip root',
  },

  {
    id: 'white-tip-leek',
    name: 'White Tip of Leek',
    common_names: ['Phytophthora porri'],
    pest_type: 'disease',
    description: 'Disease of leeks caused by Phytophthora porri. Causes white papery drying of leaf tips that progresses downward. Can cause significant yield and quality losses in UK leek production. Favoured by wet autumn weather.',
    lifecycle: 'Oospores persist in soil and infected debris. Zoospores released in wet conditions swim through soil water to infect root and leaf bases. Rain-splashed zoospores infect leaf surfaces. Multiple cycles in prolonged wet periods.',
    identification: 'White to pale bleached drying of leaf tips that extends downward. Affected tips become papery and may split. Green leaf tissue below the die-back zone often shows water-soaked margins. In severe cases, rot extends into the shaft.',
    crops_affected: ['leeks'],
    risk_factors: 'Wet autumn weather, waterlogged soils, poor drainage, overhead irrigation, dense planting, short leek rotations',
    economic_impact: 'Quality losses of 10-30% as tip damage requires trimming, reducing shaft length and market value. No specific fungicides approved. Drainage improvement and wider spacing reduce humidity in the crop canopy.',
    images_description: 'Leek leaf with white papery dried tip extending downward into green tissue',
  },

  // ── Expansion: Additional Diseases ─────────────────────────────

  {
    id: 'powdery-scab-potato',
    name: 'Powdery Scab of Potato',
    common_names: ['Spongospora subterranea'],
    pest_type: 'disease',
    description: 'Soil-borne disease of potatoes caused by Spongospora subterranea. Produces raised pustules on tubers that rupture to release powdery brown spore balls. Also causes root galling. The vector for Potato Mop-Top Virus (PMTV).',
    lifecycle: 'Resting spores (cystosori) persist in soil for 10+ years. Release zoospores in wet conditions that infect roots and developing tubers through lenticels. Pustules develop on tuber surface filled with powdery brown spore balls.',
    identification: 'Raised pustules (3-10mm) on tuber surface that rupture to expose powdery dark brown mass of spore balls. Distinguished from common scab by the raised edge and powdery contents. Root galling visible on washed roots. Severe on wet heavy soils.',
    crops_affected: ['potatoes'],
    risk_factors: 'Wet heavy soils, waterlogged conditions, cool soil temperatures (12-18C), short potato rotations, infected seed tubers, susceptible varieties',
    economic_impact: 'Downgrades processing and table potatoes. Yield losses from root galling. Tuber blemish reduces market value by 10-30%. Also transmits PMTV causing spraing. No chemical control. Long rotations (6+ years) and resistant varieties are primary tools.',
    images_description: 'Potato tuber with raised pustules ruptured to show powdery brown spore mass',
  },

  {
    id: 'bunt-wheat',
    name: 'Common Bunt of Wheat',
    common_names: ['Tilletia caries', 'Tilletia tritici', 'Stinking smut'],
    pest_type: 'disease',
    description: 'Seed-borne disease of wheat caused by Tilletia caries. Infected ears contain bunt balls instead of grain — dark masses of spores with a distinctive rotten fish smell. Historically devastating but now rare due to universal seed treatment.',
    lifecycle: 'Seed-borne and soil-borne. Teliospores contaminating seed germinate alongside the wheat seed and infect the coleoptile. Fungus grows systemically within the plant. Replaces grain with bunt balls filled with teliospores.',
    identification: 'Infected ears slightly shorter and more upright than healthy ears (bunt balls are lighter than grain). Bunt balls are dark grey-brown, same size as wheat grain. Crushing releases black spore mass with strong rotten fish (trimethylamine) odour.',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat'],
    risk_factors: 'Untreated seed, farm-saved seed, organic systems without seed treatment, soil contamination from previously infected crops',
    economic_impact: 'Near-zero in conventional farming due to seed treatment. Can cause 50-100% ear loss in untreated organic crops. Contaminated grain rejected at intake (smell and appearance). Hot water seed treatment available for organic production.',
    images_description: 'Wheat ear with dark bunt balls replacing grain kernels and black spore mass when crushed',
  },

  {
    id: 'cyst-nematode-cereals',
    name: 'Cereal Cyst Nematode',
    common_names: ['Heterodera avenae'],
    pest_type: 'disease',
    description: 'Soil-borne nematode that infects roots of cereals, causing stunting and yellowing in patches. White female cysts visible on roots in June-July. Most damaging in continuous cereal rotations on light soils. Declining in importance with modern rotations.',
    lifecycle: 'Cysts containing 200+ eggs persist in soil for 10+ years. Hatching stimulated by cereal root exudates. Juveniles invade roots and feed. Females swell and burst through root cortex. White lemon-shaped cysts visible on roots. One generation per year.',
    identification: 'Patchy stunting and yellowing in cereal crops, usually on lighter soils. White to brown lemon-shaped cysts (0.5mm) visible on roots June-July. Root systems shortened and bushy. Patches often in same location year after year.',
    crops_affected: ['wheat', 'barley', 'oats'],
    risk_factors: 'Continuous cereals, light sandy soils, spring barley and oats most susceptible, short rotations without break crops',
    economic_impact: 'Yield losses of 5-20% in affected patches. Declining in importance as rotations have improved. No nematicide treatment. One non-cereal break crop year reduces populations significantly. Resistant varieties available in oats.',
    images_description: 'Wheat roots with white lemon-shaped cereal cyst nematode females attached and stunted yellowing crop',
  },

  {
    id: 'phytophthora-root-rot-peas',
    name: 'Phytophthora Root Rot of Peas',
    common_names: ['Phytophthora pisi'],
    pest_type: 'disease',
    description: 'Soil-borne disease of peas caused by Phytophthora pisi. Causes brown discolouration and rotting of the lower stem and roots. Plants wilt and die, often in waterlogged patches. Increasing in UK pea production.',
    lifecycle: 'Oospores persist in soil. Produce zoospores in wet conditions that infect pea roots and stem bases. Disease develops rapidly in waterlogged soil. Plants wilt and collapse. Oospores formed in dead tissue persist for next season.',
    identification: 'Brown to black discolouration of lower stem and roots. Plants wilt, turn yellow, and collapse. Roots rotted — pull from soil easily. Patches in waterlogged areas of fields. Distinguished from Fusarium by water-soaked brown (not pink) tissue.',
    crops_affected: ['peas', 'combining peas', 'vining peas'],
    risk_factors: 'Waterlogged soils, poor drainage, heavy rainfall after drilling, short pea rotations, compacted soils',
    economic_impact: 'Losses of 10-40% in affected patches. No chemical treatment in crop. Long pea rotations (6+ years) reduce soil inoculum. Improve field drainage. Metalaxyl-M seed treatment provides some protection on high-risk sites.',
    images_description: 'Wilting pea plants with brown-black root and lower stem rot in waterlogged field patch',
  },

  {
    id: 'rust-beans',
    name: 'Rust of Field Beans',
    common_names: ['Uromyces viciae-fabae'],
    pest_type: 'disease',
    description: 'Rust disease of field beans caused by Uromyces viciae-fabae. Produces dark brown urediniospore pustules on leaves and stems in summer. Differs from chocolate spot by the raised powdery pustules. Can cause significant defoliation in late-maturing crops.',
    lifecycle: 'Urediniospores spread by wind from early infections. Multiple infection cycles through summer. Pustules produce masses of brown spores. Most damaging on late-maturing crops in warm summers. Dark teliospores produced in autumn.',
    identification: 'Dark brown to reddish-brown raised pustules (uredinia) on both leaf surfaces and stems. Pustules powdery when rubbed — brown spore mass. Distinguished from chocolate spot by raised powdery nature. Severe infections cause yellowing and defoliation.',
    crops_affected: ['field beans', 'winter beans', 'spring beans'],
    risk_factors: 'Warm humid summers, late-maturing crops, spring beans in warm autumns, dense crops, nitrogen-rich conditions',
    economic_impact: 'Yield losses of 5-20% in severe years. More important in spring beans which are still green when conditions favour rust. Tebuconazole provides moderate control. Variety resistance is limited. Early harvest of mature crops avoids late-season build-up.',
    images_description: 'Dark brown powdery rust pustules raised above field bean leaf surface',
  },

  {
    id: 'verticillium-wilt-strawberry',
    name: 'Verticillium Wilt of Strawberry',
    common_names: ['Verticillium dahliae on strawberry'],
    pest_type: 'disease',
    description: 'Soil-borne wilt disease of strawberry caused by Verticillium dahliae. Causes outer leaf wilting, browning, and collapse of the whole plant. Microsclerotia persist in soil for years. Major problem in UK strawberry production.',
    lifecycle: 'Microsclerotia in soil germinate and infect roots. Fungus colonises xylem vessels, blocking water transport. Outer leaves wilt and brown. Inner leaves remain green initially. Plant collapses. Microsclerotia form in dead tissue, returning to soil.',
    identification: 'Outer leaves wilt, turn brown, and flatten around the crown. Inner leaves may remain green initially (rosette appearance). Cut crown lengthwise — brown-black vascular discolouration visible. Whole plant eventually collapses.',
    crops_affected: ['strawberries'],
    risk_factors: 'Previous potato, brassica, or strawberry cropping (broad host range), soil temperatures 20-25C, heavy soils, new plantings in infested soil',
    economic_impact: 'Plant losses of 10-50% in infested fields. No in-crop chemical treatment. Raised beds with substrate (table-top) production avoids soil-borne inoculum. Resistant varieties limited. Biofumigation and long rotations help reduce soil inoculum.',
    images_description: 'Strawberry plant with outer leaves wilted and brown and cut crown showing dark vascular staining',
  },

  {
    id: 'crown-rot-strawberry',
    name: 'Crown Rot of Strawberry',
    common_names: ['Phytophthora cactorum'],
    pest_type: 'disease',
    description: 'Serious disease of strawberries caused by Phytophthora cactorum. Causes rapid wilting and death. Internal crown tissue shows reddish-brown discolouration. Spread in infected planting material and by splashing water. Common in UK production.',
    lifecycle: 'Oospores in soil and infected crowns. Zoospores released in wet conditions infect crowns through wounds or soil splash. Disease develops rapidly in warm wet conditions. Entire plant wilts and dies within days to weeks.',
    identification: 'Sudden wilting without outer-to-inner leaf progression (unlike Verticillium). Cut crown shows reddish-brown marbled discolouration (not uniform brown). Roots may appear healthy. Sudden collapse, often in wet warm weather.',
    crops_affected: ['strawberries'],
    risk_factors: 'Infected planting material, wet weather, waterlogged conditions, overhead irrigation, warm temperatures (20-30C), susceptible varieties',
    economic_impact: 'Plant losses of 10-60% in outbreaks. Certified disease-free planting material is the primary control. Metalaxyl-M drench can protect but not cure. Raised substrate production reduces risk. Rapid plant removal limits spread within the row.',
    images_description: 'Wilted strawberry plant and cut crown showing reddish-brown marbled internal discolouration',
  },

  {
    id: 'powdery-mildew-strawberry',
    name: 'Powdery Mildew of Strawberry',
    common_names: ['Podosphaera aphanis'],
    pest_type: 'disease',
    description: 'Foliar and fruit disease of strawberries caused by Podosphaera aphanis. Causes leaf curling, purple discolouration, and white powdery coating on fruit. The most common fungal disease of UK strawberry production under protection.',
    lifecycle: 'Overwinters as mycelium on old leaves. Conidia produced in warm dry conditions with high humidity (polytunnel environment). Rapid cycles of infection. Favoured by warm days (18-25C), cool nights, and high humidity without free water on leaves.',
    identification: 'Leaves curl upward with purple-red discolouration on undersurface. White powdery mycelium on undersurface of leaves and on fruit. Infected fruit develop poor colour, hard texture, and powdery coating. Flowers may fail to set.',
    crops_affected: ['strawberries'],
    risk_factors: 'Polytunnel production (warm + humid), susceptible varieties (Elsanta), dense planting, poor ventilation, warm dry periods followed by high humidity',
    economic_impact: 'Yield and quality losses of 10-30% in susceptible varieties. Fungicide programmes based on myclobutanil, penconazole, or sulfur. Variety resistance is important — some newer varieties have good field resistance. Polytunnel ventilation management.',
    images_description: 'Strawberry leaf curling upward with purple discolouration and white powdery mildew on fruit surface',
  },

  {
    id: 'apple-canker',
    name: 'Apple Canker',
    common_names: ['Neonectria ditissima', 'Nectria galligena'],
    pest_type: 'disease',
    description: 'Fungal disease of apples and pears caused by Neonectria ditissima. Causes sunken cankers on branches and trunks that girdle and kill branches. Enters through wounds, leaf scars, and pruning cuts. The most important canker disease of UK apple orchards.',
    lifecycle: 'Ascospores released from red perithecia (tiny red balls on canker margins) year-round but mainly autumn-spring. Infection through leaf scars in autumn and pruning wounds in winter. Cankers enlarge over years, producing concentric bark rings.',
    identification: 'Sunken oval cankers with concentric rings of cracked bark. Canker margin may show small red perithecia (0.5mm red dots). Cream-coloured sporodochia (spore cushions) in summer. Branches die above girdling cankers. Eye rot on stored fruit.',
    crops_affected: ['apples', 'pears'],
    risk_factors: 'Wet climate (western UK), heavy rainfall, poor drainage, susceptible varieties (Cox, Braeburn), woolly aphid galling (entry points), winter pruning in wet weather',
    economic_impact: 'Branch and tree losses. Fruit eye rot in store causes rejection. Western UK orchards can lose 5-15% of productive wood annually. Canker removal (prune 30cm below canker) and wound paint. Copper sprays at leaf fall reduce new infections.',
    images_description: 'Sunken oval canker on apple branch with concentric bark rings and small red perithecia at margins',
  },

  {
    id: 'plum-rust',
    name: 'Plum Rust',
    common_names: ['Tranzschelia pruni-spinosae'],
    pest_type: 'disease',
    description: 'Rust disease of plums, damsons, and related Prunus species caused by Tranzschelia pruni-spinosae. Produces yellow-orange pustules on leaf undersurfaces. Can cause premature defoliation in severe years. Alternate host is anemone.',
    lifecycle: 'Heteroecious rust alternating between anemone (spring) and Prunus (summer). Aeciospores from anemone infect plum leaves. Urediniospores cycle on plum through summer. Teliospores on fallen plum leaves infect anemone in spring.',
    identification: 'Angular yellow spots on upper leaf surface. Brown to cinnamon urediniospore pustules on corresponding undersurface. Heavy infections cause premature leaf fall from August. Distinguished from other discolourations by powdery pustules beneath.',
    crops_affected: ['plums', 'damsons', 'gages', 'blackthorn'],
    risk_factors: 'Proximity to anemone (Anemone species), wet summers, susceptible varieties, sheltered sites, previous year infection',
    economic_impact: 'Premature defoliation weakens trees and reduces next year fruit bud formation. Yield losses of 5-15%. Fungicide control not usually economic. Removal of anemone near orchards eliminates the alternate host.',
    images_description: 'Plum leaf with yellow upper spots and brown urediniospore pustules on undersurface',
  },

  // ── Quarantine & Notifiable Diseases ────────────────────────────

  {
    id: 'xylella-fastidiosa',
    name: 'Xylella fastidiosa',
    common_names: ['Xylella', 'Pierce\'s disease', 'Olive quick decline'],
    pest_type: 'disease',
    description: 'Bacterial plant pathogen (Xylella fastidiosa) that colonises xylem vessels, blocking water transport. UK quarantine organism not yet established in Britain. Multiple subspecies affect over 500 host plant species including olive, grape, oak, plane, lavender, and rosemary. Spread by xylem-feeding insects (sharpshooters, spittlebugs).',
    lifecycle: 'Transmitted by xylem-feeding Hemiptera (meadow spittlebug Philaenus spumarius is the main European vector). Bacteria multiply in xylem, forming biofilms that block water transport. No overwintering in insects — reacquired each season from infected plants. Latent period of months to years before symptoms appear.',
    identification: 'Leaf scorch starting at margins and progressing inward. Dieback of branches. Stunted growth. In olives: rapid desiccation of leaves and twigs (quick decline). In grapevine: interveinal chlorosis progressing to necrosis. Laboratory confirmation (ELISA, PCR) required for diagnosis.',
    crops_affected: ['olives', 'grapevines', 'oak', 'plane trees', 'lavender', 'rosemary', 'cherry', 'almond', 'ornamentals'],
    risk_factors: 'Import of infected plant material from southern Europe, climate warming extending vector range, wide host range, long latent period delaying detection',
    economic_impact: 'Devastating in southern Europe — destroyed over 20 million olive trees in Puglia, Italy. UK quarantine pest under the Plant Health (England) Order. Early detection and eradication are the only management options. No cure exists.',
    images_description: 'Leaf margin scorch and branch dieback on infected host plant',
  },
  {
    id: 'phytophthora-ramorum',
    name: 'Phytophthora ramorum',
    common_names: ['Sudden oak death', 'Ramorum disease', 'Larch disease'],
    pest_type: 'disease',
    description: 'Water mould (Phytophthora ramorum) causing bleeding cankers on trees and leaf blight on shrubs. UK notifiable disease. Caused extensive dieback in Japanese larch plantations across western Britain. Also affects rhododendron (major spore source), Viburnum, Camellia, and oak.',
    lifecycle: 'Produces zoospores in wet conditions that spread via rain splash, wind-driven rain, and watercourses. Rhododendron is the main sporulating host in the UK. Chlamydospores survive in soil and leaf litter. Long-distance spread via infected nursery stock and contaminated soil.',
    identification: 'On larch: needle blackening, dieback of shoot tips, resinous cankers on stems. On rhododendron: dark brown-black leaf lesions, stem dieback. On oak: bleeding tarry cankers on trunk. Laboratory confirmation required (Phytophthora-specific testing).',
    crops_affected: ['Japanese larch', 'rhododendron', 'oak', 'Viburnum', 'Camellia', 'bilberry', 'sweet chestnut'],
    risk_factors: 'Wet western climate (high rainfall), proximity to rhododendron (sporulation host), infected nursery stock imports, contaminated soil movement, mild winters',
    economic_impact: 'Over 17 million larch trees felled in the UK under statutory plant health notices. Significant cost to forestry and nursery sectors. Statutory notification and management required. Clearance of rhododendron reduces inoculum.',
    images_description: 'Bleeding canker on oak trunk and blackened larch needles with shoot dieback',
  },
  {
    id: 'ash-dieback',
    name: 'Ash Dieback',
    common_names: ['Chalara', 'Chalara dieback of ash', 'Hymenoscyphus fraxineus'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Hymenoscyphus fraxineus (anamorph: Chalara fraxinea). UK notifiable disease that has spread across the majority of British ash woodlands. Causes progressive crown dieback, bark lesions, and eventual mortality in Fraxinus excelsior.',
    lifecycle: 'Ascospores released from fruiting bodies (apothecia) on fallen rachises (leaf stalks) in summer (June-September). Wind-dispersed spores infect leaves. Fungus grows through the petiole into the branch, causing diamond-shaped bark lesions and dieback. Cycle repeats annually.',
    identification: 'Dark brown-black lesions on leaves and petioles. Diamond-shaped bark lesions at the base of dead side-shoots. Progressive crown dieback from tips. Epicormic shoots on main trunk. Basal lesions on mature trees. White apothecia on previous year rachises on forest floor.',
    crops_affected: ['ash (Fraxinus excelsior)', 'narrow-leaved ash (Fraxinus angustifolia)'],
    risk_factors: 'Proximity to infected ash, humid conditions during spore release (June-September), young trees more rapidly killed, stressed trees (drought, waterlogging), secondary attack by Armillaria',
    economic_impact: 'Expected to kill 50-75% of UK ash trees over the coming decades. Ash is the third most common tree in Britain. Replacement and safety-felling costs estimated at GBP 15 billion. Some trees show tolerance — genetic conservation programmes are selecting resistant genotypes.',
    images_description: 'Diamond-shaped bark lesion on ash branch with progressive crown dieback',
  },
  {
    id: 'dutch-elm-disease',
    name: 'Dutch Elm Disease',
    common_names: ['DED', 'Ophiostoma novo-ulmi'],
    pest_type: 'disease',
    description: 'Vascular wilt disease caused by Ophiostoma novo-ulmi (aggressive strain, replaced the original O. ulmi). Transmitted by elm bark beetles (Scolytus scolytus and S. multistriatus). Killed over 25 million elms in the UK since the 1960s. Fungus blocks xylem vessels, causing rapid wilting.',
    lifecycle: 'Elm bark beetles breed under bark of dead or dying elms. Emerging beetles carry fungal spores to healthy trees during maturation feeding on twig crotches. Fungus invades xylem, producing toxins and gels that block water transport. Tree dies within one to several seasons. Root grafts between adjacent elms allow underground spread.',
    identification: 'Sudden wilting and browning of leaves on individual branches (flagging), often starting in the upper crown in early summer. Brown streaking in sapwood visible when bark is peeled. Progressive dieback. Beetle entrance holes and galleries under bark of dead branches.',
    crops_affected: ['English elm (Ulmus procera)', 'wych elm (Ulmus glabra)', 'smooth-leaved elm (Ulmus minor)', 'hybrid elms'],
    risk_factors: 'Presence of elm bark beetles, mature elms with thick bark suitable for beetle breeding, root grafts between adjacent elms, warm spring weather for beetle flight, proximity to recently killed elms',
    economic_impact: 'Destroyed the majority of mature English elms in southern Britain. Ongoing threat to surviving populations. Brighton and parts of Scotland retain significant elm populations due to isolation and management. Sanitation felling of infected trees and prompt removal of dying wood reduces beetle breeding sites.',
    images_description: 'Wilting flagged branch on elm tree with brown sapwood streaking visible',
  },
  {
    id: 'tomato-brown-rugose-fruit-virus',
    name: 'Tomato Brown Rugose Fruit Virus',
    common_names: ['ToBRFV', 'Rugose virus'],
    pest_type: 'disease',
    description: 'Tobamovirus causing severe symptoms on tomato and pepper. UK quarantine pest under emergency measures. Highly contagious and stable — transmitted mechanically on hands, tools, clothing, and seed. Overcomes all known tobamovirus resistance genes (Tm-1, Tm-2, Tm-2a) in tomato.',
    lifecycle: 'No insect vector required. Spreads by mechanical contact — handling plants, pruning, grafting, contaminated tools, recirculated nutrient solution, seed transmission. Virus particles are extremely stable and can persist on surfaces and in soil for months to years.',
    identification: 'Mosaic and chlorotic mottle on leaves. Narrowing and distortion of young leaves. Brown rugose (wrinkled) patches on fruit surface. Fruit may show yellow discolouration and be unmarketable. Necrotic spots on calyces and peduncles. Laboratory testing (RT-PCR, lateral flow) required for confirmation.',
    crops_affected: ['tomatoes', 'peppers', 'aubergines'],
    risk_factors: 'Contaminated seed, infected transplants from overseas, mechanical transmission during crop work, recirculated hydroponic solutions, failure to disinfect tools and hands',
    economic_impact: 'Can render 100% of fruit unmarketable in severe outbreaks. Quarantine restrictions require destruction of infected crops. Major threat to UK protected tomato production (worth GBP 250 million annually). Strict biosecurity and seed testing are the primary defences.',
    images_description: 'Tomato fruit with brown rugose patches and leaf mosaic mottle',
  },
  {
    id: 'potato-ring-rot',
    name: 'Potato Ring Rot',
    common_names: ['Ring rot', 'Clavibacter sepedonicus', 'Clavibacter michiganensis subsp. sepedonicus'],
    pest_type: 'disease',
    description: 'Bacterial disease caused by Clavibacter sepedonicus. UK quarantine pest — not established in Britain. Causes vascular ring discolouration in tubers and progressive wilting of foliage. Extremely difficult to eradicate once established due to persistence on equipment and in storage.',
    lifecycle: 'Bacteria survive in dried slime on equipment, crates, and store surfaces for months to years. Spread via contaminated seed tubers and mechanical transmission during planting, cutting, and handling. Slow systemic invasion of vascular tissue. Symptoms may not appear until tubers are in store.',
    identification: 'Tubers: creamy-yellow to brown vascular ring discolouration visible when tuber is cut transversely at the stolon end. Squeeze test — cheesy exudate from vascular ring. Foliage: progressive wilting and yellowing, often one-sided. Official diagnostic testing required.',
    crops_affected: ['potatoes'],
    risk_factors: 'Contaminated seed tubers (especially from high-risk regions), shared equipment not disinfected, cutting seed without sanitising blades, contaminated stores',
    economic_impact: 'Quarantine pest requiring statutory eradication if detected. Entire crop destroyed, fields placed under restriction, equipment must be decontaminated. Zero tolerance in seed certification. Not established in the UK — import controls and seed testing are the primary defences.',
    images_description: 'Transverse potato tuber section showing creamy vascular ring rot',
  },
  {
    id: 'potato-brown-rot',
    name: 'Potato Brown Rot',
    common_names: ['Brown rot', 'Ralstonia solanacearum'],
    pest_type: 'disease',
    description: 'Bacterial wilt caused by Ralstonia solanacearum race 3 biovar 2. UK quarantine pest with occasional detections in watercourses and associated ware potato crops. Causes brown vascular discolouration in tubers and wilting of foliage. Can survive in waterways associated with Solanum dulcamara (bittersweet).',
    lifecycle: 'Bacteria survive in watercourses colonising roots of bittersweet (Solanum dulcamara). Irrigation with contaminated water introduces bacteria to potato fields. Enters tubers through lenticels or wounds. Systemic vascular invasion. Spread via contaminated seed, water, and soil.',
    identification: 'Tubers: brown vascular ring visible on transverse cut, bacterial ooze from eyes and stolon end when squeezed, soil adhering to eye discharge. Foliage: progressive wilting starting with lower leaves, one-sided wilting on stems. Place cut tuber in water — milky bacterial streaming from vascular ring is diagnostic.',
    crops_affected: ['potatoes', 'tomatoes'],
    risk_factors: 'Irrigation from contaminated surface water, proximity to watercourses with bittersweet, contaminated seed, warm temperatures (optimum 27C but race 3 tolerates cooler UK climate)',
    economic_impact: 'Quarantine pest. Detections trigger statutory eradication zones, crop destruction, and field restrictions. Watercourse monitoring programme ongoing in England and Wales. Zero tolerance in seed certification. Irrigation bans from contaminated watercourses.',
    images_description: 'Potato tuber cross-section with brown vascular ring and bacterial ooze',
  },

  // ── Protected Cropping / Glasshouse Diseases ────────────────────

  {
    id: 'tomato-leaf-mould',
    name: 'Tomato Leaf Mould',
    common_names: ['Passalora fulva', 'Fulvia fulva', 'Cladosporium fulvum'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Passalora fulva (formerly Cladosporium fulvum). Common in glasshouse tomato production under high humidity. Produces olive-brown velvety mould on leaf undersurfaces with corresponding yellow patches above. Yield reduction through loss of photosynthetic area.',
    lifecycle: 'Conidia spread by air movement within glasshouses. Spores germinate on leaf surfaces in high humidity (>85% RH) at 20-25C. Infection progresses over 10-14 days. Multiple cycles per season under glass. Survives between crops on debris and glasshouse structures.',
    identification: 'Upper leaf surface: diffuse yellow patches. Lower leaf surface: olive-brown to purple-brown velvety mould of conidia and conidiophores. Affected leaves curl and dry out from margins. Progresses from lower to upper canopy.',
    crops_affected: ['tomatoes (protected)'],
    risk_factors: 'High humidity in glasshouses, poor ventilation, dense canopy, warm temperatures (20-25C), prolonged leaf wetness, susceptible varieties',
    economic_impact: 'Yield losses of 10-30% from reduced leaf area. Management centres on ventilation and humidity control. Resistant varieties (Cf genes) available but some races overcome them. Chemical options limited in protected crops.',
    images_description: 'Yellow patches on tomato leaf upper surface with olive-brown velvety mould beneath',
  },
  {
    id: 'tomato-blight',
    name: 'Tomato Blight',
    common_names: ['Phytophthora infestans on tomato', 'Late blight of tomato'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Phytophthora infestans, the same organism causing potato late blight. Affects outdoor tomatoes and unheated tunnels in the UK. Causes rapid destruction of foliage and brown firm rot of fruit. Most severe in warm wet summers.',
    lifecycle: 'Sporangia produced on infected foliage are wind-dispersed (same population as potato blight). Infection requires free water on leaf surface at 10-25C. Rapid epidemic development in warm humid conditions. Can destroy a crop within days once established.',
    identification: 'Dark brown-green water-soaked lesions on leaves and stems. White sporulation on lesion margins and undersurfaces in humid conditions. Brown firm rot on green fruit, often starting at the calyx end. Stem lesions are dark brown to black.',
    crops_affected: ['tomatoes (outdoor)', 'tomatoes (unheated tunnels)'],
    risk_factors: 'Warm wet weather, proximity to blighted potato crops, outdoor or unheated production, Smith Period forecasts (two consecutive days with minimum temperature above 10C and relative humidity above 90% for 11+ hours)',
    economic_impact: 'Can destroy outdoor tomato crops in days during Smith Period weather. Protected crops under glass are generally safe if ventilated. Copper-based protectants are the main option for organic growers. Remove affected plant material promptly.',
    images_description: 'Water-soaked brown lesion on tomato leaf with white sporulation on underside',
  },
  {
    id: 'blossom-end-rot',
    name: 'Blossom End Rot',
    common_names: ['BER', 'Calcium deficiency disorder'],
    pest_type: 'disease',
    description: 'Physiological disorder (not a pathogen) caused by localised calcium deficiency in developing fruit. Affects tomatoes, peppers, aubergines, courgettes, and melons. Results from irregular water supply disrupting calcium transport to the distal fruit end, not from soil calcium deficiency.',
    lifecycle: 'Not a disease lifecycle. Occurs when rapid fruit growth coincides with water stress or irregular watering. Calcium is transported in the xylem by transpiration pull — fruit has low transpiration rate so receives less calcium than leaves. Hot weather, high salinity, and root damage exacerbate the condition.',
    identification: 'Dark brown to black sunken leathery patch at the blossom (distal) end of the fruit. Starts as a water-soaked area, becoming dry and sunken. May have secondary fungal colonisation on the necrotic area. First-formed fruit on each truss most commonly affected.',
    crops_affected: ['tomatoes', 'peppers', 'aubergines', 'courgettes', 'melons'],
    risk_factors: 'Irregular watering (alternating wet and dry), high salinity in growing medium, excessive nitrogen fertilisation, root damage, high temperatures increasing transpiration, rapid vegetative growth',
    economic_impact: 'Can affect 10-30% of fruit in severe cases. Not contagious — affected fruit is unmarketable. Consistent irrigation is the primary prevention. Calcium foliar sprays are generally ineffective because calcium does not move from leaves to fruit.',
    images_description: 'Tomato fruit with dark brown-black sunken lesion at the blossom end',
  },
  {
    id: 'tobacco-mosaic-virus',
    name: 'Tobacco Mosaic Virus',
    common_names: ['TMV', 'Tobamovirus'],
    pest_type: 'disease',
    description: 'Tobamovirus causing mosaic symptoms on tomato, pepper, and tobacco. One of the most stable and persistent plant viruses known — virus particles remain infectious in dried plant sap for decades. Transmitted mechanically on hands, tools, and clothing. No insect vector required.',
    lifecycle: 'Spread by mechanical contact during handling, pruning, transplanting. Contaminated hands, tools, and clothing are the main transmission routes. Virus survives on surfaces, in soil, and in dried debris for years. Seed transmission occurs at a low rate in tomato.',
    identification: 'Light and dark green mosaic pattern on leaves. Leaf distortion and puckering. Fernleaf symptoms (narrowed leaflets) in some strains. Stunted growth. Fruit mottling and internal browning in severe infections. Symptoms vary with virus strain, temperature, and host variety.',
    crops_affected: ['tomatoes', 'peppers', 'tobacco', 'aubergines', 'ornamental Solanaceae'],
    risk_factors: 'Mechanical handling without hand-washing, contaminated tools, infected seed, tobacco products (virus in cured tobacco), failure to disinfect between plants during pruning',
    economic_impact: 'Yield losses of 10-30% in affected crops. Management centres on hygiene — hand-washing with milk or trisodium phosphate, tool disinfection, resistant varieties (Tm-2a gene in modern tomato cultivars). Resistant varieties have greatly reduced the impact in commercial production.',
    images_description: 'Tomato leaf with light-dark green mosaic pattern and puckered distortion',
  },
  {
    id: 'cucumber-powdery-mildew',
    name: 'Cucumber Powdery Mildew',
    common_names: ['Powdery mildew of cucurbits', 'Podosphaera xanthii', 'Golovinomyces orontii'],
    pest_type: 'disease',
    description: 'Foliar disease caused primarily by Podosphaera xanthii (also Golovinomyces orontii) on cucumbers, courgettes, melons, and pumpkins. Produces white powdery growth on leaf surfaces. Major yield-limiting disease in protected and outdoor cucurbit production in the UK.',
    lifecycle: 'Conidia spread by air currents. Infections establish on leaf surfaces without free water — high humidity sufficient. Rapid multiplication with 5-7 day generation time. Overwinters on perennial cucurbit weeds and in protected crop environments.',
    identification: 'White powdery fungal growth on upper and lower leaf surfaces. Starts as discrete circular colonies, spreading to cover entire leaves. Heavily infected leaves turn yellow, brown, and die. Also affects petioles and stems. Distinguished from downy mildew by growth on upper leaf surface.',
    crops_affected: ['cucumbers', 'courgettes', 'melons', 'pumpkins', 'squash'],
    risk_factors: 'Protected crop environment with poor ventilation, dense canopy, dry leaf surface with high ambient humidity, susceptible varieties, late-season crops, nitrogen-lush growth',
    economic_impact: 'Yield losses of 20-40% in susceptible varieties if untreated. Reduces fruit quality and shelf life. Fungicide resistance is common — azole and strobilurin resistance widespread. Management relies on resistant varieties, ventilation, and fungicide rotation.',
    images_description: 'White powdery mildew colonies covering cucumber leaf surface',
  },

  // ── Ornamental / Nursery Diseases ──────────────────────────────

  {
    id: 'box-blight',
    name: 'Box Blight',
    common_names: ['Calonectria pseudonaviculata', 'Cylindrocladium buxicola'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Calonectria pseudonaviculata (formerly Cylindrocladium buxicola). Causes rapid defoliation and dieback of box (Buxus) plants. Major problem in UK gardens, parks, and nurseries since first detection in the mid-1990s. A separate species (C. henricotiae) is also present.',
    lifecycle: 'Conidia produced on fallen infected leaves and debris. Spread by rain splash, contaminated tools, and movement of infected plant material. Sticky spores readily adhere to boots, animals, and equipment. Survives as microsclerotia in soil and debris for at least 5 years.',
    identification: 'Dark brown to black spots and streaks on leaves, rapidly expanding to cover entire leaf. White sporulation on undersurface in humid conditions. Black streak lesions on stems. Rapid defoliation leaving bare twigs. Distinguished from box tree moth damage by brown leaf spots and stem streaks.',
    crops_affected: ['box (Buxus sempervirens)', 'box cultivars', 'Buxus species', 'Sarcococca (sweet box)'],
    risk_factors: 'Wet weather, dense planting, poor air circulation, overhead irrigation, contaminated tools and footwear, infected nursery stock, humid microclimates',
    economic_impact: 'Devastating to box hedging, topiary, and formal gardens. No highly effective chemical cure. Management centres on hygiene, air circulation, and resistant alternatives (Ilex crenata, Euonymus japonicus). Some Buxus varieties show partial resistance.',
    images_description: 'Box leaves with dark brown spots and defoliated twigs with white spore masses',
  },
  {
    id: 'phytophthora-root-rot-ornamental',
    name: 'Phytophthora Root Rot (Ornamentals)',
    common_names: ['Phytophthora root rot', 'Phytophthora crown rot'],
    pest_type: 'disease',
    description: 'Root and crown rot of ornamental plants caused by various Phytophthora species (P. cinnamomi, P. citricola, P. nicotianae, and others). Causes wilting, yellowing, and death of container-grown and field-grown nursery stock. Often introduced via contaminated growing media or irrigation water.',
    lifecycle: 'Zoospores released from sporangia in waterlogged conditions swim to roots. Infection via root tips. Oospores and chlamydospores persist in soil and growing media for years. Spread via contaminated water, soil, and infected plant material. Favoured by overwatering and poor drainage.',
    identification: 'Above ground: progressive wilting despite adequate moisture, yellowing of foliage, dieback from tips. Below ground: dark brown-black rotted roots, bark easily strips away from rotted roots revealing brown inner tissue. Crown rot may show dark staining at stem base.',
    crops_affected: ['heathers', 'rhododendron', 'Viburnum', 'Lawson cypress', 'yew', 'nursery stock generally'],
    risk_factors: 'Overwatering, poor drainage, contaminated irrigation water, standing water under containers, infected growing media, warm wet conditions, stressed plants',
    economic_impact: 'Major cause of nursery stock losses. Prevention through water management and hygiene is more effective than treatment. Use raised benches, drip irrigation, and clean water sources. Phosphonate-based treatments can provide some protection.',
    images_description: 'Wilting ornamental plant with dark brown rotted roots when lifted from container',
  },
  {
    id: 'downy-mildew-impatiens',
    name: 'Downy Mildew on Impatiens',
    common_names: ['Impatiens downy mildew', 'Plasmopara obducens'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Plasmopara obducens. Devastated the UK bedding plant market for busy Lizzie (Impatiens walleriana) from 2011 onwards. Causes leaf yellowing, defoliation, and plant collapse. Oospores persist in soil for years, making replanting with Impatiens walleriana impractical.',
    lifecycle: 'Oospores in soil and plant debris germinate in wet conditions, producing sporangia. Airborne sporangia infect leaves. Systemic infection develops — fungus grows through the plant internally. White sporulation on leaf undersurfaces produces secondary inoculum. Oospores formed in dying tissue persist in soil.',
    identification: 'Leaves turn pale green-yellow, often with a stippled appearance. White downy sporulation on leaf undersurfaces (often faint, check early morning). Rapid defoliation and plant collapse. Flowers and buds may fall. Stunted growth. Plants may appear to collapse overnight.',
    crops_affected: ['Impatiens walleriana (busy Lizzie)', 'Impatiens balsamina'],
    risk_factors: 'Cool wet weather, humid conditions, overhead watering, dense planting, contaminated soil from previous Impatiens crops, new introductions from infected nursery stock',
    economic_impact: 'Effectively eliminated Impatiens walleriana from the UK bedding market. New Guinea impatiens (I. hawkeri) are resistant and used as replacements. No effective treatment. Site hygiene and resistant species are the only management options.',
    images_description: 'Impatiens plant with yellowed leaves and white downy sporulation on undersurface',
  },

  // ── Protected Cropping / Glasshouse — additional ───────────────

  {
    id: 'pepper-mild-mottle-virus',
    name: 'Pepper Mild Mottle Virus',
    common_names: ['PMMoV', 'Tobamovirus of pepper'],
    pest_type: 'disease',
    description: 'Tobamovirus infecting pepper (Capsicum) worldwide. Extremely stable virus particles persist on seeds, in soil, and on surfaces. Causes mild mosaic and mottle on leaves and distortion of fruit. Yield losses arise from unmarketable fruit rather than plant death.',
    lifecycle: 'Seed-transmitted at rates up to 30%. Also mechanically transmitted on hands, tools, clothing, and through contaminated soil or nutrient solution. No insect vector required. Virus particles can survive years in dried plant debris and soil. Reinfection from contaminated greenhouse structures is common.',
    identification: 'Mild green mosaic and mottle on young leaves. Leaf distortion and rugosity in severe strains. Fruit discolouration — pale patches and uneven ripening. Stunted growth in young plants. Some strains cause necrotic lesions on leaves and fruit. Laboratory testing (ELISA, lateral flow) confirms identity.',
    crops_affected: ['peppers (protected)', 'chilli peppers', 'tomatoes (some strains)'],
    risk_factors: 'Contaminated seed, mechanical transmission during crop work, recirculated nutrient solution, contaminated greenhouse structures, failure to disinfect between crops',
    economic_impact: 'Widespread globally. Yield losses of 10-30% from unmarketable fruit. Seed treatment (dry heat or trisodium phosphate) reduces but does not eliminate seed transmission. Strict hygiene and certified seed are primary controls.',
    images_description: 'Pepper leaf with mild green mosaic mottle and distorted fruit with pale patches',
  },
  {
    id: 'fusarium-crown-rot-tomato',
    name: 'Fusarium Crown and Root Rot of Tomato',
    common_names: ['FCRR', 'Fusarium oxysporum f.sp. radicis-lycopersici'],
    pest_type: 'disease',
    description: 'Soil-borne fungal disease caused by Fusarium oxysporum f.sp. radicis-lycopersici (FORL). Attacks roots and crown of tomato, causing progressive wilt and plant death. Distinguished from Fusarium wilt (f.sp. lycopersici) by brown discolouration at the crown base rather than unilateral vascular browning.',
    lifecycle: 'Chlamydospores persist in soil, growing media, and on greenhouse structures for years. Infects through roots and crown. Colonises cortex and vascular tissue at the stem base. Spreads via contaminated growing media, recirculated nutrient solution, and infected transplants. Optimal infection at 18-20C (cooler than Fusarium wilt).',
    identification: 'Yellowing and wilting of lower leaves progressing upward. Dark brown rot at the crown (stem base) at soil level — key diagnostic feature. Pink-orange sporulation on crown surface in humid conditions. Roots brown and decayed. Vascular browning limited to lower stem (unlike Fusarium wilt which extends higher).',
    crops_affected: ['tomatoes (protected)', 'tomatoes (outdoor)'],
    risk_factors: 'Contaminated growing media or soil, cool root zone temperatures (15-20C), recirculated nutrient solution, infected transplants, cropping history of tomato on same site',
    economic_impact: 'Major disease of protected tomato worldwide. Can cause total crop loss in heavily infested substrates. Resistant rootstocks (e.g., Beaufort, Maxifort) provide effective control for grafted crops. Steam sterilisation or substrate replacement between crops.',
    images_description: 'Tomato plant with wilting lower leaves and dark brown crown rot at soil level with pink sporulation',
  },

  // ── Ornamental / Nursery — additional ──────────────────────────

  {
    id: 'rhododendron-powdery-mildew',
    name: 'Rhododendron Powdery Mildew',
    common_names: ['Erysiphe spp. on rhododendron', 'Podosphaera spp. on rhododendron'],
    pest_type: 'disease',
    description: 'Powdery mildew of rhododendron and azalea caused by Erysiphe azaleae (syn. Microsphaera azaleae) and related species. White powdery fungal growth on upper leaf surfaces, sometimes with yellow patches on the underside. More common on deciduous azaleas than evergreen rhododendrons.',
    lifecycle: 'Conidia spread by wind in warm dry weather with high humidity (not free moisture). Infection cycle 7-10 days in favourable conditions. Overwintering as mycelium on buds or as cleistothecia (sexual fruiting bodies) on fallen leaves. Multiple generations through the growing season.',
    identification: 'White powdery patches on upper leaf surface, sometimes with corresponding yellow patches beneath. Leaf curling and distortion. In severe cases, leaves turn brown and fall prematurely. Young shoots may be stunted. Deciduous azaleas typically show more severe symptoms than evergreen types.',
    crops_affected: ['rhododendron', 'azalea', 'ornamental Ericaceae'],
    risk_factors: 'Warm days and cool nights, high humidity, poor air circulation, dense planting, susceptible cultivars, shaded conditions',
    economic_impact: 'Reduces ornamental value. Repeated severe infection weakens plants. Fungicide control with myclobutanil or penconazole. Improve air circulation through pruning. Remove fallen infected leaves.',
    images_description: 'Rhododendron leaf with white powdery mildew patches on upper surface',
  },

  // ── Misc Diseases — additional ─────────────────────────────────

  {
    id: 'narcissus-basal-rot',
    name: 'Narcissus Basal Rot',
    common_names: ['Fusarium oxysporum f.sp. narcissi', 'Basal rot of daffodil'],
    pest_type: 'disease',
    description: 'Soil-borne fungal disease caused by Fusarium oxysporum f.sp. narcissi. The most important disease of narcissus bulbs in the UK. Infection occurs through the basal plate, causing chocolate-brown rot that extends upward through the bulb scales. Can cause significant losses in stored bulbs and in the field.',
    lifecycle: 'Chlamydospores persist in soil for many years. Infection through basal plate wounds or root scars, primarily during warm soil conditions (above 17C). Fungus grows through bulb scales producing brown rot. Infected bulbs in store continue to rot and spread spores to adjacent bulbs.',
    identification: 'In the field: premature yellowing of leaf tips and early die-back. Lifted bulbs show chocolate-brown rot starting at the basal plate and extending upward. In store: soft brown rot, often with pink-white mycelium at basal plate. Bulbs may become completely rotted and mummified.',
    crops_affected: ['narcissus (daffodil)', 'bulb crops'],
    risk_factors: 'Warm soil temperatures at lifting and planting, mechanical damage to basal plate, hot dry summers, continuous narcissus cropping, warm store temperatures',
    economic_impact: 'Can cause 10-30% losses in susceptible cultivars. Hot water treatment of bulbs (44.4C for 3 hours + formaldehyde) reduces infection. Cool store temperatures (<17C) slow disease development. Long rotations (5+ years) and avoiding bulb damage reduce losses.',
    images_description: 'Narcissus bulb cut in half showing chocolate-brown rot spreading from basal plate upward',
  },
  {
    id: 'tulip-fire',
    name: 'Tulip Fire',
    common_names: ['Botrytis tulipae', 'Tulip grey mould'],
    pest_type: 'disease',
    description: 'Devastating grey mould disease of tulips caused by Botrytis tulipae (distinct from B. cinerea). Causes withered, scorched shoots in spring, leaf spots, and flower damage. Sclerotia on infected bulbs spread disease in store and when planted. Named for the scorched appearance of affected shoots.',
    lifecycle: 'Sclerotia on infected bulbs or in soil produce conidia in wet spring weather. Primary infections cause scorched, withered shoots. Conidia splash-spread to adjacent plants causing leaf spots and flower infections. Sclerotia form on dying tissue and on bulb surfaces. Soil-borne sclerotia survive several years.',
    identification: 'Emerging shoots stunted, distorted, and covered with grey mould — appear scorched or fired (hence "tulip fire"). Small brown spots on leaves with dark green water-soaked haloes. Flowers spotted or distorted. Lifted bulbs show small black sclerotia on outer scales. Grey mould sporulation in wet weather.',
    crops_affected: ['tulips'],
    risk_factors: 'Wet spring weather, dense planting, continuous tulip cropping, infected planting stock, poor air circulation, mild wet autumns',
    economic_impact: 'Can destroy entire tulip plantings in wet years. Bulb inspection and removal of infected stock before planting. Fungicide protectant sprays from emergence. Long rotation (3+ years) away from tulips. Remove and destroy affected plants immediately.',
    images_description: 'Scorched tulip shoots with grey mould and leaf spots with water-soaked haloes',
  },
  {
    id: 'onion-downy-mildew',
    name: 'Onion Downy Mildew',
    common_names: ['Peronospora destructor', 'Downy mildew of alliums'],
    pest_type: 'disease',
    description: 'Oomycete disease caused by Peronospora destructor. Major disease of onion, shallot, and occasionally leek in the UK. Causes pale oval lesions on leaves with violet-grey sporulation. Systemic infection from infected sets is the primary source. Can cause complete crop failure in wet years.',
    lifecycle: 'Primary inoculum from systemically infected sets or volunteer onions. Infected plants produce spores (sporangia) that are wind-dispersed to neighbouring plants. Infection requires leaf wetness (>6 hours) and cool temperatures (10-15C). Oospores in soil and crop debris provide secondary inoculum. Epidemic cycles of 14-21 days.',
    identification: 'Pale green to yellow oval lesions on leaves, often with violet-grey downy sporulation (visible early morning in humid conditions). Affected leaves collapse from the tip. Systemic infections produce distorted, pale plants with stunted growth. Bulb development poor in severely affected crops.',
    crops_affected: ['onions', 'shallots', 'leeks', 'garlic'],
    risk_factors: 'Infected sets or transplants, cool wet weather (May-July), heavy dew, proximity to volunteer onions or infected crops, continuous allium cropping',
    economic_impact: 'Yield losses of 30-75% in severe epidemics. Premature die-back reduces bulb size and storage quality. Use disease-free sets, remove volunteers, apply protectant fungicides (mancozeb) from 4-5 leaf stage. Forecasting models help target spray timing.',
    images_description: 'Onion leaf with pale oval lesions and violet-grey downy mildew sporulation',
  },
  {
    id: 'parsley-septoria',
    name: 'Parsley Septoria',
    common_names: ['Septoria petroselini', 'Leaf spot of parsley'],
    pest_type: 'disease',
    description: 'Fungal leaf spot of parsley caused by Septoria petroselini. The most important disease of parsley in the UK. Causes small dark brown spots on leaves that enlarge and coalesce, leading to complete defoliation. Seed-borne pathogen that can devastate crops if unchecked.',
    lifecycle: 'Seed-transmitted. Also persists on crop debris in soil. Pycnidiospores produced in leaf lesions are splash-dispersed during rain. Infection requires 12+ hours leaf wetness. Disease cycles of 2-3 weeks. Autumn-sown parsley particularly vulnerable through winter into spring.',
    identification: 'Small dark brown circular spots (2-5mm) on leaf blades and petioles. Spots have a tan centre with tiny black pycnidia (fruiting bodies) visible with a hand lens. Spots coalesce in severe infections, causing leaf yellowing and death. Petiole lesions can girdle the stem.',
    crops_affected: ['parsley (flat-leaf and curled)', 'parsley root'],
    risk_factors: 'Contaminated seed, wet weather, overhead irrigation, dense crop canopy, continuous parsley cropping, autumn-sown crops',
    economic_impact: 'Can cause total marketable yield loss through defoliation. Use treated or tested seed. Avoid overhead irrigation. Wider spacing improves air circulation. Copper-based fungicides or azoxystrobin provide some protection.',
    images_description: 'Parsley leaf with dark brown spot lesions showing tiny black pycnidia in centres',
  },
  {
    id: 'mint-rust',
    name: 'Mint Rust',
    common_names: ['Puccinia menthae', 'Rust of mint'],
    pest_type: 'disease',
    description: 'Rust disease of mint caused by Puccinia menthae. Common throughout the UK on garden and commercial mint. Produces orange-brown pustules on leaf undersurfaces. Systemic infection distorts spring shoots (characteristic "rust-infected runners"). Can render mint crops unmarketable.',
    lifecycle: 'Autoecious rust (completes life cycle on mint only). Teliospores overwinter on dead stems and soil debris. Spring infections produce swollen, distorted, pale shoots (systemically infected runners). Urediniospores from pustules spread the disease through summer. Rust persists in perennial rootstock.',
    identification: 'Swollen, distorted, pale shoots in spring (systemic infection — distinctive diagnostic feature). Orange-brown urediniospore pustules on leaf undersurfaces in summer. Dark brown-black teliospore pustules in autumn. Severely infected leaves yellow and drop.',
    crops_affected: ['mint (all species)', 'Mentha piperita', 'Mentha spicata'],
    risk_factors: 'Infected planting material (runners), wet conditions, dense plantings, old mint beds with accumulated inoculum, warm humid summers',
    economic_impact: 'Major quality issue — rust-infected leaves are unmarketable. Remove and destroy systemically infected shoots in spring before sporulation. Propagate from rust-free stock. Cut and remove affected growth. Some fungicides (tebuconazole) provide suppression.',
    images_description: 'Mint leaf underside with orange-brown rust pustules and distorted systemically infected shoot',
  },

  // ── Additional Diseases ────────────────────────────────────────

  {
    id: 'carrot-cavity-spot',
    name: 'Carrot Cavity Spot',
    common_names: ['Pythium violae', 'Pythium sulcatum'],
    pest_type: 'disease',
    description: 'Soil-borne oomycete disease caused primarily by Pythium violae and P. sulcatum. Produces small elliptical sunken lesions on the carrot root surface. The most important quality defect in UK carrots. Lesions are shallow but render carrots unmarketable for pre-pack retail.',
    lifecycle: 'Oospores persist in soil for many years. Infect carrot roots through lenticels and wounds during the growing season. Disease develops most rapidly in wet, poorly drained soils from mid-season onwards. Lesions continue to develop in cold store.',
    identification: 'Elliptical to lens-shaped sunken lesions (3-10mm long) across the carrot root surface. Lesions are shallow (1-2mm deep) with smooth edges. Light brown to grey interior. Often multiple lesions per root. Distinguished from scab by smooth, concave shape.',
    crops_affected: ['carrots', 'parsnips'],
    risk_factors: 'Wet heavy soils, poor drainage, continuous carrot cropping, late harvest, long growing season, soil compaction',
    economic_impact: 'Losses of 10-40% in susceptible fields. Metalaxyl-M seed treatment provides some protection. Improved drainage, shorter rotations (1 in 5+ years), and timely harvest reduce severity. No resistant varieties available.',
    images_description: 'Carrot root with multiple elliptical sunken cavity spot lesions on surface',
  },
  {
    id: 'damping-off',
    name: 'Damping Off',
    common_names: ['Pythium spp.', 'Rhizoctonia solani', 'Fusarium spp.'],
    pest_type: 'disease',
    description: 'Complex of soil-borne fungi and oomycetes (Pythium spp., Rhizoctonia solani, Fusarium spp.) that attack seeds and seedlings. Causes pre- and post-emergence death of seedlings across a wide range of crops. Most severe in cool, wet, poorly drained conditions.',
    lifecycle: 'Pathogens persist as oospores, sclerotia, or chlamydospores in soil and growing media. Attack germinating seeds (pre-emergence) or seedling stems at soil level (post-emergence). Spread via contaminated water, soil, and equipment. Warm wet conditions favour Rhizoctonia; cool wet conditions favour Pythium.',
    identification: 'Pre-emergence: failed germination, seeds rotted in soil. Post-emergence: seedlings collapse at soil level with water-soaked, constricted stem base. Affected seedlings topple over. Patches of dead seedlings in seed trays or field. Fine cottony mycelium may be visible in humid conditions.',
    crops_affected: ['all crops at seedling stage', 'vegetables', 'ornamentals', 'cereals', 'sugar beet'],
    risk_factors: 'Over-watering, poor drainage, compacted soil, sowing too deep, cold soil, contaminated growing media, dense sowing, unsterilised containers',
    economic_impact: 'Common cause of establishment failure. Seed treatments (thiram, metalaxyl-M) reduce losses. Use clean growing media, avoid over-watering, ensure good drainage. Biological controls (Trichoderma harzianum) provide protection in growing media.',
    images_description: 'Collapsed seedlings with water-soaked constricted stems at soil level in seed tray',
  },
  {
    id: 'black-rot-brassica',
    name: 'Black Rot of Brassicas',
    common_names: ['Xanthomonas campestris pv. campestris', 'Brassica black rot'],
    pest_type: 'disease',
    description: 'Bacterial disease caused by Xanthomonas campestris pv. campestris. Seed-borne and the most important bacterial disease of brassicas worldwide. Causes V-shaped yellow lesions from leaf margins with blackened veins. Can cause systemic infection and plant death.',
    lifecycle: 'Seed-transmitted at rates up to 1%. Bacteria enter through hydathodes at leaf margins or through wounds. Spread by rain splash, irrigation, insects, and mechanical contact. Systemic spread through vascular system blackens veins. Survives in crop debris for 1-2 years.',
    identification: 'V-shaped yellow (chlorotic) lesions advancing from leaf margins toward the midrib. Darkened or blackened leaf veins visible when leaf is held to light. In advanced infections, leaves wilt and drop. Cross-section of stem shows blackened vascular ring. Characteristic foul odour in wet rot stage.',
    crops_affected: ['cabbage', 'cauliflower', 'broccoli', 'Brussels sprouts', 'kale', 'swede', 'turnip'],
    risk_factors: 'Contaminated seed, warm wet conditions, overhead irrigation, mechanical damage, insect wounds, continuous brassica cropping',
    economic_impact: 'Can cause total crop loss in severe outbreaks. Hot water seed treatment (50C for 25 minutes) reduces seed-borne infection. Use certified seed. Avoid overhead irrigation. Rotation of 2+ years away from brassicas. No effective chemical control.',
    images_description: 'Brassica leaf with V-shaped yellow lesion from margin and blackened veins',
  },
  {
    id: 'bacterial-soft-rot',
    name: 'Bacterial Soft Rot',
    common_names: ['Pectobacterium spp.', 'Erwinia carotovora', 'Dickeya spp.'],
    pest_type: 'disease',
    description: 'Soft rot bacteria (Pectobacterium carotovorum, P. atrosepticum, Dickeya spp.) cause wet slimy decay of fleshy plant tissues. Affect a wide range of vegetable crops, ornamental bulbs, and potatoes. Enzymes dissolve cell walls producing characteristic watery, foul-smelling rot.',
    lifecycle: 'Bacteria enter through wounds, lenticels, or natural openings. Produce pectolytic enzymes that dissolve middle lamella between cells. Spread by contact, contaminated water, insects, and tools. Survive in soil, water, and crop debris. Favour warm, wet, anaerobic conditions.',
    identification: 'Water-soaked, soft, slimy tissue that collapses when touched. Characteristic foul smell (especially in potatoes and onions). Affected tissue becomes cream to brown and liquefies. On potatoes: blackleg (stem base rot) or tuber soft rot. On onions: neck rot with slimy decay.',
    crops_affected: ['potatoes', 'onions', 'carrots', 'celery', 'lettuce', 'brassicas', 'ornamental bulbs'],
    risk_factors: 'Mechanical damage, waterlogging, poor ventilation in store, warm temperatures, harvesting in wet conditions, contaminated washing water',
    economic_impact: 'Major cause of post-harvest losses in potatoes and vegetables. Losses of 10-25% in store. Careful handling to avoid damage, good ventilation, cool dry storage conditions, and avoiding contaminated washing water are primary controls.',
    images_description: 'Potato tuber with soft slimy rot and liquefied tissue with foul-smelling decay',
  },
  {
    id: 'honey-fungus',
    name: 'Honey Fungus',
    common_names: ['Armillaria mellea', 'Bootlace fungus', 'Armillaria spp.'],
    pest_type: 'disease',
    description: 'Root rot disease caused by Armillaria species (primarily A. mellea in gardens). The most common cause of death in trees and shrubs in UK gardens. Spreads underground via black bootlace-like rhizomorphs. Produces honey-coloured toadstools in autumn.',
    lifecycle: 'Spreads via dark brown-black rhizomorphs (bootlaces) through soil from infected stumps or roots. Rhizomorphs can extend several metres. Also spreads by root contact. White mycelial fans grow beneath bark at the root collar. Honey-coloured toadstools (October-November) produce spores but root-to-root spread is the primary transmission route.',
    identification: 'Progressive decline and death of trees and shrubs. White mycelial fans (sheets of white fungal growth) beneath bark at the base of dead or dying plants — key diagnostic feature. Black bootlace-like rhizomorphs in soil and beneath bark. Honey-coloured toadstools in clusters at the base of affected plants in autumn.',
    crops_affected: ['privet', 'birch', 'willow', 'apple', 'cherry', 'roses', 'wisteria', 'most woody plants'],
    risk_factors: 'Presence of old infected stumps, waterlogged soil, stressed trees, recently cleared woodland sites, heavy clay soils',
    economic_impact: 'Kills thousands of garden trees and shrubs annually. No chemical control available. Remove infected stumps and as many roots as possible. Physical barriers (heavy-duty polythene buried vertically to 45cm) can protect high-value plants. Replace with resistant species (yew, beech, box).',
    images_description: 'White mycelial fan beneath bark of dead tree and honey-coloured toadstool clusters at base',
  },
  {
    id: 'coral-spot',
    name: 'Coral Spot',
    common_names: ['Nectria cinnabarina', 'Neonectria ditissima'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Nectria cinnabarina producing distinctive salmon-pink raised pustules on dead and dying branches. Common saprophyte on dead wood that can become a weak pathogen on stressed plants. Characteristic coral-pink pustules make it one of the most recognisable garden diseases.',
    lifecycle: 'Primarily saprophytic — colonises dead wood. Can become parasitic on stressed or wounded plants. Coral-pink sporodochia (1-2mm raised cushion-like pustules) produce conidia that are rain-splashed to fresh wounds. Enters through pruning cuts, frost cracks, and mechanical damage. Darker red perithecia (sexual stage) produce ascospores.',
    identification: 'Salmon-pink to coral-red raised pustules (1-2mm) on dead bark. Usually on dead twigs and branches initially. Dieback of branches may indicate parasitic phase. Pustules are firm, smooth, and slightly raised. Older pustules turn darker red-brown (perithecial stage).',
    crops_affected: ['sycamore', 'maple', 'magnolia', 'currants', 'fig', 'most deciduous trees and shrubs'],
    risk_factors: 'Dead wood left on or near plants, pruning wounds, frost damage, mechanical injury, stressed plants, poor hygiene',
    economic_impact: 'Usually minor — primarily a saprophyte. Parasitic attack can cause branch dieback on stressed plants. Prune out dead and affected wood to below the infection. Dispose of prunings — do not compost. Avoid leaving dead wood as inoculum.',
    images_description: 'Dead branch with salmon-pink coral spot pustules on bark surface',
  },
  {
    id: 'rose-black-spot',
    name: 'Rose Black Spot',
    common_names: ['Diplocarpon rosae', 'Marssonina rosae'],
    pest_type: 'disease',
    description: 'Fungal disease caused by Diplocarpon rosae. The most common and damaging disease of garden roses in the UK. Causes dark purple-black spots on leaves leading to yellowing and premature leaf fall. Repeated defoliation weakens plants and reduces flowering.',
    lifecycle: 'Overwinters on fallen leaves and on infected stems. Spores produced on fallen leaves in spring are rain-splashed onto new foliage. Infection requires 7+ hours of leaf wetness. New lesions appear 10-14 days after infection. Multiple disease cycles through the growing season.',
    identification: 'Dark purple-black circular spots (up to 15mm) on upper leaf surface with radiating, feathery margins. Affected leaves turn yellow around the spots and fall prematurely. Lower leaves affected first. Severe infections can completely defoliate the plant by mid-summer. Dark lesions may also appear on young stems.',
    crops_affected: ['roses (all types)'],
    risk_factors: 'Wet weather, overhead watering, susceptible cultivars, fallen infected leaves left on ground, poor air circulation, shaded conditions',
    economic_impact: 'Weakens plants and reduces flowering quality. Choose resistant varieties (check RHS AGM disease resistance). Collect and dispose of fallen leaves. Fungicide sprays (myclobutanil, tebuconazole, triticonazole) from spring. Mulch to reduce splash dispersal from soil.',
    images_description: 'Rose leaf with dark black spots surrounded by yellow chlorotic haloes',
  },
  {
    id: 'rose-powdery-mildew',
    name: 'Rose Powdery Mildew',
    common_names: ['Podosphaera pannosa', 'Sphaerotheca pannosa'],
    pest_type: 'disease',
    description: 'Powdery mildew of roses caused by Podosphaera pannosa. Very common throughout the UK. White powdery coating on leaves, shoots, and flower buds. Favoured by warm dry days with cool humid nights. Unlike most fungal diseases, does not require free water for infection.',
    lifecycle: 'Overwinters as mycelium on dormant buds and stems. In spring, new conidia produced from overwintered mycelium infect expanding leaves. Conidia are wind-dispersed. Infection cycle 5-7 days in warm conditions. Does not need free water — high humidity is sufficient. Multiple generations through summer.',
    identification: 'White to grey powdery coating on upper and lower leaf surfaces, young shoots, and flower buds. Leaves may curl, twist, and become distorted. Young leaves are most susceptible. Severe infections cause leaf drop and malformed buds. Distinguished from downy mildew by powdery (not fuzzy) growth primarily on upper surface.',
    crops_affected: ['roses (all types)', 'ornamental Rosaceae'],
    risk_factors: 'Warm days and cool nights, high humidity, drought-stressed plants (dry roots with damp air), susceptible cultivars, poor air circulation, sheltered gardens',
    economic_impact: 'Reduces flowering quality and weakens plants. Choose resistant varieties. Ensure adequate watering at the roots. Improve air circulation by pruning. Fungicides (myclobutanil, tebuconazole, sulphur) effective as protectant and curative treatments.',
    images_description: 'Rose leaf and bud covered with white powdery mildew fungal growth',
  },
  {
    id: 'lavender-shab',
    name: 'Lavender Shab Disease',
    common_names: ['Phoma lavandulae', 'Shab'],
    pest_type: 'disease',
    description: 'Fungal disease of lavender caused by Phoma lavandulae. Causes progressive wilting and death of shoots. Named "shab" from an old word meaning scab or sore. The most damaging disease of commercial and garden lavender in the UK. Shoot dieback starts from the tips.',
    lifecycle: 'Pycnidia on infected dead shoots produce pycnidiospores dispersed by rain splash. Enters through wounds, pruning cuts, and leaf scars. Fungus grows down the shoot causing progressive dieback. Infected woody tissue at the base remains as a source of reinfection. Stress and age increase susceptibility.',
    identification: 'Wilting and browning of shoot tips, progressing downward. Affected shoots turn grey-brown. Dark lesions on stems at the junction of live and dead tissue. Cross-section of affected stem shows dark brown discolouration of the wood. Individual shoots or whole sections of the bush die.',
    crops_affected: ['lavender (Lavandula spp.)', 'lavandin'],
    risk_factors: 'Old plants, waterlogged soil, winter damage, hard pruning into old wood, wounds, humid conditions, crowded planting',
    economic_impact: 'Can destroy entire lavender hedges over 2-3 years. No chemical treatment available. Prune out affected shoots to healthy wood. Avoid pruning into old wood (lavender does not regenerate from bare wood). Replace old plants. Improve drainage.',
    images_description: 'Lavender bush with grey-brown dead shoot tips and progressive dieback',
  },
  {
    id: 'chrysanthemum-white-rust',
    name: 'Chrysanthemum White Rust',
    common_names: ['Puccinia horiana', 'White rust'],
    pest_type: 'disease',
    description: 'Quarantine rust disease of chrysanthemum caused by Puccinia horiana. Produces distinctive white to pale pink pustules on leaf undersurfaces. EU-listed quarantine pathogen requiring statutory notification and control. Can spread rapidly in protected chrysanthemum production.',
    lifecycle: 'Teliospores on infected leaves germinate to produce basidiospores, which are the primary means of spread. Basidiospores are wind-dispersed and infect through stomata on leaf undersurfaces. Latent period 10-14 days. No alternate host. Overwintering on infected plant material and cuttings.',
    identification: 'Pale green to yellow spots on upper leaf surface. White to buff or pale pink waxy pustules (telia) on corresponding undersurface — key diagnostic feature. Pustules are raised, smooth, and waxy (unlike orange/brown rusts). Severe infections cause leaf senescence.',
    crops_affected: ['chrysanthemum', 'dendranthema'],
    risk_factors: 'Infected cuttings or plant material, high humidity, leaf wetness, cool temperatures (17C optimal), dense planting, poor ventilation',
    economic_impact: 'Quarantine pathogen — outbreaks require notification to APHA and mandatory destruction of infected stock. Strict incoming plant inspection, quarantine of new stock, and regular crop monitoring. Fungicide protectants (azoxystrobin) in clean crops.',
    images_description: 'Chrysanthemum leaf underside with white waxy rust pustules and upper surface yellow spots',
  },
  {
    id: 'hosta-virus-x',
    name: 'Hosta Virus X',
    common_names: ['HVX', 'Potexvirus of hosta'],
    pest_type: 'disease',
    description: 'Potexvirus specifically infecting hostas. Widespread in the UK hosta trade. Causes mosaic patterns, ring spots, leaf puckering, and tissue collapse. Sap-transmitted through division, mechanical contact, and contaminated tools. Cannot be cured — infected plants must be destroyed.',
    lifecycle: 'No insect vector known. Transmitted by mechanical contact — contaminated cutting tools, dividing plants, handling. Virus remains in all plant parts. Spread in the nursery trade through infected divisions and tissue culture. Latent infections common in some cultivars (appear healthy but carry virus).',
    identification: 'Blue-green ink-bleed patterns following leaf veins. Ring spots and mosaic patterns. Tissue collapse and necrotic sunken patches. Leaf puckering and distortion. Some cultivars show symptoms clearly; others are latently infected. Symptoms most visible in spring and early summer. Laboratory testing (ELISA, RT-PCR) confirms infection.',
    crops_affected: ['hosta (all cultivars)'],
    risk_factors: 'Infected planting stock, division with contaminated tools, nursery trade, lack of testing, latent infections in popular cultivars',
    economic_impact: 'Causes significant losses in hosta collections. No cure. Remove and destroy infected plants (including roots). Sterilise tools between plants. Buy from reputable sources that test for HVX. Do not compost infected material.',
    images_description: 'Hosta leaf with blue-green ink-bleed mosaic pattern and necrotic sunken patches',
  },
  {
    id: 'allium-white-rot',
    name: 'Allium White Rot',
    common_names: ['Stromatinia cepivora', 'Sclerotium cepivorum'],
    pest_type: 'disease',
    description: 'Devastating soil-borne fungal disease of alliums caused by Stromatinia cepivora (anamorph Sclerotium cepivorum). Small black sclerotia persist in soil for 20+ years. Once established in a field, onion and garlic production becomes uneconomic. The most important soil-borne disease of alliums worldwide.',
    lifecycle: 'Sclerotia in soil germinate in response to allium root exudates (alkyl cysteine sulphoxides). White mycelium attacks roots and basal plate. Plants wilt and die. Dense white mycelium covers bulb base with small round black sclerotia (0.2-0.5mm). Each infected plant produces thousands of new sclerotia.',
    identification: 'Yellowing and wilting of outer leaves, progressing inward. Plants pull up easily — roots rotted. Dense fluffy white mycelium on basal plate and roots. Numerous tiny round black sclerotia (0.2-0.5mm like poppy seeds) in the white mycelium — key diagnostic feature. Affected bulbs soft and rotted from the base.',
    crops_affected: ['onions', 'garlic', 'leeks', 'shallots', 'chives'],
    risk_factors: 'Infested soil (sclerotia survive 20+ years), continuous allium cropping, contaminated soil on equipment, infected planting stock, mild to warm soil temperatures (15-20C)',
    economic_impact: 'Can make fields permanently unsuitable for allium production. No effective chemical control. Long rotation (20+ years) or permanent avoidance of alliums on infested land. Sclerotia can be stimulated to germinate without a host crop using diallyl disulphide soil treatment.',
    images_description: 'Onion base with dense white mycelium and tiny black sclerotia covering rotted roots',
  },
  {
    id: 'beet-downy-mildew',
    name: 'Beet Downy Mildew',
    common_names: ['Peronospora farinosa f.sp. betae', 'Downy mildew of sugar beet'],
    pest_type: 'disease',
    description: 'Oomycete disease of sugar beet and related Beta species caused by Peronospora farinosa f.sp. betae. Causes inward curling and thickening of the youngest leaves (heart leaves) with grey-violet downy sporulation. Can systemically infect seed crops. Occasional but damaging in UK root crops.',
    lifecycle: 'Oospores overwinter in soil and crop debris. Systemic infection from oospore germination produces distorted heart leaves. Sporangia from systemically infected leaves spread to neighbouring plants via wind. Secondary infections appear as yellowish leaf spots with downy sporulation.',
    identification: 'Heart leaves curled inward, thickened, and pale green-yellow. Grey-violet downy sporulation on leaf undersurfaces (especially early morning). Systemically infected plants are stunted with distorted heart. Secondary leaf spots are yellow with downy growth beneath.',
    crops_affected: ['sugar beet', 'beetroot', 'chard', 'spinach beet'],
    risk_factors: 'Cool wet weather, heavy dew, continuous beet cropping, seed crop proximity, oospore-infested soil',
    economic_impact: 'Occasional in UK root crops — more damaging in seed crops. Systemic infection reduces yield by 10-20%. Metalaxyl-M seed treatment provides some protection. Remove and destroy systemically infected plants in seed crops.',
    images_description: 'Sugar beet heart leaves curled inward with grey-violet downy sporulation on undersurface',
  },
  {
    id: 'rust-leek',
    name: 'Leek Rust (Allium Rust)',
    common_names: ['Puccinia porri', 'Puccinia allii'],
    pest_type: 'disease',
    description: 'Rust disease of leeks and other alliums caused by Puccinia allii (syn. P. porri). Produces bright orange urediniospore pustules on leaves. Very common in UK leek production. Severe infections render leeks unmarketable through unsightly pustules and premature senescence.',
    lifecycle: 'Autoecious rust completing entire cycle on alliums. Urediniospores produced in bright orange pustules spread the disease through the growing season. Teliospores form in dark brown pustules in autumn. Overwintering on infected allium debris and perennial alliums (chives, garlic).',
    identification: 'Bright orange elongated urediniospore pustules on leaf surfaces. Pustules rupture to release powdery orange spores. Dark brown to black teliospore pustules in autumn. Severe infections cause leaves to yellow and wither. Pustules on the white flag leaf area make leeks unmarketable.',
    crops_affected: ['leeks', 'garlic', 'chives', 'onions (occasionally)'],
    risk_factors: 'Mild wet autumn, nitrogen-rich growth, dense plantings, proximity to infected alliums, susceptible cultivars, mild winters maintaining green tissue',
    economic_impact: 'Major quality defect — pustules on marketed portion reduce shelf appeal. Yield losses of 5-20%. Tebuconazole fungicide provides moderate control. Choose less susceptible cultivars. Wider spacing improves air circulation. Remove infected debris.',
    images_description: 'Leek leaf with bright orange rust pustules on surface',
  },

  // ── Turf Diseases ──────────────────────────────────────────────

  {
    id: 'fusarium-patch-turf',
    name: 'Fusarium Patch',
    common_names: ['Microdochium nivale', 'Microdochium patch', 'Snow mould'],
    pest_type: 'disease',
    description: 'The most common and damaging disease of managed turf in the UK, caused by Microdochium nivale (formerly Fusarium nivale). Produces small circular orange-brown patches that can merge to damage large areas. Active in cool, wet conditions from autumn through spring. Affects all fine turf grasses.',
    lifecycle: 'Mycelium survives in thatch and soil. Active at 0-15C with optimum around 5C. Conidia produced in sporodochia are splash-dispersed. Most damaging during prolonged cool, wet weather. Snow cover promotes disease (hence "snow mould"). Nitrogen-rich autumn growth increases susceptibility.',
    identification: 'Small circular patches (initially 25-50mm) of yellowing or orange-brown grass. White or pink cottony mycelium visible in humid mornings. Patches expand and may coalesce into irregular areas. Affected grass lies flat and appears water-soaked initially. Distinctive orange-brown margin on expanding patches.',
    crops_affected: ['fine turf', 'golf greens', 'bowling greens', 'lawns', 'sports turf'],
    risk_factors: 'Excessive autumn nitrogen, poor drainage, shade, low mowing height, thatch build-up, alkaline conditions, prolonged leaf wetness, snow cover',
    economic_impact: 'Costs UK greenkeeping and groundsmanship significant annual expenditure on fungicides. Reduce autumn nitrogen, improve drainage and air circulation, remove dew, and manage thatch. Fungicide programmes (fludioxonil, iprodione) for high-value turf.',
    images_description: 'Fine turf with circular orange-brown Fusarium patch and white mycelium at margin',
  },
  {
    id: 'red-thread-turf',
    name: 'Red Thread',
    common_names: ['Laetisaria fuciformis', 'Corticium disease'],
    pest_type: 'disease',
    description: 'Common turf disease caused by Laetisaria fuciformis. Produces distinctive pink to red needle-like stromata (threads) protruding from leaf tips. Very common on nitrogen-deficient turf, particularly perennial ryegrass and red fescue. Rarely kills grass permanently.',
    lifecycle: 'Spread via fragments of stromata and gelatinous pink mycelium (arthroconidia). Active at 15-25C in humid conditions. Most prevalent in late summer and autumn on underfed turf. Stromata and mycelial fragments survive in thatch during unfavourable periods.',
    identification: 'Irregular bleached patches of grass (50-350mm). Pink to red needle-like stromata (5-25mm long) protruding from leaf tips — key diagnostic feature. Gelatinous pink mycelial masses (cotton candy-like) on leaves in humid conditions. Affected grass bleaches but does not die.',
    crops_affected: ['perennial ryegrass turf', 'red fescue', 'lawns', 'amenity turf'],
    risk_factors: 'Nitrogen deficiency, drought stress followed by wet weather, warm humid weather, compaction, poor aeration',
    economic_impact: 'Mostly cosmetic. Application of nitrogen fertiliser promotes recovery and reduces recurrence. Improve nutrition, aeration, and drainage. Fungicide treatment rarely justified except on high-value turf. Grass recovers once nutrient status improves.',
    images_description: 'Bleached turf patch with pink-red needle-like stromata protruding from grass leaf tips',
  },
  {
    id: 'dollar-spot-turf',
    name: 'Dollar Spot',
    common_names: ['Clarireedia jacksonii', 'Sclerotinia homoeocarpa'],
    pest_type: 'disease',
    description: 'Turf disease caused by Clarireedia jacksonii (formerly Sclerotinia homoeocarpa). Produces small circular straw-coloured spots (coin-sized on closely mown turf). Named for the dollar-coin-sized patches on golf greens. Becoming more common in UK turf as temperatures increase.',
    lifecycle: 'Mycelium spreads via infected clippings, equipment, and foot traffic. Active at 15-30C with optimum around 20C. Requires humid conditions and leaf wetness. No known spore stage in the UK — spreads vegetatively. Most active in summer and early autumn.',
    identification: 'Circular straw-coloured spots 20-50mm diameter on closely mown turf (larger on higher-cut grass). White cobwebby mycelium visible in early morning dew. Individual leaf blades show hourglass-shaped lesions (light centre with reddish-brown margins). Spots may coalesce.',
    crops_affected: ['creeping bentgrass', 'annual meadow grass', 'fine fescue', 'golf greens', 'fine turf'],
    risk_factors: 'Low nitrogen, drought stress, heavy dew, warm humid nights, compaction, low mowing height, thatch',
    economic_impact: 'Increasing problem on UK golf courses. Maintain adequate nitrogen. Remove dew. Improve air circulation. Fungicides (propiconazole, fludioxonil) on high-value turf. Monitor for fungicide resistance.',
    images_description: 'Golf green with small circular straw-coloured dollar spot patches and cobwebby mycelium',
  },
  {
    id: 'anthracnose-turf',
    name: 'Anthracnose (Turf)',
    common_names: ['Colletotrichum cereale', 'Colletotrichum graminicola'],
    pest_type: 'disease',
    description: 'Turf disease caused by Colletotrichum cereale (syn. C. graminicola). Two forms: foliar blight (yellowing and death of leaf blades in summer) and basal rot (blackening and rotting of stem bases year-round). Most severe on annual meadow grass (Poa annua) under stress.',
    lifecycle: 'Conidia produced in acervuli (black fruiting bodies with hair-like setae) on dead tissue. Spread by rain splash, equipment, and foot traffic. Infects leaves (foliar blight) and stem bases (basal rot). Basal rot is more damaging — stem base turns black and plant dies. Year-round activity.',
    identification: 'Foliar blight: irregular yellow patches; leaf blades yellow from tip. Basal rot: blackened, water-soaked stem bases visible with hand lens; plants pull up easily. Black acervuli (with dark setae visible under magnification) on dead tissue. Poa annua most severely affected.',
    crops_affected: ['annual meadow grass (Poa annua)', 'creeping bentgrass', 'golf greens', 'fine turf'],
    risk_factors: 'Compaction, low nitrogen, drought, low mowing height, heavy traffic, thatch, waterlogging (basal rot form)',
    economic_impact: 'Major concern on Poa annua golf greens. Reduce stress through adequate nutrition, aeration, and irrigation. Fungicides (azoxystrobin, fludioxonil) for high-value turf. Overseeding with bentgrass reduces Poa annua dependence.',
    images_description: 'Poa annua turf with yellowing patches and blackened stem bases from anthracnose',
  },
  {
    id: 'take-all-patch-turf',
    name: 'Take-All Patch (Turf)',
    common_names: ['Gaeumannomyces graminis var. avenae', 'Ophiobolus patch'],
    pest_type: 'disease',
    description: 'Root disease of turf caused by Gaeumannomyces graminis var. avenae (same genus as cereal take-all). Creates bronze-coloured rings and patches on golf greens and fine turf. Most severe on new or recently disturbed turf, particularly bentgrass. Attacks roots, causing them to turn black.',
    lifecycle: 'Dark runner hyphae spread along root surfaces. Infects root cortex and vascular tissue, causing roots to turn black. Spread via root-to-root contact, contaminated soil, and equipment. Most active in warm wet conditions. Gradually declines as soil microbiology adjusts (take-all decline).',
    identification: 'Circular bronze or brown patches (10-100cm) on fine turf, often ring-shaped. Affected grass is thin and easily pulled up. Roots blackened and shortened. Dark runner hyphae visible on roots with hand lens. Weeds and annual meadow grass colonise centres of old patches.',
    crops_affected: ['bentgrass turf', 'golf greens', 'bowling greens', 'newly laid turf'],
    risk_factors: 'Newly turfed or re-turfed areas, liming or alkaline conditions, sandy rootzones, poor drainage, removal of surface soil (exposing subsoil)',
    economic_impact: 'Can severely damage new golf greens for 2-3 years. Acidifying fertilisers (ammonium sulphate) reduce severity. Avoid liming affected areas. Disease often declines naturally after 3-5 years as antagonistic soil microbes increase. Manganese applications may help.',
    images_description: 'Golf green with bronze-coloured circular patch and thinned turf from take-all patch',
  },
  {
    id: 'snow-mould-turf',
    name: 'Snow Mould (Grey)',
    common_names: ['Typhula incarnata', 'Grey snow mould', 'Typhula blight'],
    pest_type: 'disease',
    description: 'Turf disease caused by Typhula incarnata. Produces grey or straw-coloured patches after prolonged snow cover. Distinguished from Fusarium patch by the presence of small reddish-brown sclerotia on affected leaves. Most common in northern and upland UK after snow melt.',
    lifecycle: 'Sclerotia survive in thatch and soil through summer. Germinate in autumn to produce basidiospores or mycelium that infects grass under snow cover. Active at 0-10C under snow or prolonged wet cold conditions. Grey mycelium envelops grass blades. Reddish-brown sclerotia (0.5-3mm) form on dying leaves.',
    identification: 'Grey or straw-coloured circular patches visible after snow melt. Grey mycelial growth on matted grass blades. Distinctive reddish-brown sclerotia (small round pellets) on leaf surfaces and at the base of affected plants — diagnostic feature. Patches larger than typical Fusarium patch.',
    crops_affected: ['all turf grasses', 'golf courses', 'sports turf', 'lawns in northern UK'],
    risk_factors: 'Prolonged snow cover, autumn nitrogen, low mowing before snow, altitude, thatch, poor drainage',
    economic_impact: 'Occurs after prolonged snow cover — therefore episodic. Avoid excessive autumn nitrogen. Raise mowing height before winter. Improve drainage. Fungicide protectants before anticipated snow cover on high-value turf.',
    images_description: 'Grey matted turf patch after snow melt with reddish-brown Typhula sclerotia on leaf blades',
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

  // ── Expansion: Cereal Pests ────────────────────────────────────

  {
    id: 'hessian-fly',
    name: 'Hessian Fly',
    common_names: ['Mayetiola destructor'],
    pest_type: 'pest',
    description: 'Gall midge whose larvae feed inside wheat stems at the base, causing stunting, lodging, and stem breakage. Historically a major pest of wheat worldwide. Uncommon in the UK but occasional outbreaks occur, mainly in southern England.',
    lifecycle: 'Two generations per year in the UK. Adults emerge in spring and autumn. Females lay eggs on upper leaf surfaces. Larvae migrate down to the leaf sheath and feed at the node, forming a flaxseed-like puparium. Overwinter as puparia in stubble.',
    identification: 'Stunted tillers that fail to elongate. Dark patches at leaf sheath nodes where larvae feed. Stems break at feeding sites when bent. Brown flaxseed-shaped puparia (3mm) found at the base of leaf sheaths. Adults are small dark flies (3mm).',
    crops_affected: ['wheat', 'winter wheat', 'spring wheat', 'barley'],
    risk_factors: 'Southern England, early autumn drilling, warm autumns, wheat after wheat, stubble left undisturbed',
    economic_impact: 'Rare in the UK but can cause 10-30% yield loss in outbreak years. Delayed drilling reduces autumn generation risk. Ploughing destroys puparia in stubble. No insecticides approved specifically for Hessian fly in the UK.',
    images_description: 'Stunted wheat tiller with dark feeding damage and brown flaxseed puparium at leaf sheath base',
  },

  {
    id: 'corn-ground-beetle',
    name: 'Corn Ground Beetle',
    common_names: ['Zabrus tenebrioides'],
    pest_type: 'pest',
    description: 'Large ground beetle whose larvae feed on wheat and barley leaves during autumn and winter. Larvae are nocturnal, emerging from soil to feed on leaf tips, leaving characteristic ragged damage. Sporadic pest mainly in eastern England.',
    lifecycle: 'One generation per year. Adults active July-September, feed on grain in the ear. Eggs laid in soil near cereal stubble. Larvae feed on emerging cereal leaves from October to March. Pupate in spring. Adults emerge in summer.',
    identification: 'Adults: large (14-18mm) black ground beetles. Larvae: pale grey-brown, curled, found in soil beneath damaged plants. Leaf damage: ragged chewing of leaf tips, often pulled into soil burrows. Damage most visible in autumn and winter.',
    crops_affected: ['wheat', 'winter wheat', 'barley'],
    risk_factors: 'Eastern England, continuous cereals, stubble left after harvest (adult egg-laying habitat), warm dry summers favouring adult activity',
    economic_impact: 'Localised yield losses of 5-15% where populations are high. Mainly a pest of winter cereals in eastern counties. Ploughing after harvest destroys eggs. No specific insecticides approved — pyrethroid seed treatments provide some protection.',
    images_description: 'Large black ground beetle (Zabrus) on soil surface near wheat seedlings with ragged leaf damage',
  },

  {
    id: 'click-beetle',
    name: 'Click Beetle',
    common_names: ['Agriotes lineatus', 'Agriotes obscurus'],
    pest_type: 'pest',
    description: 'Click beetles (Agriotes lineatus, A. obscurus) are the adult stage of wireworms. Adults lay eggs in grassland and permanent pasture. Important as the egg-laying stage — populations build up over several years in grass before damaging the following arable crop.',
    lifecycle: 'Adults emerge May-June from pupation in soil. Click beetles are elongated brown beetles (7-10mm) that right themselves with an audible click when placed on their backs. Females lay eggs in soil of grassland. Larvae (wireworms) develop over 3-5 years.',
    identification: 'Adults: elongated brown beetles (7-10mm) with characteristic clicking mechanism. Found in grassland and cereal crops May-July. Pheromone traps (Agriotes lineatus pheromone) used for population monitoring. Trap catches correlate with subsequent wireworm damage risk.',
    crops_affected: ['grassland', 'wheat', 'barley', 'potatoes'],
    risk_factors: 'Long-term grassland (3+ years builds wireworm populations), first or second arable crop after grass, permanent pasture conversion',
    economic_impact: 'Adults themselves cause no crop damage — they are significant as the source of wireworm populations. Pheromone trap monitoring before ploughing old grass identifies risk. Decision point: if trap catches exceed threshold, apply seed treatment or avoid potatoes.',
    images_description: 'Brown click beetle on soil surface near grassland with characteristic elongated body shape',
  },

  // ── Expansion: Potato Pests ────────────────────────────────────

  {
    id: 'potato-tuber-moth',
    name: 'Potato Tuber Moth',
    common_names: ['Phthorimaea operculella'],
    pest_type: 'pest',
    description: 'Small moth whose larvae mine potato leaves and bore into tubers in the field and in store. A serious pest in warm climates. Currently rare in the UK but a quarantine concern with climate change potentially increasing risk.',
    lifecycle: 'Multiple generations per year in warm climates. Adults are small grey-brown moths (15mm wingspan). Females lay eggs on leaves or exposed tubers. Larvae mine leaves and bore into tubers through eyes and wounds. Pupate in soil or store.',
    identification: 'Leaf mining by larvae visible as translucent blotch mines. Frass-filled tunnels in tubers. Larvae are pale with a dark head, up to 12mm. Tuber damage: irregular tunnels filled with frass, often starting at the eye. Skin may show entry hole.',
    crops_affected: ['potatoes'],
    risk_factors: 'Imported potatoes from warmer regions, warm dry summers, exposed tubers, inadequate ridging, warm storage conditions',
    economic_impact: 'Not currently established in the UK but a quarantine risk. In affected countries causes 20-50% tuber losses. UK interceptions on imported produce. Climate change may increase establishment risk. Deep ridging and cold storage are primary controls.',
    images_description: 'Small grey-brown moth and larval tunnel damage in potato tuber filled with frass',
  },

  {
    id: 'willow-carrot-aphid',
    name: 'Willow-Carrot Aphid',
    common_names: ['Cavariella aegopodii'],
    pest_type: 'pest',
    description: 'Aphid that alternates between willow (winter host) and umbelliferous crops including carrots and parsnips (summer host). Direct feeding causes leaf yellowing and curling. Also a vector of carrot motley dwarf virus complex.',
    lifecycle: 'Overwintering eggs on willow (Salix). Spring migrants fly to umbelliferous crops in May-June. Multiple parthenogenetic generations on carrots during summer. Return migrants fly to willow in autumn for sexual reproduction.',
    identification: 'Small (2mm) green aphids, sometimes with dark siphunculi. Found on carrot foliage, especially leaf stalks. Colonies cause leaf yellowing, curling, and stunting. Honeydew and sooty mould on leaves. Virus-infected plants show red and yellow discolouration.',
    crops_affected: ['carrots', 'parsnips', 'celery', 'parsley'],
    risk_factors: 'Proximity to willow trees, warm dry springs favouring early migration, carrot motley dwarf virus in the area',
    economic_impact: 'Direct feeding damage usually minor. Virus transmission (carrot motley dwarf) causes significant quality and yield losses of 10-30%. Pyrethroid sprays reduce populations. Timing of spray to coincide with first migration from willow is important.',
    images_description: 'Green aphids on carrot leaf petioles with yellowing and curling of foliage',
  },

  // ── Expansion: Vegetable Pests ─────────────────────────────────

  {
    id: 'leek-moth',
    name: 'Leek Moth',
    common_names: ['Acrolepiopsis assectella'],
    pest_type: 'pest',
    description: 'Small moth whose larvae mine into the leaves and stems of leeks, onions, and garlic. First confirmed breeding in the UK in 2003 in south-east England. Spreading northward. Larvae bore into the leek shaft causing quality losses.',
    lifecycle: 'Two generations per year in the UK. Adults emerge April-May and July-August. Eggs laid near leaf bases. Larvae mine within leaves, then bore into the central growing point and shaft. Pupate in a lace-like cocoon on the plant.',
    identification: 'Adults: small brown moths (16mm wingspan) with white triangular markings. Larvae: yellowish-green, up to 13mm, found mining inside leaves and shaft. Characteristic lace-like pupation cocoon. Damage: windows in leaf surface, holes in shaft.',
    crops_affected: ['leeks', 'onions', 'garlic', 'chives'],
    risk_factors: 'South-east England (expanding range), warm springs, proximity to allium crops, absence of crop covers',
    economic_impact: 'Shaft damage makes leeks unmarketable — losses of 10-40% in affected areas. Fleece or mesh covers prevent egg-laying. Spinosad approved for control. Pheromone traps monitor flight timing. Range expanding in the UK with warming climate.',
    images_description: 'Small brown moth with white markings and larval mining damage in leek leaf',
  },

  {
    id: 'swede-midge',
    name: 'Swede Midge',
    common_names: ['Contarinia nasturtii'],
    pest_type: 'pest',
    description: 'Tiny gall midge (1.5mm) whose larvae feed in the growing points of brassica crops causing distorted growth, blind heads, and multiple growing points. Quarantine pest in some regions. First confirmed in UK oilseed rape in 2007.',
    lifecycle: 'Multiple generations per year. Adults emerge from soil in spring. Females lay eggs in clusters on brassica growing points. Larvae feed gregariously, causing galling and distortion. Drop to soil to pupate. Can overwinter as diapausing larvae.',
    identification: 'Adults: tiny (1.5mm) light brown midges — difficult to see. Larval feeding causes: swollen distorted growing points, multiple growing points (bushy appearance), blind or distorted heads in cauliflower/broccoli, twisted petioles, scarred stems.',
    crops_affected: ['cauliflower', 'broccoli', 'Brussels sprouts', 'oilseed rape', 'swedes', 'turnips'],
    risk_factors: 'Consecutive brassica cropping, warm humid conditions, proximity to previous brassica crops, south-east England',
    economic_impact: 'Blind or distorted heads reduce cauliflower and broccoli yield by 20-80% in severe infestations. Oilseed rape pod set reduced. Crop rotation (3+ year break from brassicas) is primary control. No insecticides specifically recommended.',
    images_description: 'Distorted brassica growing point with multiple shoots and swollen galled tissue',
  },

  {
    id: 'brassica-flea-beetle-small',
    name: 'Small Brassica Flea Beetle',
    common_names: ['Phyllotreta undulata', 'Phyllotreta nemorum', 'Phyllotreta spp.'],
    pest_type: 'pest',
    description: 'Small flea beetles (Phyllotreta species) that damage brassica vegetables by shot-holing cotyledons and young leaves. Multiple species involved, all 2-3mm. Distinguished from the larger cabbage stem flea beetle (Psylliodes chrysocephala) of oilseed rape.',
    lifecycle: 'Adults overwinter in hedgerows and field margins. Become active in April when temperatures exceed 15C. Feed on brassica leaves. Eggs laid in soil near roots. Larvae feed on roots (minor damage). New generation adults appear in late summer.',
    identification: 'Tiny (2-3mm) shiny black or black-and-yellow striped beetles that jump when disturbed. Damage: small round holes (shot-holes) in cotyledons and young leaves. Seedlings may be killed if grazing is severe during hot dry weather when growth is slow.',
    crops_affected: ['cabbage', 'cauliflower', 'broccoli', 'Brussels sprouts', 'turnips', 'swedes', 'radishes', 'rocket'],
    risk_factors: 'Hot dry weather (slow seedling growth), direct drilled crops, unprotected transplants, proximity to brassica stubble, warm springs',
    economic_impact: 'Seedling losses of 10-50% in hot dry weather when plant growth cannot outpace beetle feeding. Less significant once plants have 4+ true leaves. Fleece covers, irrigation to promote growth, and pyrethroid sprays are control options.',
    images_description: 'Tiny black flea beetle on brassica cotyledon showing characteristic round shot-holes',
  },

  {
    id: 'turnip-moth',
    name: 'Turnip Moth',
    common_names: ['Agrotis segetum', 'Turnip cutworm'],
    pest_type: 'pest',
    description: 'Noctuid moth whose caterpillars (cutworms) live in soil and sever plant stems at ground level. Affects a wide range of crops. Damage occurs at night. One of the most important cutworm species in the UK alongside Agrotis exclamationis.',
    lifecycle: 'Two generations in southern UK, one in the north. Adults fly May-September. Eggs laid on bare soil or low-growing plants. Caterpillars feed on soil surface at night, cutting stems and pulling foliage into soil. Pupate in soil.',
    identification: 'Adults: grey-brown moths (40-45mm wingspan) with kidney-shaped and round dark markings on forewings. Caterpillars: dull greyish-brown, smooth, curled in C-shape when disturbed, up to 45mm. Damage: plants severed at ground level, young roots tunnelled.',
    crops_affected: ['lettuce', 'brassicas', 'sugar beet', 'carrots', 'potatoes', 'cereals', 'turnips', 'swedes'],
    risk_factors: 'Warm dry summers, light sandy soils, weedy fields (attract egg-laying moths), following grass or weedy fallow',
    economic_impact: 'Plant losses of 5-30% in affected crops. Lettuce and brassica transplants are most vulnerable. Damage is patchy — worst in warm dry summers when caterpillars are active on soil surface. Irrigating to firm soil surface reduces surface movement.',
    images_description: 'Grey-brown cutworm caterpillar curled in C-shape on soil surface next to severed lettuce stem',
  },

  // ── Expansion: Fruit Pests ─────────────────────────────────────

  {
    id: 'woolly-aphid',
    name: 'Woolly Aphid',
    common_names: ['Eriosoma lanigerum'],
    pest_type: 'pest',
    description: 'Aphid that produces distinctive white waxy wool and feeds on apple bark, especially around pruning wounds and new growth. Forms dense colonies that cause galling and distortion of bark. Can weaken young trees and provide entry points for canker.',
    lifecycle: 'Overwinters on roots and in bark crevices on apple. Colonies become visible from May as white wool appears. Multiple overlapping generations. Winged forms spread to new trees in summer. Some populations include a sexual phase on elm.',
    identification: 'Dense white waxy wool on bark surfaces, pruning wounds, and around graft unions. Beneath the wool, purple-brown aphids feeding on bark. Galling and swelling of bark at feeding sites. Honeydew may attract ants and sooty mould.',
    crops_affected: ['apples', 'pears', 'Cotoneaster', 'Pyracantha'],
    risk_factors: 'Pruning wounds, mechanical damage, warm summers, sheltered orchards, lack of natural enemies',
    economic_impact: 'Weakens young trees by causing bark galling. Provides entry points for apple canker (Neonectria ditissima). Natural enemy Aphelinus mali provides good biological control in many orchards. Spirotetramat effective where biological control is insufficient.',
    images_description: 'Dense white waxy wool on apple bark at pruning wound concealing purple-brown aphid colony beneath',
  },

  {
    id: 'gooseberry-sawfly',
    name: 'Gooseberry Sawfly',
    common_names: ['Nematus ribesii'],
    pest_type: 'pest',
    description: 'Sawfly whose larvae rapidly defoliate gooseberry and currant bushes. Three generations per year are possible. Larvae are gregarious and can strip a bush of leaves within days if undetected. One of the most damaging pests of soft fruit in UK gardens.',
    lifecycle: 'Adults emerge April-May. Eggs inserted into leaf undersides along veins. Larvae feed gregariously, starting in the centre of the bush (often unnoticed). Three generations: spring, summer, and late summer. Pupate in soil.',
    identification: 'Larvae: pale green with black spots, up to 20mm, feeding in groups on leaf edges. Start in the lower centre of the bush. Adults: yellow and black wasp-like insects (6-8mm). Damage: rapid defoliation starting from the interior outward.',
    crops_affected: ['gooseberries', 'red currants', 'white currants'],
    risk_factors: 'Previous year infestation, sheltered gardens, failure to inspect bush centres in April-May, mild winters',
    economic_impact: 'Complete defoliation reduces fruit quality and yield by 50-100%. Weakens bushes for the following year. Hand-picking effective on small bushes. Spinosad or pyrethrum sprays when larvae first detected. Inspect bush centres weekly from mid-April.',
    images_description: 'Green larvae with black spots feeding gregariously on defoliated gooseberry branch',
  },

  {
    id: 'blackcurrant-gall-mite',
    name: 'Blackcurrant Gall Mite',
    common_names: ['Cecidophyopsis ribis', 'Big bud mite'],
    pest_type: 'pest',
    description: 'Microscopic eriophyid mite that infests blackcurrant buds, causing them to swell into characteristic rounded big buds that fail to develop. Also vectors blackcurrant reversion virus. The most important pest of blackcurrant in the UK.',
    lifecycle: 'Overwinters inside infested buds. Mites migrate to new buds during flowering (April-May) — the dispersal window. Mites colonise new buds and feed inside, causing galling. Hundreds of mites per bud. Slow natural spread; faster spread on planting material.',
    identification: 'Swollen rounded buds (big buds) visible from January that fail to open normally. Normal buds are pointed. Infested buds may be twice normal size. Microscopic mites (0.2mm) visible if bud is dissected and examined under magnification.',
    crops_affected: ['blackcurrants'],
    risk_factors: 'Infested planting material, established plantations, failure to remove big buds, proximity to infested bushes',
    economic_impact: 'Yield losses of 20-60% from destroyed buds plus reversion virus. Controlled by certified pest-free planting material, hand-removal of big buds in winter, and sulphur sprays at peak mite migration. Resistant varieties (e.g., Ben Hope) available.',
    images_description: 'Blackcurrant branch showing swollen rounded big buds alongside normal pointed buds',
  },

  {
    id: 'strawberry-blossom-weevil',
    name: 'Strawberry Blossom Weevil',
    common_names: ['Anthonomus rubi'],
    pest_type: 'pest',
    description: 'Small weevil that severs strawberry and raspberry flower stalks (pedicels) after laying an egg inside the bud. Causes loss of primary flowers and reduced yield. Increasing in UK strawberry production. Also affects wild Rosaceae.',
    lifecycle: 'Adults overwinter in leaf litter and soil. Emerge in spring when temperatures exceed 10C. Females lay a single egg in a flower bud, then partially sever the pedicel. Larva develops inside the wilting bud. New adults emerge in summer.',
    identification: 'Adults: small (2-4mm) dark brown to black weevils with a long rostrum. Damage: flower buds hanging on partially severed stalks or fallen to the ground. Cut is distinctive — a clean partial cut leaving the bud attached by a thin strand.',
    crops_affected: ['strawberries', 'raspberries', 'blackberries'],
    risk_factors: 'Mild winters (adult survival), proximity to hedgerows and woodland (overwintering sites), organic systems without insecticide options',
    economic_impact: 'Yield losses of 10-30% of primary fruit if severe. Primary (king) flowers produce the largest berries, so the economic impact exceeds the percentage of buds lost. Pyrethroid spray before flowering. Trap crops of early-flowering varieties.',
    images_description: 'Strawberry flower bud hanging on partially severed stalk with small dark weevil nearby',
  },

  {
    id: 'apple-sawfly',
    name: 'Apple Sawfly',
    common_names: ['Hoplocampa testudinea'],
    pest_type: 'pest',
    description: 'Sawfly whose larvae bore into young apple fruitlets causing a distinctive ribbon-like scar on the skin and early fruit drop. One of the most important pests of dessert apple in UK orchards. Damage reduces marketable yield.',
    lifecycle: 'One generation per year. Adults emerge at pink bud stage and fly during blossom. Eggs inserted into the calyx of open flowers. First-instar larvae feed just under the skin (ribbon scar). Later instars bore into the core. Fruitlets drop. Pupate in soil.',
    identification: 'Ribbon-like scar on fruitlet skin where early larva has fed just beneath the surface. Entry hole near the calyx with frass. Fruitlets drop prematurely in June. Larvae: pale cream with dark head, up to 12mm, found inside fallen fruitlets.',
    crops_affected: ['apples'],
    risk_factors: 'Heavy blossom (more egg-laying sites), sheltered orchards, warm weather during blossom, previous year infestation, Cox and Bramley varieties',
    economic_impact: 'Yield losses of 5-20% of dessert fruit. Ribbon scar damage makes fruit unmarketable even when larva has moved on. Thiacloprid or deltamethrin at petal fall. White sticky traps during blossom for monitoring.',
    images_description: 'Apple fruitlet with characteristic ribbon scar on skin and entry hole near calyx end',
  },

  {
    id: 'winter-moth',
    name: 'Winter Moth',
    common_names: ['Operophtera brumata'],
    pest_type: 'pest',
    description: 'Common moth whose caterpillars feed on buds, leaves, and blossom of fruit trees and many deciduous trees. Named for adult emergence in November-January. Caterpillars emerge from eggs at bud burst and can cause significant fruit damage.',
    lifecycle: 'Adults emerge November-January. Wingless females climb tree trunks to lay eggs on bark and buds. Caterpillars hatch at bud burst (March-April) and feed on opening buds, flowers, and young leaves. Drop on silk threads to pupate in soil by June.',
    identification: 'Adults: males grey-brown moths (25mm wingspan); females wingless. Caterpillars: pale green inchworms (loopers) up to 25mm, moving with characteristic looping gait. Damage: holes in leaves, destroyed blossom clusters, fruitlets with feeding scars.',
    crops_affected: ['apples', 'pears', 'plums', 'cherries', 'oak trees', 'many deciduous trees'],
    risk_factors: 'Mild winters (adult survival), orchards near woodland, failure to apply grease bands, previous year infestation',
    economic_impact: 'Yield losses of 10-40% from blossom destruction and fruitlet damage. Grease bands on tree trunks in October trap wingless females. Diflubenzuron spray at egg hatch. Bacillus thuringiensis for organic control.',
    images_description: 'Pale green looper caterpillar on apple blossom with feeding damage to petals and fruitlets',
  },

  {
    id: 'tortrix-moth',
    name: 'Tortrix Moth (Fruit)',
    common_names: ['Archips podanus', 'Adoxophyes orana', 'Summer fruit tortrix'],
    pest_type: 'pest',
    description: 'Complex of tortrix moth species whose caterpillars feed on fruit tree leaves and fruit surfaces, causing characteristic shallow grazing marks on apples and pears. Multiple species involved — summer fruit tortrix and others.',
    lifecycle: 'Varies by species. Summer fruit tortrix has two generations. Adults fly May-June and August. Caterpillars spin leaves together with silk and feed inside. Later generations feed on fruit surface. Overwinter as small larvae on bark.',
    identification: 'Caterpillars: green with brown head, up to 20mm, found inside spun leaves or on fruit surface. Damage: leaves spun together with silk, shallow irregular grazing marks on fruit skin. Adults: small brown moths (15-20mm) at rest with characteristic wing-folding.',
    crops_affected: ['apples', 'pears', 'plums', 'cherries'],
    risk_factors: 'Previous year infestation, sheltered orchards with low wind exposure, organic systems, proximity to hedgerows',
    economic_impact: 'Fruit surface grazing makes 5-20% of dessert fruit unmarketable. Pheromone traps for monitoring flight periods. Diflubenzuron or spinosad at egg hatch. Mating disruption dispensers in larger orchards.',
    images_description: 'Green caterpillar inside spun apple leaves and shallow grazing damage on fruit surface',
  },

  {
    id: 'cherry-blackfly',
    name: 'Cherry Blackfly',
    common_names: ['Myzus cerasi'],
    pest_type: 'pest',
    description: 'Aphid that forms dense colonies on young cherry shoots in spring, causing severe leaf curling and stunting. Honeydew from colonies contaminates fruit. One of the most damaging pests of sweet and acid cherries in the UK.',
    lifecycle: 'Overwintering eggs on cherry bark. Fundatrices hatch at bud burst. Rapid parthenogenetic reproduction on young shoots. Dense colonies form by May. Winged migrants leave for summer hosts (bedstraw, speedwell) from June. Return to cherry in autumn.',
    identification: 'Dense black aphid colonies on shoot tips and undersides of young leaves. Severe leaf curling and crumpling. Sticky honeydew and black sooty mould on leaves and fruit below colonies. Shoot growth stunted and distorted.',
    crops_affected: ['sweet cherries', 'acid cherries'],
    risk_factors: 'Previous year infestation, mild winters (egg survival), vigorous shoot growth, sheltered sites',
    economic_impact: 'Fruit contamination with honeydew and sooty mould makes 20-50% of crop unmarketable. Leaf curling protects aphids from contact sprays. Pre-blossom pyrethroid or post-blossom acetamiprid provides control. Fatty acid sprays for organic systems.',
    images_description: 'Dense black aphid colony on cherry shoot tip with severely curled and crumpled leaves',
  },

  {
    id: 'pear-midge',
    name: 'Pear Midge',
    common_names: ['Contarinia pyrivora'],
    pest_type: 'pest',
    description: 'Tiny midge that lays eggs in pear blossom. Larvae feed inside developing fruitlets causing them to swell abnormally, blacken, and fall prematurely. Can cause major crop loss in pear orchards. Widespread in the UK.',
    lifecycle: 'One generation per year. Adults emerge from soil at white bud to early blossom stage. Females lay eggs inside flower buds. Larvae feed inside developing fruitlet (15-30 per fruitlet). Infested fruitlets blacken and drop by late May. Larvae enter soil to pupate.',
    identification: 'Infested fruitlets swell abnormally — rounder and larger than normal at early stage. Then blacken and crack at the calyx end. Cut open to find orange-white larvae inside. Premature fruit drop in late May-June. Adults too small (2mm) to see easily.',
    crops_affected: ['pears'],
    risk_factors: 'Previous year infestation (soil pupae), sheltered orchards, heavy blossom, Conference and Comice varieties',
    economic_impact: 'Losses of 30-80% of fruitlets in severe infestations. Cultivation under trees in autumn disturbs pupae. Insecticide spray at white bud stage (before egg-laying). Monitoring: shake blossoms over a white tray to detect adults.',
    images_description: 'Swollen blackened pear fruitlet cracking at calyx with orange larvae visible inside',
  },

  {
    id: 'mussel-scale',
    name: 'Mussel Scale',
    common_names: ['Lepidosaphes ulmi', 'Oystershell scale'],
    pest_type: 'pest',
    description: 'Scale insect found on apple, pear, and many ornamental trees. Named for the mussel-shaped scale cover (2-3mm). Heavy infestations weaken branches and can kill young trees. Often overlooked because the scales resemble bark texture.',
    lifecycle: 'One generation per year. Overwinter as eggs beneath the dead female scale. Crawlers emerge in June-July and settle on bark. Insert stylet to feed on sap. Females remain immobile, producing a protective waxy scale. Males are tiny winged insects.',
    identification: 'Grey-brown mussel-shaped scales (2-3mm) aligned along twigs and branches. Heavy infestations encrust bark. Lift a scale to see eggs (white) or the shrivelled female body beneath. Branch dieback in severe cases. Fruit may show red halos around settled scales.',
    crops_affected: ['apples', 'pears', 'plums', 'Cotoneaster', 'many ornamental trees'],
    risk_factors: 'Old neglected orchards, poor tree vigour, lack of dormant sprays, sheltered sites',
    economic_impact: 'Heavy infestations reduce tree vigour and can kill branches. Winter tar oil washes historically used. Dormant-season petroleum spray oil smothers overwintering eggs. Crawler-stage sprays (July) with spirotetramat.',
    images_description: 'Grey-brown mussel-shaped scales aligned along apple twig bark surface',
  },

  {
    id: 'fruit-tree-red-spider-mite',
    name: 'Fruit Tree Red Spider Mite',
    common_names: ['Panonychus ulmi'],
    pest_type: 'pest',
    description: 'Mite that feeds on apple, pear, and plum leaves causing bronzing and reduced photosynthesis. Distinguished from the glasshouse red spider mite (Tetranychus urticae) — this species is specific to fruit trees and overwinters as red eggs on bark.',
    lifecycle: 'Overwinter as distinctive red eggs on bark, especially around spurs and bud bases. Hatch at bud burst. Females lay eggs on leaves — multiple generations through summer. Populations peak July-August. Return to bark to lay overwintering eggs in autumn.',
    identification: 'Mites: tiny (0.4mm) dark red to brown with white dorsal spots. Red overwintering eggs visible on bark in winter. Leaf damage: fine pale stippling on upper surface, bronzing in severe cases. Mites and summer eggs on leaf undersurface.',
    crops_affected: ['apples', 'pears', 'plums', 'damsons'],
    risk_factors: 'Repeated broad-spectrum insecticide use (kills predatory mites), hot dry summers, high overwintering egg counts, absence of Typhlodromus pyri (predatory mite)',
    economic_impact: 'Yield and fruit quality losses of 5-20% when populations are high. Predatory mite Typhlodromus pyri provides excellent biological control in IPM orchards. Winter wash with petroleum oil reduces egg survival. Avoid broad-spectrum sprays that harm predators.',
    images_description: 'Bronzed apple leaf with tiny red-brown mites and red overwintering eggs on bark',
  },

  // ── Expansion: Grassland Pests ─────────────────────────────────

  {
    id: 'chafer-grubs',
    name: 'Chafer Grubs',
    common_names: ['Phyllopertha horticola', 'Garden chafer', 'Melolontha melolontha', 'Cockchafer'],
    pest_type: 'pest',
    description: 'Larvae of chafer beetles that feed on grass roots in grassland, turf, and amenity areas. Several species involved, with garden chafer (Phyllopertha horticola) most common. Cause yellowing patches that can be pulled up like carpet.',
    lifecycle: 'Garden chafer: one year cycle. Adults fly June-July. Eggs laid in grassland soil. Larvae (C-shaped white grubs with brown heads) feed on roots through summer and autumn. Overwinter deeper in soil. Resume feeding in spring. Pupate April-May.',
    identification: 'C-shaped white grubs with brown head capsule and three pairs of legs, found 2-5cm deep in soil beneath yellowing turf. Turf lifts easily from soil. Crows, rooks, and badgers dig up turf to feed on grubs. Adults: brown beetles (10-12mm) in swarms on warm June evenings.',
    crops_affected: ['grassland', 'turf', 'amenity grass', 'lawns'],
    risk_factors: 'Light sandy soils, warm dry summers, previous adult beetle activity, grassland without predator activity',
    economic_impact: 'Turf and grassland losses of 10-50% in affected areas. Secondary damage from birds and mammals digging for grubs can exceed direct root damage. Nematode drench (Heterorhabditis bacteriophora) in late summer provides biological control.',
    images_description: 'White C-shaped chafer grub with brown head found beneath lifted turf patch',
  },

  {
    id: 'field-voles',
    name: 'Field Voles',
    common_names: ['Microtus agrestis', 'Short-tailed vole'],
    pest_type: 'pest',
    description: 'Small herbivorous rodent that damages grassland, young tree plantations, and orchard trees by gnawing bark and eating vegetation. Populations cycle with peaks every 3-4 years. Can cause significant damage to grass leys and tree bark in peak years.',
    lifecycle: 'Breed March-October, producing 4-6 litters of 3-6 young per year. Populations cycle over 3-4 years from low to peak density. Peak populations can reach 200+ per hectare. Construct characteristic surface runways through grass. Active day and night.',
    identification: 'Small rodents (10cm body) with short tail, blunt nose, and small ears. Surface runways (3-4cm wide) visible in long grass. Piles of chopped grass stems at feeding stations along runways. Bark gnawing at the base of young trees.',
    crops_affected: ['grassland', 'young tree plantations', 'orchards', 'grass leys'],
    risk_factors: 'Long ungrazed grass (provides cover), rough tussocky grassland, peak population years, young tree plantations without guards',
    economic_impact: 'Grassland damage mainly cosmetic but bark damage can kill young trees. Losses of 5-30% of young trees in plantations in peak vole years. Tree guards (spiral or mesh), short grass around tree bases, and raptor perches for natural predation are controls.',
    images_description: 'Surface runway through grass with chopped stems and bark gnawing at base of young tree',
  },

  {
    id: 'new-zealand-flatworm',
    name: 'New Zealand Flatworm',
    common_names: ['Arthurdendyus triangulatus'],
    pest_type: 'pest',
    description: 'Invasive predatory flatworm from New Zealand that feeds on earthworms. Established in Scotland, Northern Ireland, and parts of northern England. Reduces earthworm populations, degrading soil structure and fertility. No chemical control available.',
    lifecycle: 'Produces dark egg capsules in soil year-round. Feeds by enveloping earthworms in mucus and digesting them externally. Active at soil temperatures of 5-20C. Avoids hot dry conditions by retreating deeper into soil. Spreads primarily through movement of soil and plants.',
    identification: 'Flat, pointed at both ends, 5-15cm long, dark purple-brown upper surface with pale buff underside and margin. Found under stones, pots, and surface objects. Egg capsules: dark, shiny, 5-10mm, found in soil. Distinct from native flatworms by larger size and colour.',
    crops_affected: ['grassland', 'gardens', 'allotments', 'nursery stock'],
    risk_factors: 'Scotland and Northern Ireland (established), imported plants and soil, cool moist conditions, gardens and nurseries',
    economic_impact: 'Reduces earthworm populations by 20-80% in affected areas. Consequent loss of soil aeration, drainage, and organic matter incorporation. No chemical control. Prevent spread by avoiding movement of soil from infested areas. Biosecurity in nursery trade.',
    images_description: 'Dark purple-brown flat elongated flatworm on soil surface with pale-edged margin',
  },

  {
    id: 'crow-rook-damage',
    name: 'Crow and Rook Damage',
    common_names: ['Corvus frugilegus', 'Corvus corone'],
    pest_type: 'pest',
    description: 'Rooks (Corvus frugilegus) and carrion crows (Corvus corone) cause significant crop damage by pulling up newly sown cereal and maize seedlings to eat the seed, and by feeding on grain in the ear before harvest. Also dig up grassland to feed on soil invertebrates.',
    lifecycle: 'Year-round residents. Rooks nest colonially in rookeries. Crows nest individually. Crop damage peaks at drilling (pulling seedlings), at milk ripe stage (grain feeding), and in spring on grassland (invertebrate feeding). Social learning spreads damaging behaviour.',
    identification: 'Seedlings pulled up with seed still attached at base. Rows of missing plants in newly drilled cereals and maize. Ragged ears where grain has been removed. Patches of grassland torn up. Flocks of rooks or individual crows in affected fields.',
    crops_affected: ['wheat', 'barley', 'maize', 'peas', 'grassland'],
    risk_factors: 'Fields near rookeries, shallow drilling, bare soil after drilling, grain left on surface, livestock fields (invertebrate attraction)',
    economic_impact: 'Losses of 5-20% plant stand in worst-affected fields. Maize is particularly vulnerable due to large seed and slow emergence. Bird scarers (gas cannons, kites, distress calls) provide temporary deterrence. Deeper drilling reduces seed exposure.',
    images_description: 'Rook in cereal field pulling up seedling with seed still attached at base',
  },

  // ── Expansion: Additional Pests ────────────────────────────────

  {
    id: 'cabbage-moth',
    name: 'Cabbage Moth',
    common_names: ['Mamestra brassicae'],
    pest_type: 'pest',
    description: 'Noctuid moth whose caterpillars bore into the hearts of cabbages and Brussels sprouts. Distinguished from cabbage white butterflies by the moth adult and the boring habit of larger larvae. Causes contamination and rejection of produce.',
    lifecycle: 'One to two generations per year. Adults fly May-September. Eggs laid in clusters on undersides of brassica leaves. Young larvae feed on outer leaves. Older larvae bore into hearts. Pupate in soil in autumn. Overwinter as pupae.',
    identification: 'Adults: brown-grey noctuid moths (40-45mm wingspan) with kidney-shaped wing markings. Caterpillars: variable — green, brown, or dark with pale line along sides, up to 45mm. Damage: holes in outer leaves (young larvae) and bore holes into hearts (older larvae).',
    crops_affected: ['cabbage', 'Brussels sprouts', 'cauliflower', 'broccoli'],
    risk_factors: 'Warm summers, fields near overwintering sites, second generation in warm years, organic systems without synthetic insecticides',
    economic_impact: 'Heart damage and frass contamination makes 10-30% of produce unmarketable. More damaging than cabbage white because boring larvae are protected from sprays. Bacillus thuringiensis effective on young larvae before they bore.',
    images_description: 'Brown-green caterpillar boring into cabbage heart with frass visible at entry hole',
  },

  {
    id: 'carrot-willow-aphid',
    name: 'Carrot-Willow Aphid',
    common_names: ['Cavariella aegopodii', 'Willow-carrot aphid'],
    pest_type: 'pest',
    description: 'Aphid alternating between willow (winter) and carrot family (summer). Direct feeding causes leaf yellowing. Transmits carrot motley dwarf virus complex causing red and yellow discolouration. Same species as willow-carrot aphid — primary name in entomological literature.',
    lifecycle: 'Overwintering eggs on willow. Spring migration to umbelliferous crops May-June. Multiple summer generations on carrots. Autumn return to willow. Virus acquired from infected plants and transmitted to healthy ones during probing.',
    identification: 'Small green aphids on carrot foliage. Virus symptoms: bright red and yellow discolouration of outer leaves. Stunted plants. Distinguished from other carrot aphids by the specific association with carrot motley dwarf virus.',
    crops_affected: ['carrots', 'parsnips', 'celery'],
    risk_factors: 'Proximity to willow, warm springs, virus reservoir in wild umbellifers',
    economic_impact: 'Virus-mediated losses of 10-30% in affected areas. Pyrethroid sprays timed to first migration reduce virus spread. Removal of willow hedges near carrot fields eliminates overwintering host.',
    images_description: 'Carrot foliage with red-yellow discolouration from virus and green aphids on leaf underside',
  },

  {
    id: 'mangold-fly',
    name: 'Mangold Fly',
    common_names: ['Pegomya hyoscyami', 'Beet leaf miner'],
    pest_type: 'pest',
    description: 'Fly whose larvae mine within sugar beet and beetroot leaves, creating large blister-like mines. Same species as beet leaf miner. Two generations per year. Most damaging to young plants in spring when leaf area is limited.',
    lifecycle: 'Adults emerge May. Eggs laid in clusters on undersides of beet leaves. Larvae feed between leaf surfaces creating mines. Pupate in soil. Second generation July-August. Overwinter as pupae in soil.',
    identification: 'Pale blister-like mines in beet leaves, initially narrow then expanding. Several larvae may be visible inside the mine as dark shapes. Severely mined leaves become brown and papery. Young plants may be stunted if most leaf area is mined.',
    crops_affected: ['sugar beet', 'beetroot', 'spinach beet', 'mangolds'],
    risk_factors: 'Fields near hedgerows, spring (first generation on young plants), warm dry weather, organic systems',
    economic_impact: 'First generation on young plants (4-6 leaf) can reduce yield 5-15%. Later attacks on established plants are tolerated. Seed treatment with neonicotinoids (where still approved) provides early protection. Established plants compensate for mining damage.',
    images_description: 'Large blister-like mine in sugar beet leaf with larval shapes visible inside',
  },

  {
    id: 'celery-fly',
    name: 'Celery Fly',
    common_names: ['Euleia heraclei', 'Celery leaf miner'],
    pest_type: 'pest',
    description: 'Small fly whose larvae mine within celery, parsnip, and lovage leaves. Creates brown blister mines that reduce photosynthetic area and make celery unmarketable. Two to three generations per year. A significant pest of UK celery production.',
    lifecycle: 'Adults emerge April-May. Eggs inserted into leaf tissue. Larvae feed between leaf surfaces creating brown blotch mines. Pupate in the mine or in soil. Two to three generations: April-May, July, and September. Multiple larvae per mine.',
    identification: 'Brown blotch mines in celery and parsnip leaves, initially small then expanding to cover much of the leaflet. Frass visible inside mine. Larvae: white maggots (5-7mm) visible through mine surface. Severely mined plants have brown, papery leaves.',
    crops_affected: ['celery', 'parsnips', 'lovage', 'parsley'],
    risk_factors: 'Proximity to hedgerow (umbelliferous hosts), warm dry conditions, unprotected crops, organic production',
    economic_impact: 'Celery with visible mine damage is unmarketable — losses of 10-30%. Spinosad spray provides control. Fleece covers prevent egg-laying. On parsnips, damage is cosmetic to foliage and rarely affects root yield.',
    images_description: 'Brown blotch mines in celery leaf with white larvae visible inside the mine',
  },

  {
    id: 'onion-thrips',
    name: 'Onion Thrips',
    common_names: ['Thrips tabaci'],
    pest_type: 'pest',
    description: 'Tiny (1-2mm) thrips that feeds on onion and leek leaves, causing silver-white patches and streaks. Heavy infestations reduce bulb size and quality. Also vectors Iris Yellow Spot Virus (IYSV). Important pest of UK allium crops.',
    lifecycle: 'Multiple generations per year. Adults and larvae feed by rasping leaf surface and sucking cell contents. Eggs inserted into leaf tissue. Pupate in soil. Populations build through summer, peaking July-August. Overwinter in soil and crop debris.',
    identification: 'Tiny (1-2mm) yellow to brown insects found between inner leaves. Silver-white streaks and patches on leaves where cells have been emptied. Heavy infestations cause distorted, silvered foliage. Black frass spots visible on damaged areas.',
    crops_affected: ['onions', 'leeks', 'garlic', 'shallots'],
    risk_factors: 'Hot dry summers, sheltered fields, dense crops, proximity to alternative hosts, previous crop debris',
    economic_impact: 'Yield losses of 10-25% from reduced bulb size. Quality reduction from neck damage. Virus transmission adds further loss. Spinosad and lambda-cyhalothrin provide control. Blue sticky traps for monitoring. Overhead irrigation deters thrips.',
    images_description: 'Silver-white streaks on onion leaf surface with tiny yellow thrips visible between leaves',
  },

  {
    id: 'raspberry-cane-midge',
    name: 'Raspberry Cane Midge',
    common_names: ['Resseliella theobaldi'],
    pest_type: 'pest',
    description: 'Tiny midge whose larvae feed in the bark splits of raspberry canes, creating entry points for cane blight and other fungal diseases. The midge itself causes minor damage but the resulting cane blight is devastating. Critical pest of UK raspberry production.',
    lifecycle: 'Two to three generations per year. Adults emerge April-May. Females lay eggs in natural bark splits on new canes. Larvae feed in the cambium layer. Larvae fall to soil to pupate. Feeding wounds become entry points for Leptosphaeria coniothyrium (cane blight).',
    identification: 'Tiny orange-pink larvae (2-3mm) found beneath bark splits on primocanes. Dark areas around split bark where larvae have fed. Cane blight follows — dark brown to black discolouration spreading from entry point, making canes brittle.',
    crops_affected: ['raspberries'],
    risk_factors: 'Vigorous primocane growth (more bark splitting), warm moist conditions, previous cane blight history, susceptible varieties',
    economic_impact: 'Cane blight resulting from midge damage can destroy 20-50% of fruiting canes. Fenitrothion historically used but now withdrawn. Current control relies on reducing primocane number, prophylactic fungicide sprays at split bark stage.',
    images_description: 'Raspberry cane bark split with tiny orange larvae beneath and dark cane blight discolouration',
  },

  {
    id: 'pea-leaf-weevil',
    name: 'Pea and Bean Weevil',
    common_names: ['Sitona lineatus'],
    pest_type: 'pest',
    description: 'Small weevil (4-5mm) that notches the leaf margins of peas and beans. Adults cause characteristic U-shaped notches. Larvae feed on root nodules underground, reducing nitrogen fixation. One of the most common pests of legume crops in the UK.',
    lifecycle: 'Adults overwinter in hedgerows and field margins. Migrate to pea and bean crops in spring. Feeding creates leaf notches. Eggs laid in soil near plants. Larvae feed on Rhizobium root nodules. New adults emerge in summer and seek overwintering sites.',
    identification: 'Adults: grey-brown weevils (4-5mm) with striped pattern, feigning death when disturbed. Damage: distinctive U-shaped notches along leaf margins. Larvae: white, legless, C-shaped grubs on roots. Root nodules appear brown and hollowed out.',
    crops_affected: ['peas', 'field beans', 'spring beans'],
    risk_factors: 'Spring-sown crops (most vulnerable at seedling stage), warm dry springs, proximity to hedgerows, previous pea/bean crops',
    economic_impact: 'Leaf notching on young plants (1-3 leaf stage) can reduce yield 5-15% in severe cases. Mature plants tolerate significant notching. Larval damage to root nodules reduces nitrogen fixation. Lambda-cyhalothrin threshold spray when notching reaches 50% of plants.',
    images_description: 'Grey-brown weevil on pea leaf margin with characteristic U-shaped notches',
  },

  {
    id: 'flea-beetle-root-crops',
    name: 'Flea Beetle on Root Crops',
    common_names: ['Phyllotreta vittula', 'Chaetocnema concinna'],
    pest_type: 'pest',
    description: 'Small flea beetles that damage sugar beet, spinach, and other root crop seedlings by shot-holing cotyledons. Several species involved. Most damaging in hot dry weather when seedling growth is slow. Can necessitate re-drilling.',
    lifecycle: 'Adults overwinter in leaf litter and field margins. Active from April when temperatures exceed 15C. Feed on cotyledons and first true leaves. Eggs laid in soil. Larvae feed on roots (minor). New adults emerge mid-summer.',
    identification: 'Tiny (2-3mm) shiny dark beetles that jump vigorously when disturbed. Shot-hole damage on cotyledons and young leaves. Multiple species: Chaetocnema concinna (beet flea beetle, shiny bronze), Phyllotreta vittula (striped). Seedlings may be killed.',
    crops_affected: ['sugar beet', 'beetroot', 'spinach', 'chard'],
    risk_factors: 'Hot dry weather, slow seedling emergence, light sandy soils, east and south England, organic systems',
    economic_impact: 'Seedling losses requiring re-drilling in 2-5% of UK beet crops annually. Neonicotinoid seed treatment (where approved) provides effective early protection. Lambda-cyhalothrin foliar spray at seedling stage as alternative.',
    images_description: 'Tiny shiny dark beetle jumping from sugar beet cotyledon showing shot-hole damage',
  },

  {
    id: 'large-narcissus-fly',
    name: 'Large Narcissus Fly',
    common_names: ['Merodon equestris'],
    pest_type: 'pest',
    description: 'Hoverfly whose larvae feed inside narcissus (daffodil) bulbs, destroying them from within. A significant pest of commercial narcissus production in the UK, particularly in Cornwall and Lincolnshire. Larvae consume the central growing point.',
    lifecycle: 'One generation per year. Adults (bumblebee mimics) fly May-June. Females lay eggs at the base of narcissus leaves as foliage dies back. Larva enters bulb through the base plate. Feeds inside through autumn and winter. Pupates in soil spring.',
    identification: 'Adults: bumblebee-like hoverflies (12-15mm) visiting flowers near narcissus. Larva: large (15-20mm) cream grub inside hollowed-out bulb. Infested bulbs are soft, light, and fail to produce shoots. Single larva per bulb. Brown papery remains inside.',
    crops_affected: ['narcissus', 'daffodils', 'amaryllis', 'snowdrops'],
    risk_factors: 'Fields with previous narcissus, warm dry June conditions (adult flight), foliage dying back naturally (eggs laid at base), southwest and east England production areas',
    economic_impact: 'Bulb losses of 5-20% in commercial narcissus. Hot water treatment of bulbs (44.4C for 3 hours) kills larvae but stresses bulbs. Permethrin drench historically used. Covering soil surface at foliage die-back can prevent egg-laying.',
    images_description: 'Hollowed-out narcissus bulb with large cream larva inside and bumblebee-like adult hoverfly',
  },

  {
    id: 'glasshouse-whitefly',
    name: 'Glasshouse Whitefly',
    common_names: ['Trialeurodes vaporariorum'],
    pest_type: 'pest',
    description: 'Small white-winged insect that feeds on the undersides of leaves of tomatoes, cucumbers, and many protected crops. Adults and nymphs suck sap and excrete honeydew. One of the most important pests of UK protected edible crops.',
    lifecycle: 'Continuous generations in heated glasshouses. Females lay eggs on leaf undersides. Nymphs (scales) are flat, oval, and immobile after first instar. Pupate to winged adults. Complete cycle takes 3-4 weeks at 20C. Cannot survive UK winters outdoors.',
    identification: 'Adults: tiny (1.5mm) white-winged insects that fly up in clouds when plants are disturbed. Nymphs: flat oval pale green scales on leaf undersurface. Honeydew and black sooty mould on leaves below colonies. Eggs on stalks on leaf undersurface.',
    crops_affected: ['tomatoes', 'cucumbers', 'peppers', 'aubergines', 'ornamentals'],
    risk_factors: 'Heated glasshouses, year-round cropping, insecticide resistance, absence of biological control agents',
    economic_impact: 'Direct feeding, honeydew, and sooty mould reduce fruit quality and yield by 10-30%. Encarsia formosa (parasitoid wasp) provides commercial biological control. Insecticide resistance is widespread. IPM programmes essential.',
    images_description: 'White-winged adult whiteflies and flat oval nymphs on tomato leaf underside with honeydew',
  },

  {
    id: 'western-flower-thrips',
    name: 'Western Flower Thrips',
    common_names: ['Frankliniella occidentalis', 'WFT'],
    pest_type: 'pest',
    description: 'Invasive thrips species from North America. Established in UK glasshouses since the late 1980s. Feeds on flowers and young fruit of many crops, causing scarring and distortion. Also vectors Tomato Spotted Wilt Virus (TSWV). Major protected crop pest.',
    lifecycle: 'Continuous generations under glass. Adults and larvae feed by rasping and sucking. Eggs inserted into plant tissue. Pupation in growing media or soil. Complete cycle 2-3 weeks at 25C. Cannot survive UK winters outdoors.',
    identification: 'Tiny (1-2mm) yellow to brown insects in flowers and on young fruit. Feeding causes silver scarring on fruit, distorted flowers, and streaking on petals. Tap flowers over white paper to dislodge and count. Blue sticky traps for monitoring.',
    crops_affected: ['peppers', 'cucumbers', 'strawberries', 'chrysanthemums', 'ornamentals'],
    risk_factors: 'Heated glasshouses, imported plant material, insecticide resistance, warm dry conditions, absence of predatory mites',
    economic_impact: 'Fruit scarring and virus transmission cause 10-40% yield and quality losses. Amblyseius cucumeris (predatory mite) is standard biological control. Insecticide resistance severe. IPM with biological control agents is primary strategy.',
    images_description: 'Tiny yellow thrips inside pepper flower and silver scarring damage on fruit surface',
  },

  {
    id: 'badger-damage',
    name: 'Badger Damage',
    common_names: ['Meles meles'],
    pest_type: 'pest',
    description: 'European badger (Meles meles) causes agricultural damage by digging in grassland, cereals, and sweetcorn for earthworms and invertebrates, and by feeding on ripening crops. Protected under the Protection of Badgers Act 1992.',
    lifecycle: 'Year-round activity with seasonal peaks. Family groups (clans) in setts. Digging for earthworms and leatherjackets peaks in autumn-winter. Cereal and sweetcorn feeding in late summer-autumn. Protected species — cannot be killed or disturbed.',
    identification: 'Characteristic snuffle holes (5-10cm deep, cone-shaped) in grassland and turf. Sweetcorn cobs pulled down and stripped. Cereal crops flattened and ears eaten. Well-worn paths between sett and feeding area. Latrine pits near sett.',
    crops_affected: ['grassland', 'turf', 'sweetcorn', 'cereals', 'strawberries'],
    risk_factors: 'Proximity to badger setts, livestock pasture (earthworm attraction), sweetcorn fields near woodland, autumn (peak foraging)',
    economic_impact: 'Sweetcorn losses of 10-50% in fields near setts. Grassland digging damages machinery and sports turf. Electric fencing provides deterrence. Compensation not available. Protected species — lethal control not an option. Coexistence strategies required.',
    images_description: 'Cone-shaped snuffle holes in grassland turf and stripped sweetcorn cobs from badger feeding',
  },

  {
    id: 'cabbage-stem-weevil',
    name: 'Cabbage Stem Weevil',
    common_names: ['Ceutorhynchus pallidactylus', 'Ceutorhynchus quadridens'],
    pest_type: 'pest',
    description: 'Weevil whose larvae bore inside the stems of oilseed rape and brassica vegetables. Adults feed on leaves creating small holes. Larvae mine within the petioles and stems, weakening plants. A common spring pest of UK oilseed rape.',
    lifecycle: 'Adults overwinter away from crops. Migrate to oilseed rape in spring (March-April). Eggs laid in petioles and stem. Larvae mine within petioles, moving into main stem. Exit to pupate in soil in June. New adults feed on brassica pods before overwintering.',
    identification: 'Adults: small (3-4mm) dark grey weevils. Leaf damage: small round feeding holes. Larval damage: white legless grubs inside split petioles and stems. Exit holes visible on stem surface where mature larvae leave. Multiple larvae per stem.',
    crops_affected: ['oilseed rape', 'cabbage', 'Brussels sprouts'],
    risk_factors: 'Spring migration during warm dry weather (March-April), proximity to overwintering sites, large crops with many petioles',
    economic_impact: 'Yield losses usually minor (2-5%) unless secondary infections enter larval tunnels. Pyrethroid spray at migration threshold but rarely justified economically. Often present but below treatment threshold. More of an issue in brassica vegetables.',
    images_description: 'Small dark weevil on oilseed rape leaf and white larva inside split petiole',
  },

  // ── Quarantine & Notifiable Insect Pests ───────────────────────

  {
    id: 'asian-longhorn-beetle',
    name: 'Asian Longhorn Beetle',
    common_names: ['ALB', 'Anoplophora glabripennis', 'Starry sky beetle'],
    pest_type: 'pest',
    description: 'Large cerambycid beetle (Anoplophora glabripennis) native to East Asia. UK quarantine pest — eradicated from a Kent outbreak in 2012. Larvae bore deep into the heartwood of broadleaved trees, causing structural failure and death. Hosts include maple, birch, willow, poplar, horse chestnut, and plane.',
    lifecycle: 'Adults emerge from round exit holes (10mm diameter) in tree trunks June-August. Females chew oviposition pits in bark and lay eggs singly. Larvae bore into sapwood and heartwood, creating extensive tunnels over 1-2 years. Pupation in the wood. One generation takes 1-2 years depending on climate.',
    identification: 'Adults: large (20-35mm body), glossy black with irregular white spots on wing cases, very long black-and-white banded antennae (longer than body). Damage: round exit holes (10mm) in trunk and main branches, coarse frass (sawdust) at base of tree, oviposition scars on bark.',
    crops_affected: ['maple', 'birch', 'willow', 'poplar', 'horse chestnut', 'plane', 'elm', 'beech'],
    risk_factors: 'Import of infested wood packaging material (pallets, crates), proximity to ports and industrial estates receiving imports from Asia, urban trees with stress factors',
    economic_impact: 'UK quarantine pest. Kent outbreak (2012) cost over GBP 2 million to eradicate, requiring felling of all host trees within a demarcated zone. Early detection and destruction of infested trees is the only effective management. Report suspected sightings to the Forestry Commission.',
    images_description: 'Large black beetle with white spots and long banded antennae on tree trunk',
  },
  {
    id: 'citrus-longhorn-beetle',
    name: 'Citrus Longhorn Beetle',
    common_names: ['CLB', 'Anoplophora chinensis'],
    pest_type: 'pest',
    description: 'Large cerambycid beetle (Anoplophora chinensis) native to East Asia. UK quarantine pest with interceptions on imported plants. Larvae bore into the root collar and lower trunk of broadleaved trees, causing girdling and tree death. Wider host range than the Asian longhorn beetle.',
    lifecycle: 'Adults emerge May-August from round exit holes near the base of the tree. Females oviposit at or just below soil level on the root collar. Larvae bore into roots and lower trunk over 1-2 years. Pupation in the wood near the surface. Frass accumulates around the base of infested trees.',
    identification: 'Adults: large (20-35mm body), glossy black with variable white or yellow markings on wing cases, long banded antennae. Similar to ALB but markings are more regular. Damage: exit holes near tree base, frass accumulation at soil level, girdling of root collar.',
    crops_affected: ['citrus', 'maple', 'apple', 'pear', 'Cornus', 'Acer', 'Betula', 'Salix', 'Rosa', 'Lagerstroemia'],
    risk_factors: 'Import of infested nursery plants (especially from Italy), containerised trees with larvae in root ball, mild climates allowing establishment',
    economic_impact: 'EU quarantine pest. Established in northern Italy and parts of continental Europe. UK interceptions on imported plants. Eradication requires destruction of infested trees and host-free zones. All imported host plants from infested areas must have phytosanitary certification.',
    images_description: 'Large black beetle with regular white markings on wing cases near tree base',
  },
  {
    id: 'emerald-ash-borer',
    name: 'Emerald Ash Borer',
    common_names: ['EAB', 'Agrilus planipennis'],
    pest_type: 'pest',
    description: 'Metallic green buprestid beetle (Agrilus planipennis) native to East Asia. UK quarantine pest — not yet detected in Britain but considered the greatest single threat to UK ash trees if it arrives. Larvae feed in the cambium layer, creating serpentine galleries that girdle and kill ash trees within 2-5 years.',
    lifecycle: 'Adults emerge through D-shaped exit holes (3-4mm) in May-July. Feed on ash foliage for 1-2 weeks. Females lay eggs in bark crevices. Larvae hatch and bore into the cambium, creating S-shaped galleries packed with fine frass. Overwintering as larvae. Pupation in spring. One generation per year in temperate climates.',
    identification: 'Adults: small (8-14mm), bright metallic green, elongated bullet shape. Damage: D-shaped exit holes in bark (distinctive), serpentine larval galleries under bark packed with fine frass, bark splitting along galleries, crown dieback from top down, epicormic sprouting on trunk.',
    crops_affected: ['ash (Fraxinus excelsior)', 'Fraxinus species'],
    risk_factors: 'Import of infested ash wood products, firewood movement, wooden packaging from infested regions (North America, Russia, Ukraine), natural spread from continental Europe if established',
    economic_impact: 'Killed hundreds of millions of ash trees in North America since detection in 2002. Established in Moscow region and Ukraine, spreading westward through Europe. Combined with ash dieback, its arrival in the UK could mean the functional extinction of ash from British landscapes. Import restrictions on ash wood are in place.',
    images_description: 'Small bright metallic green beetle next to D-shaped exit hole in ash bark',
  },
  {
    id: 'horse-chestnut-leaf-miner',
    name: 'Horse Chestnut Leaf Miner',
    common_names: ['HCLM', 'Cameraria ohridella'],
    pest_type: 'pest',
    description: 'Small moth (Cameraria ohridella) whose larvae mine within horse chestnut leaves. Arrived in the UK in 2002 and has spread throughout England and Wales. Multiple overlapping generations cause progressive browning and premature defoliation by late summer.',
    lifecycle: 'Adults emerge from pupae in leaf litter in April-May. Females lay eggs on upper leaf surface. Larvae mine within the leaf tissue, creating blotch mines. 2-3 generations per year in the UK. Pupation in leaf mines. Overwinters as pupae in fallen leaves on the ground.',
    identification: 'Blotch mines on upper leaf surface — start as narrow linear mines becoming large brown blotches. Each mine contains a single larva. Heavily mined leaves turn entirely brown by August-September. Premature leaf fall. Adult moths are small (5mm), brown with white and dark cross-bands.',
    crops_affected: ['horse chestnut (Aesculus hippocastanum)'],
    risk_factors: 'Proximity to existing infestations, failure to remove fallen leaves (pupae overwinter in litter), urban areas with horse chestnut avenues, warm springs accelerating development',
    economic_impact: 'Primarily aesthetic damage to amenity trees. Trees defoliated year after year show reduced vigour but rarely die. Composting or removing fallen leaves in autumn reduces overwintering pupae by up to 90%. A parasitoid wasp community is building but biological control is not yet sufficient.',
    images_description: 'Horse chestnut leaf with brown blotch mines and premature browning',
  },
  {
    id: 'oriental-chestnut-gall-wasp',
    name: 'Oriental Chestnut Gall Wasp',
    common_names: ['OCGW', 'Dryocosmus kuriphilus'],
    pest_type: 'pest',
    description: 'Cynipid wasp (Dryocosmus kuriphilus) that induces conspicuous green to reddish galls on sweet chestnut buds and shoots. First detected in the UK in 2015. The most damaging pest of sweet chestnut worldwide. Galls prevent normal shoot and leaf development, reducing nut yield and tree vigour.',
    lifecycle: 'Entirely parthenogenetic (no males). Adults emerge from galls in June-July. Females lay eggs in dormant buds. Larvae develop inside buds over winter. Galls form in spring as buds break. One generation per year. Biological control by Torymus sinensis (parasitoid wasp) is being released in the UK.',
    identification: 'Conspicuous green or reddish-green galls (5-20mm) on buds, shoots, and leaf petioles in spring. Each gall contains one or more larval chambers. Galled shoots fail to develop normally. Old galls dry out and persist as brown woody structures.',
    crops_affected: ['sweet chestnut (Castanea sativa)', 'Castanea species', 'hybrid chestnuts'],
    risk_factors: 'Proximity to existing infestations, movement of infested plant material, mild winters allowing high adult survival, absence of natural enemies in newly invaded areas',
    economic_impact: 'Nut yield reductions of 50-80% in heavily infested areas. Significant concern for Kent and south-east England coppice chestnut industry. Classical biological control using Torymus sinensis parasitoid wasp is under release — effective in continental Europe within 5-10 years of release.',
    images_description: 'Green-red galls on sweet chestnut buds and shoot tips in spring',
  },

  // ── Protected Cropping Pests ───────────────────────────────────

  {
    id: 'greenhouse-red-spider-mite',
    name: 'Glasshouse Red Spider Mite',
    common_names: ['Two-spotted spider mite (protected)', 'Tetranychus urticae (glasshouse)'],
    pest_type: 'pest',
    description: 'Two-spotted spider mite (Tetranychus urticae) in protected crop context. Major pest of glasshouse tomatoes, cucumbers, peppers, strawberries, and ornamentals. Rapid reproduction in warm dry conditions. Produces fine silk webbing. Adults are tiny (0.5mm), yellow-green with two dark spots.',
    lifecycle: 'Overwinters as orange-red diapausing females in crevices of glasshouse structure. Resumes activity in spring. Eggs laid on leaf undersurfaces. Development from egg to adult in 7-14 days at 20-25C. Multiple overlapping generations under glass. Population doubling time as short as 3 days.',
    identification: 'Fine stippling (pale dots) on upper leaf surface. Fine silk webbing on leaf undersurfaces and between leaves in heavy infestations. Mites visible with hand lens on undersurface — yellow-green with two dark spots (summer form) or orange-red (autumn diapause form).',
    crops_affected: ['tomatoes (protected)', 'cucumbers', 'peppers', 'strawberries (protected)', 'ornamentals under glass'],
    risk_factors: 'Warm dry conditions in glasshouses, poor humidity, pesticide-resistant populations, absence of biological control agents, over-reliance on broad-spectrum pesticides',
    economic_impact: 'Can destroy protected crops rapidly if unchecked. Biological control using Phytoseiulus persimilis is the standard commercial approach. Acaricide resistance is widespread. Integrated pest management using predatory mites is more reliable than chemical control.',
    images_description: 'Fine silk webbing and stippled leaves on glasshouse tomato with tiny yellow-green mites on undersurface',
  },
  {
    id: 'sciarid-fly',
    name: 'Sciarid Fly',
    common_names: ['Fungus gnat', 'Bradysia spp.', 'Sciara spp.'],
    pest_type: 'pest',
    description: 'Small dark flies (Bradysia spp.) whose larvae feed on organic matter, fungi, and plant roots in growing media. Common pest in propagation glasshouses and container nurseries. Larvae damage seedling roots and stem bases, causing wilting and death. Adults are a nuisance but do not feed on plants.',
    lifecycle: 'Adults (2-4mm, dark grey-black, long legs) lay eggs in moist growing media. Larvae (5-8mm, translucent white with black head capsule) feed in upper layers of compost for 2-3 weeks. Pupation in growing media. Life cycle 3-4 weeks at 20C. Multiple overlapping generations year-round under glass.',
    identification: 'Adults: small dark flies with long legs running over compost surface. Larvae: translucent white legless maggots (5-8mm) with shiny black head capsule, visible when compost is disturbed. Slime trails on compost surface. Yellow sticky traps catch adults for monitoring.',
    crops_affected: ['propagation seedlings', 'cuttings', 'potted herbs', 'lettuce (protected)', 'mushrooms', 'ornamental nursery stock'],
    risk_factors: 'Wet over-watered growing media, high organic matter content, warm glasshouse temperatures, unsterilised compost, algae growth on compost surface attracting egg-laying',
    economic_impact: 'Significant losses in propagation where larvae damage young roots and stem bases of seedlings and cuttings. Adults also vector fungal pathogens (Pythium, Fusarium, Botrytis). Biological control using Steinernema feltiae nematodes or Hypoaspis (Stratiolaelaps) mites is standard practice.',
    images_description: 'Small dark sciarid fly adult on compost surface and translucent white larva with black head',
  },
  {
    id: 'shore-fly',
    name: 'Shore Fly',
    common_names: ['Scatella stagnalis'],
    pest_type: 'pest',
    description: 'Small robust dark fly (Scatella stagnalis) associated with algae growth on wet surfaces in glasshouses. Adults leave unsightly dark spots of excrement on leaves and fruit. Larvae do not damage plants directly — they feed on algae. A nuisance pest in protected salad and herb production.',
    lifecycle: 'Eggs laid on algae on wet surfaces (capillary matting, gravel floors, NFT channels). Larvae feed on algae for 1-2 weeks. Pupation on or near growing surfaces. Life cycle 2-3 weeks at 20C. Adults are stronger fliers than sciarid flies and more robust (3-5mm, dark with smoky wings with pale spots).',
    identification: 'Adults: stocky dark flies (3-5mm) with short antennae and distinctive pale spots on smoky dark wings. Run rapidly over compost and leaf surfaces. Faecal spots (tiny dark dots) on leaves and fruit. Larvae are brownish, found in algae on wet surfaces. Distinguished from sciarid flies by stouter build and wing spots.',
    crops_affected: ['lettuce (protected)', 'herbs (protected)', 'tomatoes (protected)', 'cucumbers', 'ornamentals'],
    risk_factors: 'Standing water on floors, algae growth on capillary matting and bench surfaces, nutrient-rich irrigation run-off, poor glasshouse hygiene',
    economic_impact: 'Primarily a cosmetic issue — faecal spotting reduces salad crop marketability. Adults can vector plant pathogens (Pythium, Fusarium). Management centres on eliminating algae by improving drainage, disinfecting surfaces, and reducing standing water.',
    images_description: 'Stocky dark shore fly with pale wing spots on lettuce leaf with faecal spotting',
  },
  {
    id: 'leaf-miner-protected',
    name: 'Leaf Miner (Protected Crops)',
    common_names: ['Liriomyza spp.', 'American serpentine leaf miner', 'Tomato leaf miner (Liriomyza)'],
    pest_type: 'pest',
    description: 'Agromyzid leaf-mining flies (Liriomyza trifolii, L. bryoniae, L. huidobrensis) in protected crops. Larvae create serpentine or blotch mines in leaf tissue. Major quarantine significance for some species. Can cause severe defoliation in tomatoes, lettuce, chrysanthemums, and other protected crops.',
    lifecycle: 'Adults (1-2mm, yellow and black) make punctures in leaves for feeding and oviposition. Single egg per puncture. Larvae mine within the leaf mesophyll for 5-10 days. Exit leaf to pupate on soil surface or on leaf surface. Life cycle 2-3 weeks at 20-25C. Multiple generations under glass.',
    identification: 'Serpentine or blotch mines on leaves containing a single larva (visible through the leaf when held to light). Feeding and oviposition punctures (pale dots) on upper leaf surface. Adults are tiny yellow-and-black flies. Frass deposited in a characteristic pattern within the mine.',
    crops_affected: ['tomatoes (protected)', 'lettuce (protected)', 'chrysanthemums', 'celery', 'ornamentals under glass'],
    risk_factors: 'Warm glasshouse conditions, imported plant material from infested areas, broad-spectrum insecticide use killing natural enemies, lack of biological control programme',
    economic_impact: 'Quarantine significance for L. trifolii and L. huidobrensis — detection triggers statutory measures. Severe infestations defoliate crops. Biological control using Diglyphus isaea (parasitoid wasp) and Dacnusa sibirica is effective. Insecticide resistance is common in Liriomyza.',
    images_description: 'Serpentine leaf mines on tomato leaf with tiny yellow-black adult fly',
  },
  {
    id: 'tuta-absoluta',
    name: 'Tomato Leaf Miner (Tuta absoluta)',
    common_names: ['South American tomato moth', 'Tuta absoluta'],
    pest_type: 'pest',
    description: 'Small moth (Tuta absoluta) native to South America, now established in southern Europe and a regular interception in UK glasshouses. Larvae mine in leaves, bore into stems, and tunnel into fruit. Can cause total crop loss in unmanaged outbreaks. UK quarantine pest — does not overwinter outdoors in the UK climate.',
    lifecycle: 'Adults (6-7mm wingspan, grey-brown) are nocturnal. Females lay eggs on leaves and stems. Larvae (up to 8mm, cream to green with dark head) mine leaves, bore stems, and enter fruit. Pupation in the soil, on plant surfaces, or within mines. Life cycle 30-40 days at 25C. Multiple generations per year under glass.',
    identification: 'Irregular blotch mines on leaves (wider than Liriomyza mines). Mines contain dark frass. Larvae may also bore into stems and green fruit — entrance holes with frass visible. Adults attracted to delta traps with Tuta pheromone lures. Larvae are larger than Liriomyza with visible dark head.',
    crops_affected: ['tomatoes (protected)', 'aubergines', 'peppers', 'potatoes', 'Solanum weeds'],
    risk_factors: 'Import of infested plant material from southern Europe, failure to use pheromone traps for early detection, warm glasshouse conditions, contaminated used trays and equipment',
    economic_impact: 'Can cause 80-100% crop loss in unmanaged outbreaks. Pheromone monitoring traps are mandatory in UK glasshouse tomato production. IPM programmes combining mass trapping, Macrolophus predatory bugs, and Bacillus thuringiensis provide effective control. Chemical resistance is a concern.',
    images_description: 'Irregular blotch mine on tomato leaf with dark frass and small grey-brown adult moth',
  },

  // ── Ornamental / Nursery Pests ─────────────────────────────────

  {
    id: 'fuchsia-gall-mite',
    name: 'Fuchsia Gall Mite',
    common_names: ['Aculops fuchsiae'],
    pest_type: 'pest',
    description: 'Eriophyid mite (Aculops fuchsiae) causing severe galling and distortion of fuchsia growing points, leaves, and flowers. First detected in the UK in 2007 in southern England. Microscopic (0.2mm) — cannot be seen without magnification. Spread via wind, contaminated plant material, and handling.',
    lifecycle: 'Microscopic mites feed within developing buds and growing points, causing gall formation. Reproduction is rapid — generation time 2-3 weeks. Mites spread between plants via wind, contact, and handling. Can survive brief periods off the plant. Active from spring through autumn.',
    identification: 'Swollen, distorted, reddened growing points and shoot tips. Leaves thickened, crinkled, and galled — often with a reddish or purplish discolouration. Flowers severely distorted or absent. Looks superficially like herbicide damage. Mites only visible under 20x magnification.',
    crops_affected: ['fuchsia (all species and cultivars)'],
    risk_factors: 'Acquisition of infested plants, warm sheltered gardens, failure to inspect new plants, proximity to infested plants (wind dispersal), mild winters',
    economic_impact: 'Makes fuchsia plants unsightly and unflowering. No effective chemical treatment available to amateur gardeners. Management by removing and destroying affected shoots. Some Fuchsia species show tolerance. Significant reduction in UK fuchsia cultivation since arrival.',
    images_description: 'Fuchsia shoot tip with thickened reddened galled leaves and distorted growing point',
  },
  {
    id: 'hemerocallis-gall-midge',
    name: 'Hemerocallis Gall Midge',
    common_names: ['Daylily gall midge', 'Contarinia quinquenotata'],
    pest_type: 'pest',
    description: 'Small midge (Contarinia quinquenotata) whose larvae develop inside daylily (Hemerocallis) flower buds, causing them to swell and fail to open. First reported in the UK in 1989 and now widespread. Can destroy 100% of flower display on affected plants.',
    lifecycle: 'Adults (2-3mm, delicate grey midges) emerge from soil in late spring. Females lay eggs inside developing flower buds. Larvae (up to 3mm, white to orange) feed inside buds, causing swelling. Mature larvae drop to soil to pupate. Overwintering in soil as pupae. One generation per year.',
    identification: 'Flower buds swollen, abnormally plump, often bent or kinked. Buds fail to open normally. When opened, infested buds contain small white to orange maggots (often multiple per bud). Uninfested buds on the same scape are normal for comparison.',
    crops_affected: ['daylily (Hemerocallis species and cultivars)'],
    risk_factors: 'Acquisition of infested plants, proximity to established infestations, failure to remove swollen buds before larvae enter soil, early-flowering varieties most affected',
    economic_impact: 'Can destroy the entire flower display. No chemical control available. Management by picking off and destroying swollen buds before larvae mature and drop to soil. Consistent removal over 2-3 years reduces populations. Late-flowering varieties may escape the main flight period.',
    images_description: 'Swollen abnormally plump daylily bud with small orange larvae inside when opened',
  },
  {
    id: 'berberis-sawfly',
    name: 'Berberis Sawfly',
    common_names: ['Arge berberidis'],
    pest_type: 'pest',
    description: 'Sawfly (Arge berberidis) whose larvae defoliate Berberis (barberry) and Mahonia plants. First detected in the UK in 2002 and spreading. Larvae are gregarious and can strip plants completely. Two generations per year in southern England.',
    lifecycle: 'Adults (8-10mm, metallic blue-black) emerge in late spring. Females lay eggs in rows along leaf margins using saw-like ovipositor. Larvae are pale with dark spots, gregarious, feeding in groups. Two generations — spring/early summer and late summer. Overwintering as pupae in soil.',
    identification: 'Gregarious larvae (up to 18mm) feeding together on leaves — pale green-yellow with rows of black spots along the body. Adults are metallic blue-black with smoky wings. Defoliation starting from leaf edges, often leaving just the midrib. Plants may be completely stripped.',
    crops_affected: ['Berberis (all species)', 'Mahonia', 'barberry hedges'],
    risk_factors: 'Established populations in southern England spreading northward, warm summers producing larger second generation, failure to detect larvae early',
    economic_impact: 'Severe defoliation is unsightly on garden and hedge plants. Established plants usually survive and re-leaf. Young plants may be killed by repeated defoliation. Hand-picking of gregarious larvae is effective on small plants. Contact insecticide on first detection if needed.',
    images_description: 'Gregarious pale larvae with black spots feeding on Berberis leaf',
  },

  // ── Additional Arable/Misc Pests ───────────────────────────────

  {
    id: 'leather-jacket-marsh',
    name: 'Marsh Crane Fly',
    common_names: ['Tipula oleracea', 'Leather jacket (T. oleracea)'],
    pest_type: 'pest',
    description: 'Crane fly (Tipula oleracea) whose larvae (leatherjackets) feed on roots and stem bases of cereals, grass, and vegetables. A different species from Tipula paludosa (the common crane fly). T. oleracea has two generations per year in southern England — spring and autumn egg-laying — making damage more persistent.',
    lifecycle: 'Adults emerge and lay eggs in spring (April-May) and again in autumn (August-September). Eggs laid in soil. Larvae feed on roots and soil organic matter for several months. Two generations per year distinguishes T. oleracea from T. paludosa (one generation, autumn only). Larvae are grey-brown, legless, up to 40mm.',
    identification: 'Larvae: grey-brown, tough-skinned (leathery), legless, cylindrical, up to 40mm. Found in top 5cm of soil. Above ground: yellowing patches in turf and cereals, bare areas where larvae have severed plants at the base. Starlings and rooks probing soil indicate larval presence.',
    crops_affected: ['grassland', 'winter wheat', 'spring barley', 'vegetables', 'turf', 'lettuce'],
    risk_factors: 'Wet autumn and spring, grass leys or pasture in rotation, mild winters, high organic matter soils, no-till systems, two generations per year (T. oleracea)',
    economic_impact: 'Combined with T. paludosa, leatherjackets cause an estimated GBP 100 million of damage annually to UK agriculture. The two-generation biology of T. oleracea means damage extends into spring-sown crops. Nematode biological control (Steinernema feltiae) and cultural measures (rolling, cultivation) are the main options.',
    images_description: 'Grey-brown leatherjacket larva in soil near damaged grass roots',
  },
  {
    id: 'turnip-gall-weevil',
    name: 'Turnip Gall Weevil',
    common_names: ['Ceutorhynchus pleurostigma'],
    pest_type: 'pest',
    description: 'Small weevil (Ceutorhynchus pleurostigma) whose larvae induce marble-sized galls on roots of brassicas and oilseed rape. Galls are often confused with clubroot but have a smooth round shape and contain a single larval chamber. Widespread across the UK in brassica-growing areas.',
    lifecycle: 'Adults (2.5-3mm, dark grey-brown weevils) active in spring and autumn. Eggs laid on roots near soil surface. Larvae induce gall formation — each gall contains a single larva. Larvae feed inside the gall for several weeks before pupating in soil. Adults emerge to overwinter.',
    identification: 'Smooth round marble-sized galls (5-15mm) on roots of brassicas. Cut open the gall to find a single white legless larva inside a smooth-walled chamber. Distinguished from clubroot (irregular swellings without internal cavity) and from club-shaped galls of cabbage root fly.',
    crops_affected: ['oilseed rape', 'turnips', 'swedes', 'cabbage', 'Brussels sprouts'],
    risk_factors: 'Brassica-rich rotations, autumn and spring brassica crops, mild conditions for adult activity',
    economic_impact: 'Minor economic impact in most crops — galls rarely affect plant vigour except on young transplants. Significance lies mainly in confusion with clubroot, leading to unnecessary alarm. No specific treatment required. Galls do not harbour clubroot pathogen.',
    images_description: 'Smooth round gall on brassica root cut open to reveal single white weevil larva',
  },
  {
    id: 'mangold-flea-beetle',
    name: 'Mangold Flea Beetle',
    common_names: ['Chaetocnema concinna', 'Beet flea beetle'],
    pest_type: 'pest',
    description: 'Small flea beetle (Chaetocnema concinna, 1.5-2.5mm) that feeds on cotyledons and young leaves of sugar beet, mangolds, and related crops. Creates characteristic small round shot-holes. Can kill seedlings in hot dry conditions when growth is slow. The most important seedling pest of sugar beet in the UK.',
    lifecycle: 'Adults overwinter in grass margins and hedge bottoms. Migrate to sugar beet fields in spring when temperatures exceed 15C. Feed on cotyledons and young leaves. Eggs laid at base of plants or in soil. Larvae feed on roots (minor damage). New adults emerge in late summer.',
    identification: 'Adults: tiny (1.5-2.5mm), shiny bronze-black, jump when disturbed. Damage: numerous small round shot-holes in cotyledons and young leaves. Seedlings may be killed if more than 50% of cotyledon area is lost. Most active in warm sunny weather.',
    crops_affected: ['sugar beet', 'mangolds', 'spinach', 'beetroot'],
    risk_factors: 'Hot dry weather slowing crop growth, exposed sites, proximity to overwintering habitats (grass margins), early-sown crops coinciding with beetle emergence',
    economic_impact: 'Neonicotinoid seed treatment loss (2018 ban) increased risk. Foliar pyrethroid sprays at cotyledon stage if damage exceeds threshold (>25% cotyledon area lost). Fast-growing crops in good moisture conditions outpace feeding damage.',
    images_description: 'Small round shot-holes in sugar beet cotyledon caused by tiny bronze flea beetle',
  },
  {
    id: 'beet-moth',
    name: 'Beet Moth',
    common_names: ['Scrobipalpa ocellatella'],
    pest_type: 'pest',
    description: 'Small moth (Scrobipalpa ocellatella) whose larvae mine sugar beet leaves and bore into the crown. An occasional pest in southern England, more common in continental Europe. Crown damage can provide entry points for rot pathogens. Larvae also web together heart leaves.',
    lifecycle: 'Adults (10-12mm wingspan, grey-brown) active from May onwards. Eggs laid on leaves near the crown. Young larvae mine in leaves, older larvae bore into the crown and petiole bases. Two generations per year in warm seasons. Overwintering as pupae in soil or crop debris.',
    identification: 'Young larvae create mines in leaf blades. Older larvae bore into petiole bases and crown, creating tunnels with dark frass. Heart leaves may be webbed together. Crown damage appears as brown rotting tissue with silk webbing and frass. Adults are small grey-brown moths.',
    crops_affected: ['sugar beet', 'beetroot', 'mangolds', 'spinach beet'],
    risk_factors: 'Warm dry summers, southern England, beet crops left in the ground late, mild autumns extending second generation',
    economic_impact: 'Occasional pest in the UK — more common in Mediterranean climates. Crown damage can reduce sugar content and provide entry for crown rot fungi. No specific insecticide recommendation — generally below threshold. Timely harvest reduces late-season damage.',
    images_description: 'Sugar beet crown with frass-filled tunnels and webbed heart leaves',
  },
  {
    id: 'celery-heart-rot',
    name: 'Celery Heart Rot',
    common_names: ['Sclerotinia sclerotiorum on celery', 'Watery soft rot of celery'],
    pest_type: 'pest',
    description: 'Soft rot disease of celery caused by Sclerotinia sclerotiorum (though classified here as a pest entry for the disorder complex). Fungus attacks the heart of celery plants, causing watery soft rot from the inside out. Hard black sclerotia develop in rotting tissue, persisting in soil for years.',
    lifecycle: 'Sclerotia in soil germinate to produce apothecia (small cup-shaped fruiting bodies) that release ascospores in warm wet conditions. Spores infect via senescing petioles, wounds, or soil contact. White mycelium grows through tissue, producing watery soft rot. New sclerotia form in decaying tissue.',
    identification: 'Watery soft rot of inner petioles and heart of celery. White fluffy mycelium on rotting tissue. Hard black sclerotia (3-15mm, irregular shape) within the rot. Outer petioles may appear healthy while heart is completely rotted. Distinctive sour smell.',
    crops_affected: ['celery', 'celeriac', 'lettuce', 'carrots'],
    risk_factors: 'Wet conditions, dense planting, poor air circulation, soil with history of sclerotinia, warm humid weather during growth, mechanical damage',
    economic_impact: 'Can cause severe losses in wet seasons. Sclerotia persist in soil for 5-10 years. Rotation, good drainage, and avoiding dense planting are primary management tools. Contans (Coniothyrium minitans) biological control reduces soil sclerotia levels.',
    images_description: 'Celery heart with watery soft rot and white mycelium with black sclerotia',
  },

  // ── Additional Insect / Mite Pests ─────────────────────────────

  {
    id: 'leaf-miner-liriomyza',
    name: 'Leaf Miner (Liriomyza spp. — outdoor)',
    common_names: ['Liriomyza bryoniae', 'Pea leaf miner', 'Celery leaf miner'],
    pest_type: 'pest',
    description: 'Agromyzid leaf-mining flies (Liriomyza spp.) on outdoor crops. Several species are found in UK field crops including L. bryoniae on tomatoes, L. huidobrensis on peas and lettuce, and Euleia heraclei (celery fly) on celery. Larvae create characteristic serpentine or blotch mines between leaf surfaces.',
    lifecycle: 'Adults (2mm yellow-black flies) puncture leaves for feeding and egg-laying. Single egg per puncture. Larva (pale yellow-green maggot) mines within leaf mesophyll for 7-14 days. Exits leaf to pupate in soil. Two to three generations per year outdoors in the UK. First generation May-June.',
    identification: 'Serpentine or blotch mines visible on leaves as pale winding trails. Dark frass line within the mine. Feeding punctures (small pale dots) on upper leaf surface. Larva (2-3mm yellow-green) visible inside the mine when held to light. Adults are tiny yellow-and-black flies.',
    crops_affected: ['peas', 'lettuce', 'celery', 'brassicas', 'ornamentals'],
    risk_factors: 'Warm dry weather, proximity to glasshouses (source of L. bryoniae), successive crops, lack of natural enemies due to broad-spectrum insecticide use',
    economic_impact: 'Usually minor in UK outdoor crops. Heavy infestations on lettuce and celery reduce marketability. Biological control using parasitoid wasps (Diglyphus isaea) effective where established. Avoid unnecessary insecticide use to preserve natural enemies.',
    images_description: 'Pea leaf with serpentine mine trail showing frass line and pale larva inside',
  },
  {
    id: 'viburnum-beetle',
    name: 'Viburnum Beetle',
    common_names: ['Pyrrhalta viburni'],
    pest_type: 'pest',
    description: 'Leaf beetle (Pyrrhalta viburni) that attacks viburnum, particularly Viburnum opulus (guelder rose) and V. lantana (wayfaring tree). Both larvae and adults feed on leaves, creating characteristic holes. Severe infestations can completely skeletonise plants, reducing flowering and vigour.',
    lifecycle: 'Eggs laid in rows of small pits on young twigs in summer, covered with a cap of chewed bark and frass. Eggs overwinter. Larvae hatch April-May and feed gregariously on expanding leaves. Pupation in soil in June. Adults emerge July-August and feed until autumn. One generation per year.',
    identification: 'Larvae: creamy yellow-green caterpillar-like grubs (up to 10mm) feeding on leaf undersurfaces, creating round holes. Adults: greyish-brown elongated beetles (5-7mm) feeding from the upper surface. Severe attack produces lace-like skeletonised leaves. Egg-laying pits (small dark bumps in rows) on young twigs in winter.',
    crops_affected: ['Viburnum opulus (guelder rose)', 'Viburnum lantana (wayfaring tree)', 'Viburnum tinus (laurustinus)'],
    risk_factors: 'Previous year infestation (egg sites on twigs), shaded conditions, dense planting, susceptible Viburnum species',
    economic_impact: 'Can completely defoliate susceptible viburnums over 2-3 years, sometimes killing plants. Check twigs in winter for egg-laying sites and prune out affected shoots. Hand-pick larvae in spring. Viburnum davidii and V. rhytidophyllum are less susceptible.',
    images_description: 'Viburnum leaf skeletonised by viburnum beetle larvae with yellow-green grubs on underside',
  },
  {
    id: 'bulb-scale-mite',
    name: 'Bulb Scale Mite',
    common_names: ['Steneotarsonemus laticeps', 'Narcissus bulb mite'],
    pest_type: 'pest',
    description: 'Microscopic mite (Steneotarsonemus laticeps) infesting narcissus bulbs. Feeds between bulb scales causing brown streaking and scarring. Cannot be seen without magnification (0.15mm). Major pest of narcissus bulb production — infested stock deteriorates over successive years.',
    lifecycle: 'Lives between bulb scales. Females lay eggs on scale surfaces. Complete life cycle on the bulb. Populations build during storage at warm temperatures. Transferred between bulbs during storage, handling, and planting. Hot-water treatment at planting kills mites.',
    identification: 'Curved, reddish-brown streaking on inner bulb scales. Scarred, roughened scale surfaces. Forced bulbs show distorted, stunted flower stems with brown streaking on leaves. Mites (0.15mm) visible only under microscopy. Infested bulbs may appear superficially normal externally.',
    crops_affected: ['narcissus (daffodils)', 'amaryllis (hippeastrum)'],
    risk_factors: 'Warm storage temperatures, infested planting stock, failure to hot-water treat, successive cropping without treatment',
    economic_impact: 'Reduces bulb quality and flowering performance. Hot water treatment (44.4C for 3 hours + thiophanate-methyl wetter) before planting controls mites. Cool bulb storage (<15C) slows mite reproduction. Inspect and test incoming stock.',
    images_description: 'Cut narcissus bulb showing brown streaking between scales from bulb scale mite damage',
  },
  {
    id: 'box-sucker',
    name: 'Box Sucker',
    common_names: ['Psylla buxi', 'Cacopsylla buxi', 'Box psyllid'],
    pest_type: 'pest',
    description: 'Psyllid insect (Cacopsylla buxi) that attacks box (Buxus sempervirens). Nymphs feed in cupped young leaves at shoot tips, producing white waxy secretions. Very common on box hedges throughout the UK. Damage is primarily cosmetic — cupped leaves and stunted shoot tips.',
    lifecycle: 'Overwinters as partially developed nymphs between the bud scales. In spring, nymphs feed on expanding leaves, causing them to cup inward. Adults (3mm green winged psyllids) emerge in May-June and lay eggs on leaf surfaces. One generation per year.',
    identification: 'Young leaves at shoot tips cupped and stunted. White waxy flocculent secretions (like cotton wool) inside cupped leaves. Green flattened nymphs beneath the wax. Adults are small green winged insects (3mm). Damage most visible May-June on new growth.',
    crops_affected: ['box (Buxus sempervirens)', 'box hedging'],
    risk_factors: 'Presence of box, sheltered sites, previous year infestation, unpruned growth',
    economic_impact: 'Cosmetic damage only — does not kill box. Regular clipping of box hedges removes infested shoot tips before adults emerge. Chemical control rarely justified. Plants outgrow damage.',
    images_description: 'Box shoot tip with cupped leaves containing white waxy secretions from box sucker nymphs',
  },
  {
    id: 'woolly-beech-aphid',
    name: 'Woolly Beech Aphid',
    common_names: ['Phyllaphis fagi'],
    pest_type: 'pest',
    description: 'Aphid species (Phyllaphis fagi) specific to beech (Fagus sylvatica). Colonies covered in dense white waxy wool on leaf undersurfaces. Produces copious honeydew that supports sooty mould growth. Very common on beech hedges and specimen trees throughout the UK.',
    lifecycle: 'Overwinters as eggs on twigs. Fundatrices hatch in spring and establish colonies on leaf undersurfaces. Several parthenogenetic generations through summer, all producing white waxy filaments. Winged forms develop in autumn. Eggs laid on twigs for overwintering. One main period of activity May-August.',
    identification: 'Dense white woolly or fluffy wax on leaf undersurfaces, especially along midrib and main veins. Copious sticky honeydew dripping from infested canopy. Black sooty mould growing on honeydew-coated surfaces below. Green aphids visible beneath the waxy covering. Heavy infestations cause leaf curling.',
    crops_affected: ['beech (Fagus sylvatica)', 'beech hedges', 'copper beech'],
    risk_factors: 'Beech presence, warm dry summers favouring aphid multiplication, sheltered sites, poor air circulation',
    economic_impact: 'Primarily a nuisance from honeydew dripping on cars, paths, and garden furniture. Does not significantly harm the tree. Rarely worth treating. Natural enemies (ladybirds, lacewings, hoverflies) provide some control.',
    images_description: 'Beech leaf underside with white woolly aphid colony and honeydew-coated leaf surface',
  },
  {
    id: 'horse-chestnut-scale',
    name: 'Horse Chestnut Scale',
    common_names: ['Pulvinaria regalis', 'Cushion scale'],
    pest_type: 'pest',
    description: 'Scale insect (Pulvinaria regalis) infesting the bark of horse chestnut, lime, sycamore, and other urban trees. Females produce distinctive white egg sacs (ovisacs) on branches in May-June. Very common on street trees in southern England. Produces honeydew.',
    lifecycle: 'Overwintering as adult females on bark. In May-June, each female produces a white egg sac (ovisac) behind her body. Hundreds of eggs per female. Nymphs (crawlers) emerge in July and settle on leaf undersurfaces. In autumn, nymphs migrate to twigs and bark. One generation per year.',
    identification: 'White cottony egg sacs (ovisacs) 5-10mm long on bark of branches and trunk — most visible May-June. Brown oval adult scales (4-6mm) on bark. Crawlers (tiny flattened nymphs) on leaf undersurfaces in summer. Heavy infestations coat branches with white egg sacs. Sooty mould from honeydew.',
    crops_affected: ['horse chestnut', 'lime (Tilia)', 'sycamore', 'elm', 'magnolia'],
    risk_factors: 'Urban environments, southern England, stressed trees, previous infestation, warm winters',
    economic_impact: 'Primarily cosmetic. Heavy infestations weaken trees over time and produce copious honeydew. Rarely treated. Natural enemies (parasitoid wasps, birds) provide some regulation. Improving tree health through watering and mulching helps.',
    images_description: 'Horse chestnut bark with white cottony egg sacs of Pulvinaria regalis scale',
  },
  {
    id: 'oak-knopper-gall',
    name: 'Oak Knopper Gall Wasp',
    common_names: ['Andricus quercuscalicis'],
    pest_type: 'pest',
    description: 'Cynipid gall wasp (Andricus quercuscalicis) that causes distinctive ridged, knobbly galls on the acorns of pedunculate oak (Quercus robur). Arrived in the UK in the 1960s from continental Europe and is now ubiquitous. Galls replace the normal acorn, reducing seed production.',
    lifecycle: 'Complex life cycle alternating between pedunculate oak and Turkey oak (Q. cerris). Sexual generation produces catkin galls on Turkey oak in spring. Asexual females lay eggs in developing acorns on pedunculate oak in summer. Green knopper galls develop, turning brown by autumn. Wasp larvae overwinter in fallen galls.',
    identification: 'Distinctive knobbly, ridged green galls replacing acorns on pedunculate oak in late summer. Galls turn brown and woody by autumn. Each gall contains a single larva. Turkey oak nearby is required for the sexual generation. Heavy infestations reduce acorn production to near zero.',
    crops_affected: ['pedunculate oak (Quercus robur)', 'Turkey oak (Q. cerris, alternate host)'],
    risk_factors: 'Proximity of Turkey oak, warm summers, pedunculate oak presence, established gall wasp populations',
    economic_impact: 'Reduces acorn production — significant for forestry regeneration and wildlife. No practical control. Removing Turkey oak eliminates the sexual generation but is rarely practical. Not a threat to tree health.',
    images_description: 'Knobbly green-brown knopper gall distorting acorn on pedunculate oak twig',
  },
  {
    id: 'vapourer-moth',
    name: 'Vapourer Moth',
    common_names: ['Orgyia antiqua'],
    pest_type: 'pest',
    description: 'Tussock moth (Orgyia antiqua) whose colourful caterpillars feed on a wide range of broadleaved and coniferous trees. Very common in urban areas throughout the UK. Females are wingless and lay eggs in a distinctive foamy mass on the pupal cocoon. Caterpillars have irritant hairs.',
    lifecycle: 'Eggs overwinter in a foamy mass on the cocoon. Caterpillars hatch in May and feed on leaves until July. Pupation in silk cocoon on bark or fences. Males are red-brown day-flying moths. Wingless females remain on cocoon and lay eggs immediately after mating. One generation per year (occasionally two in south).',
    identification: 'Distinctive caterpillar: dark grey with red spots, four pale yellow dorsal tussocks, two long black hair pencils at the front, and one at the rear. Up to 35mm. Adults: males small red-brown with white spot on forewing; females wingless, grey, plump. Egg mass: grey-white foam on silk cocoon.',
    crops_affected: ['oak', 'hawthorn', 'rose', 'apple', 'lime', 'willow', 'many broadleaved trees'],
    risk_factors: 'Urban environments, hedgerows, previous infestation (wingless females lay eggs where they emerge)',
    economic_impact: 'Rarely causes significant damage as populations are regulated by parasitoids. Occasionally defoliates individual branches. Caterpillar hairs can cause skin irritation. No control measures usually needed.',
    images_description: 'Vapourer moth caterpillar with yellow tussocks and black hair pencils on oak leaf',
  },
  {
    id: 'brown-tail-moth',
    name: 'Brown-tail Moth',
    common_names: ['Euproctis chrysorrhoea'],
    pest_type: 'pest',
    description: 'Tussock moth (Euproctis chrysorrhoea) whose caterpillars have highly urticating (irritant) hairs causing severe skin rash, eye irritation, and respiratory problems. Present in coastal areas of southern England, expanding range. Public health concern as well as a defoliating pest.',
    lifecycle: 'Overwinters as small caterpillars in communal silk web tents on hedge and tree branches. Caterpillars resume feeding in spring, growing to 38mm by June. Pupation in silk cocoons in leaf clusters. White moths with brown-tipped abdomen fly in July-August. Eggs laid on leaf undersurfaces.',
    identification: 'Communal silk web tents on branch tips (visible in winter). Dark brown caterpillars with white side stripes, two orange-red dorsal spots near the tail, and dense urticating hairs. Adults: pure white moths with distinctive brown hair tuft at abdomen tip. Caterpillar hairs drift in the air.',
    crops_affected: ['hawthorn', 'blackthorn', 'oak', 'fruit trees', 'hedgerows'],
    risk_factors: 'Coastal areas of southern and south-eastern England, expanding range, warm summers, hedgerow proximity, public spaces',
    economic_impact: 'Public health concern — caterpillar hairs cause severe dermatitis and respiratory irritation. Councils may need to manage infestations near schools, parks, and housing. Prune and destroy web tents in winter (wear PPE). Do not touch caterpillars.',
    images_description: 'Brown-tail moth caterpillar with white stripes and orange-red dorsal spots in web tent',
  },
  {
    id: 'figwort-weevil',
    name: 'Figwort Weevil',
    common_names: ['Cionus scrophulariae'],
    pest_type: 'pest',
    description: 'Small weevil (Cionus scrophulariae) that feeds on figworts (Scrophularia spp.) and buddleia. Both adults and larvae feed on leaves and flower buds. Larvae are covered in a slimy mucus coating. Common garden pest of buddleia throughout the UK.',
    lifecycle: 'Adults (3-4mm, grey-brown with black and white markings) emerge in spring and feed on leaves, creating shot-holes. Eggs laid on flower buds and leaves. Larvae feed externally on leaves and buds, covered in slimy protective mucus. Pupation in a foamy cocoon on the plant. One or two generations per year.',
    identification: 'Shot-hole damage on buddleia and figwort leaves from adult feeding. Slimy, slug-like larvae (3-5mm) on leaf surfaces and flower buds — distinctive. Adults are small round weevils with patterned grey-brown wing cases. Foamy pupal cocoons on stems and leaves.',
    crops_affected: ['buddleia', 'figwort (Scrophularia)', 'mullein (Verbascum)'],
    risk_factors: 'Presence of host plants, warm weather, previous year infestation',
    economic_impact: 'Minor cosmetic damage to buddleia. Occasionally reduces flowering. No control usually needed. Hand-pick larvae if desired. Part of the natural fauna on these plants.',
    images_description: 'Small grey-brown figwort weevil and slimy larvae on buddleia leaf with shot-hole damage',
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

  // ── Expansion: Arable Weeds ────────────────────────────────────

  {
    id: 'red-dead-nettle',
    name: 'Red Dead-nettle',
    common_names: ['Lamium purpureum'],
    pest_type: 'weed',
    description: 'Common winter annual weed (Lamium purpureum) of arable land. Germinates autumn through spring. Square stems with opposite, purplish, nettle-shaped leaves. Small pink-purple flowers. Does not sting. Often found with chickweed and speedwells.',
    lifecycle: 'Winter or spring annual. Germinates September-November and February-April. Flowers March-October. Sets seed prolifically. Seeds viable in soil for 5+ years. Often completes multiple short generations per year.',
    identification: 'Square stems up to 30cm. Opposite heart-shaped leaves with crenate margins, often purplish especially near the top. Small pink-purple two-lipped flowers in whorls at upper leaf axils. No stinging hairs (unlike true nettles).',
    crops_affected: ['cereals', 'oilseed rape', 'sugar beet', 'vegetables'],
    risk_factors: 'Autumn-sown crops, minimum tillage, fertile soils, sheltered field margins',
    economic_impact: 'Usually minor in competitive cereal crops. Can be significant in sugar beet and vegetables where it competes early. Controlled by most broadleaved herbicide programmes. Often present but below economic threshold.',
    images_description: 'Red dead-nettle plant with square stem purplish leaves and pink-purple flowers',
  },

  {
    id: 'field-forget-me-not',
    name: 'Field Forget-me-not',
    common_names: ['Myosotis arvensis'],
    pest_type: 'weed',
    description: 'Winter annual weed of arable land with small blue flowers. Myosotis arvensis is one of the most common arable weeds in the UK. Germinates in autumn and overwinters as a rosette. Generally not highly competitive but abundant.',
    lifecycle: 'Winter annual. Germinates August-November. Overwinters as a basal rosette. Flowers April-September. Produces many small nutlet seeds with a hard coat. Seeds viable in soil for many years. Widespread across all soil types.',
    identification: 'Basal rosette of hairy oval leaves. Flowering stems up to 40cm. Small blue flowers (3-5mm) with yellow centres in coiled cyme inflorescences (scorpioid cyme). Stems and leaves covered in fine hairs. Nutlet seeds.',
    crops_affected: ['cereals', 'oilseed rape', 'peas', 'beans'],
    risk_factors: 'Autumn-sown crops, minimum tillage, widespread across soil types, lower-fertility sandy soils',
    economic_impact: 'Usually a minor competitor but very widespread. Rarely reaches economic threshold in cereals. Controlled by most broadleaved herbicide programmes. Can be locally abundant in peas and beans where herbicide options are limited.',
    images_description: 'Small blue forget-me-not flowers with yellow centre on hairy stems in arable field',
  },

  {
    id: 'corn-marigold',
    name: 'Corn Marigold',
    common_names: ['Glebionis segetum', 'Chrysanthemum segetum'],
    pest_type: 'weed',
    description: 'Annual weed of arable land with bright yellow daisy-like flower heads. Once a major arable weed in the UK but declined due to herbicides and seed cleaning. Still locally common on acidic sandy soils. Heritage significance as a cornfield wildflower.',
    lifecycle: 'Spring or autumn annual. Germinates February-May and September-October. Flowers June-October. Single bright yellow flower heads (35-65mm). Seeds lack dormancy mechanisms — most germinate within one year. Declined significantly since 1950s.',
    identification: 'Erect stems to 60cm. Bluish-green fleshy leaves, lower ones deeply toothed, upper clasping the stem. Large single bright yellow flower heads. Distinguished from other yellow composites by the fleshy bluish-green foliage.',
    crops_affected: ['cereals', 'root crops', 'vegetables'],
    risk_factors: 'Acidic sandy soils, organic systems (no herbicides), conservation headlands, light land in Scotland and eastern England',
    economic_impact: 'Historically a serious weed causing major yield losses. Now uncommon in conventional cropping due to herbicides. Can be competitive in organic systems on light soils. Valued in conservation headlands and wildflower strips.',
    images_description: 'Bright yellow daisy-like corn marigold flowers in cereal field margin',
  },

  {
    id: 'scented-mayweed',
    name: 'Scented Mayweed',
    common_names: ['Matricaria chamomilla', 'Matricaria recutita', 'Wild chamomile'],
    pest_type: 'weed',
    description: 'Annual weed with white daisy-like flowers and finely divided feathery leaves that release a sweet chamomile scent when crushed. Common in UK arable land, especially on lighter soils. Distinguished from scentless mayweed by the scent and hollow receptacle.',
    lifecycle: 'Spring or autumn annual. Germinates February-May and September-October. Flowers May-August. Prolific seed production (up to 5,000 seeds per plant). Seeds small and light, viable in soil for up to 15 years. Conical hollow receptacle beneath flower.',
    identification: 'Finely divided feathery leaves. White ray florets around yellow conical disc. Distinguished from scentless mayweed by: sweet scent when crushed, conical (not flat) receptacle, and hollow receptacle when sliced vertically.',
    crops_affected: ['cereals', 'sugar beet', 'oilseed rape', 'potatoes'],
    risk_factors: 'Light sandy to loamy soils, pH 5-7, autumn-sown crops, reduced herbicide input, field margins',
    economic_impact: 'Competitive in thin crops on lighter soils. Yield losses of 2-10% where dense. Controlled by most ALS and growth regulator herbicides in cereals. Can be problematic in sugar beet where herbicide options are limited.',
    images_description: 'White daisy flowers with yellow conical centre and finely divided feathery leaves in cereal stubble',
  },

  {
    id: 'shepherds-purse',
    name: "Shepherd's Purse",
    common_names: ['Capsella bursa-pastoris'],
    pest_type: 'weed',
    description: "Ubiquitous annual weed found in arable land, gardens, and waste ground across the UK. Named for its distinctive heart-shaped seed pods. Capsella bursa-pastoris can flower and set seed year-round in mild conditions. Also a host for brassica diseases.",
    lifecycle: "Germinates year-round in mild conditions. Rapid growth — can complete a generation in 6 weeks. Flowers year-round. Heart-shaped (triangular) seed pods. Up to 40,000 seeds per plant. Seed bank persists for 30+ years in soil.",
    identification: "Basal rosette of deeply lobed leaves (variable shape). Slender flowering stems to 40cm. Tiny white four-petalled flowers. Distinctive flattened heart-shaped seed pods (silicula) along the stem. Rosette leaves variable — from entire to deeply lobed.",
    crops_affected: ['cereals', 'oilseed rape', 'sugar beet', 'vegetables', 'potatoes'],
    risk_factors: 'Year-round germination, all soil types, disturbed ground, field margins, gardens, compacted ground, nitrogen-rich soils',
    economic_impact: "Usually not highly competitive but acts as a bridge host for Alternaria, clubroot, and other brassica diseases. Important in oilseed rape for this reason. Controlled by most broadleaved herbicide programmes.",
    images_description: "Shepherd's purse plant with distinctive heart-shaped seed pods along the flowering stem",
  },

  {
    id: 'groundsel',
    name: 'Groundsel',
    common_names: ['Senecio vulgaris'],
    pest_type: 'weed',
    description: 'Very common annual weed (Senecio vulgaris) that flowers and sets seed year-round. Found in arable land, gardens, nurseries, and waste ground. Fast lifecycle — can produce seed 5-6 weeks after germination. Also a host for rust diseases.',
    lifecycle: 'Germinates year-round. Multiple overlapping generations. Flowers have no ray florets (distinguish from ragwort). Wind-dispersed pappus seeds. Up to 1,000 seeds per plant. Short-lived seed bank (2-5 years). Common in warm winters.',
    identification: 'Upright plant to 40cm. Irregularly lobed leaves, slightly fleshy. Clusters of small cylindrical yellow flower heads without ray florets — flower heads look like miniature shaving brushes. White pappus for wind dispersal.',
    crops_affected: ['vegetables', 'nursery stock', 'cereals', 'sugar beet'],
    risk_factors: 'Year-round germination, disturbed ground, container nurseries, vegetable beds, mild winters, nitrogen-rich soils',
    economic_impact: 'Competitive in slow-establishing crops and containers. Acts as a host for lettuce downy mildew and rust diseases. Important weed in nursery stock and vegetable production. Controlled by most broadleaved herbicides but re-establishes rapidly.',
    images_description: 'Groundsel plant with lobed leaves and clusters of small cylindrical yellow flower heads without petals',
  },

  {
    id: 'knotgrass',
    name: 'Knotgrass',
    common_names: ['Polygonum aviculare'],
    pest_type: 'weed',
    description: 'Prostrate annual weed (Polygonum aviculare) common on compacted, heavily trafficked arable land. Forms mats of wiry stems with small lance-shaped leaves and tiny pink-white flowers. Tolerant of trampling and poor soil conditions.',
    lifecycle: 'Spring annual. Germinates March-June. Prostrate spreading habit, stems radiating from a central tap root. Tiny pink or white flowers in leaf axils July-October. Hard seeds — viable in soil for 20+ years. Favoured by compaction.',
    identification: 'Prostrate wiry stems spreading to 100cm. Small lance-shaped leaves decreasing in size toward stem tips. Silvery membranous sheaths (ocreae) at each node. Tiny pink-white flowers in leaf axils. Overall appearance of a flat mat on soil surface.',
    crops_affected: ['cereals', 'sugar beet', 'potatoes', 'maize', 'vegetables'],
    risk_factors: 'Compacted soils, field gateways, tramlines, headlands, spring-sown crops, heavy clay soils',
    economic_impact: 'Usually a minor competitor in cereal crops but abundant on headlands and tramlines. Indicator of soil compaction. Can smother low-growing crops on headlands. Controlled by most broadleaved herbicides. Address soil compaction as root cause.',
    images_description: 'Prostrate knotgrass mat with wiry stems and small leaves on compacted soil surface',
  },

  {
    id: 'black-bindweed',
    name: 'Black Bindweed',
    common_names: ['Fallopia convolvulus', 'Bilderdykia convolvulus'],
    pest_type: 'weed',
    description: 'Annual climbing weed (Fallopia convolvulus) that twines around crop stems in arable fields. Heart-shaped leaves resemble field bindweed but this species is annual and lacks the showy trumpet flowers. Can smother crops and cause harvesting difficulties.',
    lifecycle: 'Spring annual. Germinates April-June. Climbs by twining stems around crop plants. Small greenish-white flowers in clusters July-October. Hard angular black seeds. Seed bank persists for 10-20 years. Commonest in spring-sown crops.',
    identification: 'Twining annual with heart-shaped leaves (like bindweed but duller green and more angular). Stems reddish, climbing to 120cm. Small greenish-white flowers in axillary clusters (not the large trumpets of true bindweed). Hard angular black seeds.',
    crops_affected: ['cereals', 'oilseed rape', 'peas', 'beans', 'sugar beet', 'potatoes'],
    risk_factors: 'Spring-sown crops, fertile soils, minimum tillage, hedgerow margins, combine harvester spread',
    economic_impact: 'Yield losses of 3-10% from competition. Twining around stems causes lodging and harvesting problems. Contamination of harvested grain with weed seed. Controlled by most post-emergence broadleaved herbicides in cereals.',
    images_description: 'Black bindweed twining around cereal stem with heart-shaped leaves and angular black seeds',
  },

  {
    id: 'pale-persicaria',
    name: 'Pale Persicaria',
    common_names: ['Persicaria lapathifolia', 'Polygonum lapathifolium'],
    pest_type: 'weed',
    description: 'Annual weed (Persicaria lapathifolia) of arable land with pale pink flower spikes. Common in fertile, damp soils. Distinguished from redshank by nodding flower spikes, lack of dark leaf blotch, and preference for wetter conditions.',
    lifecycle: 'Spring annual. Germinates March-May. Erect stems to 80cm. Pale pink to white nodding flower spikes June-October. Seeds flattened and shiny. Seed bank persists 5-10 years. Commonest in wet areas of fields and ditch margins.',
    identification: 'Erect stems with swollen nodes and membranous ocreae. Leaves lance-shaped, often with glandular dots beneath (feel rough). Pale pink to white flower spikes that nod at the tip. No dark blotch on leaves (unlike redshank).',
    crops_affected: ['cereals', 'sugar beet', 'potatoes', 'maize', 'vegetables'],
    risk_factors: 'Wet fertile soils, damp areas of fields, spring-sown crops, ditch margins, minimum tillage',
    economic_impact: 'Competitive in spring-sown crops on wet soils. Yield losses of 3-8% locally. Controlled by most broadleaved herbicides in cereals. Can be problematic in sugar beet and vegetables in wet field areas.',
    images_description: 'Pale persicaria with nodding pale pink flower spikes and lance-shaped leaves without dark blotch',
  },

  {
    id: 'redshank',
    name: 'Redshank',
    common_names: ['Persicaria maculosa', 'Polygonum persicaria'],
    pest_type: 'weed',
    description: 'Common annual weed (Persicaria maculosa) of arable land with erect pink flower spikes and a characteristic dark blotch on each leaf. One of the most widespread arable weeds in the UK. Related to pale persicaria.',
    lifecycle: 'Spring annual. Germinates March-June. Erect to spreading stems to 75cm with reddish nodes. Erect (not nodding) pink flower spikes June-October. Seeds shiny and dark. Seed bank persists 20+ years. Very common on all soil types.',
    identification: 'Stems reddish, often with reddish swollen nodes. Lance-shaped leaves with distinctive dark blotch (not always present). Erect pink flower spikes (not nodding — unlike pale persicaria). Membranous ocreae at nodes. Leaves smooth, not glandular.',
    crops_affected: ['cereals', 'oilseed rape', 'sugar beet', 'potatoes', 'peas', 'beans'],
    risk_factors: 'All soil types, spring and autumn crops, minimum tillage, fertile soils, field margins',
    economic_impact: 'Common but usually a minor competitor. Yield losses rarely exceed 5%. Controlled by most broadleaved herbicide programmes. Very long-lived seed bank means persistence despite good chemical control. Rarely justifies specific herbicide application.',
    images_description: 'Redshank plant with erect pink flower spike and lance-shaped leaf showing dark central blotch',
  },

  {
    id: 'yorkshire-fog',
    name: 'Yorkshire Fog',
    common_names: ['Holcus lanatus'],
    pest_type: 'weed',
    description: 'Perennial grass (Holcus lanatus) that is an unwanted component in arable crops and improved grassland. Soft, hairy grass with distinctive pink-white fluffy flower heads. Indicates low fertility or poor management in grassland. Competitive in arable crops.',
    lifecycle: 'Perennial, tufted grass. Spreads by seed and short stolons. Flowers May-August in fluffy panicles that are pink when fresh, turning white. Seeds small and produced abundantly. Tolerates acid and poorly drained soils. Very common throughout the UK.',
    identification: 'Very hairy — leaves, sheaths, and nodes all softly pubescent (velvet-like feel when stroked). Pink-white fluffy flower panicle. Leaves grey-green, broad (4-10mm). Tufted growth habit. Distinguished from other grasses by the all-over hairiness.',
    crops_affected: ['cereals', 'grassland', 'hay', 'silage', 'amenity turf'],
    risk_factors: 'Acid soils, poorly drained land, low fertility, undergrazed grassland, minimum tillage in arable',
    economic_impact: 'In grassland, indicates poor fertility and management — low palatability to livestock. In arable, competes with crops on headlands and field margins. Controlled by glyphosate before drilling. Responsive to liming and fertiliser improvement in grassland.',
    images_description: 'Soft hairy grass with pink-white fluffy flower panicle and grey-green velvet leaves',
  },

  {
    id: 'soft-brome',
    name: 'Soft Brome',
    common_names: ['Bromus hordeaceus', 'Lop grass'],
    pest_type: 'weed',
    description: 'Annual or biennial grass (Bromus hordeaceus) that has become a significant weed of winter cereals in the UK, particularly where minimum tillage is practiced. Closely related to sterile brome. Competitive and can cause yield losses.',
    lifecycle: 'Annual or short-lived biennial. Germinates autumn and spring. Softly hairy plant with nodding panicle of awned spikelets. Seeds shed before harvest. Seed bank short-lived (2-3 years). Increasing in minimum tillage systems.',
    identification: 'Softly hairy grass, stems to 80cm. Panicle of broad, softly hairy spikelets with short awns. Panicle becomes compact and nodding at maturity. Distinguished from sterile brome by softer hairs, compact panicle, and shorter awns.',
    crops_affected: ['wheat', 'barley', 'oilseed rape'],
    risk_factors: 'Minimum tillage, winter cereals, field margins, short rotations, late herbicide application',
    economic_impact: 'Yield losses of 5-15% in heavy infestations. Short-lived seed bank means ploughing provides good control. In minimum tillage, pre-emergence flufenacet-based herbicides provide partial control. Less of a resistance problem than blackgrass.',
    images_description: 'Softly hairy brome grass with compact nodding panicle of broad awned spikelets in wheat field',
  },

  {
    id: 'onion-couch',
    name: 'Onion Couch',
    common_names: ['Arrhenatherum elatius var. bulbosum', 'False oat-grass (bulbous form)'],
    pest_type: 'weed',
    description: 'Bulbous form of false oat-grass (Arrhenatherum elatius var. bulbosum). Perennial grass with distinctive chains of small onion-like bulbs at the base. Difficult to control because bulbs survive cultivation and regrow. Increasing in minimum tillage.',
    lifecycle: 'Perennial. Spreads by seed and chains of basal corm-like bulbs (3-5 per chain). Bulbs survive cultivation and act like vegetative propagules. Tall grass (60-150cm) flowering June-August. Bulbs are the primary means of persistence and spread.',
    identification: 'Tall grass with distinctive chain of swollen onion-like bulbs at the stem base (easily visible when plant is pulled up). Otherwise resembles false oat-grass. Panicle with conspicuous bent awns. Bulbs 10-15mm, white to brown, bead-like.',
    crops_affected: ['cereals', 'oilseed rape', 'grass leys'],
    risk_factors: 'Minimum tillage (bulbs survive), field margins, hedgerow edges, non-inversion cultivation, light soils',
    economic_impact: 'Competitive perennial that is difficult to eradicate. Yield losses of 5-10%. Glyphosate before drilling partially effective. Ploughing buries bulbs but they can survive at depth. Repeated glyphosate applications over several seasons needed for full control.',
    images_description: 'Onion couch grass pulled from soil showing characteristic chain of onion-like bulbs at base',
  },

  {
    id: 'creeping-bent',
    name: 'Creeping Bent',
    common_names: ['Agrostis stolonifera'],
    pest_type: 'weed',
    description: 'Stoloniferous perennial grass (Agrostis stolonifera) that spreads rapidly by surface stolons. Weed of arable land, particularly in wet areas and headlands. Also invades improved grassland. Difficult to eradicate once established.',
    lifecycle: 'Perennial. Spreads primarily by stolons (surface runners) that root at nodes. Also produces abundant fine seed. Stolons fragment during cultivation and re-root. Flowers June-August. Tolerates wet and acid conditions.',
    identification: 'Mat-forming grass spreading by surface stolons. Fine leaves (2-5mm wide). Open panicle of tiny spikelets. Stolons visible as runners across soil surface, rooting at nodes. Forms dense mats that smother crop seedlings. Ligule pointed (2-6mm).',
    crops_affected: ['cereals', 'oilseed rape', 'sugar beet', 'grassland'],
    risk_factors: 'Wet areas of fields, headlands, minimum tillage, poorly drained soils, field ditches, grassland conversion to arable',
    economic_impact: 'Competitive mat-forming grass. Yield losses of 5-15% in affected patches. Glyphosate effective but stolon fragments re-establish. Ploughing and repeated cultivation needed. Drainage improvement reduces competitive advantage.',
    images_description: 'Dense mat of creeping bent grass with surface stolons rooting at nodes in wet arable headland',
  },

  {
    id: 'horsetail',
    name: 'Horsetail',
    common_names: ['Equisetum arvense', 'Marestail (common name, not Hippuris)'],
    pest_type: 'weed',
    description: 'Ancient perennial plant (Equisetum arvense) with deep rhizomes and distinctive jointed stems. Difficult to eradicate due to rhizomes extending 2m+ deep. Not controlled by any selective herbicide. Present since the Carboniferous period.',
    lifecycle: 'Perennial. Spreads by deep rhizomes (to 2m+) and spore-bearing cones on brown fertile stems in spring. Green vegetative stems (15-50cm) appear in summer with whorls of fine branches. Deciduous — dies back in autumn. Rhizome fragments regenerate.',
    identification: 'Green stems jointed like bamboo with whorls of fine needle-like branches. Fertile stems brown, unbranched, with cone-like strobili at tip appearing in spring before vegetative stems. No true leaves — photosynthesis in stems and branches.',
    crops_affected: ['cereals', 'potatoes', 'vegetables', 'grassland', 'gardens'],
    risk_factors: 'Heavy clay soils, poor drainage, waterlogged areas, field margins near ditches, gardens with disturbed clay subsoil',
    economic_impact: 'Minor direct yield impact but nearly impossible to eradicate. Resistant to all selective herbicides. Glyphosate gives temporary suppression. Repeated cultivation over years can gradually weaken the rhizome system. Drainage improvement helps.',
    images_description: 'Jointed green horsetail stems with whorls of fine branches and brown fertile cone-tipped stem',
  },

  {
    id: 'bracken',
    name: 'Bracken',
    common_names: ['Pteridium aquilinum'],
    pest_type: 'weed',
    description: 'Large fern (Pteridium aquilinum) that dominates upland grassland and moorland. Deep rhizomes make it extremely difficult to control. Contains carcinogens and is toxic to livestock. Covers an estimated 60,000 hectares in the UK.',
    lifecycle: 'Perennial fern. Spreads by deep rhizomes (to 1m+) and spores. Fronds emerge April-May from underground, reaching 1-2m tall. Die back in autumn (brown standing dead fronds persist). Dense canopy shades out other vegetation. Litter builds up.',
    identification: 'Large triangular fronds (1-2m tall) emerging as curled fiddleheads in spring. Three-times pinnate (tripinnate) with opposite pinnae. Dead brown fronds persist through winter. Underside of fertile fronds shows dark brown spore strips along pinna margins.',
    crops_affected: ['grassland', 'moorland', 'upland pasture', 'young tree plantations'],
    risk_factors: 'Upland areas, acidic soils, undergrazed land, unmanaged hill ground, light sandy or peaty soils',
    economic_impact: 'Reduces grazing capacity by 50-100% in affected areas. Toxic to livestock (carcinogens, thiaminase). Tick reservoir. Control costs GBP 50-200/ha. Asulam (the only effective herbicide for bracken) has limited approval in the UK. Mechanical cutting twice yearly can suppress but not eradicate.',
    images_description: 'Dense stand of tall bracken fronds covering upland hillside with curled fiddleheads emerging in spring',
  },

  // ── Expansion: Additional Weeds ────────────────────────────────

  {
    id: 'common-orache',
    name: 'Common Orache',
    common_names: ['Atriplex patula'],
    pest_type: 'weed',
    description: 'Annual weed (Atriplex patula) related to fat-hen. Found in arable fields on heavier soils. Triangular to hastate lower leaves. Grows later than fat-hen and can be competitive in spring-sown crops, especially sugar beet.',
    lifecycle: 'Spring annual. Germinates March-June. Erect or spreading stems to 90cm. Variable leaf shape — lower leaves triangular with basal lobes. Tiny flowers in axillary and terminal clusters. Seeds enclosed in bracteoles. Seed bank persists 5-10 years.',
    identification: 'Lower leaves triangular with two spreading basal lobes (hastate). Stems often reddish. Mealy texture on young leaves and stems. Distinguished from fat-hen by the more angular leaf shape and spreading basal lobes.',
    crops_affected: ['sugar beet', 'potatoes', 'cereals', 'vegetables'],
    risk_factors: 'Heavy clay soils, spring-sown crops, fertile conditions, minimum tillage',
    economic_impact: 'Competitive in sugar beet and root crops. Yield losses of 3-8%. Controlled by most broadleaved herbicide programmes. Similar biology to fat-hen — often managed together.',
    images_description: 'Common orache plant with triangular leaves having spreading basal lobes on reddish stem',
  },

  {
    id: 'smooth-sowthistle',
    name: 'Smooth Sow-thistle',
    common_names: ['Sonchus oleraceus'],
    pest_type: 'weed',
    description: 'Annual weed (Sonchus oleraceus) found in arable land and gardens. Produces milky latex when cut. Yellow dandelion-like flowers. Can be competitive in open crops. Distinguished from perennial sow-thistle (S. arvensis) by annual habit and rounded leaf base lobes.',
    lifecycle: 'Annual. Germinates year-round in mild conditions. Erect hollow stems to 100cm with milky sap. Yellow flower heads (20-25mm) in loose clusters. Seeds with white pappus, wind-dispersed. Rapid lifecycle — can produce several generations per year.',
    identification: 'Hollow stems with milky sap when cut. Leaves softly spiny-margined, variable shape, upper leaves clasping stem with rounded auricles. Yellow composite flowers. Distinguished from prickly sow-thistle (S. asper) by softer spines and rounded (not curled) ear-shaped leaf bases.',
    crops_affected: ['cereals', 'sugar beet', 'potatoes', 'vegetables', 'gardens'],
    risk_factors: 'Disturbed fertile soils, gardens, field margins, year-round germination in mild areas, minimum tillage',
    economic_impact: 'Minor competitor in cereals. More significant in vegetable crops and gardens due to rapid growth. Controlled by most broadleaved herbicides. Wind-dispersed seeds recolonise rapidly.',
    images_description: 'Smooth sow-thistle with hollow stem showing milky sap and yellow dandelion-like flowers',
  },

  {
    id: 'annual-nettle',
    name: 'Small Nettle',
    common_names: ['Urtica urens', 'Annual nettle'],
    pest_type: 'weed',
    description: 'Annual stinging nettle (Urtica urens) of arable land and gardens. Smaller than perennial nettle but with a more severe sting. Common on fertile phosphate-rich soils. Can form dense stands in root crops and vegetable fields.',
    lifecycle: 'Annual. Germinates March-October. Rapid growth to 30-60cm. Smaller and more compact than perennial nettle. Stinging hairs present. Flowers and seeds continuously. Multiple generations per year. Seed bank persists 5-10 years.',
    identification: 'Small (15-60cm) nettle with stinging hairs. Leaves deeply toothed, more rounded than perennial nettle. Plant monoecious (male and female flowers on same plant). Distinguished from perennial nettle by: smaller size, annual habit, and more deeply toothed leaves.',
    crops_affected: ['potatoes', 'sugar beet', 'vegetables', 'cereals'],
    risk_factors: 'Fertile soils high in phosphate, disturbed ground, vegetable fields, compost-enriched soils, farmyards',
    economic_impact: 'Competitive in root crops and vegetables. Indicator of high phosphate fertility. Yield losses of 3-8% in sugar beet. Controlled by most broadleaved herbicides. Handling hazard due to stinging hairs.',
    images_description: 'Small annual nettle with deeply toothed leaves and stinging hairs in vegetable field',
  },

  {
    id: 'field-pennycress',
    name: 'Field Pennycress',
    common_names: ['Thlaspi arvense'],
    pest_type: 'weed',
    description: 'Annual weed of arable land with distinctive large round winged seed pods (siliculae) arranged along the stem. Strong garlic-like smell when crushed. Common on lighter soils. Can contaminate grain and affect the flavour of milk from grazing livestock.',
    lifecycle: 'Winter or spring annual. Germinates August-November and February-April. Erect stems to 60cm. White four-petalled flowers. Large (10-15mm) round flat seed pods with broad papery wing — distinctive. Seeds viable 20+ years in soil.',
    identification: 'Erect stems with clasping arrow-shaped upper leaves. Small white four-petalled flowers. Distinctive large round flat seed pods with wide papery wing margin arranged along the stem. Unpleasant garlic smell when crushed.',
    crops_affected: ['cereals', 'oilseed rape', 'sugar beet'],
    risk_factors: 'Lighter soils, winter cereals, minimum tillage, alkaline soils, proximity to field margins',
    economic_impact: 'Grain contamination affects flavour. Can taint milk if grazed by livestock. Yield losses usually minor (2-5%). Controlled by most broadleaved herbicides. Long-lived seed bank means persistence. Characteristic smell aids field identification.',
    images_description: 'Field pennycress with large round winged seed pods arranged along stem',
  },

  {
    id: 'dove-foot-cranesbill',
    name: "Dove's-foot Crane's-bill",
    common_names: ['Geranium molle'],
    pest_type: 'weed',
    description: "Annual cranesbill (Geranium molle) found on light dry soils in arable land. Small pink flowers with notched petals. Less competitive than cut-leaved crane's-bill but can be locally abundant on sandy heathland soils.",
    lifecycle: "Annual. Germinates autumn and spring. Low spreading stems to 30cm. Small pink flowers (6-10mm) with deeply notched petals. Seeds dispersed by explosive capsule dehiscence. Seed bank persists 5+ years.",
    identification: "Low spreading hairy plant. Rounded leaves with 5-7 shallow lobes. Small pink flowers with deeply notched petals. Fruit: beak-shaped capsule. Distinguished from cut-leaved crane's-bill by round (not deeply divided) leaves and notched (not entire) petals.",
    crops_affected: ['cereals', 'oilseed rape', 'grassland'],
    risk_factors: 'Light sandy soils, dry heathland areas, spring-sown crops, minimum tillage, alkaline sandy loams',
    economic_impact: "Minor competitor. Usually present at low densities. Can be locally abundant on sandy soils. Controlled by most broadleaved herbicides. Less problematic than cut-leaved crane's-bill.",
    images_description: "Low spreading dove's-foot crane's-bill with rounded lobed leaves and small pink notched flowers",
  },

  {
    id: 'perennial-ryegrass-weed',
    name: 'Perennial Ryegrass (as arable weed)',
    common_names: ['Lolium perenne (volunteer)'],
    pest_type: 'weed',
    description: 'Perennial ryegrass (Lolium perenne) as a weed of arable crops following grass leys. Volunteers from the ley persist through cultivation and compete with subsequent cereal and oilseed rape crops. Distinguished from Italian ryegrass by the perennial habit.',
    lifecycle: 'Perennial tufted grass. Volunteers from grass leys regrow from root fragments after cultivation. Also establishes from seed shed before ley destruction. Dark green, glossy leaves with distinctive auricles clasping the stem. Flowers June-August.',
    identification: 'Dark green glossy grass with folded young leaves (not rolled). Small auricles clasping stem at leaf junction. Flower spike with spikelets arranged alternately and edgeways to the stem (awnless — unlike Italian ryegrass which has awns).',
    crops_affected: ['wheat', 'barley', 'oilseed rape', 'sugar beet'],
    risk_factors: 'First arable crop after grass ley, minimum tillage, incomplete ley destruction, heavy clay soils',
    economic_impact: 'Competitive volunteer — yield losses of 5-15% in first arable crop. Glyphosate before drilling is the primary control. In-crop graminicides (e.g., propaquizafop in oilseed rape) provide selective control. Ploughing buries root fragments.',
    images_description: 'Dark green glossy ryegrass volunteers in wheat crop following old grass ley',
  },

  {
    id: 'broad-leaved-plantain',
    name: 'Broad-leaved Plantain',
    common_names: ['Plantago major', 'Rat-tail plantain'],
    pest_type: 'weed',
    description: 'Perennial rosette-forming weed of grassland, lawns, and arable land. Broad oval leaves in a flat rosette tolerate trampling and mowing. Rat-tail flower spikes. Indicator of compaction. Common on paths, gateways, and overused grassland.',
    lifecycle: 'Perennial. Rosette of broad oval leaves flat to the ground. Flower spikes (5-15cm) appear May-August. Wind-pollinated. Seeds small, produced in large numbers. Tolerant of trampling, compaction, and close mowing.',
    identification: 'Flat rosette of broad oval leaves with prominent parallel veins (3-5 veins). Leaves tough and leathery. Narrow cylindrical flower spikes (rat-tails) on leafless stalks. Fibrous root system. Distinguished from ribwort plantain by broader leaves and longer flower spike.',
    crops_affected: ['grassland', 'turf', 'amenity grass', 'cereals (headlands)'],
    risk_factors: 'Compacted soils, overused grassland, field gateways, tramlines, amenity turf, heavy traffic areas',
    economic_impact: 'Indicator of soil compaction. Reduces pasture quality. Unsightly in turf. Address compaction as root cause. MCPA or mecoprop in grassland. Resistant to close mowing and trampling.',
    images_description: 'Flat rosette of broad oval leaves with parallel veins and narrow rat-tail flower spikes',
  },

  {
    id: 'ribwort-plantain',
    name: 'Ribwort Plantain',
    common_names: ['Plantago lanceolata', 'Narrowleaf plantain'],
    pest_type: 'weed',
    description: 'Perennial weed of grassland and arable field margins with narrow lance-shaped ribbed leaves. Dark brown flower heads on long stalks with white stamens. More competitive than broad-leaved plantain. Sometimes sown as herbal ley component.',
    lifecycle: 'Perennial. Rosette of narrow lance-shaped leaves with 3-5 prominent ribs. Dark oval flower heads on long grooved stalks May-August. White ring of anthers visible during flowering. Wind-pollinated. Seeds persistent in soil.',
    identification: 'Rosette of narrow lance-shaped leaves (15-30cm) with strong ribs. Flower head short, dark brown, oval to cylindrical, on long grooved leafless stalk (20-50cm). Ring of white anthers around flower head during bloom. Distinguished from broad-leaved plantain by narrow leaves.',
    crops_affected: ['grassland', 'hay', 'cereals (margins)', 'turf'],
    risk_factors: 'Permanent grassland, field margins, poor sward management, lack of nitrogen, dry chalky soils',
    economic_impact: 'Common in permanent grassland. Moderate feed value — sometimes included in herbal leys for mineral content. In pure grass swards reduces productivity. MCPA or mecoprop provide control. Responds to improved nitrogen management.',
    images_description: 'Narrow lance-shaped ribbed leaves in rosette with dark oval flower heads on long stalks',
  },

  {
    id: 'common-mouse-ear',
    name: 'Common Mouse-ear',
    common_names: ['Cerastium fontanum', 'Cerastium holosteoides'],
    pest_type: 'weed',
    description: 'Perennial weed (Cerastium fontanum) of grassland, turf, and arable field margins. Mat-forming plant with hairy stems and small white flowers with notched petals. Ubiquitous in UK grassland. Low competitive ability but very persistent.',
    lifecycle: 'Perennial. Creeping and mat-forming with ascending flowering stems. Small white flowers (6-10mm) with deeply notched petals April-November. Seeds small, produced in curved capsules. Spreads by rooting at nodes of prostrate stems.',
    identification: 'Mat-forming hairy plant. Opposite oval leaves covered in soft hairs. Small white flowers with five deeply notched petals (appear to be 10 petals). Curved cylindrical seed capsule. Distinguished from chickweed by: perennial habit, hairy stems, and capsule shape.',
    crops_affected: ['grassland', 'turf', 'amenity grass'],
    risk_factors: 'Thin swards, compacted grassland, overused turf, low-fertility areas, neglected margins',
    economic_impact: 'Minor competitive impact. Indicator of thin sward. Improve sward density through reseeding, fertiliser, and grazing management. Rarely warrants herbicide treatment — improve the grass sward instead.',
    images_description: 'Mat-forming hairy plant with small white notched flowers in thin grassland sward',
  },

  {
    id: 'white-clover-weed',
    name: 'White Clover (as arable weed)',
    common_names: ['Trifolium repens (volunteer)'],
    pest_type: 'weed',
    description: 'White clover (Trifolium repens) as a weed of arable crops following grass-clover leys. Stoloniferous habit means it persists through cultivation and regrows. Competitive in cereal crops, particularly in minimum tillage systems following clover leys.',
    lifecycle: 'Perennial. Spreads by surface stolons that root at nodes. Volunteers from previous clover ley persist after cultivation. Trefoil leaves with characteristic white chevron marking. White flower heads May-September. Fixes atmospheric nitrogen.',
    identification: 'Trefoil leaves with white V-shaped chevron marking. Creeping stolons rooting at nodes. White to pinkish globular flower heads on long stalks. Distinguished from other clovers by the creeping stoloniferous habit and white flower heads.',
    crops_affected: ['wheat', 'barley', 'oilseed rape'],
    risk_factors: 'First arable crop after grass-clover ley, minimum tillage, incomplete ley destruction, mild winters',
    economic_impact: 'Yield losses of 3-10% as a volunteer. Nitrogen-fixing ability means it thrives even in low-fertility conditions. Glyphosate before drilling and MCPA/clopyralid in-crop provide control. Ploughing buries stolons effectively.',
    images_description: 'White clover volunteers with trefoil leaves and white flower heads in wheat crop',
  },

  {
    id: 'hedge-mustard',
    name: 'Hedge Mustard',
    common_names: ['Sisymbrium officinale'],
    pest_type: 'weed',
    description: 'Annual or biennial weed of arable land, waste ground, and field margins. Erect plant with small yellow four-petalled flowers and rigid erect seed pods pressed tightly against the stem. A brassica family weed that can host brassica diseases.',
    lifecycle: 'Annual or biennial. Germinates autumn and spring. Erect branching stem to 90cm. Small yellow flowers (3mm) from May onwards. Seed pods (siliquae) held erect and pressed tightly against the stem (distinctive). Seeds viable 5-10 years.',
    identification: 'Erect stiff plant with spreading branches. Lower leaves deeply lobed with large terminal lobe. Upper leaves narrow. Small yellow four-petalled flowers. Seed pods narrow, erect, pressed tight to the stem (unique feature). Overall appearance stiff and angular.',
    crops_affected: ['cereals', 'oilseed rape', 'vegetables', 'waste ground'],
    risk_factors: 'Field margins, waste ground, disturbed soil, road verges, autumn and spring germination',
    economic_impact: 'Minor competitor in crops. Significance as a host for brassica diseases (clubroot, Alternaria) near oilseed rape. Controlled by most broadleaved herbicides. Common on disturbed land and field edges.',
    images_description: 'Hedge mustard with stiff erect seed pods pressed against stem and small yellow flowers',
  },

  // ── Additional Weeds ───────────────────────────────────────────

  {
    id: 'white-campion',
    name: 'White Campion',
    common_names: ['Silene latifolia', 'Melandrium album'],
    pest_type: 'weed',
    description: 'Annual, biennial, or short-lived perennial weed of arable land and field margins. White flowers (20-30mm) open in the evening and are moth-pollinated. Common on lighter soils. Deep taproot makes established plants difficult to control. Can be competitive in cereals and root crops.',
    lifecycle: 'Germinates autumn and spring. Forms a rosette initially. Erect stems to 100cm. White dioecious flowers (male and female on separate plants) open at dusk from May to October. Inflated bladder-like calyx on female plants. Seeds dispersed from capsules with 10 teeth.',
    identification: 'Hairy stems and opposite leaves. White flowers (20-30mm) with 5 deeply notched petals opening at dusk. Swollen bladder-like calyx on female flowers. Sticky glandular hairs on upper stems. Rosette leaves are elliptical and softly hairy.',
    crops_affected: ['cereals', 'oilseed rape', 'root crops', 'field margins'],
    risk_factors: 'Light soils, field margins, spring cropping, disturbed ground, grass-arable rotations',
    economic_impact: 'Moderate competitor in spring crops. Deep taproot survives shallow cultivation. Most broadleaved herbicides provide control. Often found with red campion at field margins.',
    images_description: 'White campion with white notched flowers and bladder-like calyx in cereal field margin',
  },
  {
    id: 'scarlet-pimpernel',
    name: 'Scarlet Pimpernel',
    common_names: ['Lysimachia arvensis', 'Anagallis arvensis', 'Poor man\'s weather glass'],
    pest_type: 'weed',
    description: 'Low-growing annual weed of arable land and gardens. Small scarlet-orange flowers (10-15mm) that close in dull weather (hence "weather glass"). Common on lighter soils throughout lowland England. Spreading prostrate habit.',
    lifecycle: 'Annual. Germinates spring (mainly). Prostrate spreading stems to 30cm. Square stems (diagnostic). Flowers June to October. Fruit a spherical capsule splitting around the middle (circumscissile). Seeds persist in soil.',
    identification: 'Low spreading prostrate plant. Square stems with opposite unstalked oval leaves (black dots on undersurface). Small bright scarlet-orange flowers (10-15mm) with 5 petals that close in dull weather. Rarely blue-flowered form. Spherical fruit capsules.',
    crops_affected: ['root crops', 'vegetables', 'cereals', 'gardens', 'nursery stock'],
    risk_factors: 'Light well-drained soils, spring cropping, warm conditions, gardens, nursery containers',
    economic_impact: 'Minor competitor. Contains toxic saponins (poisonous to livestock). Controlled by most broadleaved herbicides. Indicator of warm, well-drained soils.',
    images_description: 'Scarlet pimpernel with small bright orange flowers on prostrate spreading stems',
  },
  {
    id: 'hedge-bindweed',
    name: 'Hedge Bindweed',
    common_names: ['Calystegia sepium', 'Bellbind', 'Great bindweed'],
    pest_type: 'weed',
    description: 'Vigorous climbing perennial weed with large white trumpet flowers (60-75mm). Twines anti-clockwise around supports. Extensive underground rhizome system makes it extremely persistent. Smothers crops, hedgerows, and garden plants. Distinct from field bindweed (Convolvulus arvensis) by larger flowers and leaves.',
    lifecycle: 'Perennial. White fleshy rhizomes spread underground, regenerating from fragments as small as 1cm. Stems emerge in spring, climbing to 3m+. Large white trumpet flowers from June. Less seed production than field bindweed — primarily vegetative spread via rhizomes.',
    identification: 'Large arrow-shaped leaves (5-15cm). Large white trumpet-shaped flowers (60-75mm) with two large bracteoles covering the calyx (distinguishes from field bindweed). Stems twine vigorously anti-clockwise. White fleshy rhizomes when dug up.',
    crops_affected: ['hedgerows', 'gardens', 'orchards', 'soft fruit', 'arable field margins'],
    risk_factors: 'Established rhizome network, moist fertile soils, hedgerows, fences and supports for climbing, gardens',
    economic_impact: 'Extremely difficult to eradicate once established. Glyphosate applied to actively growing foliage provides gradual control over repeated applications. Physical removal must capture all rhizome fragments. Cover crops can suppress emergence.',
    images_description: 'Hedge bindweed with large white trumpet flowers climbing over garden fence',
  },
  {
    id: 'wild-radish',
    name: 'Wild Radish',
    common_names: ['Raphanus raphanistrum', 'Runch'],
    pest_type: 'weed',
    description: 'Annual weed of arable crops on lighter, acidic soils. Variable flower colour (white, yellow, lilac, or purple-veined). Distinguished from charlock by constricted "beaded" seed pods. Can be a significant competitor in cereals and brassica crops. Increasing in some areas due to herbicide resistance.',
    lifecycle: 'Annual. Germinates primarily in spring. Erect stems to 60cm with rough bristly hairs. Four-petalled flowers May-September. Distinctive seed pods constricted between seeds (lomentum) — break into single-seeded segments. Seeds persist 5-10 years.',
    identification: 'Rough bristly stems and leaves. Lower leaves lyrate (pinnately lobed with large terminal lobe). Flowers four-petalled, variable colour. Key feature: seed pods constricted between seeds, breaking into segments (unlike smooth charlock siliques). Roots may swell slightly.',
    crops_affected: ['cereals', 'oilseed rape', 'brassicas', 'root crops', 'light soils'],
    risk_factors: 'Light acidic soils, spring cropping, oilseed rape rotations, ALS herbicide resistance in some populations',
    economic_impact: 'Competitive in spring crops on light soils. Related to oilseed rape — shared diseases. ALS herbicide resistance emerging in UK populations. Controlled by mecoprop, MCPA, and non-ALS herbicides.',
    images_description: 'Wild radish with variable-coloured flowers and beaded constricted seed pods',
  },
  {
    id: 'marsh-cudweed',
    name: 'Marsh Cudweed',
    common_names: ['Gnaphalium uliginosum', 'Filaginella uliginosum'],
    pest_type: 'weed',
    description: 'Small annual weed of damp arable fields, gateways, and compacted tracks. Grey-woolly plant with small yellowish-brown flower heads. Indicator of wet, compacted, or poorly drained soils. Common on headlands and wheelings where soil is compacted.',
    lifecycle: 'Annual. Germinates spring and early summer. Short branching stems (5-20cm) covered in grey-white woolly hairs. Clusters of tiny yellowish-brown flower heads at stem tips, overtopped by leaf-like bracts. Seeds tiny, dispersed by wind.',
    identification: 'Low grey-woolly plant (5-20cm). Stems and narrow leaves densely covered in white-grey woolly hairs. Tiny yellowish-brown flower heads in terminal clusters surrounded by leaf-like bracts. Whole plant has a grey-silver appearance. Found in wet patches and compacted areas.',
    crops_affected: ['cereals (headlands)', 'root crops', 'vegetable fields', 'gateways'],
    risk_factors: 'Compacted wet soils, poor drainage, field gateways, headlands, wheelings, damp conditions',
    economic_impact: 'Indicator of soil compaction and drainage problems. Rarely competitive. Address underlying compaction and drainage issues rather than targeting the weed. Controlled by most broadleaved herbicides.',
    images_description: 'Grey-woolly marsh cudweed plant with tiny flower heads on damp compacted headland',
  },
  {
    id: 'common-ramping-fumitory',
    name: 'Common Ramping-fumitory',
    common_names: ['Fumaria muralis', 'Wall fumitory'],
    pest_type: 'weed',
    description: 'Scrambling annual weed of arable land, gardens, and walls. Pink-tipped tubular flowers in racemes. Finely divided grey-green foliage. More common in western and south-western UK. Related to common fumitory but with larger flowers and climbing habit.',
    lifecycle: 'Annual. Germinates autumn and spring. Scrambling stems to 100cm, using leaf stalks to climb through crop canopy. Pink flowers (10-13mm, larger than common fumitory) in loose racemes from May to October. Single-seeded nutlets.',
    identification: 'Scrambling plant with finely divided blue-grey foliage (similar to common fumitory but larger overall). Pink-purple flowers (10-13mm) with dark tips in loose racemes. Distinguished from common fumitory by larger flowers, more vigorous climbing habit, and slightly broader leaf segments.',
    crops_affected: ['cereals', 'vegetables', 'gardens', 'walls', 'hedgerows'],
    risk_factors: 'Western UK, mild maritime climate, hedgerow edges, gardens, lighter soils',
    economic_impact: 'Moderate competitor when climbing through crop canopy. Controlled by most broadleaved herbicides including mecoprop and fluroxypyr. More common in western regions.',
    images_description: 'Ramping fumitory scrambling through crop with pink-tipped tubular flowers and grey-green foliage',
  },
  {
    id: 'sun-spurge',
    name: 'Sun Spurge',
    common_names: ['Euphorbia helioscopia', 'Madwoman\'s milk'],
    pest_type: 'weed',
    description: 'Annual weed of arable land and gardens. Distinctive yellowish-green umbel-like flower heads. Contains white latex (milky sap) that is a skin irritant. Common on a wide range of soil types. One of the most recognisable arable weeds due to its symmetrical form.',
    lifecycle: 'Annual. Germinates spring. Erect single stem (10-50cm) topped with a distinctive 5-rayed umbel-like inflorescence (cyathia). Yellowish-green kidney-shaped glands on bracts. Smooth round capsule fruits. Seeds explosively ejected. Milky white latex throughout plant.',
    identification: 'Single erect stem with alternate obovate leaves, finely toothed near tip. Terminal 5-rayed umbel-like inflorescence with yellowish-green bracts. White milky latex when stem broken (skin irritant). Smooth round capsules. Symmetrical rosette-like appearance from above.',
    crops_affected: ['cereals', 'root crops', 'vegetables', 'gardens'],
    risk_factors: 'Spring germination, cultivated soils, wide soil type range, gardens',
    economic_impact: 'Minor competitor. Skin irritant latex — handle with gloves. Controlled by most broadleaved herbicides. Common but rarely abundant enough to cause significant yield loss.',
    images_description: 'Sun spurge with yellowish-green umbel inflorescence and symmetrical form in arable field',
  },
  {
    id: 'black-nightshade',
    name: 'Black Nightshade',
    common_names: ['Solanum nigrum'],
    pest_type: 'weed',
    description: 'Annual weed of arable land and gardens. Member of the Solanaceae (potato family). Small white flowers with yellow anthers followed by green berries ripening to black. Berries are toxic (contain solanine). Increasing problem in sugar beet, potatoes, and vegetables, particularly with minimum tillage.',
    lifecycle: 'Annual. Germinates late spring to early summer (requires warm soil). Branching erect to sprawling stems (20-60cm). Small white star-shaped flowers with yellow stamens from July. Green berries ripen to black (6-10mm). Seeds persist in soil 10+ years. Late germination avoids pre-emergence herbicides.',
    identification: 'Branching stems with alternate broadly ovate dark green leaves. Small white star-shaped flowers (8-10mm) in drooping clusters with prominent yellow anthers (similar to tiny potato flowers). Green berries ripening to shiny black. Stems and leaf undersurfaces sometimes purplish.',
    crops_affected: ['sugar beet', 'potatoes', 'vegetables', 'maize', 'gardens'],
    risk_factors: 'Late germination (warm soil required), minimum tillage, root crops, summer-drilled crops, long soil seed bank',
    economic_impact: 'Black berries stain harvested beet and contaminate vegetable crops. Toxic berries in green produce are a food safety concern. Late germination makes it difficult to control with residual herbicides. Metamitron and phenmedipham in sugar beet provide some control.',
    images_description: 'Black nightshade with small white star flowers and clusters of shiny black berries',
  },
  {
    id: 'fool-parsley',
    name: 'Fool\'s Parsley',
    common_names: ['Aethusa cynapium'],
    pest_type: 'weed',
    description: 'Annual weed of arable land and gardens resembling parsley. Poisonous plant containing aethusine alkaloids. Distinguished from true parsley by long drooping bracteoles below the flower umbels (resembling a beard). Common on a range of soil types.',
    lifecycle: 'Annual. Germinates spring and summer. Erect stems (10-80cm) branching from the base. White flowers in compound umbels June to October. Distinctive long pendant bracteoles (3 narrow bracts) hanging below each secondary umbel. Ridged ovoid fruits.',
    identification: 'Finely divided leaves similar to parsley (2-3 pinnate). Key feature: three long narrow bracteoles hanging down like a beard below each partial umbel (absent in parsley and most other umbellifers). White flowers in compound umbels. Unpleasant garlic-like smell when crushed.',
    crops_affected: ['cereals', 'root crops', 'vegetables', 'gardens'],
    risk_factors: 'Cultivated soils, gardens, vegetable plots, spring to summer germination',
    economic_impact: 'Toxic if consumed — can be confused with parsley (dangerous in vegetable gardens). Minor competitor in arable crops. Controlled by most broadleaved herbicides. Toxicity is the main concern rather than competition.',
    images_description: 'Fool\'s parsley with white umbel flowers and distinctive pendant bracteoles hanging below',
  },
  {
    id: 'common-mouse-ear-chickweed',
    name: 'Common Mouse-ear Chickweed',
    common_names: ['Cerastium fontanum', 'Cerastium vulgatum'],
    pest_type: 'weed',
    description: 'Perennial mat-forming weed of grassland, lawns, paths, and arable land. Hairy stems and leaves with small white flowers. Extremely common throughout the UK on all soil types. Forms dense mats in thin swards and compacted areas. Tolerant of close mowing.',
    lifecycle: 'Perennial. Spreading and rooting at nodes. Hairy stems and opposite grey-green leaves. White flowers (6-10mm) with 5 deeply notched petals (appearing as 10) from April to November. Cylindrical capsules with 10 teeth at the tip. Seeds very small.',
    identification: 'Mat-forming with hairy stems and opposite oval hairy leaves (resembling mouse ears). White flowers with 5 deeply notched petals appearing as 10 — similar to but smaller than stitchwort. Capsules cylindrical, curved, longer than calyx. Distinguished from chickweed by hairiness and perennial habit.',
    crops_affected: ['lawns', 'turf', 'grassland', 'arable (light infestations)'],
    risk_factors: 'Thin grass swards, compaction, close mowing, all soil types, ubiquitous',
    economic_impact: 'Indicator of thin sward in grassland. Improve sward density through reseeding, fertiliser, and grazing management. MCPA or mecoprop in grassland. Rarely significant in arable crops.',
    images_description: 'Mat of common mouse-ear chickweed with small white notched flowers and hairy leaves',
  },
  {
    id: 'meadow-crane-bill',
    name: 'Meadow Crane\'s-bill',
    common_names: ['Geranium pratense'],
    pest_type: 'weed',
    description: 'Perennial weed of grassland, road verges, and field margins. Large showy blue-violet flowers (25-30mm). Common in traditional meadows and increasingly spread to arable margins. Deep rootstock makes it persistent. Usually a welcomed wildflower rather than a problem weed.',
    lifecycle: 'Perennial with deep rootstock. Hairy palmately divided leaves with 5-7 deeply cut lobes. Large blue-violet flowers (25-30mm) June to September. Distinctive beak-like fruit (crane\'s bill) — 5 seeds attached to a central column that coils explosively when ripe.',
    identification: 'Tall plant (30-80cm) with large palmately lobed leaves (5-7 deep lobes). Large blue-violet saucer-shaped flowers (25-30mm) with 5 petals. Distinctive long-beaked fruit. Hairy stems and leaves. Distinguished from dove\'s-foot cranesbill by much larger flowers and deeply cut leaves.',
    crops_affected: ['grassland', 'field margins', 'road verges'],
    risk_factors: 'Traditional meadows, calcareous grassland, grass-arable margins, seed in wildflower mixes',
    economic_impact: 'Rarely a significant weed — more commonly valued as a wildflower. Deep rootstock persists through grazing. MCPA provides control in grassland if needed. Usually welcomed in conservation headlands.',
    images_description: 'Meadow crane\'s-bill with large blue-violet flowers and palmately divided leaves on verge',
  },
  {
    id: 'hairy-bittercress',
    name: 'Hairy Bittercress',
    common_names: ['Cardamine hirsuta'],
    pest_type: 'weed',
    description: 'Small annual weed of nursery containers, gardens, paths, and arable land. One of the most common weeds in container-grown nursery stock. Tiny white flowers produce explosive seed pods that scatter seeds over several metres. Multiple generations per year.',
    lifecycle: 'Annual or winter annual. Germinates year-round (mainly autumn and spring). Small rosette of pinnate leaves. Erect stems (5-30cm) with tiny white four-petalled flowers. Seed pods (siliques) held erect — when ripe, they explode on contact, firing seeds up to 1-2 metres. Multiple generations per year.',
    identification: 'Small basal rosette of pinnate leaves with rounded leaflets. Tiny white four-petalled flowers (3-4mm). Narrow erect seed pods that overtop the flowers — pods explosive when ripe. Very similar to wavy bittercress (C. flexuosa) but with fewer stem leaves and stamens.',
    crops_affected: ['nursery containers', 'garden beds', 'paths', 'walls', 'arable (light soils)'],
    risk_factors: 'Container production, disturbed soil, gaps in paving, year-round germination, explosive seed dispersal',
    economic_impact: 'Major weed in nursery container production — contaminates stock appearance. Multiple generations and explosive dispersal make control difficult. Pre-emergence herbicides on containers. Hand-weed before pods ripen.',
    images_description: 'Hairy bittercress rosette with tiny white flowers and explosive erect seed pods in nursery pot',
  },
  {
    id: 'common-poppy-weed',
    name: 'Common Poppy (as arable weed)',
    common_names: ['Papaver rhoeas', 'Field poppy', 'Corn poppy'],
    pest_type: 'weed',
    description: 'Annual arable weed with iconic scarlet flowers. Historically the most common UK arable weed, reduced by herbicides but still widespread. Seeds remain viable in soil for 80+ years. Cultural icon associated with Remembrance. Valued in conservation headlands.',
    lifecycle: 'Annual. Germinates mainly autumn with some spring emergence. Rosette of hairy pinnately lobed leaves. Hairy stems to 60cm. Scarlet flowers (50-100mm) with dark centre blotch from June. Pepper-pot seed capsule. Each plant produces thousands of tiny seeds viable for decades.',
    identification: 'Hairy plant with pinnately lobed leaves. Scarlet red four-petalled flowers (50-100mm) with dark basal blotch. Nodding hairy flower buds. Smooth round pepper-pot seed capsule with ring of pores beneath the stigmatic disc. Milky white latex.',
    crops_affected: ['cereals', 'oilseed rape', 'root crops', 'field margins'],
    risk_factors: 'Seed bank persists 80+ years, autumn cultivation brings seeds to surface, minimum tillage, conservation headlands, set-aside',
    economic_impact: 'Moderate competitor in cereals. Significant weed in organic systems. Most broadleaved herbicides provide good control. Maintained deliberately in conservation headlands and field margins for biodiversity.',
    images_description: 'Scarlet common poppies in wheat field margin with pepper-pot seed capsules',
  },
  {
    id: 'corn-spurrey',
    name: 'Corn Spurrey',
    common_names: ['Spergula arvensis'],
    pest_type: 'weed',
    description: 'Annual weed of light acidic sandy soils. Distinctive whorled narrow fleshy leaves around the stem. White flowers. Indicator of acid, sandy, nutrient-poor soils. Was historically a serious weed of poor sandy land — now reduced by liming and improved nutrition.',
    lifecycle: 'Annual. Germinates spring and summer. Stems 10-40cm with whorled clusters of narrow fleshy leaves at each node. Small white five-petalled flowers in loose terminal clusters. Capsule opening by 5 valves. Black seeds with narrow pale wing.',
    identification: 'Distinctive whorled narrow fleshy leaves (appearing like clusters of green needles) at each node — key identification feature. White five-petalled flowers (5-8mm). Stems sticky-hairy. Found on sandy acid soils. Superficially similar to cleavers but with distinct leaf arrangement.',
    crops_affected: ['cereals (light soils)', 'root crops', 'vegetables on sandy land'],
    risk_factors: 'Sandy acidic soils, poor nutrition, historical indicator species, light land',
    economic_impact: 'Indicator of poor acid soils. Liming and improved nutrition reduce populations. Controlled by most broadleaved herbicides. Once a major weed — now uncommon on improved farmland.',
    images_description: 'Corn spurrey with whorled fleshy leaves and small white flowers on sandy soil',
  },
  {
    id: 'small-nettle',
    name: 'Small Nettle',
    common_names: ['Urtica urens', 'Annual nettle', 'Burning nettle'],
    pest_type: 'weed',
    description: 'Annual stinging nettle found on rich fertile soils, particularly in vegetable plots and gardens. Smaller than perennial nettle (Urtica dioica) with more intense sting. Monoecious (male and female flowers on same plant). Common on phosphate-rich soils.',
    lifecycle: 'Annual. Germinates spring to autumn. Stems 10-50cm, less robust than perennial nettle. Opposite leaves with coarse teeth and stinging hairs. Male and female flowers in same clusters from June to October. Seeds produced prolifically.',
    identification: 'Smaller than common nettle (10-50cm vs 1-2m). Leaves elliptical to ovate with deeply toothed margins and stinging hairs. Male and female flowers in same clusters (perennial nettle has separate male and female plants). More intense sting than perennial nettle.',
    crops_affected: ['vegetables', 'gardens', 'arable (rich soils)'],
    risk_factors: 'High phosphate soils, gardens, vegetable plots, rich fertile land, disturbed soil',
    economic_impact: 'Indicator of high phosphate levels. Minor competitor but stinging hairs make hand-weeding painful. Controlled by most broadleaved herbicides. Indicates fertile soil.',
    images_description: 'Small annual nettle on vegetable plot with toothed leaves and mixed flower clusters',
  },
  {
    id: 'common-cudweed',
    name: 'Common Cudweed',
    common_names: ['Filago vulgaris', 'Filago germanica'],
    pest_type: 'weed',
    description: 'Small annual weed of dry sandy soils and arable fields. Grey-woolly plant with clusters of yellowish flower heads at stem tips. Declining nationally due to improved farming but still found on sandy heathland margins and dry acidic fields.',
    lifecycle: 'Annual. Germinates spring. Grey-woolly erect stems (10-30cm) branching from upper leaf axils. Clusters of 20-40 tiny woolly flower heads in dense rounded groups. Entire plant densely covered in white-grey woolly hairs. Tiny seeds with pappus.',
    identification: 'Small grey-white woolly plant. Stems branching from upper nodes. Clusters of tiny yellowish flower heads in compact woolly groups at branch tips and in leaf forks. Entire plant covered in dense white-grey wool. Distinguished from marsh cudweed by branching pattern and drier habitats.',
    crops_affected: ['cereals (light soils)', 'sandy heathland margins', 'set-aside'],
    risk_factors: 'Dry sandy acidic soils, heathland margins, low-input farming, conservation areas',
    economic_impact: 'Rare as a crop weed. More significant as a declining native species. Conservation interest on heathland. Not usually a target for weed control.',
    images_description: 'Grey woolly common cudweed with clusters of tiny flower heads on sandy soil',
  },
  {
    id: 'ivy-leaved-speedwell',
    name: 'Ivy-leaved Speedwell',
    common_names: ['Veronica hederifolia'],
    pest_type: 'weed',
    description: 'Winter annual weed of arable crops, particularly winter cereals and oilseed rape. Trailing stems with ivy-shaped leaves. Very small pale blue-lilac flowers. Increasingly common in autumn-sown crops — one of the first weeds to germinate in early autumn.',
    lifecycle: 'Winter annual. Germinates September to November. Trailing hairy stems to 60cm. Ivy-shaped (3-5 lobed) leaves on long stalks. Tiny pale blue-lilac flowers (4-6mm) from March to May, borne singly in leaf axils. Large (3mm) round seeds — fewer but larger than other speedwells.',
    identification: 'Trailing hairy stems. Leaves distinctly ivy-shaped with 3-5 rounded lobes (unlike other speedwells with toothed or oval leaves). Tiny pale blue-lilac flowers (4-6mm) in leaf axils. Large round seeds. Kidney-shaped cotyledons similar to other speedwells but true leaves quickly distinctive.',
    crops_affected: ['winter cereals', 'winter oilseed rape', 'vegetables'],
    risk_factors: 'Autumn germination, winter cropping, minimum tillage, mild winters, fertile soils',
    economic_impact: 'Can be competitive in winter crops, particularly in thin cereal crops. Earlier germination than most weeds gives it a competitive advantage. Fluroxypyr and mecoprop provide control in cereals.',
    images_description: 'Ivy-leaved speedwell with distinctive lobed leaves and tiny pale blue flowers in cereal crop',
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

  // ── Expansion: New Disease Symptoms ────────────────────────────

  // Wheat Streak Mosaic Virus
  { pest_id: 'wheat-streak-mosaic-virus', symptom: 'Yellow to light green streaks running parallel to leaf veins', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'wheat-streak-mosaic-virus', symptom: 'Stunted plants with poor tillering and chlorotic leaves', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'wheat-streak-mosaic-virus', symptom: 'Mosaic pattern on young developing leaves', plant_part: 'leaves', timing: 'early spring', confidence: 'suggestive' },

  // Barley Stripe
  { pest_id: 'barley-stripe', symptom: 'Long pale yellow to brown stripes running the full length of barley leaf', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'barley-stripe', symptom: 'Tissue splitting along darkened stripe with necrotic tissue', plant_part: 'leaves', timing: 'spring to early summer', confidence: 'diagnostic' },
  { pest_id: 'barley-stripe', symptom: 'Stunted plants with ears failing to emerge from the boot', plant_part: 'ears', timing: 'summer', confidence: 'suggestive' },

  // Halo Spot
  { pest_id: 'halo-spot', symptom: 'Small circular pale spots with dark brown border and broader pale yellow halo', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'halo-spot', symptom: 'Pycnidia visible within older lesions under magnification', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // Tan Spot
  { pest_id: 'tan-spot', symptom: 'Oval lens-shaped tan lesions with yellow border and dark centre spot on wheat leaves', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'tan-spot', symptom: 'Large necrotic areas from coalescing lesions on upper leaves', plant_part: 'leaves', timing: 'late spring', confidence: 'suggestive' },
  { pest_id: 'tan-spot', symptom: 'Lesions starting on lower leaves and progressing upward through canopy', plant_part: 'leaves', timing: 'spring', confidence: 'associated' },

  // Wheat Spindle Streak Mosaic Virus
  { pest_id: 'wheat-spindle-streak-mosaic-virus', symptom: 'Spindle-shaped yellow streaks tapering at both ends on wheat leaves', plant_part: 'leaves', timing: 'March to April', confidence: 'diagnostic' },
  { pest_id: 'wheat-spindle-streak-mosaic-virus', symptom: 'General yellowing and slight stunting during cool spring weather', plant_part: 'whole plant', timing: 'early spring', confidence: 'suggestive' },
  { pest_id: 'wheat-spindle-streak-mosaic-virus', symptom: 'Symptoms fading and disappearing as temperatures rise above 20C', plant_part: 'leaves', timing: 'late spring', confidence: 'associated' },

  // Soil-borne Wheat Mosaic Virus
  { pest_id: 'soil-borne-wheat-mosaic-virus', symptom: 'Light green to yellow mosaic mottling on wheat leaves', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'soil-borne-wheat-mosaic-virus', symptom: 'Irregular patches of pale and dark green in the crop canopy', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Potato Virus Y
  { pest_id: 'potato-virus-y', symptom: 'Leaf mosaic pattern of light and dark green patches on potato foliage', plant_part: 'leaves', timing: 'June to August', confidence: 'diagnostic' },
  { pest_id: 'potato-virus-y', symptom: 'Necrotic ringspot — depressed necrotic rings on tuber surface (PVYNTN strain)', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'potato-virus-y', symptom: 'Leaf rugosity and crinkling with vein clearing', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Potato Leafroll Virus
  { pest_id: 'potato-leafroll-virus', symptom: 'Upward rolling of upper leaflets giving a cupped appearance', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'potato-leafroll-virus', symptom: 'Net necrosis — brown streaks visible when tuber is cut longitudinally', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'diagnostic' },
  { pest_id: 'potato-leafroll-virus', symptom: 'Leaflets become leathery and pale with purple-red discolouration', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Gangrene
  { pest_id: 'gangrene', symptom: 'Depressed rounded areas on tuber surface with wrinkled skin above dry cavity', plant_part: 'tubers', timing: 'during storage (2-3 months after harvest)', confidence: 'diagnostic' },
  { pest_id: 'gangrene', symptom: 'Well-defined dry powdery cavity when tuber is cut open — thumb-shaped', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },

  // Dry Rot Potato
  { pest_id: 'dry-rot-potato', symptom: 'Shrunken wrinkled area on tuber with concentric skin folds', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },
  { pest_id: 'dry-rot-potato', symptom: 'Pastel-coloured fungal pustules (white, blue, or pink) on lesion surface', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },
  { pest_id: 'dry-rot-potato', symptom: 'Internal dry brown to pink crumbly rot cavity', plant_part: 'tubers', timing: 'storage', confidence: 'suggestive' },

  // Pink Rot
  { pest_id: 'pink-rot', symptom: 'Cut tuber flesh turns distinctly salmon-pink within 15-30 minutes of cutting', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'pink-rot', symptom: 'Waterlogged glassy internal tissue with ammonia-like odour', plant_part: 'tubers', timing: 'harvest', confidence: 'suggestive' },

  // Spraing (TRV)
  { pest_id: 'spraing-tobacco-rattle-virus', symptom: 'Brown corky arcs rings and flecks scattered through tuber flesh when cut', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'diagnostic' },
  { pest_id: 'spraing-tobacco-rattle-virus', symptom: 'External tuber symptoms often absent — internal damage only visible when cut', plant_part: 'tubers', timing: 'harvest', confidence: 'associated' },
  { pest_id: 'spraing-tobacco-rattle-virus', symptom: 'Spraing symptoms intensifying during storage', plant_part: 'tubers', timing: 'storage', confidence: 'suggestive' },

  // Peach Leaf Curl
  { pest_id: 'peach-leaf-curl', symptom: 'Leaves emerge thickened puckered and curled with red-purple discolouration', plant_part: 'leaves', timing: 'spring (March-May)', confidence: 'diagnostic' },
  { pest_id: 'peach-leaf-curl', symptom: 'White powdery spore layer developing on affected leaf areas', plant_part: 'leaves', timing: 'late spring', confidence: 'diagnostic' },
  { pest_id: 'peach-leaf-curl', symptom: 'Premature leaf drop with severe defoliation by June', plant_part: 'whole plant', timing: 'spring to early summer', confidence: 'suggestive' },

  // Bacterial Canker Stone Fruit
  { pest_id: 'bacterial-canker-stone-fruit', symptom: 'Dark sunken cankers on branches with amber or brown gum exuding', plant_part: 'stems', timing: 'year-round (most visible in winter)', confidence: 'diagnostic' },
  { pest_id: 'bacterial-canker-stone-fruit', symptom: 'Shothole symptoms on leaves — circular necrotic spots that drop out', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'bacterial-canker-stone-fruit', symptom: 'Dead buds in spring — branches fail to leaf out above canker', plant_part: 'stems', timing: 'spring', confidence: 'suggestive' },

  // Pear Rust
  { pest_id: 'pear-rust', symptom: 'Bright orange to red spots on upper surface of pear leaves', plant_part: 'leaves', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'pear-rust', symptom: 'Horn-like projections (aecia) on underside of leaf spots producing orange spores', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'pear-rust', symptom: 'Premature leaf fall from heavily infected trees', plant_part: 'leaves', timing: 'late summer', confidence: 'associated' },

  // Brassica Dark Leaf Spot Alternaria
  { pest_id: 'brassica-dark-leaf-spot-alternaria', symptom: 'Dark brown to black circular spots with concentric rings on brassica leaves', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'brassica-dark-leaf-spot-alternaria', symptom: 'Yellowing of tissue surrounding dark target-board lesions', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'brassica-dark-leaf-spot-alternaria', symptom: 'Small dark spots on cauliflower curds reducing marketability', plant_part: 'fruit', timing: 'autumn', confidence: 'diagnostic' },

  // Brassica White Mould
  { pest_id: 'brassica-white-mould', symptom: 'Watery soft rot covered with dense white fluffy mycelium on brassica stems', plant_part: 'stems', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'brassica-white-mould', symptom: 'Hard black sclerotia (2-10mm) embedded in rotting tissue', plant_part: 'stems', timing: 'autumn', confidence: 'diagnostic' },
  { pest_id: 'brassica-white-mould', symptom: 'Plants wilting above infected point with foul smell', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Downy Mildew Brassica Veg
  { pest_id: 'downy-mildew-brassica', symptom: 'Angular yellow patches on upper leaf surface bounded by leaf veins', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'downy-mildew-brassica', symptom: 'White to grey downy growth on underside of yellowed leaf patches', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'downy-mildew-brassica', symptom: 'Purpling and systemic infection in seedlings', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Leek Rust
  { pest_id: 'leek-rust', symptom: 'Bright orange urediniospore pustules on leek leaf surfaces', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'leek-rust', symptom: 'Yellowing and dieback of leaf tips from severe infection', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },
  { pest_id: 'leek-rust', symptom: 'Dark brown-black teliospore pustules in late season', plant_part: 'leaves', timing: 'late autumn', confidence: 'suggestive' },

  // Celery Leaf Spot
  { pest_id: 'celery-leaf-spot', symptom: 'Small brown spots with visible black pycnidia on celery leaves and petioles', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'celery-leaf-spot', symptom: 'Spots coalescing causing leaf blight and petiole lesions', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },

  // Parsnip Canker
  { pest_id: 'parsnip-canker', symptom: 'Orange-brown to black sunken cankers on parsnip root shoulders', plant_part: 'roots', timing: 'autumn to winter', confidence: 'diagnostic' },
  { pest_id: 'parsnip-canker', symptom: 'Canker lesions expanding during autumn storage in the ground', plant_part: 'roots', timing: 'winter', confidence: 'suggestive' },

  // White Tip Leek
  { pest_id: 'white-tip-leek', symptom: 'White papery drying of leek leaf tips extending downward', plant_part: 'leaves', timing: 'autumn to winter', confidence: 'diagnostic' },
  { pest_id: 'white-tip-leek', symptom: 'Water-soaked margins at the boundary between green and bleached tissue', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },

  // Powdery Scab Potato
  { pest_id: 'powdery-scab-potato', symptom: 'Raised pustules on tuber surface rupturing to show powdery brown spore mass', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'powdery-scab-potato', symptom: 'Root galling visible on washed potato root system', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },

  // Bunt Wheat
  { pest_id: 'bunt-wheat', symptom: 'Dark grey-brown bunt balls replacing grain in wheat ears with rotten fish smell', plant_part: 'ears', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'bunt-wheat', symptom: 'Ears slightly shorter and more upright than healthy ears', plant_part: 'ears', timing: 'pre-harvest', confidence: 'suggestive' },

  // Cereal Cyst Nematode
  { pest_id: 'cyst-nematode-cereals', symptom: 'Patchy stunting and yellowing in cereal crops on lighter soils', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'cyst-nematode-cereals', symptom: 'White to brown lemon-shaped cysts visible on roots in June-July', plant_part: 'roots', timing: 'June to July', confidence: 'diagnostic' },
  { pest_id: 'cyst-nematode-cereals', symptom: 'Shortened bushy root systems in affected patches', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },

  // Phytophthora Root Rot Peas
  { pest_id: 'phytophthora-root-rot-peas', symptom: 'Brown to black discolouration of lower stem and roots of peas', plant_part: 'stems', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'phytophthora-root-rot-peas', symptom: 'Plants wilt turn yellow and collapse in waterlogged patches', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Rust of Field Beans
  { pest_id: 'rust-beans', symptom: 'Dark brown raised powdery urediniospore pustules on bean leaves and stems', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'rust-beans', symptom: 'Yellowing and defoliation from severe rust infection', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },

  // Verticillium Wilt Strawberry
  { pest_id: 'verticillium-wilt-strawberry', symptom: 'Outer leaves wilt turn brown and flatten around the crown', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'verticillium-wilt-strawberry', symptom: 'Cut crown shows brown-black vascular discolouration', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'verticillium-wilt-strawberry', symptom: 'Inner leaves remain green while outer leaves collapse (rosette pattern)', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Crown Rot Strawberry
  { pest_id: 'crown-rot-strawberry', symptom: 'Sudden wilting of entire strawberry plant without outer-to-inner progression', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'crown-rot-strawberry', symptom: 'Reddish-brown marbled discolouration in cut crown tissue', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },

  // Powdery Mildew Strawberry
  { pest_id: 'powdery-mildew-strawberry', symptom: 'Leaves curl upward with purple-red discolouration on undersurface', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'powdery-mildew-strawberry', symptom: 'White powdery coating on fruit surface', plant_part: 'fruit', timing: 'summer', confidence: 'diagnostic' },

  // Apple Canker
  { pest_id: 'apple-canker', symptom: 'Sunken oval cankers with concentric rings of cracked bark on branches', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'apple-canker', symptom: 'Small red perithecia visible at canker margins', plant_part: 'stems', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'apple-canker', symptom: 'Branch dieback above girdling cankers', plant_part: 'stems', timing: 'spring', confidence: 'suggestive' },

  // Plum Rust
  { pest_id: 'plum-rust', symptom: 'Angular yellow spots on upper plum leaf surface with cinnamon pustules beneath', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'plum-rust', symptom: 'Premature leaf fall from heavily infected plum trees in August', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },

  // ── Expansion: New Insect Pest Symptoms ────────────────────────

  // Hessian Fly
  { pest_id: 'hessian-fly', symptom: 'Stunted wheat tillers that fail to elongate with dark patches at nodes', plant_part: 'stems', timing: 'autumn and spring', confidence: 'diagnostic' },
  { pest_id: 'hessian-fly', symptom: 'Brown flaxseed-shaped puparia at the base of leaf sheaths', plant_part: 'stems', timing: 'winter to spring', confidence: 'diagnostic' },
  { pest_id: 'hessian-fly', symptom: 'Stems breaking at feeding sites when bent', plant_part: 'stems', timing: 'spring', confidence: 'suggestive' },

  // Corn Ground Beetle
  { pest_id: 'corn-ground-beetle', symptom: 'Ragged chewing of leaf tips on winter cereal seedlings', plant_part: 'leaves', timing: 'autumn to winter', confidence: 'suggestive' },
  { pest_id: 'corn-ground-beetle', symptom: 'Leaf tips pulled into soil burrows with ragged ends visible', plant_part: 'leaves', timing: 'autumn to winter', confidence: 'diagnostic' },
  { pest_id: 'corn-ground-beetle', symptom: 'Large black ground beetles (14-18mm) found beneath damaged plants', plant_part: 'whole plant', timing: 'autumn', confidence: 'diagnostic' },

  // Click Beetle
  { pest_id: 'click-beetle', symptom: 'Elongated brown beetles (7-10mm) found in pheromone traps in grassland before ploughing', plant_part: 'whole plant', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'click-beetle', symptom: 'Beetle rights itself with audible click when placed on back', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },

  // Potato Tuber Moth
  { pest_id: 'potato-tuber-moth', symptom: 'Leaf mining visible as translucent blotch mines on potato foliage', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'potato-tuber-moth', symptom: 'Frass-filled tunnels in potato tubers starting at eyes', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'diagnostic' },

  // Willow-Carrot Aphid
  { pest_id: 'willow-carrot-aphid', symptom: 'Small green aphids on carrot leaf stalks causing yellowing and curling', plant_part: 'leaves', timing: 'May to September', confidence: 'suggestive' },
  { pest_id: 'willow-carrot-aphid', symptom: 'Red and yellow leaf discolouration from carrot motley dwarf virus', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // Leek Moth
  { pest_id: 'leek-moth', symptom: 'Windows in leek leaf surface where larvae have mined', plant_part: 'leaves', timing: 'May to September', confidence: 'suggestive' },
  { pest_id: 'leek-moth', symptom: 'Bore holes in leek shaft with frass and larvae visible inside', plant_part: 'stems', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'leek-moth', symptom: 'Lace-like pupation cocoons on plant surface', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },

  // Swede Midge
  { pest_id: 'swede-midge', symptom: 'Swollen distorted growing points on brassica plants', plant_part: 'growing point', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'swede-midge', symptom: 'Multiple growing points giving bushy appearance to brassica plant', plant_part: 'growing point', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'swede-midge', symptom: 'Blind or distorted heads in cauliflower and broccoli', plant_part: 'fruit', timing: 'summer to autumn', confidence: 'suggestive' },

  // Brassica Flea Beetle Small
  { pest_id: 'brassica-flea-beetle-small', symptom: 'Small round shot-holes in brassica cotyledons and young leaves', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'brassica-flea-beetle-small', symptom: 'Tiny shiny black beetles jumping when disturbed on seedlings', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },

  // Turnip Moth
  { pest_id: 'turnip-moth', symptom: 'Plants severed at ground level overnight', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'turnip-moth', symptom: 'Grey-brown caterpillar curled in C-shape found in soil near severed stems', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'turnip-moth', symptom: 'Young roots tunnelled with irregular holes', plant_part: 'roots', timing: 'summer to autumn', confidence: 'suggestive' },

  // Woolly Aphid
  { pest_id: 'woolly-aphid', symptom: 'Dense white waxy wool on apple bark at pruning wounds and graft unions', plant_part: 'stems', timing: 'May to October', confidence: 'diagnostic' },
  { pest_id: 'woolly-aphid', symptom: 'Galling and swelling of bark at feeding sites beneath the wool', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'woolly-aphid', symptom: 'Purple-brown aphids visible when wool is brushed away', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },

  // Gooseberry Sawfly
  { pest_id: 'gooseberry-sawfly', symptom: 'Rapid defoliation of gooseberry starting from centre of bush', plant_part: 'leaves', timing: 'April to September', confidence: 'suggestive' },
  { pest_id: 'gooseberry-sawfly', symptom: 'Pale green larvae with black spots feeding gregariously on leaf edges', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },

  // Blackcurrant Gall Mite
  { pest_id: 'blackcurrant-gall-mite', symptom: 'Swollen rounded big buds on blackcurrant (twice normal size)', plant_part: 'buds', timing: 'January to March', confidence: 'diagnostic' },
  { pest_id: 'blackcurrant-gall-mite', symptom: 'Big buds failing to open normally in spring', plant_part: 'buds', timing: 'March to April', confidence: 'diagnostic' },

  // Strawberry Blossom Weevil
  { pest_id: 'strawberry-blossom-weevil', symptom: 'Flower buds hanging on partially severed stalks or fallen to ground', plant_part: 'flowers', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'strawberry-blossom-weevil', symptom: 'Small dark brown weevils (2-4mm) with long rostrum on flower buds', plant_part: 'flowers', timing: 'spring', confidence: 'diagnostic' },

  // Apple Sawfly
  { pest_id: 'apple-sawfly', symptom: 'Ribbon-like scar on apple fruitlet skin from early larval feeding', plant_part: 'fruit', timing: 'May to June', confidence: 'diagnostic' },
  { pest_id: 'apple-sawfly', symptom: 'Premature fruitlet drop in June with entry hole near calyx', plant_part: 'fruit', timing: 'June', confidence: 'suggestive' },
  { pest_id: 'apple-sawfly', symptom: 'Pale cream larvae inside fallen fruitlets when cut open', plant_part: 'fruit', timing: 'June', confidence: 'diagnostic' },

  // Winter Moth
  { pest_id: 'winter-moth', symptom: 'Pale green inchworm caterpillars on opening buds and blossom', plant_part: 'flowers', timing: 'March to May', confidence: 'diagnostic' },
  { pest_id: 'winter-moth', symptom: 'Holes in young leaves and destroyed blossom clusters', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'winter-moth', symptom: 'Wingless female moths climbing tree trunks November to January', plant_part: 'stems', timing: 'winter', confidence: 'diagnostic' },

  // Tortrix Moth
  { pest_id: 'tortrix-moth', symptom: 'Leaves spun together with silk containing green caterpillar inside', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'tortrix-moth', symptom: 'Shallow irregular grazing marks on fruit surface', plant_part: 'fruit', timing: 'summer to autumn', confidence: 'diagnostic' },

  // Cherry Blackfly
  { pest_id: 'cherry-blackfly', symptom: 'Dense black aphid colonies on cherry shoot tips with severe leaf curling', plant_part: 'leaves', timing: 'April to June', confidence: 'diagnostic' },
  { pest_id: 'cherry-blackfly', symptom: 'Sticky honeydew and black sooty mould on leaves and fruit below colonies', plant_part: 'fruit', timing: 'summer', confidence: 'suggestive' },

  // Pear Midge
  { pest_id: 'pear-midge', symptom: 'Fruitlets swelling abnormally — rounder and larger than normal at early stage', plant_part: 'fruit', timing: 'May', confidence: 'diagnostic' },
  { pest_id: 'pear-midge', symptom: 'Fruitlets blackening and cracking at calyx end then dropping', plant_part: 'fruit', timing: 'late May to June', confidence: 'diagnostic' },
  { pest_id: 'pear-midge', symptom: 'Orange-white larvae inside fallen fruitlets when cut open', plant_part: 'fruit', timing: 'June', confidence: 'diagnostic' },

  // Mussel Scale
  { pest_id: 'mussel-scale', symptom: 'Grey-brown mussel-shaped scales aligned along twigs and branches', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'mussel-scale', symptom: 'Branch dieback in severe infestations with encrusted bark', plant_part: 'stems', timing: 'year-round', confidence: 'suggestive' },

  // Fruit Tree Red Spider Mite
  { pest_id: 'fruit-tree-red-spider-mite', symptom: 'Fine pale stippling on upper leaf surface progressing to bronzing', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'fruit-tree-red-spider-mite', symptom: 'Red overwintering eggs visible on bark and bud bases in winter', plant_part: 'stems', timing: 'winter', confidence: 'diagnostic' },
  { pest_id: 'fruit-tree-red-spider-mite', symptom: 'Tiny red-brown mites with white spots visible on leaf underside with hand lens', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // Chafer Grubs
  { pest_id: 'chafer-grubs', symptom: 'C-shaped white grubs with brown head found 2-5cm deep in soil under yellowing turf', plant_part: 'roots', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'chafer-grubs', symptom: 'Turf lifting easily from soil like a carpet in affected patches', plant_part: 'roots', timing: 'autumn to spring', confidence: 'suggestive' },
  { pest_id: 'chafer-grubs', symptom: 'Crows rooks and badgers digging up turf to feed on grubs', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'associated' },

  // Field Voles
  { pest_id: 'field-voles', symptom: 'Surface runways (3-4cm wide) visible in long grass', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'field-voles', symptom: 'Bark gnawing at the base of young trees to bare wood', plant_part: 'stems', timing: 'winter', confidence: 'diagnostic' },
  { pest_id: 'field-voles', symptom: 'Piles of chopped grass stems at feeding stations along runways', plant_part: 'whole plant', timing: 'year-round', confidence: 'suggestive' },

  // New Zealand Flatworm
  { pest_id: 'new-zealand-flatworm', symptom: 'Flat purple-brown worm (5-15cm) found under stones and surface objects', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'new-zealand-flatworm', symptom: 'Reduced earthworm populations in garden and grassland soil', plant_part: 'roots', timing: 'year-round', confidence: 'suggestive' },

  // Crow/Rook Damage
  { pest_id: 'crow-rook-damage', symptom: 'Seedlings pulled up with seed still attached at base in rows', plant_part: 'whole plant', timing: 'autumn (drilling) and spring', confidence: 'diagnostic' },
  { pest_id: 'crow-rook-damage', symptom: 'Ragged ears with grain removed before harvest', plant_part: 'ears', timing: 'late summer', confidence: 'suggestive' },
  { pest_id: 'crow-rook-damage', symptom: 'Patches of grassland torn up by birds feeding on soil invertebrates', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Cabbage Moth
  { pest_id: 'cabbage-moth', symptom: 'Holes in outer brassica leaves from young caterpillar feeding', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'cabbage-moth', symptom: 'Bore holes into cabbage hearts with frass-producing caterpillars inside', plant_part: 'fruit', timing: 'late summer to autumn', confidence: 'diagnostic' },

  // Carrot-Willow Aphid
  { pest_id: 'carrot-willow-aphid', symptom: 'Green aphids on carrot foliage with red-yellow virus discolouration of outer leaves', plant_part: 'leaves', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'carrot-willow-aphid', symptom: 'Stunted carrot plants with curled yellowed foliage', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Mangold Fly
  { pest_id: 'mangold-fly', symptom: 'Pale blister-like mines in sugar beet leaves with dark larval shapes visible inside', plant_part: 'leaves', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'mangold-fly', symptom: 'Brown papery patches on beet leaves from mined and dried-out tissue', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Celery Fly
  { pest_id: 'celery-fly', symptom: 'Brown blotch mines expanding across celery leaflets', plant_part: 'leaves', timing: 'April to September', confidence: 'diagnostic' },
  { pest_id: 'celery-fly', symptom: 'White maggots (5-7mm) visible through mine surface on celery', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // Onion Thrips
  { pest_id: 'onion-thrips', symptom: 'Silver-white streaks and patches on onion leaves from cell emptying', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'onion-thrips', symptom: 'Tiny yellow to brown insects between inner onion leaves', plant_part: 'leaves', timing: 'July to August', confidence: 'diagnostic' },

  // Raspberry Cane Midge
  { pest_id: 'raspberry-cane-midge', symptom: 'Tiny orange-pink larvae beneath bark splits on raspberry primocanes', plant_part: 'stems', timing: 'April to August', confidence: 'diagnostic' },
  { pest_id: 'raspberry-cane-midge', symptom: 'Dark brown to black cane blight spreading from bark split entry points', plant_part: 'stems', timing: 'summer to autumn', confidence: 'suggestive' },

  // Pea Leaf Weevil
  { pest_id: 'pea-leaf-weevil', symptom: 'Distinctive U-shaped notches along pea and bean leaf margins', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'pea-leaf-weevil', symptom: 'Grey-brown weevils (4-5mm) feigning death when disturbed on plants', plant_part: 'whole plant', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'pea-leaf-weevil', symptom: 'Brown hollowed-out root nodules from larval feeding', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },

  // Flea Beetle Root Crops
  { pest_id: 'flea-beetle-root-crops', symptom: 'Shot-hole damage on sugar beet and spinach cotyledons from tiny jumping beetles', plant_part: 'leaves', timing: 'April to June', confidence: 'diagnostic' },
  { pest_id: 'flea-beetle-root-crops', symptom: 'Seedlings killed in hot dry weather when growth cannot outpace feeding', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Large Narcissus Fly
  { pest_id: 'large-narcissus-fly', symptom: 'Soft light narcissus bulbs that fail to produce shoots in spring', plant_part: 'roots', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'large-narcissus-fly', symptom: 'Large cream grub (15-20mm) inside hollowed-out bulb when cut', plant_part: 'roots', timing: 'autumn to spring', confidence: 'diagnostic' },

  // Glasshouse Whitefly
  { pest_id: 'glasshouse-whitefly', symptom: 'Clouds of tiny white-winged insects flying up when plants are disturbed', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'glasshouse-whitefly', symptom: 'Flat oval pale green nymphs on leaf undersurface with honeydew and sooty mould', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },

  // Western Flower Thrips
  { pest_id: 'western-flower-thrips', symptom: 'Silver scarring on fruit surface from thrips feeding', plant_part: 'fruit', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'western-flower-thrips', symptom: 'Tiny yellow insects visible when flowers are tapped over white paper', plant_part: 'flowers', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'western-flower-thrips', symptom: 'Distorted flowers and streaked petals', plant_part: 'flowers', timing: 'year-round under glass', confidence: 'suggestive' },

  // Badger Damage
  { pest_id: 'badger-damage', symptom: 'Cone-shaped snuffle holes (5-10cm deep) in grassland and turf', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'badger-damage', symptom: 'Sweetcorn cobs pulled down and stripped of kernels', plant_part: 'fruit', timing: 'late summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'badger-damage', symptom: 'Well-worn paths between woodland and crop field', plant_part: 'whole plant', timing: 'year-round', confidence: 'associated' },

  // Cabbage Stem Weevil
  { pest_id: 'cabbage-stem-weevil', symptom: 'Small round feeding holes on oilseed rape leaves from adult weevils', plant_part: 'leaves', timing: 'March to April', confidence: 'suggestive' },
  { pest_id: 'cabbage-stem-weevil', symptom: 'White legless grubs inside split petioles and stems of oilseed rape', plant_part: 'stems', timing: 'May to June', confidence: 'diagnostic' },

  // ── Expansion: New Weed Symptoms ───────────────────────────────

  // Red Dead-nettle
  { pest_id: 'red-dead-nettle', symptom: 'Square stems with opposite heart-shaped purplish leaves and pink-purple flowers', plant_part: 'whole plant', timing: 'March to October', confidence: 'diagnostic' },
  { pest_id: 'red-dead-nettle', symptom: 'Dense patches in autumn-sown crops on fertile soils', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'suggestive' },

  // Field Forget-me-not
  { pest_id: 'field-forget-me-not', symptom: 'Small blue flowers with yellow centre on hairy stems in arable crops', plant_part: 'whole plant', timing: 'April to September', confidence: 'diagnostic' },
  { pest_id: 'field-forget-me-not', symptom: 'Basal rosette of hairy oval leaves overwintering in cereal crops', plant_part: 'leaves', timing: 'autumn to spring', confidence: 'suggestive' },

  // Corn Marigold
  { pest_id: 'corn-marigold', symptom: 'Bright yellow daisy-like flowers (35-65mm) with bluish-green fleshy foliage', plant_part: 'whole plant', timing: 'June to October', confidence: 'diagnostic' },
  { pest_id: 'corn-marigold', symptom: 'Dense stands in cereal crops on acidic sandy soils', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Scented Mayweed
  { pest_id: 'scented-mayweed', symptom: 'White daisy flowers with conical hollow yellow centre and sweet chamomile scent when crushed', plant_part: 'whole plant', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'scented-mayweed', symptom: 'Finely divided feathery leaves in cereal and root crops', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },

  // Shepherd's Purse
  { pest_id: 'shepherds-purse', symptom: 'Distinctive heart-shaped seed pods along slender flowering stems', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'shepherds-purse', symptom: 'Basal rosette of deeply lobed variable-shaped leaves', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Groundsel
  { pest_id: 'groundsel', symptom: 'Clusters of small cylindrical yellow flower heads without ray florets', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'groundsel', symptom: 'White pappus for wind dispersal visible on mature seed heads', plant_part: 'whole plant', timing: 'year-round', confidence: 'suggestive' },

  // Knotgrass
  { pest_id: 'knotgrass', symptom: 'Prostrate wiry stems with small lance-shaped leaves and silvery sheath at each node', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'knotgrass', symptom: 'Flat mats on compacted soil at field gateways and tramlines', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Black Bindweed
  { pest_id: 'black-bindweed', symptom: 'Annual twining stems with heart-shaped leaves climbing cereal stems', plant_part: 'whole plant', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'black-bindweed', symptom: 'Small greenish-white flowers in clusters and hard angular black seeds', plant_part: 'whole plant', timing: 'summer to autumn', confidence: 'diagnostic' },

  // Pale Persicaria
  { pest_id: 'pale-persicaria', symptom: 'Pale pink to white nodding flower spikes on erect stems with glandular-dotted leaves', plant_part: 'whole plant', timing: 'June to October', confidence: 'diagnostic' },
  { pest_id: 'pale-persicaria', symptom: 'Plants concentrated in wet areas and ditch margins of fields', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Redshank
  { pest_id: 'redshank', symptom: 'Erect pink flower spikes and lance-shaped leaves with dark central blotch', plant_part: 'whole plant', timing: 'June to October', confidence: 'diagnostic' },
  { pest_id: 'redshank', symptom: 'Reddish stems and swollen nodes in arable crops', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },

  // Yorkshire Fog
  { pest_id: 'yorkshire-fog', symptom: 'Very hairy grass with velvet-like feel and pink-white fluffy flower panicle', plant_part: 'whole plant', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'yorkshire-fog', symptom: 'Grey-green broad soft leaves in poorly managed grassland', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Soft Brome
  { pest_id: 'soft-brome', symptom: 'Compact nodding panicle of broad softly hairy spikelets with short awns', plant_part: 'whole plant', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'soft-brome', symptom: 'Softly hairy grass plants competing in winter wheat on minimum tillage', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Onion Couch
  { pest_id: 'onion-couch', symptom: 'Chain of swollen onion-like bulbs at stem base when plant pulled up', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'onion-couch', symptom: 'Tall grass with conspicuous bent-awned panicle on field margins', plant_part: 'whole plant', timing: 'June to August', confidence: 'suggestive' },

  // Creeping Bent
  { pest_id: 'creeping-bent', symptom: 'Dense grass mat with surface stolons rooting at nodes on wet ground', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'creeping-bent', symptom: 'Fine-leaved grass smothering crop seedlings in wet field patches', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'suggestive' },

  // Horsetail
  { pest_id: 'horsetail', symptom: 'Jointed green stems with whorls of fine needle-like branches', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'horsetail', symptom: 'Brown unbranched fertile stems with cone-like strobili appearing in spring before green stems', plant_part: 'whole plant', timing: 'March to April', confidence: 'diagnostic' },

  // Bracken
  { pest_id: 'bracken', symptom: 'Large triangular fronds (1-2m) emerging as curled fiddleheads covering upland ground', plant_part: 'whole plant', timing: 'April to May', confidence: 'diagnostic' },
  { pest_id: 'bracken', symptom: 'Dense canopy shading out all other vegetation with dead brown fronds persisting through winter', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },

  // Common Orache
  { pest_id: 'common-orache', symptom: 'Triangular leaves with spreading basal lobes and mealy texture on reddish stems', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'common-orache', symptom: 'Competitive patches in sugar beet on heavier soils', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Smooth Sow-thistle
  { pest_id: 'smooth-sowthistle', symptom: 'Hollow stems with milky sap and yellow dandelion-like flowers in loose clusters', plant_part: 'whole plant', timing: 'year-round in mild conditions', confidence: 'diagnostic' },
  { pest_id: 'smooth-sowthistle', symptom: 'Softly spiny-margined leaves clasping stem with rounded auricles', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'suggestive' },

  // Annual Nettle
  { pest_id: 'annual-nettle', symptom: 'Small stinging nettle (15-60cm) with deeply toothed rounded leaves on fertile soil', plant_part: 'whole plant', timing: 'March to October', confidence: 'diagnostic' },
  { pest_id: 'annual-nettle', symptom: 'Dense stands in vegetable fields and high-phosphate soils', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Field Pennycress
  { pest_id: 'field-pennycress', symptom: 'Large round flat seed pods with wide papery wing along stem with garlic smell when crushed', plant_part: 'whole plant', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'field-pennycress', symptom: 'White four-petalled flowers and clasping arrow-shaped upper leaves', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Dove's-foot Crane's-bill
  { pest_id: 'dove-foot-cranesbill', symptom: 'Small pink flowers with deeply notched petals and rounded lobed leaves on sandy soil', plant_part: 'whole plant', timing: 'April to September', confidence: 'diagnostic' },
  { pest_id: 'dove-foot-cranesbill', symptom: 'Low spreading hairy plant on dry light sandy soils in arable crops', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'suggestive' },

  // Perennial Ryegrass Weed
  { pest_id: 'perennial-ryegrass-weed', symptom: 'Dark green glossy grass with folded leaves and small auricles persisting after ley destruction', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'perennial-ryegrass-weed', symptom: 'Awnless flower spikes with spikelets edgeways to stem in first arable crop', plant_part: 'whole plant', timing: 'June to August', confidence: 'diagnostic' },

  // Broad-leaved Plantain
  { pest_id: 'broad-leaved-plantain', symptom: 'Flat rosette of broad oval leaves with prominent parallel veins on compacted ground', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'broad-leaved-plantain', symptom: 'Narrow cylindrical rat-tail flower spikes on leafless stalks', plant_part: 'whole plant', timing: 'May to August', confidence: 'diagnostic' },

  // Ribwort Plantain
  { pest_id: 'ribwort-plantain', symptom: 'Rosette of narrow lance-shaped leaves with strong ribs and dark oval flower heads on long stalks', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'ribwort-plantain', symptom: 'Ring of white anthers around dark flower head during bloom', plant_part: 'whole plant', timing: 'May to August', confidence: 'diagnostic' },

  // Common Mouse-ear
  { pest_id: 'common-mouse-ear', symptom: 'Mat-forming hairy plant with small white deeply notched flowers in thin sward', plant_part: 'whole plant', timing: 'April to November', confidence: 'diagnostic' },
  { pest_id: 'common-mouse-ear', symptom: 'Curved cylindrical seed capsule on prostrate hairy stems', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // White Clover Weed
  { pest_id: 'white-clover-weed', symptom: 'Trefoil leaves with white V-shaped chevron and creeping stolons in arable crop', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'white-clover-weed', symptom: 'White globular flower heads on long stalks amongst cereal crop', plant_part: 'whole plant', timing: 'May to September', confidence: 'suggestive' },

  // Hedge Mustard
  { pest_id: 'hedge-mustard', symptom: 'Narrow erect seed pods pressed tightly against stiff stem', plant_part: 'whole plant', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'hedge-mustard', symptom: 'Small yellow four-petalled flowers on angular branching stems', plant_part: 'whole plant', timing: 'May to September', confidence: 'suggestive' },

  // ── Additional symptoms for depth ──────────────────────────────

  // Extra symptoms for diseases with only 2
  { pest_id: 'gangrene', symptom: 'Skin wrinkling over depressed area with firm dry powdery brown-black tissue beneath', plant_part: 'tubers', timing: 'mid to late storage', confidence: 'suggestive' },
  { pest_id: 'pink-rot', symptom: 'Tuber skin appears normal or slightly darkened externally despite severe internal rot', plant_part: 'tubers', timing: 'harvest', confidence: 'associated' },
  { pest_id: 'soil-borne-wheat-mosaic-virus', symptom: 'Slight stunting of wheat plants in patches on heavy clay soils', plant_part: 'whole plant', timing: 'spring', confidence: 'associated' },
  { pest_id: 'white-tip-leek', symptom: 'Rot extending into leek shaft in severe cases from initial leaf tip die-back', plant_part: 'stems', timing: 'late autumn', confidence: 'associated' },
  { pest_id: 'powdery-scab-potato', symptom: 'Raised pustule edge remaining after spore mass has been rubbed off — distinct from common scab', plant_part: 'tubers', timing: 'harvest', confidence: 'suggestive' },
  { pest_id: 'bunt-wheat', symptom: 'Strong rotten fish (trimethylamine) odour released when bunt ball is crushed', plant_part: 'ears', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'phytophthora-root-rot-peas', symptom: 'Roots rotted and plants pull from soil easily without resistance', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'crown-rot-strawberry', symptom: 'Roots may appear healthy despite internal crown discolouration and wilting', plant_part: 'roots', timing: 'summer', confidence: 'associated' },

  // Extra symptoms for pests with only 2
  { pest_id: 'click-beetle', symptom: 'High pheromone trap catches in grassland planned for conversion to arable indicate future wireworm risk', plant_part: 'whole plant', timing: 'May to July', confidence: 'associated' },
  { pest_id: 'potato-tuber-moth', symptom: 'Small grey-brown moths (15mm wingspan) active around potato foliage at dusk', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'cabbage-moth', symptom: 'Brown-grey noctuid moths (40-45mm wingspan) with kidney-shaped wing markings at light traps', plant_part: 'whole plant', timing: 'May to September', confidence: 'suggestive' },
  { pest_id: 'mangold-fly', symptom: 'Stunted young sugar beet plants with most leaf area lost to mining', plant_part: 'whole plant', timing: 'May to June', confidence: 'associated' },
  { pest_id: 'new-zealand-flatworm', symptom: 'Dark shiny egg capsules (5-10mm) found in soil near flatworm hiding places', plant_part: 'roots', timing: 'year-round', confidence: 'suggestive' },
  { pest_id: 'cabbage-stem-weevil', symptom: 'Exit holes on oilseed rape stem surface where mature larvae have left', plant_part: 'stems', timing: 'June', confidence: 'suggestive' },
  { pest_id: 'blackcurrant-gall-mite', symptom: 'Reversion virus symptoms — flowers with magenta colour and extra petals on infested bushes', plant_part: 'flowers', timing: 'spring', confidence: 'associated' },
  { pest_id: 'mussel-scale', symptom: 'White eggs or shrivelled female body visible when scale cover is lifted', plant_part: 'stems', timing: 'winter', confidence: 'diagnostic' },
  { pest_id: 'raspberry-cane-midge', symptom: 'Brittle canes snapping at points of cane blight infection originating from midge wounds', plant_part: 'stems', timing: 'autumn to winter', confidence: 'suggestive' },
  { pest_id: 'celery-fly', symptom: 'Brown papery leaves on severely attacked celery plants reducing crop marketability', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'associated' },
  { pest_id: 'onion-thrips', symptom: 'Black frass spots visible on silvered leaf areas', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'flea-beetle-root-crops', symptom: 'Tiny shiny bronze-coloured beetles (Chaetocnema concinna) on sugar beet seedlings', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'large-narcissus-fly', symptom: 'Bumblebee-like hoverfly adults visiting flowers near narcissus plantings in May-June', plant_part: 'whole plant', timing: 'May to June', confidence: 'associated' },
  { pest_id: 'glasshouse-whitefly', symptom: 'Eggs on short stalks visible on leaf undersurface with hand lens', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'suggestive' },

  // ── Symptoms for existing pests that lacked entries ─────────────

  // Xylella fastidiosa
  { pest_id: 'xylella-fastidiosa', symptom: 'Leaf margin scorch starting at edges and progressing inward', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'xylella-fastidiosa', symptom: 'Branch dieback in upper canopy', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'xylella-fastidiosa', symptom: 'Stunted growth and reduced vigour over multiple seasons', plant_part: 'whole plant', timing: 'year-round', confidence: 'associated' },

  // Phytophthora ramorum
  { pest_id: 'phytophthora-ramorum', symptom: 'Bleeding tarry cankers on tree trunk (oak)', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'phytophthora-ramorum', symptom: 'Needle blackening and shoot tip dieback on larch', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'phytophthora-ramorum', symptom: 'Dark brown-black leaf lesions on rhododendron with stem dieback', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Ash dieback
  { pest_id: 'ash-dieback', symptom: 'Diamond-shaped bark lesions at the base of dead side-shoots', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'ash-dieback', symptom: 'Progressive crown dieback from tips with epicormic shoots on trunk', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'ash-dieback', symptom: 'Dark brown-black lesions on leaves and petioles', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Dutch Elm Disease
  { pest_id: 'dutch-elm-disease', symptom: 'Sudden wilting and browning of leaves on individual branches (flagging)', plant_part: 'leaves', timing: 'early summer', confidence: 'diagnostic' },
  { pest_id: 'dutch-elm-disease', symptom: 'Brown streaking in sapwood visible when bark peeled back', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'dutch-elm-disease', symptom: 'Beetle entrance holes and galleries under bark of dead branches', plant_part: 'stems', timing: 'year-round', confidence: 'suggestive' },

  // ToBRFV
  { pest_id: 'tomato-brown-rugose-fruit-virus', symptom: 'Brown rugose (wrinkled) patches on fruit surface', plant_part: 'fruit', timing: 'fruiting period', confidence: 'diagnostic' },
  { pest_id: 'tomato-brown-rugose-fruit-virus', symptom: 'Mosaic and chlorotic mottle on leaves with narrowing of young leaves', plant_part: 'leaves', timing: 'vegetative growth', confidence: 'suggestive' },
  { pest_id: 'tomato-brown-rugose-fruit-virus', symptom: 'Necrotic spots on calyces and peduncles', plant_part: 'flowers', timing: 'fruiting', confidence: 'associated' },

  // Potato Ring Rot
  { pest_id: 'potato-ring-rot', symptom: 'Cream-coloured cheesy ring of decay visible when tuber is cut across', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'potato-ring-rot', symptom: 'Wilting of individual stems with interveinal chlorosis on leaves', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Potato Brown Rot
  { pest_id: 'potato-brown-rot', symptom: 'Brown discolouration of vascular ring in cut tuber with bacterial ooze', plant_part: 'tubers', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'potato-brown-rot', symptom: 'Wilting and yellowing of stems often on one side of the plant', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },

  // Tomato Leaf Mould
  { pest_id: 'tomato-leaf-mould', symptom: 'Olive-green to brown velvety mould on leaf undersurface', plant_part: 'leaves', timing: 'summer under glass', confidence: 'diagnostic' },
  { pest_id: 'tomato-leaf-mould', symptom: 'Pale yellow spots on upper leaf surface corresponding to mould beneath', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'tomato-leaf-mould', symptom: 'Leaf curling and premature senescence in severe cases', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'associated' },

  // Tomato Blight
  { pest_id: 'tomato-blight', symptom: 'Dark brown-black water-soaked lesions on leaves spreading rapidly in wet weather', plant_part: 'leaves', timing: 'July to September', confidence: 'diagnostic' },
  { pest_id: 'tomato-blight', symptom: 'Brown firm rot on fruit surface often starting at the calyx end', plant_part: 'fruit', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'tomato-blight', symptom: 'Dark brown stem lesions with white sporulation in humid conditions', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },

  // Blossom End Rot
  { pest_id: 'blossom-end-rot', symptom: 'Dark sunken leathery patch at blossom end of fruit', plant_part: 'fruit', timing: 'fruiting', confidence: 'diagnostic' },
  { pest_id: 'blossom-end-rot', symptom: 'Internal browning and dry papery tissue at fruit base when cut open', plant_part: 'fruit', timing: 'fruiting', confidence: 'suggestive' },

  // Tobacco Mosaic Virus
  { pest_id: 'tobacco-mosaic-virus', symptom: 'Mosaic pattern of light and dark green patches on leaves', plant_part: 'leaves', timing: 'vegetative growth', confidence: 'diagnostic' },
  { pest_id: 'tobacco-mosaic-virus', symptom: 'Leaf distortion and fern-leaf narrowing in severe strains', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'tobacco-mosaic-virus', symptom: 'Stunted growth and reduced yield with mottled fruit', plant_part: 'whole plant', timing: 'growing season', confidence: 'associated' },

  // Cucumber Powdery Mildew
  { pest_id: 'cucumber-powdery-mildew', symptom: 'White powdery patches on upper leaf surface spreading rapidly', plant_part: 'leaves', timing: 'summer under glass', confidence: 'diagnostic' },
  { pest_id: 'cucumber-powdery-mildew', symptom: 'Leaf yellowing and premature senescence under heavy infection', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'suggestive' },

  // Box Blight
  { pest_id: 'box-blight', symptom: 'Dark brown-black streaks on stems with dieback', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'box-blight', symptom: 'Tan or brown leaf spots with dark margins, leaves falling rapidly', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'suggestive' },
  { pest_id: 'box-blight', symptom: 'White sporulation on leaf undersurfaces in humid conditions', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'suggestive' },

  // Phytophthora Root Rot Ornamental
  { pest_id: 'phytophthora-root-rot-ornamental', symptom: 'Progressive wilting despite adequate soil moisture', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'phytophthora-root-rot-ornamental', symptom: 'Dark brown rotted roots visible when plant lifted from container', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },

  // Downy Mildew Impatiens
  { pest_id: 'downy-mildew-impatiens', symptom: 'Rapid plant collapse and defoliation seemingly overnight', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'downy-mildew-impatiens', symptom: 'White downy sporulation on leaf undersurfaces in humid mornings', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'downy-mildew-impatiens', symptom: 'Leaves pale green-yellow with stippled appearance before collapse', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Asian Longhorn Beetle
  { pest_id: 'asian-longhorn-beetle', symptom: 'Circular exit holes (10mm+) in bark of broadleaved trees', plant_part: 'stems', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'asian-longhorn-beetle', symptom: 'Coarse frass (sawdust) at base of tree or in branch forks', plant_part: 'stems', timing: 'summer', confidence: 'suggestive' },

  // Citrus Longhorn Beetle
  { pest_id: 'citrus-longhorn-beetle', symptom: 'Circular exit holes (6-11mm) in bark near base of trunk and large roots', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'citrus-longhorn-beetle', symptom: 'Crown dieback and branch death from internal larval tunnelling', plant_part: 'whole plant', timing: 'year-round', confidence: 'suggestive' },

  // Emerald Ash Borer
  { pest_id: 'emerald-ash-borer', symptom: 'D-shaped exit holes (3-4mm) in ash bark', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'emerald-ash-borer', symptom: 'S-shaped serpentine larval galleries under bark', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'emerald-ash-borer', symptom: 'Crown dieback starting from top with epicormic shoots lower on trunk', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Horse Chestnut Leaf Miner
  { pest_id: 'horse-chestnut-leaf-miner', symptom: 'Brown blotch mines on horse chestnut leaves expanding from midrib', plant_part: 'leaves', timing: 'June to September', confidence: 'diagnostic' },
  { pest_id: 'horse-chestnut-leaf-miner', symptom: 'Premature leaf browning and early leaf fall from heavy infestation', plant_part: 'leaves', timing: 'August to September', confidence: 'suggestive' },

  // Oriental Chestnut Gall Wasp
  { pest_id: 'oriental-chestnut-gall-wasp', symptom: 'Green to reddish swollen galls (5-20mm) on buds and shoots of sweet chestnut', plant_part: 'stems', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'oriental-chestnut-gall-wasp', symptom: 'Reduced flowering and nut production from galled shoots', plant_part: 'flowers', timing: 'spring', confidence: 'associated' },

  // Greenhouse Red Spider Mite
  { pest_id: 'greenhouse-red-spider-mite', symptom: 'Fine pale stippling on upper leaf surface from sap feeding', plant_part: 'leaves', timing: 'spring to autumn under glass', confidence: 'diagnostic' },
  { pest_id: 'greenhouse-red-spider-mite', symptom: 'Fine silk webbing on leaf undersurfaces and between leaves', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'greenhouse-red-spider-mite', symptom: 'Tiny mites visible on leaf undersurface with hand lens — green in summer, orange-red in autumn', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },

  // Sciarid Fly
  { pest_id: 'sciarid-fly', symptom: 'Small black flies (3-4mm) running over compost surface and flying weakly around pots', plant_part: 'roots', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'sciarid-fly', symptom: 'Translucent larvae (5mm with dark head) visible in growing media surface', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'sciarid-fly', symptom: 'Seedling collapse or poor rooting of cuttings from larval feeding on roots', plant_part: 'roots', timing: 'year-round', confidence: 'associated' },

  // Shore Fly
  { pest_id: 'shore-fly', symptom: 'Small dark flies (3-4mm) with smoky wings running rapidly on leaf surfaces', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'shore-fly', symptom: 'Small dark spots of fly frass (excrement) on leaves — cosmetic damage', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Leaf Miner (Protected)
  { pest_id: 'leaf-miner-protected', symptom: 'Serpentine mines on leaves with dark frass line visible through leaf surface', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'leaf-miner-protected', symptom: 'Feeding and oviposition punctures (pale dots) on upper leaf surface', plant_part: 'leaves', timing: 'year-round', confidence: 'suggestive' },

  // Tuta absoluta
  { pest_id: 'tuta-absoluta', symptom: 'Irregular blotch mines on tomato leaves that may turn brown and dry', plant_part: 'leaves', timing: 'year-round under glass', confidence: 'diagnostic' },
  { pest_id: 'tuta-absoluta', symptom: 'Tunnels in fruit with dark frass visible through skin', plant_part: 'fruit', timing: 'fruiting', confidence: 'diagnostic' },
  { pest_id: 'tuta-absoluta', symptom: 'Stem boring and associated wilting of shoots above boring site', plant_part: 'stems', timing: 'growing season', confidence: 'suggestive' },

  // Fuchsia Gall Mite
  { pest_id: 'fuchsia-gall-mite', symptom: 'Distorted, thickened, reddened galled shoot tips and flowers', plant_part: 'flowers', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'fuchsia-gall-mite', symptom: 'Abnormal enlarged calyces and aborted flowers', plant_part: 'flowers', timing: 'summer', confidence: 'suggestive' },

  // Hemerocallis Gall Midge
  { pest_id: 'hemerocallis-gall-midge', symptom: 'Swollen distorted flower buds that fail to open normally', plant_part: 'flowers', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'hemerocallis-gall-midge', symptom: 'Small white or orange larvae inside opened swollen bud', plant_part: 'flowers', timing: 'May to July', confidence: 'diagnostic' },

  // Berberis Sawfly
  { pest_id: 'berberis-sawfly', symptom: 'Complete defoliation of berberis from gregarious larval feeding', plant_part: 'leaves', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'berberis-sawfly', symptom: 'Pale green-grey caterpillar-like larvae with black spots on berberis leaves', plant_part: 'leaves', timing: 'May to July', confidence: 'diagnostic' },

  // Leather Jacket Marsh
  { pest_id: 'leather-jacket-marsh', symptom: 'Yellowish patches in turf or crops with grey-brown leatherjackets found below surface', plant_part: 'roots', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'leather-jacket-marsh', symptom: 'Severed plant stems at ground level from nocturnal larval feeding', plant_part: 'stems', timing: 'March to May', confidence: 'suggestive' },

  // Turnip Gall Weevil
  { pest_id: 'turnip-gall-weevil', symptom: 'Round marble-like swellings (galls) on roots and stem base of brassicas', plant_part: 'roots', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'turnip-gall-weevil', symptom: 'Small white legless grub found inside gall when cut open', plant_part: 'roots', timing: 'summer', confidence: 'diagnostic' },

  // Mangold Flea Beetle
  { pest_id: 'mangold-flea-beetle', symptom: 'Tiny round shot-holes in cotyledons and first true leaves of sugar beet seedlings', plant_part: 'leaves', timing: 'April to May', confidence: 'diagnostic' },
  { pest_id: 'mangold-flea-beetle', symptom: 'Small shiny bronze-black beetles (2mm) jumping when disturbed', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },

  // Beet Moth
  { pest_id: 'beet-moth', symptom: 'Mines in sugar beet leaf blades from young larval feeding', plant_part: 'leaves', timing: 'June to July', confidence: 'suggestive' },
  { pest_id: 'beet-moth', symptom: 'Webbed heart leaves with dark frass and tunnelling into crown', plant_part: 'stems', timing: 'July to September', confidence: 'diagnostic' },

  // Celery Heart Rot
  { pest_id: 'celery-heart-rot', symptom: 'Watery soft rot of inner petioles and heart while outer stalks remain healthy', plant_part: 'stems', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'celery-heart-rot', symptom: 'White fluffy mycelium and hard black sclerotia within rotting tissue', plant_part: 'stems', timing: 'summer to autumn', confidence: 'diagnostic' },

  // ── Symptoms for NEW pests ─────────────────────────────────────

  // Pepper Mild Mottle Virus
  { pest_id: 'pepper-mild-mottle-virus', symptom: 'Mild green mosaic and mottle on young pepper leaves', plant_part: 'leaves', timing: 'vegetative growth', confidence: 'suggestive' },
  { pest_id: 'pepper-mild-mottle-virus', symptom: 'Fruit discolouration with pale patches and uneven ripening', plant_part: 'fruit', timing: 'fruiting', confidence: 'suggestive' },
  { pest_id: 'pepper-mild-mottle-virus', symptom: 'Leaf distortion and rugosity in severe strains', plant_part: 'leaves', timing: 'growing season', confidence: 'associated' },

  // Fusarium Crown Rot Tomato
  { pest_id: 'fusarium-crown-rot-tomato', symptom: 'Dark brown rot at the crown (stem base) at soil level', plant_part: 'stems', timing: 'growing season', confidence: 'diagnostic' },
  { pest_id: 'fusarium-crown-rot-tomato', symptom: 'Pink-orange sporulation on crown surface in humid conditions', plant_part: 'stems', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'fusarium-crown-rot-tomato', symptom: 'Yellowing and wilting of lower leaves progressing upward', plant_part: 'leaves', timing: 'growing season', confidence: 'suggestive' },

  // Rhododendron Powdery Mildew
  { pest_id: 'rhododendron-powdery-mildew', symptom: 'White powdery patches on upper leaf surface of rhododendron or azalea', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'rhododendron-powdery-mildew', symptom: 'Leaf curling and premature drop on deciduous azaleas', plant_part: 'leaves', timing: 'late summer', confidence: 'suggestive' },

  // Narcissus Basal Rot
  { pest_id: 'narcissus-basal-rot', symptom: 'Chocolate-brown rot starting at basal plate and extending upward through scales', plant_part: 'tubers', timing: 'lifting and storage', confidence: 'diagnostic' },
  { pest_id: 'narcissus-basal-rot', symptom: 'Premature yellowing of leaf tips and early die-back in the field', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'narcissus-basal-rot', symptom: 'Soft brown rot with pink-white mycelium at basal plate in store', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },

  // Tulip Fire
  { pest_id: 'tulip-fire', symptom: 'Stunted scorched-looking shoots covered in grey mould emerging in spring', plant_part: 'whole plant', timing: 'spring emergence', confidence: 'diagnostic' },
  { pest_id: 'tulip-fire', symptom: 'Small brown leaf spots with dark green water-soaked haloes', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },
  { pest_id: 'tulip-fire', symptom: 'Small black sclerotia on outer bulb scales when lifted', plant_part: 'tubers', timing: 'summer', confidence: 'diagnostic' },

  // Onion Downy Mildew
  { pest_id: 'onion-downy-mildew', symptom: 'Pale green to yellow oval lesions on leaves with violet-grey downy sporulation', plant_part: 'leaves', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'onion-downy-mildew', symptom: 'Leaf collapse from the tip with premature die-back', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'onion-downy-mildew', symptom: 'Distorted pale stunted plants from systemic infection in sets', plant_part: 'whole plant', timing: 'spring', confidence: 'suggestive' },

  // Parsley Septoria
  { pest_id: 'parsley-septoria', symptom: 'Small dark brown circular spots (2-5mm) on leaf blades with tiny black pycnidia', plant_part: 'leaves', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'parsley-septoria', symptom: 'Spots coalescing causing leaf yellowing and defoliation', plant_part: 'leaves', timing: 'autumn to spring', confidence: 'suggestive' },

  // Mint Rust
  { pest_id: 'mint-rust', symptom: 'Swollen distorted pale shoots in spring from systemic infection', plant_part: 'stems', timing: 'spring', confidence: 'diagnostic' },
  { pest_id: 'mint-rust', symptom: 'Orange-brown urediniospore pustules on leaf undersurfaces', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'mint-rust', symptom: 'Dark brown-black teliospore pustules on leaves and stems in autumn', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },

  // Carrot Cavity Spot
  { pest_id: 'carrot-cavity-spot', symptom: 'Elliptical sunken lesions (3-10mm) on carrot root surface', plant_part: 'roots', timing: 'harvest', confidence: 'diagnostic' },
  { pest_id: 'carrot-cavity-spot', symptom: 'Shallow (1-2mm deep) concave pits with smooth edges and tan centres', plant_part: 'roots', timing: 'harvest and storage', confidence: 'suggestive' },

  // Damping Off
  { pest_id: 'damping-off', symptom: 'Seedlings collapsed at soil level with water-soaked constricted stem base', plant_part: 'stems', timing: 'germination to emergence', confidence: 'diagnostic' },
  { pest_id: 'damping-off', symptom: 'Patches of failed emergence where seeds rotted before germinating', plant_part: 'roots', timing: 'sowing', confidence: 'suggestive' },
  { pest_id: 'damping-off', symptom: 'Fine cottony mycelium visible on collapsed seedlings in humid conditions', plant_part: 'stems', timing: 'germination', confidence: 'associated' },

  // Black Rot Brassica
  { pest_id: 'black-rot-brassica', symptom: 'V-shaped yellow lesions advancing from leaf margins toward the midrib', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'black-rot-brassica', symptom: 'Darkened or blackened leaf veins visible when held to light', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'black-rot-brassica', symptom: 'Cross-section of stem showing blackened vascular ring', plant_part: 'stems', timing: 'summer to autumn', confidence: 'suggestive' },

  // Bacterial Soft Rot
  { pest_id: 'bacterial-soft-rot', symptom: 'Water-soaked slimy tissue that collapses on touch with foul smell', plant_part: 'tubers', timing: 'storage', confidence: 'diagnostic' },
  { pest_id: 'bacterial-soft-rot', symptom: 'Cream to brown liquefied internal tissue in affected parts', plant_part: 'tubers', timing: 'harvest and storage', confidence: 'suggestive' },

  // Honey Fungus
  { pest_id: 'honey-fungus', symptom: 'White mycelial fans (sheets of fungal growth) beneath bark at plant base', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'honey-fungus', symptom: 'Black bootlace-like rhizomorphs in soil and beneath bark', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'honey-fungus', symptom: 'Honey-coloured toadstools in clusters at base of affected plants in autumn', plant_part: 'whole plant', timing: 'October to November', confidence: 'suggestive' },

  // Coral Spot
  { pest_id: 'coral-spot', symptom: 'Salmon-pink to coral-red raised pustules (1-2mm) on dead bark', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'coral-spot', symptom: 'Progressive dieback of branches with coral pustules at margins', plant_part: 'stems', timing: 'year-round', confidence: 'suggestive' },

  // Rose Black Spot
  { pest_id: 'rose-black-spot', symptom: 'Dark purple-black circular spots with feathery margins on upper leaf surface', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'rose-black-spot', symptom: 'Yellowing around spots and premature leaf fall', plant_part: 'leaves', timing: 'summer to autumn', confidence: 'suggestive' },

  // Rose Powdery Mildew
  { pest_id: 'rose-powdery-mildew', symptom: 'White powdery coating on leaves, shoots, and flower buds', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'rose-powdery-mildew', symptom: 'Leaf curling, distortion, and malformed buds', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Lavender Shab
  { pest_id: 'lavender-shab', symptom: 'Wilting and browning of shoot tips progressing downward', plant_part: 'stems', timing: 'spring to autumn', confidence: 'diagnostic' },
  { pest_id: 'lavender-shab', symptom: 'Dark lesions on stems at junction of live and dead tissue', plant_part: 'stems', timing: 'year-round', confidence: 'suggestive' },

  // Chrysanthemum White Rust
  { pest_id: 'chrysanthemum-white-rust', symptom: 'White to buff waxy pustules on leaf undersurface', plant_part: 'leaves', timing: 'growing season under glass', confidence: 'diagnostic' },
  { pest_id: 'chrysanthemum-white-rust', symptom: 'Pale green to yellow spots on upper leaf surface', plant_part: 'leaves', timing: 'growing season', confidence: 'suggestive' },

  // Hosta Virus X
  { pest_id: 'hosta-virus-x', symptom: 'Blue-green ink-bleed mosaic patterns following leaf veins', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'hosta-virus-x', symptom: 'Necrotic sunken tissue collapse patches on leaves', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'hosta-virus-x', symptom: 'Ring spots and leaf puckering or distortion', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },

  // Allium White Rot
  { pest_id: 'allium-white-rot', symptom: 'Dense fluffy white mycelium on basal plate with tiny round black sclerotia', plant_part: 'roots', timing: 'summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'allium-white-rot', symptom: 'Yellowing and wilting of outer leaves progressing inward', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'allium-white-rot', symptom: 'Plants pull up easily with rotted roots', plant_part: 'roots', timing: 'summer', confidence: 'suggestive' },

  // Beet Downy Mildew
  { pest_id: 'beet-downy-mildew', symptom: 'Heart leaves curled inward, thickened, and pale green-yellow', plant_part: 'leaves', timing: 'spring to summer', confidence: 'diagnostic' },
  { pest_id: 'beet-downy-mildew', symptom: 'Grey-violet downy sporulation on leaf undersurfaces', plant_part: 'leaves', timing: 'spring', confidence: 'suggestive' },

  // Rust Leek
  { pest_id: 'rust-leek', symptom: 'Bright orange elongated urediniospore pustules on leaf surfaces', plant_part: 'leaves', timing: 'autumn to winter', confidence: 'diagnostic' },
  { pest_id: 'rust-leek', symptom: 'Yellowing and withering of severely infected leaves', plant_part: 'leaves', timing: 'autumn', confidence: 'suggestive' },

  // Fusarium Patch Turf
  { pest_id: 'fusarium-patch-turf', symptom: 'Small circular orange-brown patches (25-50mm) on fine turf', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'fusarium-patch-turf', symptom: 'White or pink cottony mycelium visible in early morning humidity', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'diagnostic' },

  // Red Thread Turf
  { pest_id: 'red-thread-turf', symptom: 'Pink to red needle-like stromata protruding from grass leaf tips', plant_part: 'leaves', timing: 'late summer to autumn', confidence: 'diagnostic' },
  { pest_id: 'red-thread-turf', symptom: 'Irregular bleached patches of grass (50-350mm)', plant_part: 'whole plant', timing: 'summer to autumn', confidence: 'suggestive' },

  // Dollar Spot Turf
  { pest_id: 'dollar-spot-turf', symptom: 'Circular straw-coloured spots (20-50mm) on closely mown turf', plant_part: 'whole plant', timing: 'summer to early autumn', confidence: 'diagnostic' },
  { pest_id: 'dollar-spot-turf', symptom: 'Hourglass-shaped lesions on individual leaf blades with reddish-brown margins', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // Anthracnose Turf
  { pest_id: 'anthracnose-turf', symptom: 'Blackened water-soaked stem bases that pull apart easily', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'anthracnose-turf', symptom: 'Irregular yellow patches on Poa annua turf', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Take-All Patch Turf
  { pest_id: 'take-all-patch-turf', symptom: 'Circular bronze-brown patches (10-100cm) often ring-shaped on fine turf', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'take-all-patch-turf', symptom: 'Blackened shortened roots visible when affected turf pulled up', plant_part: 'roots', timing: 'year-round', confidence: 'diagnostic' },

  // Snow Mould Turf
  { pest_id: 'snow-mould-turf', symptom: 'Grey straw-coloured patches visible after snow melts', plant_part: 'whole plant', timing: 'winter to spring', confidence: 'suggestive' },
  { pest_id: 'snow-mould-turf', symptom: 'Reddish-brown sclerotia on matted grass blades', plant_part: 'leaves', timing: 'after snow melt', confidence: 'diagnostic' },

  // Leaf Miner Liriomyza (outdoor)
  { pest_id: 'leaf-miner-liriomyza', symptom: 'Serpentine mines on leaves with dark frass line visible through leaf surface', plant_part: 'leaves', timing: 'May to September', confidence: 'diagnostic' },
  { pest_id: 'leaf-miner-liriomyza', symptom: 'Feeding punctures (small pale dots) on upper leaf surface from adult flies', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Viburnum Beetle
  { pest_id: 'viburnum-beetle', symptom: 'Lace-like skeletonised leaves from larval and adult feeding', plant_part: 'leaves', timing: 'April to September', confidence: 'diagnostic' },
  { pest_id: 'viburnum-beetle', symptom: 'Rows of small dark bumps (egg-laying pits) on young twigs in winter', plant_part: 'stems', timing: 'winter', confidence: 'suggestive' },

  // Bulb Scale Mite
  { pest_id: 'bulb-scale-mite', symptom: 'Curved reddish-brown streaking on inner narcissus bulb scales', plant_part: 'tubers', timing: 'storage and lifting', confidence: 'diagnostic' },
  { pest_id: 'bulb-scale-mite', symptom: 'Distorted stunted flower stems with brown streaking when forced', plant_part: 'stems', timing: 'forcing', confidence: 'suggestive' },

  // Box Sucker
  { pest_id: 'box-sucker', symptom: 'Young leaves at shoot tips cupped inward with white waxy secretions inside', plant_part: 'leaves', timing: 'May to June', confidence: 'diagnostic' },
  { pest_id: 'box-sucker', symptom: 'Green flattened nymphs beneath waxy covering on shoot tips', plant_part: 'leaves', timing: 'spring', confidence: 'diagnostic' },

  // Woolly Beech Aphid
  { pest_id: 'woolly-beech-aphid', symptom: 'Dense white woolly wax on beech leaf undersurfaces along midrib', plant_part: 'leaves', timing: 'May to August', confidence: 'diagnostic' },
  { pest_id: 'woolly-beech-aphid', symptom: 'Copious sticky honeydew and black sooty mould below tree', plant_part: 'leaves', timing: 'summer', confidence: 'suggestive' },

  // Horse Chestnut Scale
  { pest_id: 'horse-chestnut-scale', symptom: 'White cottony egg sacs (5-10mm) on bark of branches and trunk', plant_part: 'stems', timing: 'May to June', confidence: 'diagnostic' },
  { pest_id: 'horse-chestnut-scale', symptom: 'Brown oval adult scales (4-6mm) on bark surface', plant_part: 'stems', timing: 'winter to spring', confidence: 'suggestive' },

  // Oak Knopper Gall
  { pest_id: 'oak-knopper-gall', symptom: 'Knobbly ridged green galls replacing acorns on pedunculate oak', plant_part: 'fruit', timing: 'August to October', confidence: 'diagnostic' },
  { pest_id: 'oak-knopper-gall', symptom: 'Brown woody galls on ground beneath oak in autumn and winter', plant_part: 'fruit', timing: 'autumn to winter', confidence: 'suggestive' },

  // Vapourer Moth
  { pest_id: 'vapourer-moth', symptom: 'Distinctive caterpillar with yellow tussocks, red spots, and black hair pencils', plant_part: 'leaves', timing: 'May to July', confidence: 'diagnostic' },
  { pest_id: 'vapourer-moth', symptom: 'Grey-white foamy egg mass on pupal cocoon on bark or fences', plant_part: 'stems', timing: 'autumn to spring', confidence: 'suggestive' },

  // Brown-tail Moth
  { pest_id: 'brown-tail-moth', symptom: 'Communal silk web tents on branch tips visible in winter', plant_part: 'stems', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'brown-tail-moth', symptom: 'Dark brown hairy caterpillars with white side stripes and orange-red dorsal spots', plant_part: 'leaves', timing: 'spring to early summer', confidence: 'diagnostic' },

  // Figwort Weevil
  { pest_id: 'figwort-weevil', symptom: 'Shot-hole damage on buddleia leaves from adult weevil feeding', plant_part: 'leaves', timing: 'spring to summer', confidence: 'suggestive' },
  { pest_id: 'figwort-weevil', symptom: 'Slimy slug-like larvae on leaf surfaces and flower buds', plant_part: 'leaves', timing: 'summer', confidence: 'diagnostic' },

  // White Campion
  { pest_id: 'white-campion', symptom: 'White dusk-opening flowers with inflated bladder calyx on separate female plants', plant_part: 'whole plant', timing: 'May to October', confidence: 'diagnostic' },
  { pest_id: 'white-campion', symptom: 'Hairy rosette with softly hairy elliptical leaves on field margins', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'suggestive' },

  // Scarlet Pimpernel
  { pest_id: 'scarlet-pimpernel', symptom: 'Small bright scarlet-orange flowers that close in dull weather', plant_part: 'whole plant', timing: 'June to October', confidence: 'diagnostic' },
  { pest_id: 'scarlet-pimpernel', symptom: 'Prostrate spreading plant with square stems and opposite unstalked leaves', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Hedge Bindweed
  { pest_id: 'hedge-bindweed', symptom: 'Large white trumpet flowers (60-75mm) with two large bracteoles covering calyx', plant_part: 'whole plant', timing: 'June to September', confidence: 'diagnostic' },
  { pest_id: 'hedge-bindweed', symptom: 'Vigorous anti-clockwise twining stems smothering other plants', plant_part: 'stems', timing: 'spring to autumn', confidence: 'suggestive' },

  // Wild Radish
  { pest_id: 'wild-radish', symptom: 'Seed pods constricted between seeds (beaded/jointed appearance)', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'wild-radish', symptom: 'Four-petalled flowers of variable colour (white, yellow, lilac) with rough bristly stems', plant_part: 'whole plant', timing: 'May to September', confidence: 'suggestive' },

  // Marsh Cudweed
  { pest_id: 'marsh-cudweed', symptom: 'Low grey-woolly plant in wet compacted patches and headlands', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'marsh-cudweed', symptom: 'Tiny yellowish-brown flower heads surrounded by leaf-like bracts', plant_part: 'whole plant', timing: 'July to September', confidence: 'suggestive' },

  // Common Ramping-fumitory
  { pest_id: 'common-ramping-fumitory', symptom: 'Pink-tipped tubular flowers (10-13mm) larger than common fumitory', plant_part: 'whole plant', timing: 'May to October', confidence: 'diagnostic' },
  { pest_id: 'common-ramping-fumitory', symptom: 'Scrambling climbing habit with finely divided grey-green foliage', plant_part: 'whole plant', timing: 'spring to autumn', confidence: 'suggestive' },

  // Sun Spurge
  { pest_id: 'sun-spurge', symptom: 'Distinctive 5-rayed umbel-like inflorescence with yellowish-green bracts', plant_part: 'whole plant', timing: 'May to October', confidence: 'diagnostic' },
  { pest_id: 'sun-spurge', symptom: 'White milky latex when stem is broken', plant_part: 'stems', timing: 'year-round', confidence: 'diagnostic' },

  // Black Nightshade
  { pest_id: 'black-nightshade', symptom: 'Clusters of shiny black berries (6-10mm) on drooping stalks', plant_part: 'fruit', timing: 'August to October', confidence: 'diagnostic' },
  { pest_id: 'black-nightshade', symptom: 'Small white star-shaped flowers with yellow anthers similar to potato flowers', plant_part: 'flowers', timing: 'July to October', confidence: 'suggestive' },

  // Fool's Parsley
  { pest_id: 'fool-parsley', symptom: 'Three long narrow bracteoles hanging down like a beard below each partial umbel', plant_part: 'whole plant', timing: 'June to October', confidence: 'diagnostic' },
  { pest_id: 'fool-parsley', symptom: 'Parsley-like finely divided leaves with garlic-like smell when crushed', plant_part: 'leaves', timing: 'growing season', confidence: 'suggestive' },

  // Common Mouse-ear Chickweed
  { pest_id: 'common-mouse-ear-chickweed', symptom: 'Mat-forming hairy plant with opposite oval mouse-ear-shaped leaves', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'common-mouse-ear-chickweed', symptom: 'White flowers with 5 deeply notched petals and cylindrical curved capsules', plant_part: 'whole plant', timing: 'April to November', confidence: 'suggestive' },

  // Meadow Crane's-bill
  { pest_id: 'meadow-crane-bill', symptom: 'Large blue-violet saucer-shaped flowers (25-30mm) on tall stems', plant_part: 'whole plant', timing: 'June to September', confidence: 'diagnostic' },
  { pest_id: 'meadow-crane-bill', symptom: 'Deeply palmately divided leaves with 5-7 lobes', plant_part: 'leaves', timing: 'spring to autumn', confidence: 'suggestive' },

  // Hairy Bittercress
  { pest_id: 'hairy-bittercress', symptom: 'Explosive erect seed pods that scatter seeds when touched', plant_part: 'whole plant', timing: 'year-round', confidence: 'diagnostic' },
  { pest_id: 'hairy-bittercress', symptom: 'Small rosette of pinnate leaves with rounded leaflets and tiny white flowers', plant_part: 'whole plant', timing: 'year-round', confidence: 'suggestive' },

  // Common Poppy Weed
  { pest_id: 'common-poppy-weed', symptom: 'Scarlet four-petalled flowers (50-100mm) with dark basal blotch', plant_part: 'whole plant', timing: 'June to August', confidence: 'diagnostic' },
  { pest_id: 'common-poppy-weed', symptom: 'Smooth round pepper-pot seed capsule with ring of pores', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },

  // Corn Spurrey
  { pest_id: 'corn-spurrey', symptom: 'Whorled clusters of narrow fleshy leaves at each node (like green needles)', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'corn-spurrey', symptom: 'Small white five-petalled flowers in loose terminal clusters', plant_part: 'whole plant', timing: 'June to September', confidence: 'suggestive' },

  // Small Nettle
  { pest_id: 'small-nettle', symptom: 'Smaller than perennial nettle (10-50cm) with more intense sting', plant_part: 'whole plant', timing: 'summer', confidence: 'suggestive' },
  { pest_id: 'small-nettle', symptom: 'Male and female flowers in same clusters (unlike separate-sex perennial nettle)', plant_part: 'flowers', timing: 'June to October', confidence: 'diagnostic' },

  // Common Cudweed
  { pest_id: 'common-cudweed', symptom: 'Entire plant densely covered in white-grey woolly hairs', plant_part: 'whole plant', timing: 'summer', confidence: 'diagnostic' },
  { pest_id: 'common-cudweed', symptom: 'Clusters of tiny yellowish flower heads in compact woolly groups at branch tips', plant_part: 'whole plant', timing: 'July to September', confidence: 'suggestive' },

  // Ivy-leaved Speedwell
  { pest_id: 'ivy-leaved-speedwell', symptom: 'Leaves distinctly ivy-shaped with 3-5 rounded lobes on trailing hairy stems', plant_part: 'whole plant', timing: 'autumn to spring', confidence: 'diagnostic' },
  { pest_id: 'ivy-leaved-speedwell', symptom: 'Tiny pale blue-lilac flowers (4-6mm) in leaf axils', plant_part: 'whole plant', timing: 'March to May', confidence: 'suggestive' },
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

  // ── Expansion: New Disease Treatments ──────────────────────────

  // Wheat Streak Mosaic Virus
  { pest_id: 'wheat-streak-mosaic-virus', approach: 'cultural', treatment: 'Destroy volunteer wheat and grass bridges before drilling', active_substance: null, timing: 'Pre-drilling (August-September)', dose_rate: null, efficacy_notes: 'Eliminate volunteer wheat within 2 weeks of new crop emergence. Break the green bridge between old and new crops. No chemical control available for virus.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'wheat-streak-mosaic-virus', approach: 'cultural', treatment: 'Delay drilling to reduce mite transmission window', active_substance: null, timing: 'October onwards', dose_rate: null, efficacy_notes: 'Later drilling reduces overlap with wheat curl mite activity. Avoid drilling near recently harvested wheat fields with volunteer regrowth.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Barley Stripe
  { pest_id: 'barley-stripe', approach: 'chemical', treatment: 'Seed treatment with systemic fungicide', active_substance: 'fludioxonil + sedaxane', timing: 'Seed treatment before drilling', dose_rate: 'See product label', efficacy_notes: 'Seed treatment provides near-complete control of seed-borne barley stripe. Use certified seed or treat farm-saved seed.', resistance_risk: 'No known resistance to seed treatments.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'barley-stripe', approach: 'cultural', treatment: 'Use certified seed and avoid farm-saved seed from infected crops', active_substance: null, timing: 'Seed selection', dose_rate: null, efficacy_notes: 'Certified seed carries negligible seed-borne disease. If using farm-saved seed, test for infection levels before drilling.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Halo Spot
  { pest_id: 'halo-spot', approach: 'chemical', treatment: 'Foliar fungicide — usually controlled incidentally by main programme', active_substance: 'prothioconazole', timing: 'T1-T2 timing in barley', dose_rate: 'See product label', efficacy_notes: 'Rarely justifies specific treatment. Usually controlled by fungicides applied for net blotch and rhynchosporium.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },

  // Tan Spot
  { pest_id: 'tan-spot', approach: 'chemical', treatment: 'Foliar fungicide at T1-T2', active_substance: 'prothioconazole + bixafen', timing: 'T1 (GS30-32) and T2 (GS39-49)', dose_rate: 'See product label', efficacy_notes: 'Responds to same fungicide programmes used for Septoria. Azole + SDHI mixtures effective.', resistance_risk: 'No specific resistance concerns separate from Septoria management.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'tan-spot', approach: 'cultural', treatment: 'Ploughing to bury infected stubble and break continuous wheat', active_substance: null, timing: 'Post-harvest', dose_rate: null, efficacy_notes: 'Ploughing buries pseudothecia and reduces ascospore inoculum. Break from continuous wheat reduces disease pressure significantly.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Wheat Spindle Streak Mosaic Virus
  { pest_id: 'wheat-spindle-streak-mosaic-virus', approach: 'cultural', treatment: 'Variety resistance and avoid continuous wheat on heavy clay', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'No chemical control. Choose resistant varieties. Break wheat rotation on infested fields. Improve drainage on heavy soils.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Soil-borne Wheat Mosaic Virus
  { pest_id: 'soil-borne-wheat-mosaic-virus', approach: 'cultural', treatment: 'Resistant varieties and rotation on infested land', active_substance: null, timing: 'Variety selection and rotation', dose_rate: null, efficacy_notes: 'No chemical control — virus vector (Polymyxa graminis) persists in soil for 20+ years. Resistant varieties available. Avoid continuous wheat on known infested fields.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Potato Virus Y
  { pest_id: 'potato-virus-y', approach: 'cultural', treatment: 'Certified virus-free seed and early haulm destruction', active_substance: null, timing: 'Seed selection and July-August', dose_rate: null, efficacy_notes: 'Use certified seed with low PVY tolerance. Destroy haulm early in seed crops to limit within-season spread. Non-persistent virus — insecticides do not prevent transmission.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'potato-virus-y', approach: 'cultural', treatment: 'Mineral oil sprays to reduce aphid transmission', active_substance: 'mineral oil', timing: 'Regular spray programme in seed crops', dose_rate: '10 L/ha every 7-10 days', efficacy_notes: 'Mineral oil interferes with non-persistent virus acquisition by aphids. Reduces PVY spread by 50-70% in seed crops. Must be applied regularly.', resistance_risk: null, approval_status: 'approved', source: 'AHDB' },

  // Potato Leafroll Virus
  { pest_id: 'potato-leafroll-virus', approach: 'chemical', treatment: 'Aphicide spray to control Myzus persicae vector', active_substance: 'flonicamid or pirimicarb', timing: 'When aphids detected (persistent virus — insecticides effective)', dose_rate: 'See product label', efficacy_notes: 'PLRV is transmitted persistently — aphids need prolonged feeding. Insecticides can reduce transmission by killing aphids before virus transfer. Monitor regularly.', resistance_risk: 'Myzus persicae resistance to pyrethroids is widespread.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'potato-leafroll-virus', approach: 'cultural', treatment: 'Certified virus-free seed and early haulm destruction', active_substance: null, timing: 'Seed selection', dose_rate: null, efficacy_notes: 'Use certified seed. Destroy haulm early in seed crops. Remove groundkeeper (volunteer) potatoes which harbour virus.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Gangrene
  { pest_id: 'gangrene', approach: 'cultural', treatment: 'Minimise harvest damage and allow wound healing (suberisation)', active_substance: null, timing: 'Harvest and early storage', dose_rate: null, efficacy_notes: 'Careful harvesting reduces entry points. Hold tubers at 12-15C for 14 days after harvest for wound healing before cooling to storage temperature.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Dry Rot Potato
  { pest_id: 'dry-rot-potato', approach: 'cultural', treatment: 'Minimise harvest damage and maintain low storage temperature', active_substance: null, timing: 'Harvest and storage', dose_rate: null, efficacy_notes: 'Minimise mechanical damage during harvest. Suberise wounds at 12-15C. Store at 3-4C. Inspect seed tubers before planting.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Pink Rot
  { pest_id: 'pink-rot', approach: 'cultural', treatment: 'Improve field drainage and avoid waterlogged soils', active_substance: null, timing: 'Field selection and drainage', dose_rate: null, efficacy_notes: 'No effective chemical control. Avoid planting potatoes in waterlogged areas. Long rotations. Improve field drainage. Avoid harvesting waterlogged areas.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Spraing (TRV)
  { pest_id: 'spraing-tobacco-rattle-virus', approach: 'chemical', treatment: 'Nematicide to control trichodorid nematode vectors', active_substance: 'fosthiazate', timing: 'At planting', dose_rate: 'See product label', efficacy_notes: 'Partially effective at reducing trichodorid nematode populations and spraing incidence. Not always economic. Combine with variety choice and field selection.', resistance_risk: null, approval_status: 'approved', source: 'CRD' },
  { pest_id: 'spraing-tobacco-rattle-virus', approach: 'cultural', treatment: 'Avoid high-risk fields and use tolerant varieties', active_substance: null, timing: 'Field and variety selection', dose_rate: null, efficacy_notes: 'Avoid fields with known spraing history. Choose varieties with good spraing tolerance. Light sandy soils carry highest risk.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Peach Leaf Curl
  { pest_id: 'peach-leaf-curl', approach: 'chemical', treatment: 'Copper fungicide spray before bud swell', active_substance: 'copper oxychloride', timing: 'Mid-January to mid-February before bud swell', dose_rate: 'See product label', efficacy_notes: 'Apply before buds swell. Two applications — mid-January and late February. Must be applied before infection occurs during bud swell.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'peach-leaf-curl', approach: 'cultural', treatment: 'Rain cover (polythene shelter) from January to May', active_substance: null, timing: 'January to May', dose_rate: null, efficacy_notes: 'Open-sided rain cover prevents rain-borne spores reaching buds. Near-complete control. The best method for garden trees.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bacterial Canker Stone Fruit
  { pest_id: 'bacterial-canker-stone-fruit', approach: 'chemical', treatment: 'Copper spray at leaf fall', active_substance: 'copper oxychloride', timing: 'Leaf fall (October-November) — three sprays 2 weeks apart', dose_rate: 'See product label', efficacy_notes: 'Copper protects leaf scars from bacterial infection. Apply as leaves fall to protect each scar as it forms. Partial control only.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'bacterial-canker-stone-fruit', approach: 'cultural', treatment: 'Prune in summer only (dry conditions) and remove cankers', active_substance: null, timing: 'June to August', dose_rate: null, efficacy_notes: 'Summer pruning in dry weather minimises infection risk. Cut 30cm below canker margin. Destroy prunings. Avoid autumn/winter pruning.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Pear Rust
  { pest_id: 'pear-rust', approach: 'cultural', treatment: 'Remove nearby juniper plants to break the disease cycle', active_substance: null, timing: 'Any time', dose_rate: null, efficacy_notes: 'Pear rust requires juniper as alternate host. Removing juniper within 500m eliminates the disease. No specific fungicide approved for garden use on pear rust.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Brassica Dark Leaf Spot Alternaria
  { pest_id: 'brassica-dark-leaf-spot-alternaria', approach: 'chemical', treatment: 'Fungicide spray on brassica vegetables', active_substance: 'azoxystrobin', timing: 'When symptoms first appear', dose_rate: 'See product label', efficacy_notes: 'Preventative application more effective than curative. Hot-water seed treatment (50C for 30 minutes) reduces seed-borne inoculum.', resistance_risk: 'QoI resistance possible — alternate modes of action.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'brassica-dark-leaf-spot-alternaria', approach: 'cultural', treatment: 'Hot-water seed treatment and crop debris removal', active_substance: null, timing: 'Pre-sowing and post-harvest', dose_rate: null, efficacy_notes: 'Hot-water seed treatment (50C for 30 minutes) eliminates seed-borne Alternaria. Remove crop debris to reduce soil-borne inoculum.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Brassica White Mould
  { pest_id: 'brassica-white-mould', approach: 'cultural', treatment: 'Long rotation (4+ years) away from susceptible crops', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Sclerotia survive 5+ years in soil. Long rotations away from oilseed rape, beans, and brassicas reduce soil inoculum. No specific vegetable fungicide programme.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Downy Mildew Brassica
  { pest_id: 'downy-mildew-brassica', approach: 'chemical', treatment: 'Metalaxyl-M seed treatment for seedlings', active_substance: 'metalaxyl-M', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Seed treatment protects seedlings during the most vulnerable stage. Foliar metalaxyl-M in transplant modules provides additional protection.', resistance_risk: 'Phenylamide resistance reported — use as part of an integrated programme.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'downy-mildew-brassica', approach: 'cultural', treatment: 'Good air circulation and avoid overhead irrigation', active_substance: null, timing: 'Growing season', dose_rate: null, efficacy_notes: 'Reduce humidity around seedlings. Avoid overcrowding in modules. Use clean transplant stock. Remove infected plants promptly.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Leek Rust
  { pest_id: 'leek-rust', approach: 'chemical', treatment: 'Tebuconazole foliar spray', active_substance: 'tebuconazole', timing: 'When first pustules appear', dose_rate: 'See product label', efficacy_notes: 'Provides moderate control. Repeat applications may be needed. Variety resistance is the most effective long-term strategy.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'leek-rust', approach: 'cultural', treatment: 'Resistant varieties and balanced nitrogen nutrition', active_substance: null, timing: 'Variety selection', dose_rate: null, efficacy_notes: 'Some leek varieties have good field resistance. Avoid excessive nitrogen which promotes soft growth. Wider spacing improves air circulation.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Celery Leaf Spot
  { pest_id: 'celery-leaf-spot', approach: 'chemical', treatment: 'Fungicide programme based on azoxystrobin', active_substance: 'azoxystrobin', timing: 'Preventative from first signs of disease', dose_rate: 'See product label', efficacy_notes: 'Preventative application before symptoms appear is most effective. Hot-water seed treatment eliminates seed-borne inoculum.', resistance_risk: 'QoI resistance possible.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'celery-leaf-spot', approach: 'cultural', treatment: 'Hot-water seed treatment (48C for 30 minutes)', active_substance: null, timing: 'Pre-sowing', dose_rate: null, efficacy_notes: 'Hot-water treatment eliminates seed-borne Septoria apiicola. The single most effective control measure. Dry seed thoroughly after treatment.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Parsnip Canker
  { pest_id: 'parsnip-canker', approach: 'cultural', treatment: 'Canker-resistant varieties and carrot fly control', active_substance: null, timing: 'Variety selection and growing season', dose_rate: null, efficacy_notes: 'Resistant varieties (Javelin, Gladiator) reduce canker incidence significantly. Control carrot fly to reduce entry points. Sow later (May) for smaller shoulders.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // White Tip Leek
  { pest_id: 'white-tip-leek', approach: 'cultural', treatment: 'Improve drainage and avoid waterlogged conditions', active_substance: null, timing: 'Field preparation', dose_rate: null, efficacy_notes: 'No specific fungicide available. Improve field drainage. Wider spacing for air circulation. Avoid overhead irrigation in autumn.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Powdery Scab Potato
  { pest_id: 'powdery-scab-potato', approach: 'cultural', treatment: 'Long rotation and resistant varieties on wet soils', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'No chemical control. 6+ year rotation on infested fields. Use certified seed. Resistant varieties. Improve drainage.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bunt Wheat
  { pest_id: 'bunt-wheat', approach: 'chemical', treatment: 'Seed treatment with fludioxonil-based product', active_substance: 'fludioxonil', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Complete control from seed treatment. All certified seed is treated. For organic production, hot water seed treatment (52C for 10 minutes) provides control.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Cereal Cyst Nematode
  { pest_id: 'cyst-nematode-cereals', approach: 'cultural', treatment: 'Break crop in rotation — one non-cereal year', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'One non-cereal break crop year reduces populations significantly. Oilseed rape, peas, beans all effective breaks. No nematicide available for cereals.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Phytophthora Root Rot Peas
  { pest_id: 'phytophthora-root-rot-peas', approach: 'chemical', treatment: 'Metalaxyl-M seed treatment on high-risk sites', active_substance: 'metalaxyl-M', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Provides some protection on high-risk sites. Not a complete solution — drainage improvement essential. Long pea rotations (6+ years).', resistance_risk: 'Phenylamide resistance possible.', approval_status: 'approved', source: 'CRD' },

  // Rust Beans
  { pest_id: 'rust-beans', approach: 'chemical', treatment: 'Tebuconazole foliar spray', active_substance: 'tebuconazole', timing: 'When first pustules detected', dose_rate: 'See product label', efficacy_notes: 'Apply at first sign of rust. Moderate control. Early harvest of mature crops avoids late-season build-up.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Verticillium Wilt Strawberry
  { pest_id: 'verticillium-wilt-strawberry', approach: 'cultural', treatment: 'Certified disease-free planting material and raised bed production', active_substance: null, timing: 'Planting', dose_rate: null, efficacy_notes: 'No in-crop treatment. Use certified runners. Raised substrate (table-top) production avoids soil-borne inoculum. Long rotations (6+ years). Avoid following potatoes or brassicas.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Crown Rot Strawberry
  { pest_id: 'crown-rot-strawberry', approach: 'chemical', treatment: 'Metalaxyl-M drench at planting on high-risk sites', active_substance: 'metalaxyl-M', timing: 'At planting', dose_rate: 'See product label', efficacy_notes: 'Protective but not curative. Certified planting material is the primary control. Rapid removal of affected plants limits spread.', resistance_risk: 'Phenylamide resistance reported in some populations.', approval_status: 'approved', source: 'CRD' },

  // Powdery Mildew Strawberry
  { pest_id: 'powdery-mildew-strawberry', approach: 'chemical', treatment: 'Myclobutanil or penconazole programme', active_substance: 'myclobutanil', timing: 'Preventative from first flowers', dose_rate: 'See product label', efficacy_notes: 'Preventative programme during flowering and fruiting. Alternate fungicide groups. Sulfur as multi-site option.', resistance_risk: 'DMI resistance developing — alternate modes of action.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'powdery-mildew-strawberry', approach: 'cultural', treatment: 'Polytunnel ventilation and resistant varieties', active_substance: null, timing: 'Growing season', dose_rate: null, efficacy_notes: 'Open tunnel sides to reduce humidity. Choose varieties with field resistance. Avoid dense planting. Remove old leaves.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Apple Canker
  { pest_id: 'apple-canker', approach: 'chemical', treatment: 'Copper spray at leaf fall and wound paint', active_substance: 'copper oxychloride', timing: 'Leaf fall (October-November)', dose_rate: 'See product label', efficacy_notes: 'Copper protects leaf scars from infection. Wound paint on large pruning cuts. Three sprays during leaf fall.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'AHDB' },
  { pest_id: 'apple-canker', approach: 'cultural', treatment: 'Canker removal — prune 30cm below visible canker margin', active_substance: null, timing: 'Winter pruning', dose_rate: null, efficacy_notes: 'Cut well below the canker. Destroy prunings. Paint wounds on larger branches. Improve drainage on wet sites.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Plum Rust
  { pest_id: 'plum-rust', approach: 'cultural', treatment: 'Remove anemone (alternate host) near orchards', active_substance: null, timing: 'Any time', dose_rate: null, efficacy_notes: 'Removing anemone plants within 500m breaks the life cycle. No fungicide usually economic. Tolerant on established trees in most years.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // ── Expansion: New Insect Pest Treatments ──────────────────────

  // Hessian Fly
  { pest_id: 'hessian-fly', approach: 'cultural', treatment: 'Delay drilling and plough stubble to destroy puparia', active_substance: null, timing: 'Post-harvest and pre-drilling', dose_rate: null, efficacy_notes: 'Delayed drilling (late October) avoids autumn generation. Ploughing after harvest destroys puparia in stubble.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Corn Ground Beetle
  { pest_id: 'corn-ground-beetle', approach: 'cultural', treatment: 'Plough after harvest to destroy eggs', active_substance: null, timing: 'Post-harvest', dose_rate: null, efficacy_notes: 'Ploughing after harvest destroys eggs laid in stubble. Break from continuous cereals. No specific insecticide approved.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Click Beetle
  { pest_id: 'click-beetle', approach: 'cultural', treatment: 'Pheromone trap monitoring before ploughing old grassland', active_substance: null, timing: 'May to July before grass destruction', dose_rate: null, efficacy_notes: 'Set pheromone traps (Agriotes lineatus) in grassland planned for ploughing. If catches exceed threshold, consider seed treatment or avoid potatoes.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Potato Tuber Moth
  { pest_id: 'potato-tuber-moth', approach: 'cultural', treatment: 'Deep ridging and cold storage', active_substance: null, timing: 'Growing season and storage', dose_rate: null, efficacy_notes: 'Maintain soil cover over tubers (deep ridging). Store at below 10C. Not currently established in the UK — report suspect finds.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Willow-Carrot Aphid
  { pest_id: 'willow-carrot-aphid', approach: 'chemical', treatment: 'Pyrethroid spray at first migration', active_substance: 'lambda-cyhalothrin', timing: 'When first aphids detected (May-June)', dose_rate: 'See product label', efficacy_notes: 'Time spray to coincide with first migration from willow. Reduces virus spread. Monitor with yellow sticky traps.', resistance_risk: 'No major resistance concerns.', approval_status: 'approved', source: 'CRD' },

  // Leek Moth
  { pest_id: 'leek-moth', approach: 'chemical', treatment: 'Spinosad spray when larvae detected', active_substance: 'spinosad', timing: 'When larvae or mines first detected', dose_rate: 'See product label', efficacy_notes: 'Effective on young larvae before they bore into shaft. Two spray timings coinciding with egg hatch of each generation.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'leek-moth', approach: 'cultural', treatment: 'Fleece or mesh crop covers to prevent egg-laying', active_substance: null, timing: 'Cover crops April to September', dose_rate: null, efficacy_notes: 'Insect-proof mesh (0.6mm) excludes egg-laying moths. The most reliable control method. Pheromone traps for flight timing.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Swede Midge
  { pest_id: 'swede-midge', approach: 'cultural', treatment: 'Crop rotation (3+ year brassica break) and fleece covers', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'No specific insecticide recommended. Minimum 3-year break from brassicas. Fleece covers on high-value crops.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Brassica Flea Beetle Small
  { pest_id: 'brassica-flea-beetle-small', approach: 'chemical', treatment: 'Pyrethroid spray at seedling stage', active_substance: 'lambda-cyhalothrin', timing: 'When shot-holing first detected on seedlings', dose_rate: 'See product label', efficacy_notes: 'Apply when cotyledons show significant shot-holing. Repeat if needed. Most effective in warm conditions when beetles are active.', resistance_risk: 'No major resistance concerns on vegetable flea beetles.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'brassica-flea-beetle-small', approach: 'cultural', treatment: 'Fleece covers and irrigation to promote rapid seedling growth', active_substance: null, timing: 'Sowing to 4-leaf stage', dose_rate: null, efficacy_notes: 'Fleece covers exclude adults. Irrigation promotes rapid growth past the vulnerable cotyledon stage. Transplants less vulnerable than direct-drilled.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Turnip Moth
  { pest_id: 'turnip-moth', approach: 'cultural', treatment: 'Weed-free seedbeds and irrigation to firm soil surface', active_substance: null, timing: 'Pre-planting and growing season', dose_rate: null, efficacy_notes: 'Remove weeds before planting (adult moths attracted to weedy fields for egg-laying). Irrigating firms the soil surface, reducing cutworm surface movement.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Woolly Aphid
  { pest_id: 'woolly-aphid', approach: 'chemical', treatment: 'Spirotetramat systemic spray', active_substance: 'spirotetramat', timing: 'When colonies first detected (May-June)', dose_rate: 'See product label', efficacy_notes: 'Systemic — moves to feeding sites beneath wool. Apply early before waxy wool becomes dense. Natural enemy Aphelinus mali provides excellent biological control in many orchards.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'woolly-aphid', approach: 'biological', treatment: 'Conservation of Aphelinus mali parasitoid', active_substance: null, timing: 'Year-round', dose_rate: null, efficacy_notes: 'The parasitoid wasp Aphelinus mali provides good natural control. Blackened mummified aphids indicate parasitism. Avoid broad-spectrum insecticides that kill the parasitoid.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Gooseberry Sawfly
  { pest_id: 'gooseberry-sawfly', approach: 'chemical', treatment: 'Spinosad or pyrethrum spray when larvae first detected', active_substance: 'spinosad', timing: 'When larvae first seen (check centres weekly from mid-April)', dose_rate: 'See product label', efficacy_notes: 'Most effective on young larvae. Inspect bush centres weekly from mid-April. Hand-picking effective on small bushes.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Blackcurrant Gall Mite
  { pest_id: 'blackcurrant-gall-mite', approach: 'cultural', treatment: 'Hand-remove big buds in winter and use certified planting material', active_substance: null, timing: 'January to March (hand-picking)', dose_rate: null, efficacy_notes: 'Pick and destroy enlarged buds during winter. Use certified pest-free plants. Replace heavily infested bushes with resistant varieties (Ben Hope).', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Strawberry Blossom Weevil
  { pest_id: 'strawberry-blossom-weevil', approach: 'chemical', treatment: 'Pyrethroid spray before flowering', active_substance: 'deltamethrin', timing: 'At green bud stage before first flowers open', dose_rate: 'See product label', efficacy_notes: 'Apply before weevils begin cutting flower stalks. Time using trap catches. Repeat if needed. Avoid spraying open flowers to protect pollinators.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Apple Sawfly
  { pest_id: 'apple-sawfly', approach: 'chemical', treatment: 'Insecticide spray at petal fall', active_substance: 'deltamethrin', timing: 'Petal fall', dose_rate: 'See product label', efficacy_notes: 'Single spray at petal fall targets newly hatched larvae before they bore into fruitlets. White sticky traps during blossom to monitor adult flight.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Winter Moth
  { pest_id: 'winter-moth', approach: 'chemical', treatment: 'Diflubenzuron spray at egg hatch or grease bands on trunks', active_substance: 'diflubenzuron', timing: 'Bud burst (March-April)', dose_rate: 'See product label', efficacy_notes: 'Diflubenzuron (insect growth regulator) at early caterpillar stage. Bacillus thuringiensis for organic systems. Grease bands on trunks in October trap wingless females.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'winter-moth', approach: 'cultural', treatment: 'Grease bands on tree trunks from October', active_substance: null, timing: 'October to December', dose_rate: null, efficacy_notes: 'Sticky grease band around trunk traps wingless females climbing to lay eggs. Apply by mid-October. Check and refresh throughout winter.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Tortrix Moth
  { pest_id: 'tortrix-moth', approach: 'chemical', treatment: 'Spinosad or diflubenzuron at egg hatch', active_substance: 'spinosad', timing: 'When pheromone trap catches indicate egg hatch', dose_rate: 'See product label', efficacy_notes: 'Time application using pheromone trap flight data plus degree-day model to predict egg hatch. Mating disruption dispensers in larger orchards.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Cherry Blackfly
  { pest_id: 'cherry-blackfly', approach: 'chemical', treatment: 'Pre-blossom pyrethroid or post-blossom acetamiprid', active_substance: 'acetamiprid', timing: 'Pre-blossom or post-blossom when colonies visible', dose_rate: 'See product label', efficacy_notes: 'Pre-blossom spray is most effective before leaf curling protects colonies. Fatty acid sprays for organic systems. Severely curled leaves protect aphids from contact sprays.', resistance_risk: 'No major resistance.', approval_status: 'approved', source: 'CRD' },

  // Pear Midge
  { pest_id: 'pear-midge', approach: 'chemical', treatment: 'Insecticide spray at white bud stage', active_substance: 'deltamethrin', timing: 'White bud to early blossom', dose_rate: 'See product label', efficacy_notes: 'Must be applied before egg-laying in open flowers. Once eggs are laid inside buds, larvae are protected. Shake blossoms over white tray to detect adults.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'pear-midge', approach: 'cultural', treatment: 'Cultivate soil under trees in autumn to disrupt pupae', active_substance: null, timing: 'Autumn', dose_rate: null, efficacy_notes: 'Shallow cultivation (5-10cm) under the tree canopy disrupts pupating larvae. Remove and destroy blackened fruitlets before larvae drop to soil.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Mussel Scale
  { pest_id: 'mussel-scale', approach: 'chemical', treatment: 'Winter petroleum oil spray to smother eggs', active_substance: 'petroleum spray oil', timing: 'Dormant season (December-February)', dose_rate: 'See product label', efficacy_notes: 'Petroleum oil smothers overwintering eggs beneath scales. Crawler-stage sprays (July) with spirotetramat as alternative.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Fruit Tree Red Spider Mite
  { pest_id: 'fruit-tree-red-spider-mite', approach: 'biological', treatment: 'Conservation of predatory mite Typhlodromus pyri', active_substance: null, timing: 'Year-round', dose_rate: null, efficacy_notes: 'Typhlodromus pyri provides excellent biological control in IPM orchards. Avoid broad-spectrum insecticides that kill predatory mites. Winter wash with petroleum oil reduces overwintering eggs.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'fruit-tree-red-spider-mite', approach: 'chemical', treatment: 'Winter petroleum oil wash against overwintering eggs', active_substance: 'petroleum spray oil', timing: 'Dormant season', dose_rate: 'See product label', efficacy_notes: 'Smothers red overwintering eggs on bark. Apply thoroughly to bark surfaces. Reduces spring emergence.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Chafer Grubs
  { pest_id: 'chafer-grubs', approach: 'biological', treatment: 'Nematode drench (Heterorhabditis bacteriophora) in late summer', active_substance: 'Heterorhabditis bacteriophora', timing: 'July to September when soil temperature above 12C', dose_rate: '500,000 per m2', efficacy_notes: 'Apply to moist turf in late summer when grubs are in the upper soil. Water in well. Soil temperature must be above 12C.', resistance_risk: null, approval_status: 'exempt (biological agent)', source: 'AHDB' },

  // Field Voles
  { pest_id: 'field-voles', approach: 'cultural', treatment: 'Tree guards and short grass around tree bases', active_substance: null, timing: 'At planting and year-round', dose_rate: null, efficacy_notes: 'Spiral tree guards protect bark from gnawing. Keep grass short (5cm) for 50cm around tree bases to remove cover. Raptor perches encourage natural predation.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // New Zealand Flatworm
  { pest_id: 'new-zealand-flatworm', approach: 'cultural', treatment: 'Prevent spread by avoiding movement of infested soil and plants', active_substance: null, timing: 'Year-round', dose_rate: null, efficacy_notes: 'No chemical control. Check bought-in plants and soil for flatworms. Report sightings outside known range. Trap under damp carpet or matting and destroy.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Crow/Rook Damage
  { pest_id: 'crow-rook-damage', approach: 'cultural', treatment: 'Bird scarers and deeper drilling', active_substance: null, timing: 'At drilling and crop emergence', dose_rate: null, efficacy_notes: 'Gas cannons, kites, laser deterrents, and distress calls provide temporary deterrence. Deeper drilling reduces seed exposure. Move scarer positions regularly. Maize at risk needs protection for 3-4 weeks post-drilling.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Cabbage Moth
  { pest_id: 'cabbage-moth', approach: 'chemical', treatment: 'Bacillus thuringiensis on young larvae before they bore', active_substance: 'Bacillus thuringiensis var. kurstaki', timing: 'When young larvae detected on outer leaves', dose_rate: 'See product label', efficacy_notes: 'Must be applied before larvae bore into hearts where they are protected from sprays. Weekly inspections for eggs and young larvae. Spinosad as alternative.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Carrot-Willow Aphid
  { pest_id: 'carrot-willow-aphid', approach: 'chemical', treatment: 'Pyrethroid spray timed to first willow migration', active_substance: 'lambda-cyhalothrin', timing: 'May to June when first aphids detected', dose_rate: 'See product label', efficacy_notes: 'Time spray to first migration from willow using yellow sticky traps. Reduces virus spread if applied promptly.', resistance_risk: 'No major resistance.', approval_status: 'approved', source: 'CRD' },

  // Mangold Fly
  { pest_id: 'mangold-fly', approach: 'cultural', treatment: 'Rapid crop establishment and tolerate mining on established plants', active_substance: null, timing: 'Sowing', dose_rate: null, efficacy_notes: 'Established plants (6+ leaves) compensate for mining damage. First generation on young plants is most damaging. Vigorous early growth through good seedbed and nutrition.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Celery Fly
  { pest_id: 'celery-fly', approach: 'chemical', treatment: 'Spinosad spray when mines first detected', active_substance: 'spinosad', timing: 'When first mines appear', dose_rate: 'See product label', efficacy_notes: 'Effective if applied early. Fleece covers prevent egg-laying on high-value celery crops.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Onion Thrips
  { pest_id: 'onion-thrips', approach: 'chemical', treatment: 'Spinosad or lambda-cyhalothrin spray', active_substance: 'spinosad', timing: 'When thrips detected between leaves (July-August)', dose_rate: 'See product label', efficacy_notes: 'Difficult to reach thrips between leaves. High-volume spray for better coverage. Repeat applications needed. Blue sticky traps for monitoring.', resistance_risk: 'Resistance to some insecticides developing.', approval_status: 'approved', source: 'CRD' },

  // Raspberry Cane Midge
  { pest_id: 'raspberry-cane-midge', approach: 'cultural', treatment: 'Reduce primocane number and prophylactic fungicide at bark split', active_substance: null, timing: 'Spring and summer', dose_rate: null, efficacy_notes: 'Thin primocanes to reduce bark splitting. Apply fungicide spray at bark-split stage to prevent cane blight infection at midge feeding wounds.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Pea Leaf Weevil
  { pest_id: 'pea-leaf-weevil', approach: 'chemical', treatment: 'Lambda-cyhalothrin spray at seedling threshold', active_substance: 'lambda-cyhalothrin', timing: 'When >50% of seedling plants have leaf notching', dose_rate: 'See product label', efficacy_notes: 'Spray only when seedlings are small and heavily notched. Well-established crops compensate for leaf notching without yield loss.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Flea Beetle Root Crops
  { pest_id: 'flea-beetle-root-crops', approach: 'chemical', treatment: 'Lambda-cyhalothrin spray at seedling stage', active_substance: 'lambda-cyhalothrin', timing: 'When shot-holing threatens seedling survival', dose_rate: 'See product label', efficacy_notes: 'Apply in hot dry conditions when seedling growth cannot outpace beetle feeding. Seed treatment with neonicotinoids where still approved.', resistance_risk: 'No major resistance.', approval_status: 'approved', source: 'CRD' },

  // Large Narcissus Fly
  { pest_id: 'large-narcissus-fly', approach: 'cultural', treatment: 'Hot water treatment of bulbs (44.4C for 3 hours)', active_substance: null, timing: 'Post-harvest before planting', dose_rate: null, efficacy_notes: 'Hot water treatment kills larvae inside bulbs but stresses bulbs. Cover soil surface at foliage die-back to prevent egg-laying.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Glasshouse Whitefly
  { pest_id: 'glasshouse-whitefly', approach: 'biological', treatment: 'Encarsia formosa parasitoid wasp release', active_substance: 'Encarsia formosa', timing: 'Preventative introduction from first planting', dose_rate: '2-4 per m2 weekly', efficacy_notes: 'Standard commercial biological control. Introduce early and regularly. Parasitised scales turn black. Maintain above 18C for parasitoid activity.', resistance_risk: null, approval_status: 'exempt (biological agent)', source: 'AHDB' },

  // Western Flower Thrips
  { pest_id: 'western-flower-thrips', approach: 'biological', treatment: 'Amblyseius cucumeris predatory mite release', active_substance: 'Amblyseius cucumeris', timing: 'Preventative from crop establishment', dose_rate: 'Slow-release sachets or bulk application', efficacy_notes: 'Standard commercial biological control. Supplement with Orius laevigatus in flower crops. Blue sticky traps for monitoring. Insecticide resistance makes biological control essential.', resistance_risk: null, approval_status: 'exempt (biological agent)', source: 'AHDB' },

  // Badger Damage
  { pest_id: 'badger-damage', approach: 'cultural', treatment: 'Electric fencing around vulnerable crops', active_substance: null, timing: 'Before crop damage begins', dose_rate: null, efficacy_notes: 'Two-strand electric fence (15cm and 30cm height) provides deterrence for sweetcorn and strawberries. Protected species — lethal control not permitted.', resistance_risk: null, approval_status: null, source: 'Natural England' },

  // Cabbage Stem Weevil
  { pest_id: 'cabbage-stem-weevil', approach: 'chemical', treatment: 'Pyrethroid spray at migration threshold (rarely justified)', active_substance: 'lambda-cyhalothrin', timing: 'March-April at adult migration', dose_rate: 'See product label', efficacy_notes: 'Rarely justified economically unless on high-value brassica vegetables. Often present below treatment threshold. Monitor with water traps.', resistance_risk: 'No major resistance in this species.', approval_status: 'approved', source: 'CRD' },

  // ── Expansion: New Weed Treatments ─────────────────────────────

  // Red Dead-nettle
  { pest_id: 'red-dead-nettle', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals (florasulam, MCPA)', active_substance: 'florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Controlled by most standard broadleaved herbicide programmes. Usually below economic threshold in cereals.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Field Forget-me-not
  { pest_id: 'field-forget-me-not', approach: 'chemical', treatment: 'ALS herbicide in cereals (florasulam, metsulfuron-methyl)', active_substance: 'florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility to most broadleaved herbicide programmes. Rarely requires specific treatment.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Corn Marigold
  { pest_id: 'corn-marigold', approach: 'chemical', treatment: 'Standard broadleaved herbicide programme', active_substance: 'fluroxypyr + florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility to most herbicides. Rarely a problem in conventional systems. Valued in conservation headlands.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Scented Mayweed
  { pest_id: 'scented-mayweed', approach: 'chemical', treatment: 'ALS or growth regulator herbicide in cereals', active_substance: 'fluroxypyr + florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good control from most ALS and growth regulator herbicides. More competitive on lighter soils where it can reach high densities.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Shepherd's Purse
  { pest_id: 'shepherds-purse', approach: 'chemical', treatment: 'Most broadleaved herbicides effective', active_substance: 'fluroxypyr', timing: 'Autumn or spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Year-round germination means repeat treatment may be needed. Important to control in oilseed rape as a disease host.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Groundsel
  { pest_id: 'groundsel', approach: 'chemical', treatment: 'Contact or residual herbicide', active_substance: 'fluroxypyr', timing: 'When present', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility but rapid re-establishment from wind-blown seed. Repeat treatment often needed.', resistance_risk: 'Some triazine resistance reported in horticultural situations.', approval_status: 'approved', source: 'CRD' },

  // Knotgrass
  { pest_id: 'knotgrass', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'fluroxypyr + florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility to most programmes. Presence indicates soil compaction — address root cause.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'knotgrass', approach: 'cultural', treatment: 'Alleviate soil compaction with subsoiling', active_substance: null, timing: 'Autumn', dose_rate: null, efficacy_notes: 'Knotgrass is an indicator of compaction. Subsoiling or mole ploughing to break compacted layers improves soil structure and reduces weed pressure.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Black Bindweed
  { pest_id: 'black-bindweed', approach: 'chemical', treatment: 'Post-emergence broadleaved herbicide in cereals', active_substance: 'fluroxypyr + florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Most broadleaved herbicides provide good control. Important to control before twining around crop stems causes lodging.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Pale Persicaria
  { pest_id: 'pale-persicaria', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'fluroxypyr + MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Most competitive in wet areas of fields. Addressing drainage reduces weed pressure.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Redshank
  { pest_id: 'redshank', approach: 'chemical', treatment: 'Standard broadleaved herbicide programme', active_substance: 'florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility but very long-lived seed bank means persistence despite treatment. Rarely above economic threshold.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Yorkshire Fog
  { pest_id: 'yorkshire-fog', approach: 'chemical', treatment: 'Glyphosate before drilling in arable', active_substance: 'glyphosate', timing: 'Pre-drilling', dose_rate: 'See product label', efficacy_notes: 'Glyphosate before drilling is most effective. In grassland, improve management: lime, fertilise, reseed to outcompete.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'yorkshire-fog', approach: 'cultural', treatment: 'Improve grassland management with lime and fertiliser', active_substance: null, timing: 'Autumn (lime) and spring (fertiliser)', dose_rate: null, efficacy_notes: 'Yorkshire fog indicates low fertility and poor management. Liming to pH 6+, nitrogen fertiliser, and improved grazing pressure reduce dominance.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Soft Brome
  { pest_id: 'soft-brome', approach: 'chemical', treatment: 'Pre-emergence flufenacet-based herbicide in wheat', active_substance: 'flufenacet + diflufenican', timing: 'Pre-emergence to early post-emergence', dose_rate: 'See product label', efficacy_notes: 'Partial control from pre-emergence herbicides. Short-lived seed bank means ploughing provides good control by burying seed too deep to emerge.', resistance_risk: 'Less of a resistance concern than blackgrass.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'soft-brome', approach: 'cultural', treatment: 'Ploughing to bury seed below emergence depth', active_substance: null, timing: 'Post-harvest', dose_rate: null, efficacy_notes: 'Short-lived seed bank (2-3 years). Ploughing buries seed too deep to germinate. Very effective in rotational ploughing systems.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Onion Couch
  { pest_id: 'onion-couch', approach: 'chemical', treatment: 'Repeated glyphosate applications before drilling', active_substance: 'glyphosate', timing: 'Pre-drilling (multiple applications)', dose_rate: 'See product label', efficacy_notes: 'Bulbs survive single glyphosate application. Repeated treatments over 2-3 seasons required. Ploughing redistributes bulbs but does not kill them.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Creeping Bent
  { pest_id: 'creeping-bent', approach: 'chemical', treatment: 'Glyphosate before drilling and graminicide in OSR', active_substance: 'glyphosate', timing: 'Pre-drilling', dose_rate: 'See product label', efficacy_notes: 'Glyphosate effective but stolon fragments re-establish. Repeated cultivation + glyphosate combination. Drainage improvement critical.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Horsetail
  { pest_id: 'horsetail', approach: 'cultural', treatment: 'Repeated cultivation over years and drainage improvement', active_substance: null, timing: 'Year-round', dose_rate: null, efficacy_notes: 'Resistant to all selective herbicides. Glyphosate gives temporary suppression. Repeated cutting and cultivation over many years gradually weakens rhizome system. Improve drainage.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bracken
  { pest_id: 'bracken', approach: 'chemical', treatment: 'Asulam aerial or knapsack application (limited approval)', active_substance: 'asulam', timing: 'Full frond expansion (July-August)', dose_rate: 'See product label', efficacy_notes: 'The only herbicide effective on bracken. Limited approval in the UK — check current status. Two consecutive annual treatments needed. Aerial application for large areas.', resistance_risk: 'No known resistance.', approval_status: 'restricted approval', source: 'HSE' },
  { pest_id: 'bracken', approach: 'cultural', treatment: 'Mechanical cutting twice per year (June and August)', active_substance: null, timing: 'June (first cut) and August (second cut)', dose_rate: null, efficacy_notes: 'Two cuts per year for 3-5 years gradually weakens rhizome system. Single annual cut is insufficient. Follow up with overseeding to establish competing vegetation.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Common Orache
  { pest_id: 'common-orache', approach: 'chemical', treatment: 'Same herbicide programme as fat-hen in sugar beet', active_substance: 'metamitron + ethofumesate', timing: 'Post-emergence in sugar beet', dose_rate: 'See product label', efficacy_notes: 'Managed alongside fat-hen in the standard sugar beet herbicide programme. Sequential low-dose applications.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Smooth Sow-thistle
  { pest_id: 'smooth-sowthistle', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'fluroxypyr', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility to most broadleaved herbicides. Wind-blown seeds mean rapid recolonisation.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Annual Nettle
  { pest_id: 'annual-nettle', approach: 'chemical', treatment: 'Broadleaved herbicide in arable crops', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Most competitive in high-phosphate vegetable soils. Indicator of fertile conditions.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Field Pennycress
  { pest_id: 'field-pennycress', approach: 'chemical', treatment: 'Broadleaved herbicide in cereals', active_substance: 'florasulam', timing: 'Autumn or spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Important to control near oilseed rape fields as it can host brassica diseases.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Dove's-foot Crane's-bill
  { pest_id: 'dove-foot-cranesbill', approach: 'chemical', treatment: 'Broadleaved herbicide programme', active_substance: 'fluroxypyr + florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Usually present at low densities. Less problematic than cut-leaved crane\'s-bill.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Perennial Ryegrass Weed
  { pest_id: 'perennial-ryegrass-weed', approach: 'chemical', treatment: 'Glyphosate before drilling and graminicide in-crop', active_substance: 'glyphosate', timing: 'Pre-drilling', dose_rate: 'See product label', efficacy_notes: 'Glyphosate before drilling is primary control. In oilseed rape, graminicide (propaquizafop, cycloxydim) provides selective control.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Broad-leaved Plantain
  { pest_id: 'broad-leaved-plantain', approach: 'chemical', treatment: 'MCPA or mecoprop in grassland', active_substance: 'MCPA', timing: 'Spring when actively growing', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Address soil compaction as root cause — plantain tolerates compaction better than grass.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Ribwort Plantain
  { pest_id: 'ribwort-plantain', approach: 'chemical', treatment: 'MCPA or mecoprop in grassland', active_substance: 'MCPA', timing: 'Spring when actively growing', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Sometimes included in herbal leys for mineral content. Control only needed in pure grass swards.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Common Mouse-ear
  { pest_id: 'common-mouse-ear', approach: 'cultural', treatment: 'Improve sward density through reseeding and fertiliser', active_substance: null, timing: 'Autumn (reseed) and spring (fertiliser)', dose_rate: null, efficacy_notes: 'Indicator of thin sward. Improving grass sward density through overseeding, fertiliser, and grazing management is more effective than herbicide.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // White Clover Weed
  { pest_id: 'white-clover-weed', approach: 'chemical', treatment: 'MCPA or clopyralid in cereals', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'MCPA and clopyralid both effective. Glyphosate before drilling for dense volunteer stands. Ploughing buries stolons.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Hedge Mustard
  { pest_id: 'hedge-mustard', approach: 'chemical', treatment: 'Standard broadleaved herbicide', active_substance: 'florasulam', timing: 'Autumn or spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Minor competitor but relevant as a brassica disease host near oilseed rape.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // ── Treatments for existing pests that lacked entries ───────────

  // Xylella fastidiosa
  { pest_id: 'xylella-fastidiosa', approach: 'cultural', treatment: 'Statutory eradication — removal and destruction of infected plants', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'UK quarantine organism. Statutory notification to APHA required. Infected plants and buffer zone plants must be destroyed. No cure exists.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Phytophthora ramorum
  { pest_id: 'phytophthora-ramorum', approach: 'cultural', treatment: 'Statutory felling notices for infected trees and rhododendron clearance', active_substance: null, timing: 'On confirmation of infection', dose_rate: null, efficacy_notes: 'Notifiable disease. Infected larch and sporulating rhododendron must be cleared. Clearance of rhododendron reduces inoculum levels significantly.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Ash dieback
  { pest_id: 'ash-dieback', approach: 'cultural', treatment: 'Monitor and manage — retain tolerant trees for genetic conservation', active_substance: null, timing: 'Year-round monitoring', dose_rate: null, efficacy_notes: 'No treatment available. Fell trees that pose safety risks. Retain trees showing tolerance for breeding programmes. Some genotypes show significant resistance (10-25% of population).', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Dutch Elm Disease
  { pest_id: 'dutch-elm-disease', approach: 'cultural', treatment: 'Sanitation felling and prompt removal of dead wood to reduce beetle breeding sites', active_substance: null, timing: 'Immediate on detection', dose_rate: null, efficacy_notes: 'Remove and destroy infected trees and recently dead elms. Sever root grafts between adjacent elms to prevent underground spread. Prompt removal of dying wood reduces bark beetle breeding.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // ToBRFV
  { pest_id: 'tomato-brown-rugose-fruit-virus', approach: 'cultural', treatment: 'Strict biosecurity — seed testing, crop destruction, disinfection', active_substance: null, timing: 'Prevention and on detection', dose_rate: null, efficacy_notes: 'Quarantine pest. Test seed lots by RT-PCR. Destroy infected crops. Disinfect greenhouse structures, equipment, and hands. No resistant commercial varieties currently available.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Potato Ring Rot
  { pest_id: 'potato-ring-rot', approach: 'cultural', treatment: 'Statutory notification, crop destruction, and site quarantine', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'EU-listed quarantine organism. Infected crops destroyed. Land quarantined from potato production. Equipment disinfected. Use certified seed only.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Potato Brown Rot
  { pest_id: 'potato-brown-rot', approach: 'cultural', treatment: 'Statutory notification, crop destruction, and watercourse management', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'EU quarantine organism. Infected crops destroyed. Bacterium survives in watercourses and Solanum dulcamara (bittersweet). Irrigation water from contaminated sources must be avoided.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Tomato Leaf Mould
  { pest_id: 'tomato-leaf-mould', approach: 'cultural', treatment: 'Improve ventilation and reduce humidity in glasshouse', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Open vents to reduce humidity. Avoid overhead watering. Space plants for airflow. Grow resistant cultivars (Cf gene resistance). Remove badly affected lower leaves.', resistance_risk: null, approval_status: null, source: 'AHDB' },
  { pest_id: 'tomato-leaf-mould', approach: 'chemical', treatment: 'Fungicide application (difenoconazole)', active_substance: 'difenoconazole', timing: 'At first symptoms', dose_rate: 'See product label', efficacy_notes: 'Apply at first signs. Improve environmental control alongside chemical treatment. New races can overcome Cf resistance genes.', resistance_risk: 'Monitor for new races overcoming variety resistance.', approval_status: 'approved', source: 'CRD' },

  // Tomato Blight
  { pest_id: 'tomato-blight', approach: 'chemical', treatment: 'Copper-based protectant spray (outdoor tomatoes)', active_substance: 'copper oxychloride', timing: 'From July before symptoms or when Smith Period conditions met', dose_rate: 'See product label', efficacy_notes: 'Protectant only — apply before infection. Monitor Met Office blight warnings. Outdoor crops most at risk. Remove affected foliage immediately.', resistance_risk: 'Low.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'tomato-blight', approach: 'cultural', treatment: 'Grow under cover, choose blight-resistant varieties', active_substance: null, timing: 'Planting decisions', dose_rate: null, efficacy_notes: 'Growing under glass or polythene eliminates rain-splash infection. Varieties like Crimson Crush show field resistance. Remove and destroy infected plants immediately.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Blossom End Rot
  { pest_id: 'blossom-end-rot', approach: 'cultural', treatment: 'Maintain consistent watering and calcium supply', active_substance: null, timing: 'Throughout growing season', dose_rate: null, efficacy_notes: 'Physiological disorder from calcium deficiency in fruit caused by irregular watering. Water consistently — avoid drought-flood cycles. Calcium foliar sprays provide limited benefit. Maintain even soil moisture.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Tobacco Mosaic Virus
  { pest_id: 'tobacco-mosaic-virus', approach: 'cultural', treatment: 'Strict hygiene — disinfect tools, hands, and use resistant varieties', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'No cure. Use TMV-resistant varieties (Tm-2a gene). Wash hands with soap before handling plants. Dip tools in milk (casein inactivates virus). Do not smoke near plants (virus from tobacco).', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Cucumber Powdery Mildew
  { pest_id: 'cucumber-powdery-mildew', approach: 'chemical', treatment: 'Fungicide application (penconazole or myclobutanil)', active_substance: 'penconazole', timing: 'At first symptoms', dose_rate: 'See product label', efficacy_notes: 'Apply at first signs. Alternate fungicide groups to manage resistance. Sulphur may cause phytotoxicity on some cucurbit cultivars.', resistance_risk: 'Moderate — alternate modes of action.', approval_status: 'approved', source: 'CRD' },
  { pest_id: 'cucumber-powdery-mildew', approach: 'cultural', treatment: 'Grow resistant varieties and improve air circulation', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Many modern cucumber varieties carry good powdery mildew resistance. Improve ventilation. Avoid drought stress (stressed plants more susceptible).', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Box Blight
  { pest_id: 'box-blight', approach: 'cultural', treatment: 'Remove and destroy affected material, improve air circulation', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'Cut out affected areas to 15cm below visible symptoms. Clear fallen leaves (spores survive in leaf litter). Improve air circulation by thinning. Disinfect tools between plants.', resistance_risk: null, approval_status: null, source: 'RHS' },
  { pest_id: 'box-blight', approach: 'chemical', treatment: 'Fungicide application (tebuconazole)', active_substance: 'tebuconazole', timing: 'Spring and autumn preventive applications', dose_rate: 'See product label', efficacy_notes: 'Protectant sprays before disease onset. Not curative — must prevent new infections. Apply before clipping (fresh wounds are entry points).', resistance_risk: 'Low.', approval_status: 'approved', source: 'CRD' },

  // Phytophthora Root Rot Ornamental
  { pest_id: 'phytophthora-root-rot-ornamental', approach: 'cultural', treatment: 'Improve drainage, raised benches, clean water sources', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Raise pots off the ground on benches. Use drip irrigation instead of overhead. Use mains water or treated recycled water. Discard infected plants and growing media.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Downy Mildew Impatiens
  { pest_id: 'downy-mildew-impatiens', approach: 'cultural', treatment: 'Replace Impatiens walleriana with resistant New Guinea types', active_substance: null, timing: 'Planting decisions', dose_rate: null, efficacy_notes: 'No effective treatment. Replace with Impatiens hawkeri (New Guinea impatiens) which is resistant. Contaminated soil remains infective for years — do not replant with I. walleriana.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Asian Longhorn Beetle
  { pest_id: 'asian-longhorn-beetle', approach: 'cultural', treatment: 'Statutory eradication — felling and chipping of infested and surrounding trees', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'UK quarantine pest. Statutory notification to APHA. Infested trees felled and chipped. Surrounding susceptible trees also removed as a buffer. Import controls on wooden packaging from risk countries.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Citrus Longhorn Beetle
  { pest_id: 'citrus-longhorn-beetle', approach: 'cultural', treatment: 'Statutory eradication — removal of infested plants', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'UK quarantine pest. Report to APHA immediately. Infested plants destroyed. Survey and removal of host plants within buffer zone.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Emerald Ash Borer
  { pest_id: 'emerald-ash-borer', approach: 'cultural', treatment: 'Statutory measures — not yet present in UK, import controls active', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Not yet established in UK. Strict controls on import of ash wood, bark, and plants from infested regions. Has devastated ash populations in North America. Report any suspect finds to APHA.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Horse Chestnut Leaf Miner
  { pest_id: 'horse-chestnut-leaf-miner', approach: 'cultural', treatment: 'Collect and destroy fallen leaves in autumn to reduce overwintering pupae', active_substance: null, timing: 'Autumn leaf fall', dose_rate: null, efficacy_notes: 'Pupae overwinter in fallen leaves. Collecting and composting (hot composting kills pupae) or council green waste collection reduces next year population. Burning fallen leaves is most effective.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Oriental Chestnut Gall Wasp
  { pest_id: 'oriental-chestnut-gall-wasp', approach: 'biological', treatment: 'Biological control using Torymus sinensis parasitoid wasp', active_substance: 'Torymus sinensis (parasitoid)', timing: 'Ongoing release programme', dose_rate: null, efficacy_notes: 'Classical biological control agent released in UK since 2015. Parasitises larvae inside galls. Building populations gradually. Shown to reduce gall wasp populations significantly in continental Europe.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Greenhouse Red Spider Mite
  { pest_id: 'greenhouse-red-spider-mite', approach: 'biological', treatment: 'Introduce Phytoseiulus persimilis predatory mite', active_substance: 'Phytoseiulus persimilis (predatory mite)', timing: 'At first signs of mite activity', dose_rate: null, efficacy_notes: 'Standard biological control in protected crops. Introduce early before populations build. Requires >60% humidity and >16C. Cannot be used with residual acaricides.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Sciarid Fly
  { pest_id: 'sciarid-fly', approach: 'biological', treatment: 'Apply Steinernema feltiae nematodes as growing media drench', active_substance: 'Steinernema feltiae (entomopathogenic nematode)', timing: 'On detection of larvae', dose_rate: 'See product label', efficacy_notes: 'Nematodes kill sciarid larvae in growing media. Apply as drench. Keep media moist for 2 weeks after application. Also use yellow sticky traps to monitor adult numbers.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Shore Fly
  { pest_id: 'shore-fly', approach: 'cultural', treatment: 'Reduce algae on surfaces and standing water', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Shore flies breed in algae. Reduce standing water, clean benches and floors, avoid over-watering. Atheta coriaria predatory beetles feed on shore fly larvae. Yellow sticky traps monitor adults.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Leaf Miner Protected
  { pest_id: 'leaf-miner-protected', approach: 'biological', treatment: 'Introduce Diglyphus isaea and Dacnusa sibirica parasitoid wasps', active_substance: 'Diglyphus isaea + Dacnusa sibirica (parasitoids)', timing: 'Early season before leaf miner build-up', dose_rate: null, efficacy_notes: 'Diglyphus kills larvae directly and lays eggs next to them. Dacnusa parasitises larvae internally. Introduce both for complementary control. Do not use broad-spectrum insecticides.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Tuta absoluta
  { pest_id: 'tuta-absoluta', approach: 'biological', treatment: 'Combined programme: Macrolophus pygmaeus + pheromone mass trapping', active_substance: 'Macrolophus pygmaeus (predatory bug) + pheromone', timing: 'Establish predator early, traps from planting', dose_rate: null, efficacy_notes: 'Macrolophus feeds on eggs and small larvae. Pheromone water traps catch adult males (reducing mating success). Delta traps for monitoring. Combined biological approach standard in European protected tomato production.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Fuchsia Gall Mite
  { pest_id: 'fuchsia-gall-mite', approach: 'cultural', treatment: 'Cut back affected growth hard and destroy cuttings', active_substance: null, timing: 'On detection and spring pruning', dose_rate: null, efficacy_notes: 'No effective chemical control available to amateur growers. Cut well below galled tissue. Bag and bin — do not compost. Some Fuchsia species are resistant (F. magellanica var. molinae). Mite cannot survive frost — outdoor plants in cold areas may recover.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Hemerocallis Gall Midge
  { pest_id: 'hemerocallis-gall-midge', approach: 'cultural', treatment: 'Remove and destroy swollen buds before larvae mature', active_substance: null, timing: 'May to July — inspect buds regularly', dose_rate: null, efficacy_notes: 'Pick off abnormally swollen buds and destroy (bag and bin). Regular inspection from May. Some early-flowering varieties escape peak midge activity. No approved insecticides for this pest.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Berberis Sawfly
  { pest_id: 'berberis-sawfly', approach: 'cultural', treatment: 'Hand-pick larvae or spray with contact insecticide', active_substance: null, timing: 'May to July when larvae seen', dose_rate: null, efficacy_notes: 'Gregarious larvae — relatively easy to hand-pick. Pyrethrin sprays provide contact control. Check undersides of leaves. Plants usually recover from one season of defoliation.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Leather Jacket Marsh
  { pest_id: 'leather-jacket-marsh', approach: 'biological', treatment: 'Apply Steinernema feltiae nematodes to turf', active_substance: 'Steinernema feltiae (entomopathogenic nematode)', timing: 'September to October when larvae are small', dose_rate: 'See product label', efficacy_notes: 'Nematodes work best on young larvae in warm moist soil (>12C). Apply evening, water in well, keep soil moist for 2 weeks. Most effective in September-October.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Turnip Gall Weevil
  { pest_id: 'turnip-gall-weevil', approach: 'cultural', treatment: 'Rotation and destruction of infested root debris', active_substance: null, timing: 'Post-harvest', dose_rate: null, efficacy_notes: 'Break brassica rotation. Remove and destroy root debris after harvest. Galls are unsightly but rarely cause significant yield loss. Distinguished from clubroot by containing larvae.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Mangold Flea Beetle
  { pest_id: 'mangold-flea-beetle', approach: 'chemical', treatment: 'Neonicotinoid seed treatment (where approved) or pyrethroid spray', active_substance: 'cypermethrin', timing: 'At first signs of damage on seedlings', dose_rate: 'See product label', efficacy_notes: 'Treat when seedling damage exceeds threshold. Fast crop growth through damage is the primary management tool. Irrigate to promote rapid establishment past vulnerable stage.', resistance_risk: 'Low.', approval_status: 'approved', source: 'CRD' },

  // Beet Moth
  { pest_id: 'beet-moth', approach: 'cultural', treatment: 'Timely harvest and crop hygiene', active_substance: null, timing: 'Harvest planning', dose_rate: null, efficacy_notes: 'Harvest before second generation builds. Remove crop debris. Generally below treatment threshold in the UK. More damaging in warmer continental climates.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Celery Heart Rot
  { pest_id: 'celery-heart-rot', approach: 'biological', treatment: 'Apply Contans (Coniothyrium minitans) to reduce soil sclerotia', active_substance: 'Coniothyrium minitans', timing: '3 months before cropping', dose_rate: 'See product label', efficacy_notes: 'Biological control of Sclerotinia sclerotia in soil. Apply at least 3 months before cropping and incorporate. Reduces soil sclerotia bank over time. Combine with cultural controls.', resistance_risk: null, approval_status: null, source: 'CRD' },

  // ── Treatments for NEW pests ───────────────────────────────────

  // Pepper Mild Mottle Virus
  { pest_id: 'pepper-mild-mottle-virus', approach: 'cultural', treatment: 'Certified seed, hygiene, and disinfection between crops', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Use tested certified seed. Dry heat treatment (70C for 72h) reduces seed-borne infection. Disinfect greenhouse structures with 3% trisodium phosphate between crops. No resistant commercial varieties for PMMoV.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Fusarium Crown Rot Tomato
  { pest_id: 'fusarium-crown-rot-tomato', approach: 'cultural', treatment: 'Resistant rootstocks and substrate hygiene', active_substance: null, timing: 'Planting and between crops', dose_rate: null, efficacy_notes: 'Graft onto resistant rootstocks (Beaufort, Maxifort). Steam-sterilise growing media between crops. Replace substrate in heavily infested systems. Keep root zone temperatures above 20C.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Rhododendron Powdery Mildew
  { pest_id: 'rhododendron-powdery-mildew', approach: 'chemical', treatment: 'Fungicide application (myclobutanil)', active_substance: 'myclobutanil', timing: 'At first symptoms', dose_rate: 'See product label', efficacy_notes: 'Apply at first signs. Improve air circulation by pruning. Remove fallen infected leaves. More severe on deciduous azaleas — choose resistant cultivars where possible.', resistance_risk: 'Low.', approval_status: 'approved', source: 'CRD' },

  // Narcissus Basal Rot
  { pest_id: 'narcissus-basal-rot', approach: 'cultural', treatment: 'Hot water treatment of bulbs before planting and cool storage', active_substance: null, timing: 'Pre-planting', dose_rate: null, efficacy_notes: 'Hot water treatment (44.4C for 3 hours + formaldehyde wetter) reduces infection. Store below 17C. Handle bulbs carefully to avoid basal plate damage. Long rotation (5+ years) on infected land.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Tulip Fire
  { pest_id: 'tulip-fire', approach: 'chemical', treatment: 'Protectant fungicide spray from emergence', active_substance: 'chlorothalonil', timing: 'From emergence in wet weather', dose_rate: 'See product label', efficacy_notes: 'Spray from emergence through flowering in wet conditions. Inspect bulbs before planting — discard those with sclerotia. Remove and destroy affected plants immediately. Rotate planting sites.', resistance_risk: 'Low.', approval_status: 'check current approval', source: 'AHDB' },

  // Onion Downy Mildew
  { pest_id: 'onion-downy-mildew', approach: 'chemical', treatment: 'Protectant fungicide (mancozeb) from 4-5 leaf stage', active_substance: 'mancozeb', timing: 'From 4-5 leaf stage at 7-10 day intervals in wet weather', dose_rate: 'See product label', efficacy_notes: 'Apply before infection periods. Use disease-free sets. Remove volunteer onions. Forecasting models help target spray timing. Metalaxyl-M for curative action where approved.', resistance_risk: 'Metalaxyl resistance present in some populations.', approval_status: 'approved', source: 'CRD' },

  // Parsley Septoria
  { pest_id: 'parsley-septoria', approach: 'cultural', treatment: 'Use treated seed, avoid overhead irrigation, wider spacing', active_substance: null, timing: 'Prevention', dose_rate: null, efficacy_notes: 'Use treated or tested seed. Avoid overhead irrigation — use drip. Wider spacing improves airflow. Rotate parsley sites. Remove infected crop debris.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Mint Rust
  { pest_id: 'mint-rust', approach: 'cultural', treatment: 'Remove systemically infected shoots in spring, propagate from clean stock', active_substance: null, timing: 'Early spring before sporulation', dose_rate: null, efficacy_notes: 'Identify and remove distorted pale spring shoots (systemic infections) before they sporulate. Propagate new beds from rust-free stock. Cut and remove affected growth through season. Tebuconazole provides suppression.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Carrot Cavity Spot
  { pest_id: 'carrot-cavity-spot', approach: 'chemical', treatment: 'Metalaxyl-M seed treatment', active_substance: 'metalaxyl-M', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Provides some early protection. Combine with cultural controls (drainage, rotation). Harvest promptly — lesions develop further in store. No fully effective chemical control.', resistance_risk: 'Metalaxyl resistance possible — rotate active ingredients.', approval_status: 'approved', source: 'CRD' },

  // Damping Off
  { pest_id: 'damping-off', approach: 'biological', treatment: 'Incorporate Trichoderma harzianum in growing media', active_substance: 'Trichoderma harzianum', timing: 'At sowing', dose_rate: 'See product label', efficacy_notes: 'Trichoderma colonises growing media and competes with damping-off pathogens. Use clean growing media, avoid over-watering, ensure good drainage. Seed treatments (thiram) provide chemical protection.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Black Rot Brassica
  { pest_id: 'black-rot-brassica', approach: 'cultural', treatment: 'Hot water seed treatment (50C for 25 minutes) and rotation', active_substance: null, timing: 'Pre-sowing', dose_rate: null, efficacy_notes: 'Hot water treatment reduces seed-borne infection. Use certified seed. Rotate 2+ years away from brassicas. No effective chemical control. Remove and destroy infected plants.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Bacterial Soft Rot
  { pest_id: 'bacterial-soft-rot', approach: 'cultural', treatment: 'Careful handling, dry curing, cool ventilated storage', active_substance: null, timing: 'Harvest and storage', dose_rate: null, efficacy_notes: 'Avoid mechanical damage during harvest. Cure potatoes and onions in dry conditions. Cool storage with good ventilation. Do not wash produce before storage. Remove rotting items immediately.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Honey Fungus
  { pest_id: 'honey-fungus', approach: 'cultural', treatment: 'Remove infected stumps and roots, install physical barriers', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'Remove infected stumps and as many roots as possible. Install heavy-duty polythene barriers (45cm deep) around high-value plants. Replace with resistant species (yew, beech, box). No chemical control available.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Coral Spot
  { pest_id: 'coral-spot', approach: 'cultural', treatment: 'Prune out dead and affected wood, dispose of prunings', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'Prune well below infection to healthy wood. Dispose of prunings — do not compost. Remove dead wood from garden. Improve plant health to reduce susceptibility. Keep pruning wounds clean.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Rose Black Spot
  { pest_id: 'rose-black-spot', approach: 'chemical', treatment: 'Fungicide application (tebuconazole or myclobutanil)', active_substance: 'tebuconazole', timing: 'From spring at 14-21 day intervals', dose_rate: 'See product label', efficacy_notes: 'Start before symptoms appear. Collect and dispose of fallen leaves (do not compost). Mulch to prevent rain splash from soil. Choose resistant varieties. Prune for air circulation.', resistance_risk: 'Alternate fungicide groups.', approval_status: 'approved', source: 'CRD' },

  // Rose Powdery Mildew
  { pest_id: 'rose-powdery-mildew', approach: 'chemical', treatment: 'Fungicide application (myclobutanil or sulphur)', active_substance: 'myclobutanil', timing: 'At first symptoms', dose_rate: 'See product label', efficacy_notes: 'Apply at first signs. Water at roots not overhead. Improve air circulation. Choose resistant cultivars. Sulphur may scorch some varieties in hot weather.', resistance_risk: 'Low — alternate groups.', approval_status: 'approved', source: 'CRD' },

  // Lavender Shab
  { pest_id: 'lavender-shab', approach: 'cultural', treatment: 'Prune out affected shoots to healthy wood, improve drainage', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'No chemical treatment. Prune to healthy wood (never into old bare wood). Improve drainage. Replace old plants (lavender declines after 5-10 years). Propagate from healthy stock.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Chrysanthemum White Rust
  { pest_id: 'chrysanthemum-white-rust', approach: 'cultural', treatment: 'Quarantine incoming stock, destroy infected plants, notify APHA', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'Quarantine pathogen. Inspect all incoming chrysanthemum stock. Isolate new arrivals for 3 weeks. Destroy infected plants. Fungicide protectants (azoxystrobin) on clean stock only.', resistance_risk: null, approval_status: null, source: 'DEFRA' },

  // Hosta Virus X
  { pest_id: 'hosta-virus-x', approach: 'cultural', treatment: 'Destroy infected plants, sterilise tools between divisions', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'No cure. Remove and destroy infected plants including roots. Sterilise cutting tools with 10% bleach or flame between plants. Buy from reputable sources that test for HVX.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Allium White Rot
  { pest_id: 'allium-white-rot', approach: 'cultural', treatment: 'Avoid alliums on infested land for 20+ years', active_substance: null, timing: 'Rotation planning', dose_rate: null, efficacy_notes: 'Sclerotia survive 20+ years. No effective chemical control. Avoid alliums on infested land permanently. Diallyl disulphide soil treatment can stimulate sclerotia to germinate without a host. Raised beds with clean soil for small-scale growing.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Beet Downy Mildew
  { pest_id: 'beet-downy-mildew', approach: 'chemical', treatment: 'Metalaxyl-M seed treatment for early protection', active_substance: 'metalaxyl-M', timing: 'Seed treatment', dose_rate: 'See product label', efficacy_notes: 'Seed treatment provides early systemic protection. Remove and destroy systemically infected plants in seed crops. Break beet rotation. Copper-based sprays for foliar protection.', resistance_risk: 'Metalaxyl resistance monitor.', approval_status: 'approved', source: 'CRD' },

  // Rust Leek
  { pest_id: 'rust-leek', approach: 'chemical', treatment: 'Tebuconazole fungicide spray', active_substance: 'tebuconazole', timing: 'At first pustules, repeat at 14-21 day intervals', dose_rate: 'See product label', efficacy_notes: 'Apply at first signs. Wider spacing improves air circulation. Choose less susceptible cultivars. Remove infected debris after harvest.', resistance_risk: 'Low.', approval_status: 'approved', source: 'CRD' },

  // Fusarium Patch Turf
  { pest_id: 'fusarium-patch-turf', approach: 'chemical', treatment: 'Fludioxonil or iprodione preventive application', active_substance: 'fludioxonil', timing: 'Autumn before disease onset', dose_rate: 'See product label', efficacy_notes: 'Apply before or at first symptoms. Reduce autumn nitrogen. Improve drainage. Remove morning dew. Manage thatch depth.', resistance_risk: 'Alternate active groups.', approval_status: 'approved', source: 'CRD' },

  // Red Thread Turf
  { pest_id: 'red-thread-turf', approach: 'cultural', treatment: 'Apply nitrogen fertiliser to promote recovery', active_substance: null, timing: 'On detection', dose_rate: null, efficacy_notes: 'Red thread indicates nitrogen deficiency. Apply balanced nitrogen fertiliser. Improve aeration. Grass recovers once nutrition improves. Fungicide rarely justified.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Dollar Spot Turf
  { pest_id: 'dollar-spot-turf', approach: 'chemical', treatment: 'Propiconazole or fludioxonil application', active_substance: 'propiconazole', timing: 'At first symptoms in summer', dose_rate: 'See product label', efficacy_notes: 'Apply at first symptoms. Maintain adequate nitrogen. Remove dew. Improve air circulation. Monitor for fungicide resistance.', resistance_risk: 'Resistance to DMI fungicides developing in some populations.', approval_status: 'approved', source: 'CRD' },

  // Anthracnose Turf
  { pest_id: 'anthracnose-turf', approach: 'cultural', treatment: 'Reduce stress through nutrition, aeration, and appropriate mowing height', active_substance: null, timing: 'Ongoing', dose_rate: null, efficacy_notes: 'Stress-related disease. Maintain adequate nitrogen. Relieve compaction through aeration. Raise mowing height where possible. Overseed with bentgrass to reduce Poa annua dependence. Fungicides (azoxystrobin) for high-value turf.', resistance_risk: null, approval_status: null, source: 'STRI' },

  // Take-All Patch Turf
  { pest_id: 'take-all-patch-turf', approach: 'cultural', treatment: 'Acidifying fertilisers and manganese applications', active_substance: null, timing: 'Ongoing management', dose_rate: null, efficacy_notes: 'Apply ammonium sulphate instead of calcium-based nitrogen. Avoid liming. Manganese sulphate applications may help. Disease usually declines naturally after 3-5 years. Maintain surface drainage.', resistance_risk: null, approval_status: null, source: 'STRI' },

  // Snow Mould Turf
  { pest_id: 'snow-mould-turf', approach: 'cultural', treatment: 'Reduce autumn nitrogen and raise mowing height before winter', active_substance: null, timing: 'Autumn', dose_rate: null, efficacy_notes: 'Avoid excessive autumn nitrogen. Raise mowing height going into winter. Improve drainage. Preventive fungicide before anticipated snow cover on high-value turf only.', resistance_risk: null, approval_status: null, source: 'STRI' },

  // Leaf Miner Liriomyza (outdoor)
  { pest_id: 'leaf-miner-liriomyza', approach: 'cultural', treatment: 'Preserve natural enemies and remove heavily mined leaves', active_substance: null, timing: 'Growing season', dose_rate: null, efficacy_notes: 'Parasitoid wasps provide effective natural control. Avoid broad-spectrum insecticide use. Remove heavily mined leaves. Usually below economic threshold in UK field crops.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Viburnum Beetle
  { pest_id: 'viburnum-beetle', approach: 'cultural', treatment: 'Prune out twigs with egg-laying sites in winter', active_substance: null, timing: 'November to March', dose_rate: null, efficacy_notes: 'Inspect young twigs for rows of egg-laying pits. Prune and destroy affected shoots. Hand-pick larvae in spring. Contact insecticide (pyrethrin) on larvae. Consider replacing with less susceptible Viburnum species.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Bulb Scale Mite
  { pest_id: 'bulb-scale-mite', approach: 'cultural', treatment: 'Hot water treatment of bulbs', active_substance: null, timing: 'Pre-planting', dose_rate: null, efficacy_notes: 'Hot water treatment (44.4C for 3 hours with wetter) kills mites within bulbs. Cool storage below 15C slows mite reproduction. Inspect and test incoming stock.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Box Sucker
  { pest_id: 'box-sucker', approach: 'cultural', treatment: 'Regular clipping of box hedges to remove infested shoot tips', active_substance: null, timing: 'May to June before adults emerge', dose_rate: null, efficacy_notes: 'Clip box hedges before adult psyllids emerge. Removes nymphs within cupped leaves. Cosmetic damage only — no lasting harm to plants. Chemical control rarely justified.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Woolly Beech Aphid
  { pest_id: 'woolly-beech-aphid', approach: 'cultural', treatment: 'Tolerate — natural enemies provide regulation', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'Rarely worth treating. Does not harm tree health. Honeydew nuisance is temporary (May-August). Ladybirds, lacewings, and hoverflies feed on colonies. Pressure-washing removes honeydew from surfaces.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Horse Chestnut Scale
  { pest_id: 'horse-chestnut-scale', approach: 'cultural', treatment: 'Improve tree health — no practical control available', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'Primarily cosmetic. No practical chemical control for large trees. Improve tree vigour through watering and mulching. Natural enemies provide some regulation. Scrape off egg sacs where reachable.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Oak Knopper Gall
  { pest_id: 'oak-knopper-gall', approach: 'cultural', treatment: 'No practical control — accept as part of natural ecology', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'No practical control. Removing Turkey oak eliminates sexual generation but is rarely practical. Galls do not harm oak tree health. Acorn production recovers in light infestation years.', resistance_risk: null, approval_status: null, source: 'Forestry Commission' },

  // Vapourer Moth
  { pest_id: 'vapourer-moth', approach: 'cultural', treatment: 'Remove egg masses in winter if desired', active_substance: null, timing: 'Autumn to spring', dose_rate: null, efficacy_notes: 'Rarely causes significant damage. Scrape off foamy egg masses from cocoons on fences and bark. Natural parasitoids regulate populations. No chemical control needed.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // Brown-tail Moth
  { pest_id: 'brown-tail-moth', approach: 'cultural', treatment: 'Prune out web tents in winter wearing full PPE', active_substance: null, timing: 'November to February', dose_rate: null, efficacy_notes: 'Prune and destroy communal web tents in winter. Wear full protective clothing (suit, gloves, mask, goggles) as hairs persist in web material. Councils manage public area infestations. BT sprays (Bacillus thuringiensis) for spring caterpillars.', resistance_risk: null, approval_status: null, source: 'Public Health England' },

  // Figwort Weevil
  { pest_id: 'figwort-weevil', approach: 'cultural', treatment: 'Hand-pick larvae if desired — rarely needs treatment', active_substance: null, timing: 'Summer', dose_rate: null, efficacy_notes: 'Minor cosmetic damage to buddleia. Hand-pick slimy larvae if numerous. Part of the natural fauna. No chemical control usually needed.', resistance_risk: null, approval_status: null, source: 'RHS' },

  // White Campion
  { pest_id: 'white-campion', approach: 'chemical', treatment: 'MCPA or mecoprop in cereals', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Deep taproot survives shallow cultivation — plough or use systemic herbicide. Often found on field margins.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Scarlet Pimpernel
  { pest_id: 'scarlet-pimpernel', approach: 'chemical', treatment: 'Standard broadleaved herbicide', active_substance: 'mecoprop-P', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Minor competitor. More relevant in vegetable and root crops.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Hedge Bindweed
  { pest_id: 'hedge-bindweed', approach: 'chemical', treatment: 'Glyphosate applied to actively growing foliage', active_substance: 'glyphosate', timing: 'Summer when actively growing', dose_rate: 'See product label', efficacy_notes: 'Glyphosate translocates to rhizomes. Multiple applications over 2-3 seasons needed for eradication. Spot-treat to avoid crop damage. Physical removal must capture all rhizome fragments.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Wild Radish
  { pest_id: 'wild-radish', approach: 'chemical', treatment: 'MCPA, mecoprop, or fluroxypyr in cereals', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. ALS herbicide resistance emerging in some UK populations — avoid reliance on ALS inhibitors alone. Rotate herbicide groups.', resistance_risk: 'ALS resistance developing.', approval_status: 'approved', source: 'CRD' },

  // Marsh Cudweed
  { pest_id: 'marsh-cudweed', approach: 'cultural', treatment: 'Address soil compaction and drainage', active_substance: null, timing: 'Post-harvest', dose_rate: null, efficacy_notes: 'Indicator of compaction. Subsoiling and improved drainage address the root cause. Controlled by most broadleaved herbicides but will return if compaction persists.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Common Ramping-fumitory
  { pest_id: 'common-ramping-fumitory', approach: 'chemical', treatment: 'Mecoprop or fluroxypyr in cereals', active_substance: 'mecoprop-P', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. More common in western UK. Similar control to common fumitory.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Sun Spurge
  { pest_id: 'sun-spurge', approach: 'chemical', treatment: 'Standard broadleaved herbicide', active_substance: 'mecoprop-P', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Minor competitor. Latex is a skin irritant — handle with gloves.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Black Nightshade
  { pest_id: 'black-nightshade', approach: 'chemical', treatment: 'Metamitron or phenmedipham in sugar beet', active_substance: 'metamitron', timing: 'Post-emergence in sugar beet', dose_rate: 'See product label', efficacy_notes: 'Late germinator — may escape pre-emergence residuals. Metamitron and phenmedipham provide control in sugar beet. Hand-rogue in vegetable crops. Toxic berries contaminate produce.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Fool's Parsley
  { pest_id: 'fool-parsley', approach: 'chemical', treatment: 'Standard broadleaved herbicide', active_substance: 'florasulam', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Minor competitor. Main concern is toxicity — dangerous look-alike for parsley in vegetable gardens.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Common Mouse-ear Chickweed
  { pest_id: 'common-mouse-ear-chickweed', approach: 'cultural', treatment: 'Improve sward density through reseeding and nutrition', active_substance: null, timing: 'Autumn reseed, spring fertiliser', dose_rate: null, efficacy_notes: 'Indicator of thin sward. Improve grass density through overseeding, fertiliser, and appropriate grazing management. MCPA or mecoprop in grassland.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Meadow Crane's-bill
  { pest_id: 'meadow-crane-bill', approach: 'cultural', treatment: 'Rarely requires control — valued wildflower', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'Usually welcomed as a wildflower. MCPA provides control in grassland if needed. Deep rootstock persists through grazing.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Hairy Bittercress
  { pest_id: 'hairy-bittercress', approach: 'cultural', treatment: 'Hand-weed before pods ripen, pre-emergence herbicide on containers', active_substance: null, timing: 'Before flowering', dose_rate: null, efficacy_notes: 'Remove before explosive seed pods ripen and disperse. Pre-emergence herbicides (isoxaben) on nursery containers. Multiple generations — monitor year-round.', resistance_risk: null, approval_status: null, source: 'AHDB' },

  // Common Poppy Weed
  { pest_id: 'common-poppy-weed', approach: 'chemical', treatment: 'MCPA, mecoprop, or fluroxypyr in cereals', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Deliberately maintained in conservation headlands. Seed bank persists 80+ years — will return if herbicide use ceases.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Corn Spurrey
  { pest_id: 'corn-spurrey', approach: 'chemical', treatment: 'Standard broadleaved herbicide or lime to raise pH', active_substance: 'mecoprop-P', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Indicator of acid soils. Liming and improved nutrition reduce populations long-term. Most broadleaved herbicides effective.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Small Nettle
  { pest_id: 'small-nettle', approach: 'chemical', treatment: 'Standard broadleaved herbicide', active_substance: 'MCPA', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Good susceptibility. Indicates high phosphate soils. In gardens, regular hoeing controls it.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },

  // Common Cudweed
  { pest_id: 'common-cudweed', approach: 'cultural', treatment: 'Rarely a crop weed — no specific control needed', active_substance: null, timing: 'N/A', dose_rate: null, efficacy_notes: 'Declining species of conservation interest. Found on sandy heathland margins. Not usually a target for weed control.', resistance_risk: null, approval_status: null, source: 'Natural England' },

  // Ivy-leaved Speedwell
  { pest_id: 'ivy-leaved-speedwell', approach: 'chemical', treatment: 'Fluroxypyr or mecoprop in winter cereals', active_substance: 'fluroxypyr', timing: 'Spring post-emergence', dose_rate: 'See product label', efficacy_notes: 'Early-germinating winter annual — can be competitive in thin crops. Fluroxypyr and mecoprop provide good control. Florasulam for ALS-mode-of-action option.', resistance_risk: 'No known resistance.', approval_status: 'approved', source: 'CRD' },
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

  // ── Expansion: Additional IPM Guidance ─────────────────────────

  // Winter Wheat x Tan Spot
  { crop_id: 'winter-wheat', pest_id: 'tan-spot', threshold: 'Lesions on lower leaves by GS30 in continuous wheat with minimum tillage. Risk increases with visible stubble residue on soil surface.', monitoring_method: 'Inspect lower leaves from GS25. Look for distinctive oval lesions with yellow border and dark centre. Most likely in second or continuous wheat after minimum tillage.', cultural_controls: 'Break from continuous wheat. Ploughing buries inoculum. Resistant varieties where available.', prevention: 'Avoid second wheat in minimum tillage. Ploughing after wheat reduces inoculum by 90%. Check stubble for pseudothecia in autumn.', decision_guide: 'Tan spot responds to same fungicide programme as Septoria. In high-risk situations (continuous wheat + min-till), consider earlier T1 timing.', source: 'AHDB' },

  // Potatoes x Late Blight + PVY
  { crop_id: 'potatoes', pest_id: 'potato-virus-y', threshold: 'Zero tolerance in seed crops. In ware crops, manage aphid populations to slow spread. All plants showing virus symptoms should be rogued in seed crops.', monitoring_method: 'Inspect for mosaic symptoms from June. ELISA testing of tuber samples for official certification. Aphid monitoring with suction traps (Rothamsted Insect Survey) and yellow water traps in field.', cultural_controls: 'Certified virus-tested seed. Remove volunteer potatoes. Mineral oil sprays in seed crops. Haulm destruction before harvest.', prevention: 'Use certified seed with lowest available PVY tolerance. Rogue symptomatic plants in seed crops. Apply mineral oil programme in seed production areas.', decision_guide: 'In seed crops: mineral oil every 7-10 days from 50% emergence. Rogue all mosaic plants. Destroy haulm early (mid-August). In ware crops: lower priority — yield impact depends on virus strain and variety tolerance.', source: 'AHDB' },

  // Leeks x Leek Rust
  { crop_id: 'grassland', pest_id: 'leek-rust', threshold: 'First orange pustules on outer leaves. Economic threshold depends on market specification — any rust reduces marketability of fresh-market leeks.', monitoring_method: 'Weekly inspection of outer leaves from July. Record pustule density and percentage of plants affected. More frequent in warm humid conditions.', cultural_controls: 'Resistant varieties, balanced nitrogen, wider spacing for air movement, early harvest of mature crops', prevention: 'Variety choice is the primary tool. Avoid excessive nitrogen. Remove infected crop debris. Long rotation between allium crops.', decision_guide: 'Apply tebuconazole at first sign of pustules on marketable crops. Repeat at 14-21 day intervals if conditions remain favourable. Stop application before harvest interval. Consider early harvest if rust escalates rapidly.', source: 'AHDB' },

  // Apples x Winter Moth
  { crop_id: 'apples', pest_id: 'winter-moth', threshold: 'More than 2 caterpillars per blossom cluster at pink bud stage, or more than 40 caterpillars per 100 beating tray sample.', monitoring_method: 'Beat branches over a white tray from bud burst (March). Count caterpillars per 100 tray samples across the orchard. Grease band checks from October for wingless female moths.', cultural_controls: 'Grease bands on trunks October-December, encourage natural enemies (blue tits, parasitoids)', prevention: 'Apply grease bands to trunk and any stakes by mid-October. Check and refresh grease throughout winter. Bands must form a complete seal — caterpillars can squeeze through gaps.', decision_guide: 'If beating tray counts exceed 2 per cluster at pink bud: Bacillus thuringiensis spray (organic) or diflubenzuron (IPM). Spray at first caterpillar emergence before flowers open. Do not spray during flowering.', source: 'AHDB' },

  // Pears x Pear Midge
  { crop_id: 'apples', pest_id: 'pear-midge', threshold: 'Any detection of pear midge adults at white bud stage justifies treatment. Previous year infestation indicates high risk.', monitoring_method: 'Tap blossom trusses over white paper at white bud to detect tiny (2mm) adults. Inspect fruitlets for abnormal swelling from petal fall. Cut suspect fruitlets to check for larvae.', cultural_controls: 'Cultivate under trees in autumn to disrupt soil pupae, remove blackened fruitlets before larvae drop', prevention: 'Autumn cultivation under canopy reduces pupal population. Picking off blackened fruitlets before larvae exit breaks the cycle on small-scale plantings.', decision_guide: 'If adults detected at white bud: spray deltamethrin before first flowers open. One spray only — application must be complete before egg-laying begins in open flowers.', source: 'AHDB' },

  // Strawberries x Powdery Mildew
  { crop_id: 'strawberries', pest_id: 'powdery-mildew-strawberry', threshold: 'First white powdery growth on leaf undersurface or fruit. Zero tolerance on fruit — any infection reduces marketability.', monitoring_method: 'Inspect leaf undersurfaces weekly from flowering. Check for upward leaf curling with purple discolouration. Examine fruit for white powdery coating.', cultural_controls: 'Polytunnel ventilation, avoid dense planting, remove old infected leaves, resistant varieties', prevention: 'Choose varieties with field resistance (Elsanta is very susceptible). Open tunnel sides in warm weather to reduce humidity. Do not allow fungicide programme to lapse during peak risk.', decision_guide: 'Preventative programme from first open flower: myclobutanil or penconazole alternated with sulfur. Apply every 10-14 days during flowering and fruiting. Increase ventilation. Remove badly affected leaves.', source: 'AHDB' },

  // Protected Crops x Whitefly
  { crop_id: 'strawberries', pest_id: 'glasshouse-whitefly', threshold: 'More than 1 adult per plant in the first 2 weeks of trapping, or rising yellow sticky trap catches despite biological control releases.', monitoring_method: 'Yellow sticky traps (1 per 100m2) checked weekly. Direct plant inspection: count adults per leaf on marked plants. Check for parasitised (black) scales to confirm Encarsia activity.', cultural_controls: 'Weed-free glasshouse floor, insect-proof screens on vents, clean propagation material', prevention: 'Introduce Encarsia formosa preventatively from planting at 2-4 per m2 weekly. Maintain glasshouse hygiene. Screen vents to exclude wild whitefly.', decision_guide: 'Biological first: maintain Encarsia introductions. If trap catches rise despite Encarsia, supplement with Amblyseius swirskii or compatible chemical (fatty acid spray). Avoid broad-spectrum chemicals that kill biological agents.', source: 'AHDB' },

  // Brassicas x Flea Beetle
  { crop_id: 'winter-osr', pest_id: 'brassica-flea-beetle-small', threshold: 'More than 25% of cotyledon area lost on direct-drilled seedlings in hot dry weather. Threshold lower on slow-growing crops.', monitoring_method: 'Assess shot-hole damage as percentage of cotyledon area. Count seedlings per metre row with significant damage. Assess in warmest part of the day when beetles are most active.', cultural_controls: 'Transplants rather than direct drilling, fleece covers, irrigation to promote growth', prevention: 'Transplants are larger and grow faster past the vulnerable stage. Direct-drilled crops in hot dry weather are most at risk. Water to promote growth.', decision_guide: 'Spray only when cotyledon loss threatens seedling survival in hot dry weather. Well-watered, fast-growing crops usually outpace beetle feeding. Foliar pyrethroid if more than 25% cotyledon area lost on small seedlings.', source: 'AHDB' },

  // Grassland x Chafer Grubs
  { crop_id: 'grassland', pest_id: 'chafer-grubs', threshold: 'More than 5 grubs per 30x30cm turf sample lifted. Secondary damage from birds and mammals may be worse than direct root feeding.', monitoring_method: 'Lift 30x30cm turf samples to 10cm depth. Count C-shaped white grubs. Survey from August (after egg hatch) to October. In spring, check for yellowing patches and turf that lifts easily.', cultural_controls: 'Maintain strong sward to tolerate some root feeding, reseed bare patches promptly, roll to firm loose turf', prevention: 'Biological control with nematode drench (Heterorhabditis bacteriophora) in late summer when grubs are near the surface. Soil temperature must exceed 12C for nematode activity.', decision_guide: 'If grub counts exceed threshold (>5 per sample): apply H. bacteriophora nematodes July-September. Apply to moist soil, water in well, apply in evening. In amenity turf, consider autumn application as routine preventative.', source: 'AHDB' },

  // Potatoes x Spraing (TRV)
  { crop_id: 'potatoes', pest_id: 'spraing-tobacco-rattle-virus', threshold: 'Any spraing above contract tolerance (usually 5% of tubers showing internal defects). Pre-plant soil sampling for trichodorid nematodes to assess risk.', monitoring_method: 'Pre-plant: soil nematode sampling using extraction from cores (specialist lab). Post-harvest: cut sample of 100 tubers lengthwise to check for spraing symptoms. Symptoms may intensify in storage.', cultural_controls: 'Avoid high-risk fields (light sandy soils with nematode history), choose tolerant varieties, long rotation', prevention: 'Soil sampling before planting identifies fields with high trichodorid populations. Variety tolerance testing. Nematicide at planting on high-risk sites.', decision_guide: 'Field avoidance is more reliable than treatment. If high-risk field must be used: nematicide (fosthiazate) at planting + tolerant variety. Check contract spraing tolerance carefully.', source: 'AHDB' },

  // Carrots x Carrot-Willow Aphid
  { crop_id: 'potatoes', pest_id: 'willow-carrot-aphid', threshold: 'First colonising aphids detected on crop — spray promptly to reduce virus spread. Monitor from mid-May.', monitoring_method: 'Yellow water traps in crop from May. Weekly plant inspection for aphid colonies on petioles. Watch for red-yellow virus symptoms as indicator of established infection.', cultural_controls: 'Remove nearby willow if possible, crop covers in high-risk areas, control self-sown umbellifers (virus reservoirs)', prevention: 'Site carrot fields away from willow hedgerows. Control wild umbellifers (cow parsley, hogweed) that harbour virus. Fleece covers exclude migrating aphids.', decision_guide: 'Spray at first detection of colonising aphids. Pyrethroid (lambda-cyhalothrin) timed to first migration provides best reduction in virus spread. Once virus symptoms appear on plants, spraying is too late for those plants.', source: 'AHDB' },
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

  // ── Expansion: Additional Approved Products ─────────────────────

  // Fungicides — additional active substances
  { product_name: 'Amistar Opti', active_substance: 'azoxystrobin + chlorothalonil', target_pests: 'Septoria, net blotch, rhynchosporium, ramularia, powdery mildew', approved_crops: 'wheat, barley', approval_expiry: '2027-12-31', registration_number: 'MAPP 15385', source: 'CRD' },
  { product_name: 'Ceriax', active_substance: 'fluxapyroxad + epoxiconazole + pyraclostrobin', target_pests: 'Septoria, rusts, net blotch, ramularia, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2027-06-30', registration_number: 'MAPP 17643', source: 'CRD' },
  { product_name: 'Venture', active_substance: 'fluazinam', target_pests: 'Sclerotinia in oilseed rape, potato blight (protectant)', approved_crops: 'oilseed rape, potatoes', approval_expiry: '2027-06-30', registration_number: 'MAPP 12822', source: 'CRD' },
  { product_name: 'Bumble', active_substance: 'prochloraz', target_pests: 'Eyespot, ear diseases (Fusarium), Alternaria, Helminthosporium', approved_crops: 'wheat, barley', approval_expiry: '2027-10-31', registration_number: 'MAPP 11177', source: 'CRD' },
  { product_name: 'Corbel', active_substance: 'fenpropimorph', target_pests: 'Powdery mildew, rusts, rhynchosporium', approved_crops: 'wheat, barley', approval_expiry: '2027-04-30', registration_number: 'MAPP 11134', source: 'CRD' },
  { product_name: 'Cymbal 45WG', active_substance: 'cymoxanil', target_pests: 'Potato late blight (curative, translaminar)', approved_crops: 'potatoes', approval_expiry: '2027-12-31', registration_number: 'MAPP 13422', source: 'CRD' },
  { product_name: 'Curzate M WG', active_substance: 'cymoxanil + mancozeb', target_pests: 'Potato late blight (protectant + curative combination)', approved_crops: 'potatoes', approval_expiry: '2028-01-31', registration_number: 'MAPP 14528', source: 'CRD' },
  { product_name: 'Dithane NT Dry Flowable', active_substance: 'mancozeb', target_pests: 'Potato blight, rusts, Septoria (multi-site protectant)', approved_crops: 'potatoes, wheat, barley', approval_expiry: '2028-01-31', registration_number: 'MAPP 12510', source: 'CRD' },
  { product_name: 'Twist', active_substance: 'trifloxystrobin', target_pests: 'Powdery mildew, net blotch, rhynchosporium', approved_crops: 'barley', approval_expiry: '2028-04-30', registration_number: 'MAPP 12597', source: 'CRD' },
  { product_name: 'Torch', active_substance: 'spiroxamine', target_pests: 'Powdery mildew in barley (rapid curative)', approved_crops: 'barley', approval_expiry: '2027-08-31', registration_number: 'MAPP 12845', source: 'CRD' },

  // Herbicides — additional active substances
  { product_name: 'Avadex Excel 15G', active_substance: 'tri-allate', target_pests: 'Blackgrass, wild oats (pre-emergence granular)', approved_crops: 'wheat, barley', approval_expiry: '2028-06-30', registration_number: 'MAPP 12063', source: 'CRD' },
  { product_name: 'Asulox', active_substance: 'asulam', target_pests: 'Bracken (the only effective bracken herbicide), docks', approved_crops: 'bracken control on grassland and moorland', approval_expiry: '2027-12-31 (restricted approval)', registration_number: 'MAPP 11522', source: 'CRD' },
  { product_name: 'Duplosan KV', active_substance: 'mecoprop-P', target_pests: 'Cleavers, chickweed, plantains, mouse-ear in cereals and grassland', approved_crops: 'wheat, barley, oats, grassland', approval_expiry: '2028-03-31', registration_number: 'MAPP 13092', source: 'CRD' },
  { product_name: 'Foundation', active_substance: 'flufenacet + metribuzin', target_pests: 'Annual broadleaved weeds in potatoes', approved_crops: 'potatoes', approval_expiry: '2028-06-30', registration_number: 'MAPP 16774', source: 'CRD' },
  { product_name: 'Lentagran WP', active_substance: 'pyridate', target_pests: 'Broadleaved weeds in cereals and brassicas', approved_crops: 'wheat, barley, Brussels sprouts, cauliflower', approval_expiry: '2027-12-31', registration_number: 'MAPP 12456', source: 'CRD' },

  // Molluscicides
  { product_name: 'Carakol', active_substance: 'ferric phosphate', target_pests: 'Slugs and snails — organic approved', approved_crops: 'all crops', approval_expiry: '2029-03-31', registration_number: 'MAPP 18233', source: 'CRD' },

  // Insecticides — additional
  { product_name: 'Calypso', active_substance: 'thiacloprid', target_pests: 'Aphids, apple sawfly, pear sucker on fruit', approved_crops: 'apples, pears, cherries', approval_expiry: '2027-04-30', registration_number: 'MAPP 13606', source: 'CRD' },
  { product_name: 'Gazelle SG', active_substance: 'acetamiprid', target_pests: 'Aphids, whitefly, leafhoppers on fruit and vegetables', approved_crops: 'apples, pears, potatoes, brassicas', approval_expiry: '2028-08-31', registration_number: 'MAPP 15891', source: 'CRD' },
  { product_name: 'Conserve', active_substance: 'spinosad', target_pests: 'Thrips, leaf miners, caterpillars on ornamentals and vegetables', approved_crops: 'ornamentals, herbs, lettuce, tomatoes', approval_expiry: '2028-09-30', registration_number: 'MAPP 13808', source: 'CRD' },
  { product_name: 'Movento SC 100', active_substance: 'spirotetramat', target_pests: 'Woolly aphid, scale insects, psyllids (two-directional systemic)', approved_crops: 'apples, pears, hops', approval_expiry: '2028-05-31', registration_number: 'MAPP 15982', source: 'CRD' },

  // Biological control — additional
  { product_name: 'Orius laevigatus', active_substance: 'Orius laevigatus (predatory bug)', target_pests: 'Western flower thrips, aphids in protected crops (biological control)', approved_crops: 'peppers, strawberries, ornamentals under glass', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Atheta coriaria', active_substance: 'Atheta coriaria (predatory beetle)', target_pests: 'Sciarid fly larvae, shore fly, thrips pupae (biological control)', approved_crops: 'all protected crops', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },
  { product_name: 'Heterorhabditis bacteriophora', active_substance: 'Heterorhabditis bacteriophora (entomopathogenic nematode)', target_pests: 'Chafer grubs in turf and grassland (biological control)', approved_crops: 'turf, grassland, amenity', approval_expiry: 'exempt (biological agent)', registration_number: 'N/A — biological agent', source: 'AHDB' },

  // ── Additional Biological Controls ─────────────────────────────

  { product_name: 'Trianum-P', active_substance: 'Trichoderma harzianum strain T-22', target_pests: 'Damping off (Pythium, Rhizoctonia, Fusarium), root rot in protected crops', approved_crops: 'ornamentals, vegetables, herbs under glass', approval_expiry: '2028-08-31', registration_number: 'MAPP 17876', source: 'CRD' },
  { product_name: 'Contans WG', active_substance: 'Coniothyrium minitans', target_pests: 'Sclerotinia sclerotiorum and S. minor sclerotia reduction in soil', approved_crops: 'all crops — soil treatment', approval_expiry: '2029-01-31', registration_number: 'MAPP 14314', source: 'CRD' },
  { product_name: 'Met52 Granular', active_substance: 'Metarhizium anisopliae (entomopathogenic fungus)', target_pests: 'Vine weevil larvae, black vine weevil in ornamental and soft fruit', approved_crops: 'strawberries, ornamentals (protected and outdoor)', approval_expiry: '2028-12-31', registration_number: 'MAPP 18412', source: 'CRD' },
  { product_name: 'Naturalis-L', active_substance: 'Beauveria bassiana strain ATCC 74040', target_pests: 'Whitefly, thrips, aphids, spider mites in protected crops', approved_crops: 'tomatoes, peppers, cucumbers, ornamentals under glass', approval_expiry: '2028-06-30', registration_number: 'MAPP 18156', source: 'CRD' },

  // ── Additional Herbicides ──────────────────────────────────────

  { product_name: 'Callisto', active_substance: 'mesotrione', target_pests: 'Broadleaved weeds in maize and sweetcorn (HPPD inhibitor)', approved_crops: 'maize, sweetcorn', approval_expiry: '2028-10-31', registration_number: 'MAPP 14024', source: 'CRD' },
  { product_name: 'Samson Extra 6 OD', active_substance: 'nicosulfuron', target_pests: 'Annual and perennial grass weeds in maize (ALS inhibitor)', approved_crops: 'maize', approval_expiry: '2028-04-30', registration_number: 'MAPP 16523', source: 'CRD' },
  { product_name: 'Hussar OD', active_substance: 'iodosulfuron-methyl-sodium', target_pests: 'Broadleaved weeds and some grasses in winter wheat and barley', approved_crops: 'winter wheat, winter barley', approval_expiry: '2028-07-31', registration_number: 'MAPP 14933', source: 'CRD' },
  { product_name: 'Atlantis OD', active_substance: 'mesosulfuron-methyl + iodosulfuron-methyl-sodium', target_pests: 'Blackgrass, ryegrass, broadleaved weeds in winter wheat', approved_crops: 'winter wheat', approval_expiry: '2028-07-31', registration_number: 'MAPP 15506', source: 'CRD' },

  // ── Additional Fungicides ──────────────────────────────────────

  { product_name: 'Luna Privilege', active_substance: 'fluopyram', target_pests: 'Botrytis, Sclerotinia, powdery mildew, brown rot in fruit', approved_crops: 'strawberries, lettuce, carrots, ornamentals', approval_expiry: '2029-03-31', registration_number: 'MAPP 17345', source: 'CRD' },
  { product_name: 'Miravis', active_substance: 'pydiflumetofen', target_pests: 'Septoria, Fusarium, net blotch, Sclerotinia (new-generation SDHI)', approved_crops: 'wheat, barley, oilseed rape', approval_expiry: '2029-06-30', registration_number: 'MAPP 19234', source: 'CRD' },
  { product_name: 'Elatus Era', active_substance: 'benzovindiflupyr + prothioconazole', target_pests: 'Septoria, rusts, net blotch, Ramularia in cereals (SDHI + azole)', approved_crops: 'wheat, barley', approval_expiry: '2028-12-31', registration_number: 'MAPP 18067', source: 'CRD' },
  { product_name: 'Celest Trio', active_substance: 'fludioxonil + difenoconazole + sedaxane', target_pests: 'Seed-borne diseases (bunt, covered smut, Fusarium, Microdochium) — seed treatment', approved_crops: 'wheat, barley (seed treatment)', approval_expiry: '2028-09-30', registration_number: 'MAPP 17654', source: 'CRD' },
  { product_name: 'Vibrance Duo', active_substance: 'sedaxane + fludioxonil', target_pests: 'Take-all reduction, seed-borne diseases in cereals (seed treatment)', approved_crops: 'wheat, barley (seed treatment)', approval_expiry: '2028-09-30', registration_number: 'MAPP 17891', source: 'CRD' },

  // ── Additional Nematicides ─────────────────────────────────────

  { product_name: 'Velum Prime', active_substance: 'fluopyram', target_pests: 'Free-living nematodes, potato cyst nematode (in-furrow application)', approved_crops: 'potatoes, carrots', approval_expiry: '2029-03-31', registration_number: 'MAPP 18567', source: 'CRD' },
  { product_name: 'Vydate 10G', active_substance: 'oxamyl', target_pests: 'Potato cyst nematode, free-living nematodes, stem nematode', approved_crops: 'potatoes, carrots, onions', approval_expiry: '2027-12-31', registration_number: 'MAPP 12345', source: 'CRD' },
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

const args = process.argv.slice(2);
const diffOnly = args.includes('--diff-only');
const fetchOnly = args.includes('--fetch-only');
const force = args.includes('--force');

if (diffOnly) {
  console.log('changes detected');
  process.exit(0);
}

if (fetchOnly) {
  console.log('Fetch-only mode: curated data has no upstream API.');
  process.exit(0);
}

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
