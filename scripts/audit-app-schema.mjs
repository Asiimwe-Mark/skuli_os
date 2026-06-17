#!/usr/bin/env node
// Deterministic scanner. Walks target dirs, finds every .from()/.rpc()/.storage.from() call,
// extracts select/insert/update/upsert column keys, and lists enum value strings.
// Outputs JSON to /tmp/schema-audit/catalog.json.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const OUT = process.argv[3] || '/tmp/schema-audit/catalog.json';

const TARGET_DIRS = ['app', 'lib', 'components', 'scripts', 'supabase/functions', 'tests'];
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.sql', '.json']);

// Enums to scan value strings for.
const ENUMS = {
  user_role: ['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'GROUP_ADMIN', 'SUPER_ADMIN', 'CONCIERGE', 'STAFF', 'BURSAR', 'HEAD_TEACHER', 'STUDENT', 'PLATFORM_ADMIN'],
  school_type: ['PRIMARY', 'SECONDARY', 'MIXED', 'NURSERY', 'INTERNATIONAL', 'VOCATIONAL', 'TECHNICAL'],
  subscription_plan: ['TRIAL', 'BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'FREE'],
  subscription_status: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED', 'PENDING'],
  student_status: ['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'WITHDRAWN', 'SUSPENDED', 'ALUMNI', 'ENROLLED', 'DROPPED'],
  term_name: ['TERM_1', 'TERM_2', 'TERM_3', 'SEMESTER_1', 'SEMESTER_2', 'TERM_ONE', 'TERM_TWO', 'TERM_THREE'],
  exam_type: ['MIDTERM', 'END_OF_TERM', 'MOCK', 'BOT', 'EOT', 'CAT', 'FINAL', 'QUIZ', 'ASSIGNMENT', 'OPENER', 'CLOSER'],
  attendance_status: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'SICK', 'LEAVE'],
  conduct_grade: ['A', 'B', 'C', 'D', 'E', 'F', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR'],
  report_card_status: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'PENDING'],
  payment_method: ['CASH', 'MPESA', 'BANK', 'CHEQUE', 'CARD', 'MM', 'PESAPAL', 'STK_PUSH', 'MOBILE_MONEY', 'BANK_TRANSFER'],
  mm_provider: ['MPESA', 'MTN', 'AIRTEL', 'TIGO', 'VODAFONE', 'AFRICAS_TALKING'],
  payment_status: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED', 'PARTIAL', 'SUCCESS'],
  fee_account_status: ['ACTIVE', 'OVERDUE', 'CLEARED', 'PARTIAL', 'INACTIVE', 'PENDING'],
  discount_type: ['PERCENTAGE', 'FIXED', 'FULL', 'SIBLING', 'STAFF', 'SCHOLARSHIP'],
  expense_payment_method: ['CASH', 'BANK', 'CHEQUE', 'MPESA', 'MOBILE_MONEY'],
  announcement_target: ['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'CLASS', 'SCHOOL', 'GROUP'],
  sms_channel: ['SMS', 'WHATSAPP', 'IN_APP', 'PUSH', 'EMAIL'],
  sms_status: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED', 'PENDING'],
  payroll_payment_status: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'APPROVED'],
  discipline_incident_type: ['LATE', 'ABSENT', 'MISBEHAVIOR', 'FIGHTING', 'BULLYING', 'CHEATING', 'VANDALISM', 'THEFT', 'DISRESPECT', 'OTHER'],
  asset_condition: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'BROKEN'],
  concierge_status: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST', 'CLOSED'],
  pesapal_payment_status: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INVALID', 'INITIATED'],
  payroll_funding_status: ['PENDING', 'FUNDED', 'DISBURSED', 'FAILED'],
  payroll_funding_mechanism: ['SCHOOL_BALANCE', 'INVOICE', 'PARENT_FUNDED', 'STAFF_FUNDED'],
  disbursal_status: ['PENDING', 'SENT', 'CONFIRMED', 'FAILED', 'CANCELLED'],
  staff_payout_method: ['MPESA', 'BANK', 'CASH', 'CHEQUE', 'MM'],
  notification_channel: ['SMS', 'PUSH', 'EMAIL', 'IN_APP', 'WHATSAPP'],
  marketplace_category: ['FEE_STRUCTURE', 'SMS_TEMPLATE', 'GRADING_SCALE', 'TIMETABLE', 'CURRICULUM', 'EXAM', 'REPORT_CARD', 'DISCIPLINE'],
};

async function* walk(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(e.name))) yield full;
  }
}

