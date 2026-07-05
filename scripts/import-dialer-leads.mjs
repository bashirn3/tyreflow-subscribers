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

function mapRow(row) {
  const savedName = (row["Saved Name"] || "").trim();
  const publicName = (row["Public Display Name"] || "").trim();
  const phone = (row["Phone Number"] || "").trim();
  const displayName = savedName || publicName || phone;

  return {
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
}

function rowsFromCsv(csvPath) {
  const parsed = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const headers = parsed.shift();
  if (!headers) throw new Error("CSV has no header row.");

  return parsed
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
    )
    .map(mapRow)
    .filter((row) => row.phone && row.display_name);
}

async function supabaseUpsert(rows) {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

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

async function main() {
  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV);
  const rows = rowsFromCsv(csvPath);
  console.log(`Found ${rows.length} dialer lead(s) in ${csvPath}`);
  await supabaseUpsert(rows);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
