/**
 * An infographic card's body is a static HTML fragment the model wrote. Figure cards share the
 * card kind but answer in Markdown, so only a body that is markup is drawn as HTML.
 */
export function infographicHtml(body: string): string | null {
  const html = body
    .trim()
    .replace(/^```(?:html)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim()
  if (!html.startsWith("<") || !html.includes("</")) return null
  return stripActiveContent(html)
}

/** The frame already blocks scripts and network; this keeps the stored fragment inert as well. */
function stripActiveContent(html: string): string {
  return html
    .replace(/<(script|iframe|object|form)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<\/?(?:script|iframe|object|embed|link|meta|base|form)\b[^>]*>/giu, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\s(?:href|src|xlink:href|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
}

/** App colors the fragment may use, read from the live theme so light and dark both hold. */
const THEME_VARIABLES = [
  ["--ink", "--ink"],
  ["--ink-muted", "--ink-muted"],
  ["--line", "--line"],
  ["--surface", "--surface"],
  ["--surface-muted", "--surface-muted"],
  ["--accent", "--focus"],
  ["--accent-soft", "--action-subtle"],
  ["--accent-2", "--ink-muted"],
  ["--accent-2-soft", "--research-lilac"],
] as const

export function infographicDocument(html: string, style: CSSStyleDeclaration | null): string {
  const variables = THEME_VARIABLES.map(([name, source]) => {
    const value = style?.getPropertyValue(source).trim()
    return value ? `${name}:${value};` : ""
  }).join("")
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>:root{${variables}}html,body{margin:0;background:transparent;color:var(--ink);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif;overflow-wrap:anywhere}body{padding:2px}svg{max-width:100%;height:auto}table{border-collapse:collapse}*{box-sizing:border-box;max-width:100%}</style></head><body>${html}</body></html>`
}
