#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const NATIONAL_MOBILE_TYRES_24HR_RE = /national\s+mobile\s+tyres\s*24\s*hr/i;
const BREAKDOWN_RECOVERY_RE = /\b(break\s*down|breakdown|recovery|road\s*side\s+assistance|roadside\s+assistance)\b/i;

function loadEnvFile(filename) {
  const filePath = path.join(ROOT, filename);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

function suppressionReason(lead) {
  const groupText = [lead.assigned_group, lead.all_groups].join(" ");
  if (NATIONAL_MOBILE_TYRES_24HR_RE.test(groupText)) {
    return "National Mobile Tyres 24HR group";
  }

  const leadText = [
    lead.display_name,
    lead.saved_name,
    lead.public_display_name,
    lead.assigned_group,
    lead.all_groups,
  ].join(" ");
  if (BREAKDOWN_RECOVERY_RE.test(leadText)) {
    return "Breakdown/recovery contact";
  }

  return null;
}

async function supabaseFetch(supabaseUrl, supabaseKey, endpoint, options = {}) {
  const response = await fetch(`${supabaseUrl}${endpoint}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAllLeads(supabaseUrl, supabaseKey) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/tyreflow_dialer_leads?select=id,phone,display_name,saved_name,public_display_name,assigned_group,all_groups,status,assigned_to&order=id.asc&limit=${pageSize}&offset=${offset}`,
    );
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function groupByReason(leads) {
  return leads.reduce((groups, lead) => {
    const reason = lead.suppression_reason;
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(lead);
    return groups;
  }, new Map());
}

function batch(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function markLeadsExcluded(supabaseUrl, supabaseKey, leads, reason) {
  const now = new Date().toISOString();
  for (const group of batch(leads, 100)) {
    const ids = group.map((lead) => lead.id).join(",");
    await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/tyreflow_dialer_leads?id=in.(${ids})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "excluded",
          assigned_to: null,
          assigned_name: null,
          assigned_at: null,
          excluded_reason: reason,
          excluded_at: now,
          updated_at: now,
        }),
      },
    );
  }
}

async function closeOpenTasks(supabaseUrl, supabaseKey, leads) {
  const now = new Date().toISOString();
  for (const group of batch(leads, 100)) {
    const ids = group.map((lead) => lead.id).join(",");
    await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/tyreflow_dialer_tasks?lead_id=in.(${ids})&status=eq.open`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "done",
          completed_at: now,
        }),
      },
    );
  }
}

function printSummary(leads) {
  const groups = groupByReason(leads);
  for (const [reason, rows] of groups.entries()) {
    console.log(`${reason}: ${rows.length}`);
  }

  for (const lead of leads.slice(0, 10)) {
    console.log(
      `- #${lead.id} ${lead.display_name || lead.phone} (${lead.assigned_group || "no assigned group"})`,
    );
  }
  if (leads.length > 10) console.log(`...and ${leads.length - 10} more`);
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

  const leads = await fetchAllLeads(supabaseUrl, supabaseKey);
  const matching = leads
    .map((lead) => ({ ...lead, suppression_reason: suppressionReason(lead) }))
    .filter((lead) => lead.suppression_reason);

  console.log(`Scanned ${leads.length} dialer lead(s).`);
  console.log(`Matched ${matching.length} lead(s) for exclusion.`);
  printSummary(matching);

  if (DRY_RUN) {
    console.log("Dry run only. No Supabase rows were changed.");
    return;
  }

  for (const [reason, rows] of groupByReason(matching).entries()) {
    await markLeadsExcluded(supabaseUrl, supabaseKey, rows, reason);
  }
  await closeOpenTasks(supabaseUrl, supabaseKey, matching);

  console.log("Done. Matching leads are now excluded, assignments cleared, and open tasks closed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
