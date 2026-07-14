#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXPORT_DIR = path.join(ROOT, "exports");
const TYRES_ANYWHERE_RE = /tyres?\s+anywhere/i;

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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function groupText(lead) {
  return [lead.assigned_group, lead.all_groups].join(" ");
}

function isExportLead(lead) {
  if (lead.status === "excluded") return false;
  if (TYRES_ANYWHERE_RE.test(groupText(lead))) return false;

  const notDialedYet =
    !lead.last_outcome && (lead.status === "unassigned" || lead.status === "assigned");
  const noAnswer = lead.last_outcome === "no_answer";
  return notDialedYet || noAnswer;
}

async function supabaseFetch(supabaseUrl, supabaseKey, endpoint) {
  const response = await fetch(`${supabaseUrl}${endpoint}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  return response.json();
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

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

  const leads = await fetchAll(
    supabaseUrl,
    supabaseKey,
    "/rest/v1/tyreflow_dialer_leads?select=id,phone,display_name,public_display_name,saved_name,status,assigned_to,assigned_name,last_outcome,last_note,last_called_at,assigned_group,groups_count,all_groups&order=id.asc",
  );
  const rows = leads.filter(isExportLead);
  const headers = [
    "id",
    "phone",
    "display_name",
    "status",
    "assigned_to",
    "assigned_name",
    "last_outcome",
    "last_note",
    "last_called_at",
    "assigned_group",
    "groups_count",
    "all_groups",
  ];

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(
    EXPORT_DIR,
    `tyreflow-undialed-no-answer-no-tyres-anywhere-${date}.csv`,
  );

  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
  fs.writeFileSync(outputPath, `${csv}\n`);

  console.log(`Scanned ${leads.length} lead(s).`);
  console.log(`Exported ${rows.length} lead(s).`);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
