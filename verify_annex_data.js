#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─── ENV ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// ─── CSV PARSER ───────────────────────────────────────────────────────────────
// RFC 4180 — handles quoted fields with embedded newlines and commas

function parseCSV(content) {
  const rows = [];
  let i = 0;

  while (i < content.length) {
    const row = [];

    while (i < content.length) {
      if (content[i] === '"') {
        i++;
        let field = '';
        while (i < content.length) {
          if (content[i] === '"') {
            if (content[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else {
            field += content[i++];
          }
        }
        row.push(field);
      } else {
        let field = '';
        while (i < content.length && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') {
          field += content[i++];
        }
        row.push(field);
      }

      if (i < content.length && content[i] === ',') { i++; }
      else { break; }
    }

    while (i < content.length && (content[i] === '\n' || content[i] === '\r')) i++;
    if (row.length > 0) rows.push(row);
  }

  return rows;
}

// ─── ANNEX PARSING ───────────────────────────────────────────────────────────
// File layout: 4 metadata rows + 1 header row = skip first 5 rows
// Col 2: INCI name   Col 5: product type   Col 6: max conc   Col 7: other   Col 8: wording

function parseAnnex(filePath, annexName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);
  const dataRows = rows.slice(5);
  const entries = [];

  for (const row of dataRows) {
    const inciName = row[2]?.trim();
    if (!inciName) continue;
    entries.push({
      annex: annexName,
      ref: row[0]?.trim() || '',
      inci_name: inciName,
      permitted_product_types:   row[5]?.trim() || null,
      max_concentration:         row[6]?.trim() || null,
      conditions_of_use:         row[7]?.trim() || null,
      conditions_of_use_wording: row[8]?.trim() || null,
    });
  }

  return entries;
}

// ─── COMPARISON ───────────────────────────────────────────────────────────────

function normalize(val) {
  if (val === null || val === undefined) return '';
  return val.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function diff(label, fileVal, dbVal) {
  const f = normalize(fileVal);
  const d = normalize(dbVal);
  if (f === d) return null;
  if (f === '' && (d === '' || d === null)) return null;
  return { label, file: f || '(empty)', db: d || '(empty)' };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const annexDir = '/Users/annehughes/Downloads';

  console.log('Parsing Annex III, V, VI...');
  const allEntries = [
    ...parseAnnex(path.join(annexDir, 'COSING_Annex_III_v2.txt'), 'III'),
    ...parseAnnex(path.join(annexDir, 'COSING_Annex_V_v2.txt'),   'V'),
    ...parseAnnex(path.join(annexDir, 'COSING_Annex_VI_v2.txt'),  'VI'),
  ];

  const byAnnex = { III: 0, V: 0, VI: 0 };
  allEntries.forEach(e => byAnnex[e.annex]++);
  console.log(`  Annex III: ${byAnnex.III} entries`);
  console.log(`  Annex V:   ${byAnnex.V} entries`);
  console.log(`  Annex VI:  ${byAnnex.VI} entries`);
  console.log(`  Total:     ${allEntries.length} entries with INCI names\n`);

  // Batch-fetch all matching DB rows
  const inciNames = [...new Set(allEntries.map(e => e.inci_name))];
  console.log(`Fetching ${inciNames.length} unique INCI names from database...`);

  const dbMap = {};
  const BATCH = 200;
  for (let i = 0; i < inciNames.length; i += BATCH) {
    const batch = inciNames.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('ingredients')
      .select('inci_name, permitted_product_types, max_concentration, conditions_of_use, conditions_of_use_wording')
      .in('inci_name', batch);
    if (error) { console.error('DB fetch error:', error.message); continue; }
    for (const row of data || []) dbMap[row.inci_name] = row;
  }

  const foundInDb = Object.keys(dbMap).length;
  console.log(`Found ${foundInDb} / ${inciNames.length} in database\n`);

  // Compare
  const mismatches = [];
  const notFound = [];

  for (const entry of allEntries) {
    const dbRow = dbMap[entry.inci_name];
    if (!dbRow) { notFound.push(entry); continue; }

    const diffs = [
      diff('permitted_product_types',   entry.permitted_product_types,   dbRow.permitted_product_types),
      diff('max_concentration',         entry.max_concentration,         dbRow.max_concentration),
      diff('conditions_of_use',         entry.conditions_of_use,         dbRow.conditions_of_use),
      diff('conditions_of_use_wording', entry.conditions_of_use_wording, dbRow.conditions_of_use_wording),
    ].filter(Boolean);

    if (diffs.length > 0) mismatches.push({ ...entry, diffs });
  }

  // ─── Output ───────────────────────────────────────────────────────────────

  console.log('══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Entries checked:      ${allEntries.length - notFound.length}`);
  console.log(`  Not found in DB:      ${notFound.length}`);
  console.log(`  With mismatches:      ${mismatches.length}`);
  console.log('');

  if (mismatches.length > 0) {
    console.log('══════════════════════════════════════════════════════════');
    console.log('  MISMATCHES');
    console.log('══════════════════════════════════════════════════════════');
    for (const m of mismatches) {
      console.log(`\n[Annex ${m.annex} #${m.ref}] ${m.inci_name}`);
      for (const d of m.diffs) {
        console.log(`  ── ${d.label}`);
        const fileLines = d.file.split('\n');
        const dbLines   = d.db.split('\n');
        console.log(`     FILE: ${fileLines[0]}${fileLines.length > 1 ? ` (+${fileLines.length - 1} lines)` : ''}`);
        console.log(`     DB:   ${dbLines[0]}${dbLines.length > 1 ? ` (+${dbLines.length - 1} lines)` : ''}`);
      }
    }
  } else {
    console.log('  ✅ All checked entries match the database.');
  }

  if (notFound.length > 0) {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  NOT FOUND IN DATABASE');
    console.log('══════════════════════════════════════════════════════════');
    for (const e of notFound) {
      console.log(`  [Annex ${e.annex} #${e.ref}] ${e.inci_name}`);
    }
  }
}

main().catch(console.error);
