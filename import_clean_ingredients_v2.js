const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function importIngredients() {
  const data = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'clean_ingredients_import_v2.json'), 'utf8')
  );

  console.log(`Importing ${data.length} ingredients (Title Case v2)...`);

  console.log('Starting import with upsert (handles duplicates safely)...\n');

  const BATCH_SIZE = 200;
  let imported = 0;
  let errors = 0;

  const mapped = data.map(r => ({
    inci_name: r.inci_name || null,
    alternative_names: r.alternative_names || null,
    cas_number: r.cas_number || null,
    einecs_number: r.einecs_number || null,
    chemical_name: r.chemical_name || null,
    function: r.function || null,
    banned: r.banned || null,
    restricted: r.restricted || null,
    annex_ii_ref: r.annex_ii_ref || null,
    annex_iii_ref: r.annex_iii_ref || null,
    annex_iv_ref: r.annex_iv_ref || null,
    annex_v_ref: r.annex_v_ref || null,
    annex_vi_ref: r.annex_vi_ref || null,
    product_type: r.product_type || null,
    max_concentration: r.max_concentration || null,
    restriction_details: r.restriction_details || null,
    wording: r.wording || null,
    cmr: r.cmr || null,
    risk_score: r.risk_score || 0,
    sccs_opinion: r.sccs_opinion || null,
    source: r.source || null,
    source_date: r.source_date || null,
  })).filter(r => r.inci_name);

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('ingredients')
      .upsert(batch, { onConflict: 'inci_name' });

    if (error) {
      console.error(`Batch ${i} error:`, error.message);
      errors++;
    } else {
      imported += batch.length;
      if (imported % 2000 === 0 || imported === mapped.length) {
        console.log(`✅ ${imported}/${mapped.length}`);
      }
    }
    await new Promise(r => setTimeout(r, 50));
  }

  console.log('\n── Summary ──────────────────────────');
  console.log(`Total imported:   ${imported}`);
  console.log(`Errors:           ${errors}`);
}

importIngredients().catch(console.error);
