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
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'additional_annex2_final.json'), 'utf8'));
  console.log(`Importing ${data.length} additional Annex II ingredients...`);

  const BATCH_SIZE = 20;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('ingredients')
      .upsert(batch, { onConflict: 'inci_name' });

    if (error) {
      console.error(`Batch error:`, error.message);
      errors++;
    } else {
      imported += batch.length;
      console.log(`✅ ${imported}/${data.length}`);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Errors: ${errors}`);
}

importIngredients().catch(console.error);
