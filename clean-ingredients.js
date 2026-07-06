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

async function loadCleanupRules() {
  try {
    const { data, error } = await supabase
      .from('cleanup_rules')
      .select('raw_name, cleaned_name');
    if (error || !data) return new Map();
    console.log(`Loaded ${data.length} cleanup rules from database`);
    return new Map(data.map(r => [r.raw_name.toLowerCase(), r.cleaned_name]));
  } catch (e) {
    console.log('Could not load cleanup rules:', e.message);
    return new Map();
  }
}

const AQUA_VARIANTS = new Set([
  "aqua (water)",
  "aqua / water",
  "aqua/water/eau",
  "aqua/water",
  "water/aqua/eau",
  "water/aqua",
  "water (aqua)",
  "water(aqua)",
  "water / aqua",
  "water",
]);

// Returns word tokens (letters only) for overlap calculation
function wordTokens(str) {
  return str.toLowerCase().match(/[a-z]+/g) ?? [];
}

function cleanIngredient(raw, cleanupRules = new Map()) {
  // Rule 1 — Trim
  let s = raw.trim();

  // Rule 1B — Remove trailing footnote markers (*, **, †, +, ‡ and combinations)
  s = s.replace(/[*†+‡]+$/, "").trim();

  // Rule 1C — Bilingual slash splitting: keep only the left side of " / "
  if (/ \/ /.test(s) && !/^(parfum|fragrance)\b/i.test(s)) {
    const left = s.split(" / ")[0].trim();
    if (left.length >= 2) s = left;
  }

  // Rule 9 — Cleanup rules lookup
  const ruleMatch = cleanupRules.get(s.toLowerCase());
  if (ruleMatch) return ruleMatch;

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

function cleanIngredientsList(ocrRaw, cleanupRules = new Map()) {
  const safed = ocrRaw
    .replace(/1,\s*2-hexanediol/gi, "HEXANEDIOL_PLACEHOLDER")
    .replace(/hydroxypropyl guar,\s*hydroxypropyltrimonium chloride/gi, "HYDROXYPROPYL_GUAR_PLACEHOLDER")
    .replace(/2-oleamido-1,3-octadecanediol/gi, "OLEAMIDO_PLACEHOLDER")
    .replace(/2-oleamido-1,\s*3\s*octadecanediol/gi, "OLEAMIDO_PLACEHOLDER");
  const cleaned = safed
    .split(",")
    .map(s => cleanIngredient(s, cleanupRules))
    .filter((s) => s.length > 0)
    .join(", ");
  return cleaned
    .replace(/HEXANEDIOL_PLACEHOLDER/g, "1,2-Hexanediol")
    .replace(/HYDROXYPROPYL_GUAR_PLACEHOLDER/g, "Hydroxypropyl Guar Hydroxypropyltrimonium Chloride")
    .replace(/OLEAMIDO_PLACEHOLDER/g, "2-Oleamido-1,3-Octadecanediol");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, brand, name, qc_status, ingredients_ocr_raw")
    .not("ingredients_ocr_raw", "is", null)
    .neq("qc_status", "rejected")
    .neq("qc_status", "approved")
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Failed to fetch products:", fetchError.message);
    process.exit(1);
  }

  const cleanupRules = await loadCleanupRules();

  const total = products.length;
  console.log(`Found ${total} product(s) to clean.\n`);

  let processed = 0;
  let flaggedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`Cleaning ${i + 1}/${total}: ${product.brand} ${product.name}`);

    try {
      const cleanedText = cleanIngredientsList(product.ingredients_ocr_raw, cleanupRules);

      const hasUnclear = /\[unclear\]/i.test(product.ingredients_ocr_raw);
      let newQcStatus;
      if (product.qc_status === "approved" || product.qc_status === "rejected") {
        newQcStatus = product.qc_status;
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
