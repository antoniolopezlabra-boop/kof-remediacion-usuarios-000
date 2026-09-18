// Markdown mínimo y seguro (escapa HTML primero) para las respuestas del asistente.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function markdown(md: string): string {
  const lineas = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lineas.length && /^\s*\|[\s:|-]+\|\s*$/.test(lineas[i + 1])) {
      const celdas = (x: string) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = celdas(l);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) filas.push(celdas(lineas[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*[-*•]\s+/.test(lineas[i])) items.push(inline(lineas[i++].replace(/^\s*[-*•]\s+/, '')));
      out.push(`<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) items.push(inline(lineas[i++].replace(/^\s*\d+[.)]\s+/, '')));
      out.push(`<ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>`);
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push(`<h3>${inline(h[2])}</h3>`);
      i++;
      continue;
    }
    if (l.trim() === '' || /^-{3,}$/.test(l.trim())) {
      i++;
      continue;
    }
    const parr: string[] = [];
    while (i < lineas.length && lineas[i].trim() !== '' && !/^\s*([-*•]|\d+[.)]|\||#)/.test(lineas[i])) parr.push(inline(lineas[i++]));
    if (parr.length) out.push(`<p>${parr.join('<br/>')}</p>`);
    else i++;
  }
  return out.join('');
}
