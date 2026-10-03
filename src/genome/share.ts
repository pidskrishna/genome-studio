import { parseGenome, type ParseResult } from './genome';

/** The page-address fragment that carries a code. */
export function codeToHash(code: string): string {
  return `#${code}`;
}

/** A link to `pageUrl` that opens the same organism. Any existing fragment is replaced. */
export function shareLink(pageUrl: string, code: string): string {
  const hashAt = pageUrl.indexOf('#');
  const base = hashAt < 0 ? pageUrl : pageUrl.slice(0, hashAt);
  return base + codeToHash(code);
}

/** Reads a code from `location.hash`. Returns null when the address carries no code. */
export function parseHash(hash: string): ParseResult | null {
  let text = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    text = decodeURIComponent(text);
  } catch {
    // Leave the text as it is; parsing will reject it with a clear message.
  }
  if (text.trim() === '') return null;
  return parseGenome(text);
}
