#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CSV = path.join(ROOT, "tyres_deduped_priority_2.csv");

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  return rows;
}

function bool(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const HARD_BLOCKED_DIALER_PHONES = new Set(["447354247247", "447476190546"]);
const NATIONAL_MOBILE_TYRES_24HR_RE = /national\s+mobile\s+tyres\s*24\s*hr/i;
const BREAKDOWN_RECOVERY_RE = /\b(break\s*down|breakdown|recovery|road\s*side\s+assistance|roadside\s+assistance)\b/i;

function phoneDigits(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function exclusionReason(lead, subscriberPhones = new Set()) {
  const phone = phoneDigits(lead.phone);
  if (HARD_BLOCKED_DIALER_PHONES.has(phone)) return "Dialer hard-filter number";
  if (subscriberPhones.has(phone)) return "Existing TyreFlow subscriber";

  const groupText = [lead.assigned_group, lead.all_groups].join(" ");
  if (NATIONAL_MOBILE_TYRES_24HR_RE.test(groupText)) {
    return "National Mobile Tyres 24HR group";
  }

  const nameText = [lead.display_name, lead.saved_name, lead.public_display_name].join(" ");
  const leadText = [nameText, groupText].join(" ");
  if (BREAKDOWN_RECOVERY_RE.test(leadText)) return "Breakdown/recovery contact";
  if (/m\s*25|logistics/i.test(nameText)) return "M25/admin-style contact";
  if (/tyres/i.test(nameText)) return "Tyres in contact name";

  return null;
}

function mapRow(row, subscriberPhones) {
  const savedName = (row["Saved Name"] || "").trim();
  const publicName = (row["Public Display Name"] || "").trim();
  const phone = (row["Phone Number"] || "").trim();
  const displayName = savedName || publicName || phone;

  const lead = {
    phone,
    display_name: displayName,
    public_display_name: publicName || null,
    saved_name: savedName || null,
    country_code: (row["Country Code"] || "").trim() || null,
    country: (row.Country || "").trim() || null,
    assigned_group: (row["Assigned Group (priority)"] || "").trim() || null,
    groups_count: number(row["Groups Count"]),
    all_groups: (row["All Groups"] || "").trim() || null,
    is_my_contact: bool(row["Is My Contact"]),
    is_business: bool(row["Is Business"]),
    status: "unassigned",
  };

  const reason = exclusionReason(lead, subscriberPhones);
  if (!reason) return lead;

  return {
    ...lead,
    status: "excluded",
    assigned_to: null,
    assigned_name: null,
    assigned_at: null,
    excluded_reason: reason,
    excluded_at: new Date().toISOString(),
  };
}

function rowsFromCsv(csvPath, subscriberPhones) {
  const parsed = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const headers = parsed.shift();
  if (!headers) throw new Error("CSV has no header row.");

  return parsed
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
    )
    .map((row) => mapRow(row, subscriberPhones))
    .filter((row) => row.phone && row.display_name);
}

async function supabaseUpsert(rows, supabaseUrl, supabaseKey) {
  let imported = 0;
  const batchSize = 250;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const response = await fetch(`${supabaseUrl}/rest/v1/tyreflow_dialer_leads?on_conflict=phone`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase import failed (${response.status}): ${text}`);
    }

    imported += batch.length;
    console.log(`Imported ${imported}/${rows.length}`);
  }
}

async function fetchSubscriberPhones(supabaseUrl, supabaseKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/tyreflow_subscribers?select=phone&limit=20000`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not fetch subscriber phones (${response.status}): ${text}`);
  }

  const rows = await response.json();
  return new Set(rows.map((row) => phoneDigits(row.phone)).filter(Boolean));
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV);
  const subscriberPhones = await fetchSubscriberPhones(supabaseUrl, supabaseKey);
  const rows = rowsFromCsv(csvPath, subscriberPhones);
  console.log(`Found ${rows.length} dialer lead(s) in ${csvPath}`);
  await supabaseUpsert(rows, supabaseUrl, supabaseKey);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
