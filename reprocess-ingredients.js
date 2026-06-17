#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// ─── ENV ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
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
const ANTHROPIC_API_KEY = env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing required env vars (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_ANTHROPIC_API_KEY). Check .env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── PROMPTS (mirror of analyseIngredientsWithClaude in app/(tabs)/index.tsx) ─

const SINGLE_PROMPT =
  "This image shows the back of a cosmetic product with an ingredients list. Transcribe the ingredients list EXACTLY as written, character for character. Ingredients may be separated by commas, dots, middle dots (·), semicolons, or bullet points - treat all of these as separators between ingredients. Do not add, remove, invent, or substitute any ingredients. Do not use common 'typical' ingredient lists from memory - only transcribe what is visibly written in THIS image. If a word is genuinely illegible, write [unclear] for that word only. Be aware that some INCI ingredient names contain commas as part of the chemical name itself, not as separators - for example '1,2-Hexanediol', '1,3-Propanediol', '2,3-Butanediol'. These numeric prefixes with commas are part of a single ingredient name and must NOT be split into separate items. Use your knowledge of cosmetic chemistry to recognise these patterns and keep them as one ingredient. Return ONLY a comma-separated list of ingredients in the exact order they appear, with no other text or commentary.";

const MULTI_PROMPT =
  SINGLE_PROMPT +
  " These two images may show ingredients lists that continue from one to the other - combine them into a single ordered list.";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizeIngredient(name) {
  if (name === "[unclear]") return "[unclear]";
  return name
    // Title case each run of letters: first letter upper, rest lower
    .replace(/[a-zA-Z]+/g, (word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    // Restore CI colorant codes (e.g. "Ci 17200" → "CI 17200")
    .replace(/\bCi(?=\s+\d)/g, "CI")
    // Restore [unclear] to lowercase in case it appeared mid-ingredient
    .replace(/\[Unclear\]/g, "[unclear]");
}

async function imageUrlToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status}): ${url}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function analyseIngredients(base64Image1, base64Image2) {
  const content = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image1 } },
    ...(base64Image2
      ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image2 } }]
      : []),
    { type: "text", text: base64Image2 ? MULTI_PROMPT : SINGLE_PROMPT },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const json = await response.json();
  const text = json.content?.[0]?.text?.trim() ?? "";
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeIngredient);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, brand, name, variant, barcode, product_type, qc_status, ingredient_image_url, ingredient_image_url_2")
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("Failed to fetch products:", fetchError.message);
    process.exit(1);
  }

  const total = products.length;
  console.log(`Found ${total} product(s) to process.\n`);

  let processed = 0;
  let flaggedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (product.qc_status === "approved") {
      skippedCount++;
      continue;
    }

    console.log(`Processing ${i + 1}/${total}: ${product.brand} ${product.name} - writing to ingredients_ocr_raw`);

    try {
      if (!product.ingredient_image_url) {
        console.log("  Skipped — no ingredient image URL.");
        continue;
      }

      const base64Image1 = await imageUrlToBase64(product.ingredient_image_url);
      const base64Image2 = product.ingredient_image_url_2
        ? await imageUrlToBase64(product.ingredient_image_url_2)
        : undefined;

      const ingredients = await analyseIngredients(base64Image1, base64Image2);
      const ingredientsText = ingredients.join(", ");
      const hasFlagged = ingredientsText.includes("[unclear]");
      const newStatus = hasFlagged ? "flagged_for_laptop" : "pending";

      const { error: updateError } = await supabase
        .from("products")
        .update({
          ingredients_ocr_raw: ingredientsText,
          ingredients_ocr_raw_created_at: new Date().toISOString(),
          qc_status: newStatus,
        })
        .eq("id", product.id);

      if (updateError) throw new Error(`Product update failed: ${updateError.message}`);

      const { error: deleteError } = await supabase.from("product_ingredients").delete().eq("product_id", product.id);
      if (deleteError) throw new Error(`Ingredients delete failed: ${deleteError.message}`);

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

        const { error: insertError } = await supabase.from("product_ingredients").insert(rows);
        if (insertError) throw new Error(`Ingredients insert failed: ${insertError.message}`);
      }

      processed++;
      if (hasFlagged) flaggedCount++;
      console.log(`  Done — ${ingredients.length} ingredient(s)${hasFlagged ? " ⚠️  flagged for laptop" : ""}`);
    } catch (err) {
      errorCount++;
      console.error(`  Error: ${err.message}`);
    }

    if (i < products.length - 1) {
      await sleep(1000);
    }
  }

  console.log("\n── Summary ──────────────────────────");
  console.log(`Total processed:    ${processed}`);
  console.log(`Flagged for laptop: ${flaggedCount}`);
  console.log(`Errors:             ${errorCount}`);
  console.log(`Skipped (approved): ${skippedCount}`);
}

main();
