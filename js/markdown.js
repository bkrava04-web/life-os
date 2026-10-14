// Small, dependency-free Markdown subset for model replies. Raw HTML is always
// escaped; the only tags emitted are fixed elements created by this renderer.
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function renderInline(value) {
  const code = [];
  let escaped = escapeHTML(value).replace(/`([^`\n]+)`/g, (_, source) => {
    const marker = `\u0000CODE${code.length}\u0000`;
    code.push(`<code>${source}</code>`);
    return marker;
  });
  escaped = escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
  return escaped.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => code[Number(index)] || '');
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  let codeLines = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(`<${list.tag}>${list.items.map(item => `<li>${renderInline(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    if (codeLines) {
      if (/^\s*```\s*$/.test(line)) {
        blocks.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else codeLines.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      codeLines = [];
      continue;
    }
    const heading = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const tag = ordered ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (codeLines) blocks.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  flushList();
  return blocks.join('');
}
