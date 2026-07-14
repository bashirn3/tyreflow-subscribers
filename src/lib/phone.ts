export function phoneDigits(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function isGenericE164(digits: string) {
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizeUkSubscriberPhone(value: unknown) {
  const raw = String(value || "").trim();
  const digits = phoneDigits(raw);

  if (!digits) return "";

  if (raw.startsWith("+07") && digits.length === 11) {
    return `+44${digits.slice(1)}`;
  }

  if (digits.startsWith("07") && digits.length === 11) {
    return `+44${digits.slice(1)}`;
  }

  if (digits.startsWith("447") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith("00447") && digits.length === 14) {
    return `+${digits.slice(2)}`;
  }

  if (raw.startsWith("+") && isGenericE164(digits)) {
    return `+${digits}`;
  }

  if (digits.startsWith("00") && isGenericE164(digits.slice(2))) {
    return `+${digits.slice(2)}`;
  }

  throw new Error(
    "Enter a valid phone number, for example 07872 571826 or +447872571826.",
  );
}

export function formatSubscriberPhone(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return normalizeUkSubscriberPhone(raw);
  } catch {
    const digits = phoneDigits(raw);
    if (!digits) return raw;
    return raw.startsWith("+") ? `+${digits}` : digits;
  }
}
