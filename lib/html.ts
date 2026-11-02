/** Escape per mettere un testo dentro HTML (senza dipendenze, usabile ovunque). */
export function escapeHtmlBase(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
