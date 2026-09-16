#!/usr/bin/env python3
"""Gera index.html concatenando shell.html + pricing.js + engine.js + app.js."""
import pathlib
d = pathlib.Path(__file__).parent
html = (d/'shell.html').read_text(encoding='utf-8')
for token, fname in (('/*__PRICING__*/','pricing.js'), ('/*__ENGINE__*/','engine.js'), ('/*__APP__*/','app.js')):
    html = html.replace(token, (d/'src'/fname).read_text(encoding='utf-8') if (d/'src'/fname).exists()
                        else (d/fname).read_text(encoding='utf-8'))
(d/'index.html').write_text(html, encoding='utf-8')
print(f'index.html gerado: {len(html):,} bytes')
