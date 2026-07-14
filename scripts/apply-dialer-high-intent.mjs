#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const HARD_BLOCKED_DIALER_PHONES = new Set(["447354247247", "447476190546"]);
const TYRES_ANYWHERE_RE = /tyres?\s+anywhere/i;
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

function phoneDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function groupText(lead) {
  return [lead.assigned_group, lead.all_groups].join(" ");
}

function nameText(lead) {
  return [lead.display_name, lead.saved_name, lead.public_display_name].join(" ");
}

function isStillHardExcluded(lead, subscriberPhones) {
  const phone = phoneDigits(lead.phone);
  const groups = groupText(lead);
  const names = nameText(lead);
  const combined = [groups, names].join(" ");

  return (
    HARD_BLOCKED_DIALER_PHONES.has(phone) ||
    subscriberPhones.has(phone) ||
    NATIONAL_MOBILE_TYRES_24HR_RE.test(groups) ||
    BREAKDOWN_RECOVERY_RE.test(combined) ||
    /m\s*25|logistics/i.test(names) ||
    /tyres/i.test(names)
  );
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

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(supabaseUrl, supabaseKey, endpoint) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=1000&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function batch(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

  const [leads, subscribers] = await Promise.all([
    fetchAll(
      supabaseUrl,
      supabaseKey,
      "/rest/v1/tyreflow_dialer_leads?select=id,phone,display_name,saved_name,public_display_name,assigned_group,all_groups,groups_count,status,excluded_reason",
    ),
    fetchAll(supabaseUrl, supabaseKey, "/rest/v1/tyreflow_subscribers?select=phone"),
  ]);

  const subscriberPhones = new Set(subscribers.map((row) => phoneDigits(row.phone)).filter(Boolean));
  const candidates = leads.filter((lead) => {
    if (!TYRES_ANYWHERE_RE.test(groupText(lead))) return false;
    if (lead.status !== "excluded") return false;
    if (lead.excluded_reason !== "Tyres Anywhere Live group") return false;
    return !isStillHardExcluded(lead, subscriberPhones);
  });

  console.log(`Scanned ${leads.length} dialer lead(s).`);
  console.log(`Found ${candidates.length} safe Tyres Anywhere lead(s) to restore.`);
  for (const lead of candidates.slice(0, 12)) {
    console.log(
      `- #${lead.id} ${lead.display_name || lead.phone} · ${lead.groups_count || 0} group(s)`,
    );
  }
  if (candidates.length > 12) console.log(`...and ${candidates.length - 12} more`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to restore these leads.");
    return;
  }

  const now = new Date().toISOString();
  for (const group of batch(candidates, 100)) {
    const ids = group.map((lead) => lead.id).join(",");
    await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/tyreflow_dialer_leads?id=in.(${ids})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "unassigned",
          assigned_to: null,
          assigned_name: null,
          assigned_at: null,
          excluded_reason: null,
          excluded_at: null,
          updated_at: now,
        }),
      },
    );
  }

  console.log("Done. Safe Tyres Anywhere leads are restored as high-intent unassigned leads.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
