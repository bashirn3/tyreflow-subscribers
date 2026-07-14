#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

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

function isGenericE164(digits) {
  return digits.length >= 8 && digits.length <= 15;
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  const digits = phoneDigits(raw);
  if (!digits) return "";

  if (raw.startsWith("+07") && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith("07") && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith("447") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("00447") && digits.length === 14) return `+${digits.slice(2)}`;
  if (raw.startsWith("+") && isGenericE164(digits)) return `+${digits}`;
  if (digits.startsWith("00") && isGenericE164(digits.slice(2))) return `+${digits.slice(2)}`;

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

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  }

  const rows = await supabaseFetch(
    supabaseUrl,
    supabaseKey,
    "/rest/v1/tyreflow_subscribers?select=id,name,phone&limit=20000",
  );

  const currentPhonesByNormalized = new Map();
  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    if (!normalized) continue;
    if (!currentPhonesByNormalized.has(normalized)) currentPhonesByNormalized.set(normalized, []);
    currentPhonesByNormalized.get(normalized).push(row);
  }

  const updates = [];
  const skipped = [];

  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    if (!normalized) {
      skipped.push({ ...row, reason: "Could not normalize" });
      continue;
    }
    if (normalized === row.phone) continue;

    const duplicates = (currentPhonesByNormalized.get(normalized) || []).filter(
      (item) => item.id !== row.id,
    );
    if (duplicates.length) {
      skipped.push({
        ...row,
        normalized,
        reason: `Duplicate target already exists: ${duplicates.map((item) => `#${item.id}`).join(", ")}`,
      });
      continue;
    }

    updates.push({ ...row, normalized });
  }

  console.log(`Scanned ${rows.length} subscriber(s).`);
  console.log(`Would update ${updates.length} phone(s).`);
  console.log(`Skipped ${skipped.length} phone(s).`);

  for (const row of updates.slice(0, 10)) {
    console.log(`- #${row.id} ${row.name}: ${row.phone} -> ${row.normalized}`);
  }
  if (updates.length > 10) console.log(`...and ${updates.length - 10} more update(s)`);

  if (skipped.length) {
    console.log("Skipped rows:");
    for (const row of skipped.slice(0, 10)) {
      console.log(`- #${row.id} ${row.name}: ${row.phone} (${row.reason})`);
    }
    if (skipped.length > 10) console.log(`...and ${skipped.length - 10} more skipped row(s)`);
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update Supabase.");
    return;
  }

  for (const row of updates) {
    await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/tyreflow_subscribers?id=eq.${row.id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ phone: row.normalized }),
      },
    );
  }

  console.log("Done. Subscriber phones were normalized.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
