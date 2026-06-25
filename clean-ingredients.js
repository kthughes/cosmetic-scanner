#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// ─── ENV ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing required env vars (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY). Check .env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── CLEANING RULES ───────────────────────────────────────────────────────────

// Rule 9 — Botanical common name removal (case-insensitive match, canonical output)
const BOTANICAL_COMMON_NAMES = new Map([
  ["ricinus communis (castor) seed oil", "Ricinus Communis Seed Oil"],
  ["helianthus annuus (sunflower) seed oil", "Helianthus Annuus Seed Oil"],
  ["mentha piperita (peppermint) oil", "Mentha Piperita Oil"],
  ["theobroma cacao (cocoa) seed butter", "Theobroma Cacao Seed Butter"],
  ["copernicia cerifera (carnauba) wax", "Copernicia Cerifera Wax"],
  ["butyrospermum parkii (shea) butter", "Butyrospermum Parkii Butter"],
  ["fragaria ananassa (strawberry) seed oil", "Fragaria Ananassa Seed Oil"],
  ["fragaria ananassa (strawberry) fruit extract", "Fragaria Ananassa Fruit Extract"],
  ["prunus armeniaca (apricot) kernel oil", "Prunus Armeniaca Kernel Oil"],
  ["ribes nigrum (black currant) seed oil", "Ribes Nigrum Seed Oil"],
  ["rosmarinus officinalis (rosemary) leaf extract", "Rosmarinus Officinalis Leaf Extract"],
  ["rosmarinus officinalis (rosemary) leaf oil", "Rosmarinus Officinalis Leaf Oil"],
  ["glycine soja (soybean) oil", "Glycine Soja Oil"],
  ["sambucus nigra (elder) flower extract", "Sambucus Nigra Flower Extract"],
  ["cucumis sativus (cucumber) fruit extract", "Cucumis Sativus Fruit Extract"],
  ["cucumis sativus (cucumber) fruit water", "Cucumis Sativus Fruit Water"],
  ["cocos nucifera (coconut) oil", "Cocos Nucifera Oil"],
  ["cocos nucifera (coconut) fruit extract", "Cocos Nucifera Fruit Extract"],
  ["persea gratissima (avocado) oil", "Persea Gratissima Oil"],
  ["prunus amygdalus dulcis (sweet almond) oil", "Prunus Amygdalus Dulcis Oil"],
  ["prunus amygdalus dulcis (sweet almond) seed extract", "Prunus Amygdalus Dulcis Seed Extract"],
  ["lavandula angustifolia (lavender) oil", "Lavandula Angustifolia Oil"],
  ["chamomilla recutita (matricaria) flower extract", "Chamomilla Recutita Flower Extract"],
  ["chamomilla recutita (matricaria) flower/leaf extract", "Chamomilla Recutita Flower/Leaf Extract"],
  ["rosa damascena (damask rose) flower water", "Rosa Damascena Flower Water"],
  ["rubus villosus (blackberry) fruit extract", "Rubus Villosus Fruit Extract"],
  ["urtica dioica (nettle) leaf extract", "Urtica Dioica Leaf Extract"],
  ["illicium verum (anise) fruit/seed oil", "Illicium Verum Fruit/Seed Oil"],
  ["pelargonium graveolens (geranium) oil", "Pelargonium Graveolens Oil"],
  ["avena sativa (oat) kernel extract", "Avena Sativa Kernel Extract"],
  ["juglans regia (walnut) shell powder", "Juglans Regia Shell Powder"],
  ["carica papaya (papaya) fruit extract", "Carica Papaya Fruit Extract"],
  ["linum usitatissimum (linseed) seed extract", "Linum Usitatissimum Seed Extract"],
  ["mangifera indica (mango) seed butter", "Mangifera Indica Seed Butter"],
  ["oenothera biennis (evening primrose) extract", "Oenothera Biennis Extract"],
  ["triticum vulgare (wheat) starch", "Triticum Vulgare Starch"],
  ["triticum vulgare (wheat) germ oil", "Triticum Vulgare Germ Oil"],
  ["panthenol (vitamin b5)", "Panthenol"],
  ["tocopherol (vitamin e)", "Tocopherol"],
  ["olea europaea (olive) fruit oil", "Olea Europaea Fruit Oil"],
  ["brassica campestris (rapeseed) seed oil", "Brassica Campestris Seed Oil"],
  ["hamamelis virginiana (witch hazel) leaf extract", "Hamamelis Virginiana Leaf Extract"],
  ["salix alba (willow) bark extract", "Salix Alba Bark Extract"],
  ["citrus aurantium bergamia (bergamot) peel oil", "Citrus Aurantium Bergamia Peel Oil"],
  ["citrus limon (lemon) peel oil", "Citrus Limon Peel Oil"],
  ["cedrus deodara (cedar) wood oil", "Cedrus Deodara Wood Oil"],
  ["citrus paradisi (grapefruit) peel oil", "Citrus Paradisi Peel Oil"],
  ["pyrus malus (apple) fruit extract", "Pyrus Malus Fruit Extract"],
  ["citrus nobilis (mandarin orange) oil", "Citrus Nobilis Oil"],
  ["sea salt (maris sal)", "Maris Sal"],
  ["maris sal (sea salt)", "Maris Sal"],
]);

const AQUA_VARIANTS = new Set([
  "aqua (water)",
  "aqua / water",
  "aqua/water/eau",
  "aqua/water",
  "water (aqua)",
  "water(aqua)",
  "water / aqua",
  "water",
]);

