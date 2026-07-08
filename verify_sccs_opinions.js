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

// ─── FILE FINDER ──────────────────────────────────────────────────────────────

function findAnnexFile(name) {
  const searchDirs = [
    path.join(process.env.HOME, 'Downloads'),
    path.join(process.env.HOME, 'Desktop'),
    path.join(process.env.HOME, 'Documents'),
  ];
  for (const dir of searchDirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── CSV PARSER ───────────────────────────────────────────────────────────────

function parseCSV(content) {
  const rows = []; let i = 0;
  while (i < content.length) {
    const row = [];
    while (i < content.length) {
      if (content[i] === '"') {
        i++; let field = '';
        while (i < content.length) {
          if (content[i] === '"') { if (content[i+1]==='"'){field+='"';i+=2;}else{i++;break;} }
          else { field+=content[i++]; }
        }
        row.push(field);
      } else {
        let field = '';
        while (i < content.length && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') field += content[i++];
        row.push(field);
      }
      if (i < content.length && content[i] === ',') i++; else break;
    }
    while (i < content.length && (content[i] === '\n' || content[i] === '\r')) i++;
    if (row.length > 0) rows.push(row);
  }
  return rows;
}

// ─── ANNEX PARSING ───────────────────────────────────────────────────────────
// Col 2: INCI name   Col 9: Regulation   Col 11: SCCS opinions

function parseAnnex(filePath, annexName) {
  const rows = parseCSV(fs.readFileSync(filePath, 'utf8')).slice(5);
  const entries = [];
  for (const r of rows) {
    const inci = r[2]?.trim();
    const sccs = r[11]?.trim();
    if (!inci || inci === '-') continue;
    if (!sccs) continue; // only care about entries with SCCS data
    entries.push({
      annex: annexName,
      ref:   r[0]?.trim() || '',
      inci,
      sccs,
    });
  }
  return entries;
}

// ─── NORMALISE ────────────────────────────────────────────────────────────────

function norm(val) {
  if (!val) return '';
  return val.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find files
  const annexDefs = [
    ['COSING_Annex_II_v2.txt',  'II'],
    ['COSING_Annex_III_v2.txt', 'III'],
    ['COSING_Annex_VI_v2.txt',  'VI'],
  ];

  console.log('Finding Annex files...');
  const allEntries = [];
  for (const [filename, annexName] of annexDefs) {
    const fp = findAnnexFile(filename);
    if (!fp) { console.log(`  ⚠️  ${filename} not found — skipped`); continue; }
    console.log(`  ✅ ${fp}`);
    const entries = parseAnnex(fp, annexName);
    console.log(`     ${entries.length} entries with SCCS opinions`);
    allEntries.push(...entries);
  }

  console.log(`\nTotal entries with SCCS data: ${allEntries.length}`);

  // Deduplicate by INCI (keep first occurrence per INCI name)
  const seenInci = new Set();
  const uniqueEntries = allEntries.filter(e => {
    const key = e.inci.toLowerCase();
    if (seenInci.has(key)) return false;
    seenInci.add(key);
    return true;
  });
  console.log(`Unique INCI names with SCCS data: ${uniqueEntries.length}`);

  // 2. Fetch matching DB rows via case-insensitive RPC or batched ilike
  // Use ilike per batch — group into batches of 50 for ilike OR queries
  console.log('\nFetching matching records from database...');
  const dbMap = {}; // lowercase inci -> db row
  const BATCH = 50;
  for (let i = 0; i < uniqueEntries.length; i += BATCH) {
    const batch = uniqueEntries.slice(i, i + BATCH);
    for (const entry of batch) {
      const { data } = await supabase
        .from('ingredients')
        .select('inci_name, sccs_opinion')
        .ilike('inci_name', entry.inci);
      if (data && data.length > 0) {
        dbMap[entry.inci.toLowerCase()] = data[0];
      }
    }
  }

  const foundCount = Object.keys(dbMap).length;
  console.log(`Found in database: ${foundCount} / ${uniqueEntries.length}`);

  // 3. Categorise
  const exactMatch   = [];
  const mismatch     = [];
  const missingSccs  = [];
  const notInDb      = [];

  for (const entry of uniqueEntries) {
    const dbRow = dbMap[entry.inci.toLowerCase()];
    if (!dbRow) {
      notInDb.push(entry);
      continue;
    }
    const fileVal = norm(entry.sccs);
    const dbVal   = norm(dbRow.sccs_opinion);
    if (!dbVal) {
      missingSccs.push({ ...entry, dbInci: dbRow.inci_name });
    } else if (fileVal === dbVal) {
      exactMatch.push({ ...entry, dbInci: dbRow.inci_name });
    } else {
      mismatch.push({ ...entry, dbInci: dbRow.inci_name, dbSccs: dbVal });
    }
  }

  // 4. Output
  console.log('\n' + '═'.repeat(62));
  console.log('  SUMMARY');
  console.log('═'.repeat(62));
  console.log(`  a) Exact match:              ${exactMatch.length}`);
  console.log(`  b) Mismatch:                 ${mismatch.length}`);
  console.log(`  c) In DB but no sccs_opinion: ${missingSccs.length}`);
  console.log(`  d) Not in DB at all:          ${notInDb.length}`);
  console.log(`  Total checked:               ${uniqueEntries.length}`);

  if (mismatch.length > 0) {
    console.log('\n' + '═'.repeat(62));
    console.log(`  MISMATCHES (showing first 10 of ${mismatch.length})`);
    console.log('═'.repeat(62));
    for (const m of mismatch.slice(0, 10)) {
      console.log(`\n[Annex ${m.annex} #${m.ref}] ${m.dbInci}`);
      console.log('  FILE: ' + m.sccs.slice(0, 200) + (m.sccs.length > 200 ? '...' : ''));
      console.log('  DB:   ' + m.dbSccs.slice(0, 200) + (m.dbSccs.length > 200 ? '...' : ''));
    }
  }

  if (missingSccs.length > 0) {
    console.log('\n' + '═'.repeat(62));
    console.log(`  IN DB BUT sccs_opinion IS NULL (${missingSccs.length} entries)`);
    console.log('═'.repeat(62));
    for (const m of missingSccs) {
      console.log(`  [Annex ${m.annex} #${m.ref}] ${m.dbInci}`);
      console.log(`    FILE sccs: ${m.sccs.slice(0, 120)}${m.sccs.length > 120 ? '...' : ''}`);
    }
  }

  if (notInDb.length > 0) {
    console.log('\n' + '═'.repeat(62));
    console.log(`  NOT FOUND IN DB AT ALL (${notInDb.length} entries)`);
    console.log('═'.repeat(62));
    for (const m of notInDb) {
      console.log(`  [Annex ${m.annex} #${m.ref}] ${m.inci}`);
    }
  }
}

main().catch(console.error);
