export interface ListingNameSource {
  name: string;
  aliases?: string[] | null;
}

/** Collapse whitespace/hyphens for speech-to-text tolerant matching (e.g. "Wiesen Blick" → "wiesenblick"). */
export function normalizeListingNameTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s\-_.]+/g, '');
}

export function listingNameMatches(
  guestInput: string,
  listing: ListingNameSource,
): boolean {
  const term = guestInput?.trim();
  if (!term || term.length < 2) return false;

  const termLower = term.toLowerCase();
  const termNorm = normalizeListingNameTerm(term);
  const candidates = [listing.name, ...(listing.aliases ?? [])].filter(Boolean);

  return candidates.some((candidate) => {
    const candLower = candidate.toLowerCase();
    const candNorm = normalizeListingNameTerm(candidate);

    if (candLower.includes(termLower) || termLower.includes(candLower)) {
      return true;
    }

    if (termNorm.length >= 3 && candNorm.length >= 3) {
      return candNorm.includes(termNorm) || termNorm.includes(candNorm);
    }

    return false;
  });
}

export function parseListingAliasesInput(raw: string): string[] {
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(part);
    }
  }
  return out.slice(0, 30);
}

export function formatListingAliases(
  aliases: string[] | null | undefined,
): string {
  return (aliases ?? []).join(', ');
}