// Returns word tokens (letters only) for overlap calculation
function wordTokens(str) {
  return str.toLowerCase().match(/[a-z]+/g) ?? [];
}

function cleanIngredient(raw) {
  // Rule 1 — Trim
  let s = raw.trim();

  // Rule 1B — Remove trailing footnote markers (*, **, †, +, ‡ and combinations)
  s = s.replace(/[*†+‡]+$/, "").trim();

  // Rule 9 — Botanical common name removal
  const botanicalMatch = BOTANICAL_COMMON_NAMES.get(s.toLowerCase());
  if (botanicalMatch) return botanicalMatch;

  // Rule 2 — Aqua standardisation
  if (AQUA_VARIANTS.has(s.toLowerCase())) return "Aqua";

  // Rule 3 — Parfum standardisation (must check before other rules strip content)
  if (/^(parfum|fragrance)\b/i.test(s)) return "Parfum";

  // Rule 4 — Remove F.I.L / EU batch codes
  s = s.replace(/\(F\.I[LI][\s\S]*?\)/gi, "").trim();
  s = s.replace(/\(FIL[\s\S]*?\)/gi, "").trim();
  s = s.replace(/\(EU[A-Z0-9][\s\S]*?\)/gi, "").trim();

  // Rule 5 — Remove concentration notes like (200ppb), (10ppm)
  s = s.replace(/\(\d+\s*pp[bm]\)/gi, "").trim();

  // Rule 6 — Remove square bracket content unless it contains "unclear"
  s = s.replace(/\[[^\]]*\]/g, (match) => {
    return /unclear/i.test(match) ? match : "";
  }).trim();

  // Rule 7 — Standardise CI colour codes
  // "CI77891" → "CI 77891"
  s = s.replace(/\bCI(\d{5})\b/g, "CI $1");
  // "Blue 1 (CI 42090)" style → "CI 42090"
  s = s.replace(/^[A-Za-z]+\s+\d+\s*\(CI\s*(\d{5})\)$/i, (_, num) => `CI ${num}`);
  // "CI NNNNN (anything)" or "CI NNNNN/anything" → keep only "CI NNNNN"
  s = s.replace(/^(CI\s*\d{5})\s*[\s/[(].*$/i, (_, ci) => ci.replace(/\s+/, " ").replace(/CI(\d)/, "CI $1"));

  // Rule 10 — Remove duplicate parenthetical restatement
  const trailingParen = s.match(/^(.*)\(([^)]+)\)\s*$/);
  if (trailingParen) {
    const outside = trailingParen[1].trim();
    const inside = trailingParen[2].trim();
    const outsideWords = new Set(wordTokens(outside));
    const insideWords = wordTokens(inside);
    if (outsideWords.size > 0 && insideWords.length > 0) {
      const overlap = insideWords.filter((w) => outsideWords.has(w)).length;
      if (overlap / insideWords.length > 0.5) {
        s = outside;
      }
    }
  }

  // Rule 11 — Vinegar/Acetum standardisation
  if (/vinegar|^acetum$|vinegar\/acetum\/vinaigre|vinegar\s*\(acetum\)/i.test(s)) return "Acetum";

  return s.trim();
}

function cleanIngredientsList(ocrRaw) {
  const safed = ocrRaw
    .replace(/1,2-hexanediol/gi, "HEXANEDIOL_PLACEHOLDER")
    .replace(/hydroxypropyl guar,\s*hydroxypropyltrimonium chloride/gi, "HYDROXYPROPYL_GUAR_PLACEHOLDER");
  const cleaned = safed
    .split(",")
    .map(cleanIngredient)
    .filter((s) => s.length > 0)
    .join(", ");
  return cleaned
    .replace(/HEXANEDIOL_PLACEHOLDER/g, "1,2-Hexanediol")
    .replace(/HYDROXYPROPYL_GUAR_PLACEHOLDER/g, "Hydroxypropyl Guar Hydroxypropyltrimonium Chloride");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, brand, name, qc_status, ingredients_ocr_raw")
    .not("ingredients_ocr_raw", "is", null)
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Failed to fetch products:", fetchError.message);
    process.exit(1);
  }

  const total = products.length;
  console.log(`Found ${total} product(s) to clean.\n`);

  let processed = 0;
  let flaggedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`Cleaning ${i + 1}/${total}: ${product.brand} ${product.name}`);

    try {
      const cleanedText = cleanIngredientsList(product.ingredients_ocr_raw);

      const hasUnclear = /\[unclear\]/i.test(product.ingredients_ocr_raw);
      let newQcStatus;
      if (product.qc_status === "approved") {
        newQcStatus = "approved";
      } else if (hasUnclear) {
        newQcStatus = "flagged_for_laptop";
      } else {
        newQcStatus = "pending";
      }

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("products")
        .update({
          ingredients_cleaned: cleanedText,
          ingredients_cleaned_at: now,
          ingredients_verified: cleanedText,
          ingredients_verified_at: now,
          qc_status: newQcStatus,
        })
        .eq("id", product.id);

      if (updateError) throw new Error(`Update failed: ${updateError.message}`);

      processed++;
      if (hasUnclear) flaggedCount++;
    } catch (err) {
      errorCount++;
      console.error(`  Error: ${err.message}`);
    }
  }

  console.log("\n── Summary ──────────────────────────");
  console.log(`Total processed:    ${processed}`);
  console.log(`Flagged for laptop: ${flaggedCount}`);
  console.log(`Errors:             ${errorCount}`);
}

main();
