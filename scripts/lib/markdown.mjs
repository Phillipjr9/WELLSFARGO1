// Minimal Markdown → HTML for re-captured source text.
//
// `scripts/capture-sources.mjs` writes one Markdown file per page from the
// original Wells Fargo page; this turns that file back into the same kind of
// markup a browser capture would have produced (headings, paragraphs, lists,
// tables, links). Nothing is paraphrased: the text is whatever the source page
// said.
//
// Supported: # … ###### headings, paragraphs, -, *, 1. lists, | tables |,
// [text](url) links, **bold**, *italic*, `code`, > quotes, --- rules.

const inline = (text) =>
  text
    // Links first, so emphasis inside link text is still handled below.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) =>
      `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, "&amp;");

const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) { index += 1; continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { out.push("<hr>"); index += 1; continue; }

    // Table: header row, separator row, body rows.
    if (/^\|/.test(line.trim()) && /^\|[\s:|-]+\|$/.test((lines[index + 1] || "").trim())) {
      const head = cells(line.trim());
      index += 2;
      const body = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) body.push(cells(lines[index++].trim()));
      out.push(
        `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>` +
        `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, "").trim());
        index += 1;
      }
      out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, "").trim());
        index += 1;
      }
      out.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s|>|\||-{3,})/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    else { out.push(`<p>${inline(lines[index].trim())}</p>`); index += 1; }
  }

  return out.join("\n");
}
