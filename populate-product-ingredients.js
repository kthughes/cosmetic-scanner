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

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, brand, name, variant, barcode, qc_status, ingredients_verified")
    .not("ingredients_verified", "is", null)
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Failed to fetch products:", fetchError.message);
    process.exit(1);
  }

  const total = products.length;
  console.log(`Found ${total} product(s) to populate.\n`);

  let processed = 0;
  let totalRows = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    try {
      const { error: deleteError } = await supabase
        .from("product_ingredients")
        .delete()
        .eq("product_id", product.id);
      if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

      const ingredients = product.ingredients_verified
        .split(", ")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (ingredients.length > 0) {
        const now = new Date().toISOString();
        const rows = ingredients.map((name, index) => ({
          product_id: product.id,
          ingredient_name: name,
          raw_text: name,
          position: index + 1,
          brand: product.brand,
          product_name: product.name,
          variant: product.variant ?? null,
          barcode: product.barcode,
          created_at: now,
        }));

        const { error: insertError } = await supabase
          .from("product_ingredients")
          .insert(rows);
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

        totalRows += ingredients.length;
      }

      processed++;
      console.log(`Populated ${i + 1}/${total}: ${product.brand} ${product.name} - ${ingredients.length} ingredients`);
    } catch (err) {
      errorCount++;
      console.error(`  Error (${product.brand} ${product.name}): ${err.message}`);
    }
  }

  console.log("\n── Summary ──────────────────────────");
  console.log(`Products processed:      ${processed}`);
  console.log(`Ingredient rows inserted: ${totalRows}`);
  console.log(`Errors:                  ${errorCount}`);
}

main();
