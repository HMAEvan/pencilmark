// ADR-0003: a type prefix, the date, and 6 cryptographically random characters
// from lowercase letters and digits minus the easily confused 0, o, 1, l and i.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type IdPrefix = "q" | "c" | "s" | "b" | "tr" | "tp" | "ss" | "dv";

export function newId(prefix: IdPrefix, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  // 31 symbols: modulo bias is small enough for IDs that only need to be unique.
  const random = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${prefix}_${date}_${random}`;
}