const files = [];
for (const d of TARGET_DIRS) {
  for await (const f of walk(path.join(ROOT, d))) files.push(f);
}

const tables = {};        // table -> { select_columns:Set, insert_columns:Set, update_columns:Set, files:Set }
const rpcs = [];          // [{name, args:Set, files:Set}]
const buckets = new Set();

function getTable(name) {
  if (!tables[name]) tables[name] = { select_columns: new Set(), insert_columns: new Set(), update_columns: new Set(), files: new Set() };
  return tables[name];
}
function getRpc(name) {
  let r = rpcs.find(x => x.name === name);
  if (!r) { r = { name, args: new Set(), files: new Set() }; rpcs.push(r); }
  return r;
}

const FROM_RE = /\.from\s*[(<]\s*['"`]([^'"`]+)['"`]/g;
const RPC_RE = /\.rpc\s*\(\s*['"`]([^'"`]+)['"`]/g;
const STORAGE_RE = /\.storage\.from\s*\(\s*['"`]([^'"`]+)['"`]/g;
const SELECT_RE = /\.select\s*\(\s*['"`]([^'"`]+)['"`]/g;
const EQ_RE = /\.eq\s*\(\s*['"`]([^'"`]+)['"`]/g;
const IN_RE = /\.in\s*\(\s*['"`]([^'"`]+)['"`]/g;
const ORDER_RE = /\.order\s*\(\s*['"`]([^'"`]+)['"`]/g;
const IS_RE = /\.is\s*\(\s*['"`]([^'"`]+)['"`]/g;
const OR_RE = /\.or\s*\(\s*['"`]([^'"`]+)['"`]/g;
const MATCH_RE = /\.match\s*\(\s*['"`]([^'"`]+)['"`]/g;
const ILIKE_RE = /\.ilike\s*\(\s*['"`]([^'"`]+)['"`]/g;
const LIKE_RE = /\.like\s*\(\s*['"`]([^'"`]+)['"`]/g;
const FILTER_RE = /\.filter\s*\(\s*['"`]([^'"`]+)['"`]/g;
const NEXTSCHED_RE = /\.neq\s*\(\s*['"`]([^'"`]+)['"`]/g;
const GT_RE = /\.gt\s*\(\s*['"`]([^'"`]+)['"`]/g;
const LT_RE = /\.lt\s*\(\s*['"`]([^'"`]+)['"`]/g;
const GTE_RE = /\.gte\s*\(\s*['"`]([^'"`]+)['"`]/g;
const LTE_RE = /\.lte\s*\(\s*['"`]([^'"`]+)['"`]/g;

const enumUsage = Object.fromEntries(Object.entries(ENUMS).map(([k, vs]) => [k, new Set(vs.filter(() => false))]));
for (const k of Object.keys(enumUsage)) {
  enumUsage[k] = new Set();
}

// Look-ahead depth to capture object keys
function extractObjectKeys(text, startIdx) {
  // Find matching closing brace
  let depth = 0;
  let i = startIdx;
  let inStr = null;
  let inTpl = 0;
  let inComment = null;
  while (i < text.length) {
    const c = text[i];
    const c2 = text[i] + (text[i+1] || '');
    if (inComment === 'line') { if (c === '\n') inComment = null; i++; continue; }
    if (inComment === 'block') { if (c2 === '*/') { inComment = null; i += 2; continue; } i++; continue; }
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (inTpl > 0) {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') inTpl--;
      else if (c === '$' && text[i+1] === '{') { i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && text[i+1] === '/') { inComment = 'line'; i += 2; continue; }
    if (c === '/' && text[i+1] === '*') { inComment = 'block'; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === '`') { inTpl++; i++; continue; }
    if (c === '{') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    } else if (depth === 0 && c === ')' ) {
      // close call before we found a body — return null
      return null;
    }
    i++;
  }
  return null;
}

// Get top-level key: value pairs from an object literal string
function getTopLevelKeys(objStr) {
  const keys = new Set();
  if (!objStr) return keys;
  // Walk through, tracking depth and strings.
  let i = 0;
  while (i < objStr.length) {
    const c = objStr[i];
    // skip whitespace
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{' || c === '}') { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i + 1;
      let j = start;
      while (j < objStr.length && objStr[j] !== quote) {
        if (objStr[j] === '\\') j += 2; else j++;
      }
      const key = objStr.slice(start, j);
      // skip to colon
      let k = j + 1;
      while (k < objStr.length && objStr[k] !== ':') k++;
      if (k >= objStr.length) { i = j + 1; continue; }
      keys.add(key);
      // skip value
      let depth = 0;
      let inStr = null;
      let inTpl = 0;
      k++;
      while (k < objStr.length) {
        const cc = objStr[k];
        if (inStr) { if (cc === '\\') { k += 2; continue; } if (cc === inStr) inStr = null; k++; continue; }
        if (inTpl > 0) { if (cc === '\\') { k += 2; continue; } if (cc === '`') inTpl--; else if (cc === '$' && objStr[k+1] === '{') { let bd=1; k+=2; while(k<objStr.length && bd>0){if(objStr[k]==='{')bd++; else if(objStr[k]==='}')bd--; k++;} continue; } k++; continue; }
        if (cc === '"' || cc === "'") { inStr = cc; k++; continue; }
        if (cc === '`') { inTpl++; k++; continue; }
        if (cc === '{' || cc === '[' || cc === '(') depth++;
        else if (cc === '}' || cc === ']' || cc === ')') { if (depth === 0) break; depth--; }
        else if (depth === 0 && cc === ',') break;
        k++;
      }
      i = k;
    } else {
      // bareword key (e.g. onConflict: 'key' style or shorthand) — track identifier
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(objStr.slice(i));
      if (m) {
        const key = m[0];
        let k = i + key.length;
        while (k < objStr.length && /\s/.test(objStr[k])) k++;
        if (objStr[k] === ':') {
          keys.add(key);
          k++;
          // skip value same as above
          let depth = 0;
          let inStr = null;
          let inTpl = 0;
          while (k < objStr.length) {
            const cc = objStr[k];
            if (inStr) { if (cc === '\\') { k += 2; continue; } if (cc === inStr) inStr = null; k++; continue; }
            if (inTpl > 0) { if (cc === '\\') { k += 2; continue; } if (cc === '`') inTpl--; else if (cc === '$' && objStr[k+1] === '{') { let bd=1; k+=2; while(k<objStr.length && bd>0){if(objStr[k]==='{')bd++; else if(objStr[k]==='}')bd--; k++;} continue; } k++; continue; }
            if (cc === '"' || cc === "'") { inStr = cc; k++; continue; }
            if (cc === '`') { inTpl++; k++; continue; }
            if (cc === '{' || cc === '[' || cc === '(') depth++;
            else if (cc === '}' || cc === ']' || cc === ')') { if (depth === 0) break; depth--; }
            else if (depth === 0 && cc === ',') break;
            k++;
          }
          i = k;
        } else {
          i = i + key.length;
        }
      } else {
        i++;
      }
    }
  }
  return keys;
}

function addAll(set, ...vals) { for (const v of vals) if (v) set.add(v); }

const allMatches = {
  from: 0, rpc: 0, storage: 0, select: 0, insert: 0, update: 0, upsert: 0,
};

// Build a map: line number -> current table (so we can attribute select/insert/update to the right table)
const lineToTable = new Map();

for (const file of files) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
  const relFile = path.relative(ROOT, file).replace(/\\/g, '/');

  // Find from() and remember line -> table association
  for (const m of text.matchAll(FROM_RE)) {
    const tname = m[1];
    const idx = m.index;
    const lineNo = text.slice(0, idx).split('\n').length;
    lineToTable.set(lineNo, tname);
    // also map the next 80 lines
    for (let l = lineNo; l < lineNo + 100; l++) lineToTable.set(l, tname);
    getTable(tname).files.add(relFile);
    allMatches.from++;
  }

  // For each from() on the file, look for select/insert/update/upsert within ~80 lines after
  const fromMatches = [...text.matchAll(FROM_RE)];
  for (const m of fromMatches) {
    const tname = m[1];
    const startLine = text.slice(0, m.index).split('\n').length;
    const startIdx = m.index;
    // Find end of this supabase chain — look for next .from() or ; or end of file
    let endLine = startLine + 60;
    const endIdx = text.indexOf('\n', startIdx + 200) > 0 ? text.indexOf('\n', startIdx + 200) : text.length;
    const chunk = text.slice(startIdx, endIdx);

    const t = getTable(tname);

    // selects in chunk
    for (const sm of chunk.matchAll(SELECT_RE)) {
      const cols = sm[1];
      // Split by comma not in parens — simple split is good enough since select lists are short
      for (const c of cols.split(',')) {
        const col = c.trim().split(/[\s:]/)[0].trim();
        if (col && /^[a-z_][a-z0-9_]*$/.test(col) && col !== 'count') {
          t.select_columns.add(col);
        }
        // Also capture foreign key hints like "students(full_name"
        const m2 = /\(([a-z_][a-z0-9_]*)/.exec(c);
        if (m2) t.select_columns.add(m2[1] + '_fk');
      }
      allMatches.select++;
    }

    // .insert(  look for first { or [
    for (const im of chunk.matchAll(/\.insert\s*\(/g)) {
      const after = im.index + im[0].length;
      const obj = extractObjectKeys(chunk, after);
      if (obj) {
        if (obj.trim().startsWith('[')) {
          // array — find first {...}
          const firstObj = extractObjectKeys(obj, obj.indexOf('[') + 1);
          if (firstObj) {
            for (const k of getTopLevelKeys(firstObj)) t.insert_columns.add(k);
          }
        } else {
          for (const k of getTopLevelKeys(obj)) t.insert_columns.add(k);
        }
      }
      allMatches.insert++;
    }

    // .update( and .upsert(
    for (const um of chunk.matchAll(/\.update\s*\(|\.upsert\s*\(/g)) {
      const after = um.index + um[0].length;
      const obj = extractObjectKeys(chunk, after);
      if (obj) {
        if (obj.trim().startsWith('[')) {
          const firstObj = extractObjectKeys(obj, obj.indexOf('[') + 1);
          if (firstObj) {
            for (const k of getTopLevelKeys(firstObj)) {
              if (um[0].startsWith('.update')) t.update_columns.add(k);
              else t.insert_columns.add(k);
            }
          }
        } else {
          for (const k of getTopLevelKeys(obj)) {
            if (um[0].startsWith('.update')) t.update_columns.add(k);
            else t.insert_columns.add(k);
          }
        }
      }
      if (um[0].startsWith('.update')) allMatches.update++;
      else allMatches.upsert++;
    }
  }

  // rpc() — collect from file scope (need to know the call to attribute args)
  for (const m of text.matchAll(RPC_RE)) {
    const fname = m[1];
    const idx = m.index;
    const lineNo = text.slice(0, idx).split('\n').length;
    const r = getRpc(fname);
    r.files.add(relFile);
    // Find the argument object — args may be on same line
    const after = idx + m[0].length;
    const lineEnd = text.indexOf('\n', after);
    const line = text.slice(after, lineEnd > 0 ? lineEnd + 200 : after + 200);
    const obj = extractObjectKeys(line, 0);
    if (obj) {
      for (const k of getTopLevelKeys(obj)) r.args.add(k);
    }
    allMatches.rpc++;
  }

  // storage
  for (const m of text.matchAll(STORAGE_RE)) {
    buckets.add(m[1]);
    allMatches.storage++;
  }

  // enum value string literals
  for (const [ename, vals] of Object.entries(ENUMS)) {
    for (const v of vals) {
      // match the literal as a string: 'VAL' or "VAL"
      const re = new RegExp(`['"\`]${v}['"\`]`, 'g');
      if (re.test(text)) enumUsage[ename].add(v);
    }
  }
}

// Build final output
const out = {
  tables_used: {},
  rpc_functions: rpcs.map(r => ({ name: r.name, args: [...r.args], files: [...r.files] })),
  storage_buckets: [...buckets],
  enum_values_used: Object.fromEntries(Object.entries(enumUsage).map(([k, v]) => [k, [...v].sort()])),
  edge_function_sql_references: [],
  match_counts: allMatches,
};

for (const [name, t] of Object.entries(tables)) {
  out.tables_used[name] = {
    select_columns: [...t.select_columns].sort(),
    insert_columns: [...t.insert_columns].sort(),
    update_columns: [...t.update_columns].sort(),
    files: [...t.files].sort(),
  };
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`Tables: ${Object.keys(out.tables_used).length}`);
console.log(`RPCs: ${out.rpc_functions.length}`);
console.log(`Buckets: ${out.storage_buckets.length}`);
