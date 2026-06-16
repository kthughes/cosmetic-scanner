const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env manually
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
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'full_inventory_import.json'), 'utf8'));
  console.log(`Importing ${data.length} ingredients...`);

  const BATCH_SIZE = 100;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('ingredients')
      .upsert(batch, { onConflict: 'inci_name', ignoreDuplicates: false });

    if (error) {
      console.error(`Batch ${i}-${i + BATCH_SIZE} error:`, error.message);
      errors++;
    } else {
      imported += batch.length;
      if (imported % 1000 === 0 || imported === data.length) {
        console.log(`✅ Imported ${imported}/${data.length}`);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone! Imported: ${imported}, Errors: ${errors}`);
}

importIngredients().catch(console.error);
