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
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'post2016_annex2.json'), 'utf8'));
  console.log(`Importing ${data.length} post-2016 Annex II ingredients...`);

  const { error } = await supabase
    .from('ingredients')
    .upsert(data, { onConflict: 'inci_name' });

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`✅ Successfully imported ${data.length} entries`);
    data.forEach(r => console.log(`  - ${r.inci_name} (${r.annex_ii_ref})`));
  }
}

importIngredients().catch(console.error);
