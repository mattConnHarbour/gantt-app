/** Keep Slack special mentions and HTML inert while preserving ordinary Markdown. */
export function safeMarkdown(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Escape user-controlled values inserted inside Markdown emphasis or links. */
export function escapeInline(text: string): string {
  return safeMarkdown(text).replace(/[\\`*_\[\]]/g, '\\$&');
}
