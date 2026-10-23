// แปลง markdown แบบง่ายเป็น HTML ปลอดภัย (escape ก่อนเสมอ แล้วค่อยใส่แท็กที่กำหนดเอง)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

function textBlock(b) {
  let out = '';
  let list = null;
  const close = () => {
    if (list) out += `</${list}>`;
    list = null;
  };
  for (const line of b.split('\n')) {
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; }
      out += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; }
      out += `<li>${inline(m[1])}</li>`;
    } else {
      close();
      if ((m = line.match(/^#{1,6}\s+(.*)/))) out += `<p><strong>${inline(m[1])}</strong></p>`;
      else if (line.trim()) out += `<p>${inline(line)}</p>`;
    }
  }
  close();
  return out;
}

export function mdToHtml(src) {
  return String(src || '')
    .split(/```[a-z0-9]*\n?/i)
    .map((b, i) => (i % 2 ? `<pre><code>${esc(b.replace(/\n$/, ''))}</code></pre>` : textBlock(b)))
    .join('');
}
