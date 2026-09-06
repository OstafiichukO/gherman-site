# -*- coding: utf-8 -*-
import re, sys, html, markdown

src = open(sys.argv[1], encoding='utf-8').read()

# Витягуємо метадані з шапки звіту, щоб винести їх на титульний блок
meta = {}
for key, pat in (('date', r'\*\*Дата прогону:\*\*\s*(.+)'), ('target', r'\*\*Ціль:\*\*\s*(.+)')):
    m = re.search(pat, src)
    if m:
        v = m.group(1).strip()
        v = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', v)          # [текст](лінк) -> текст
        v = re.sub(r'`([^`]+)`', lambda x: '<code>' + html.escape(x.group(1)) + '</code>',
                   html.escape(v).replace('&lt;','<').replace('&gt;','>'))
        meta[key] = v

body = markdown.markdown(src, extensions=['tables', 'fenced_code', 'sane_lists', 'attr_list'])

# Перший <h1> стає титулом сторінки, а не частиною потоку
m = re.search(r'<h1>(.*?)</h1>', body, re.S)
title = re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else 'Звіт'
if m: body = body[:m.start()] + body[m.end():]

# Прибираємо дубльовані рядки метаданих із тіла — вони вже в шапці
body = re.sub(r'<p><strong>Дата прогону:.*?</p>', '', body, flags=re.S)
body = re.sub(r'<p><strong>Ціль:.*?</p>', '', body, flags=re.S)

CSS = """
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'DejaVu Sans', 'Liberation Sans', sans-serif;
  font-size: 9.4pt; line-height: 1.52; color: #1E1B18; margin: 0;
  hyphens: none; word-break: normal; overflow-wrap: break-word;
}
.cover { border-bottom: 2.5pt solid #6E1423; padding-bottom: 9pt; margin-bottom: 16pt; }
.cover h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 7pt; color: #6E1423; font-weight: 700; letter-spacing: -.2pt; }
.cover .meta { font-size: 8.6pt; color: #6b625a; }
.cover .meta span { margin-right: 16pt; white-space: nowrap; }
.cover .meta b { color: #1E1B18; font-weight: 600; }

h2 {
  font-size: 13pt; color: #6E1423; margin: 20pt 0 7pt; padding-bottom: 3pt;
  border-bottom: .7pt solid #E3DED6; break-after: avoid; break-inside: avoid;
}
h3 { font-size: 10.6pt; margin: 13pt 0 5pt; color: #2b2320; break-after: avoid; break-inside: avoid; }
h4 { font-size: 9.6pt; margin: 10pt 0 4pt; break-after: avoid; }
p { margin: 0 0 6.5pt; }
ul, ol { margin: 0 0 7pt; padding-left: 15pt; }
li { margin-bottom: 2.5pt; }
li > ul, li > ol { margin-top: 2.5pt; }
strong { font-weight: 700; }
a { color: #6E1423; text-decoration: none; border-bottom: .4pt solid #d8c9a8; }

hr { border: 0; border-top: .7pt solid #E3DED6; margin: 16pt 0; }

table {
  border-collapse: collapse; width: 100%; margin: 8pt 0 11pt;
  font-size: 8.3pt; break-inside: avoid; table-layout: auto;
}
thead { display: table-header-group; }
th {
  background: #6E1423; color: #fff; font-weight: 600; text-align: left;
  padding: 4.5pt 5pt; border: .5pt solid #6E1423; line-height: 1.35;
}
td { padding: 4pt 5pt; border: .5pt solid #DED8CE; vertical-align: top; line-height: 1.4; }
tbody tr:nth-child(even) td { background: #FBF9F5; }
th[align=right], td[align=right] { text-align: right; }
th[align=center], td[align=center] { text-align: center; }
table code { font-size: 7.6pt; }

code {
  font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: 8.1pt; background: #F4F1EA; padding: .5pt 2.5pt;
  border-radius: 2pt; color: #4A0D18; overflow-wrap: anywhere;
}
pre {
  background: #F7F5EF; border: .5pt solid #E3DED6; border-left: 2.5pt solid #C9A961;
  padding: 6pt 8pt; margin: 7pt 0 10pt; border-radius: 2pt;
  break-inside: avoid; white-space: pre-wrap; overflow-wrap: anywhere;
}
pre code { background: none; padding: 0; font-size: 7.9pt; color: #2b2320; line-height: 1.45; }

blockquote {
  margin: 9pt 0; padding: 7pt 10pt; background: #FDF6E7;
  border-left: 2.5pt solid #C9A961; border-radius: 2pt; break-inside: avoid;
}
blockquote p:last-child { margin-bottom: 0; }
"""

out = f"""<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>{CSS}</style></head><body>
<div class="cover">
  <h1>{html.escape(title)}</h1>
  <div class="meta">
    <span><b>Дата прогону:</b> {meta.get('date','—')}</span>
    <span><b>Ціль:</b> {meta.get('target','—')}</span>
  </div>
</div>
{body}
</body></html>"""

open(sys.argv[2], 'w', encoding='utf-8').write(out)
print('HTML:', len(out), 'байт | заголовок:', title)
