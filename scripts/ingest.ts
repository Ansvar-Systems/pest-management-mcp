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
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('data_version', '1.0.0')", []);

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
