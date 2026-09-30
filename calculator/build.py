#!/usr/bin/env python3
"""Gera index.html e executive.html concatenando src/*_shell.html com os módulos JS.

Ambos compartilham pricing.js, calibration.js, engine.js e workload_default.js —
só a camada de apresentação (app.js vs. executive.js) muda entre as duas telas.
"""
import pathlib
d = pathlib.Path(__file__).parent
src = d / 'src'


def build(shell_name, app_token, app_file, out_name):
    html = (src / shell_name).read_text(encoding='utf-8')
    for token, fname in (
        ('/*__PRICING__*/', 'pricing.js'),
        ('/*__CALIBRATION__*/', 'calibration.js'),
        ('/*__ENGINE__*/', 'engine.js'),
        ('/*__WORKLOAD__*/', 'workload_default.js'),
        (app_token, app_file),
    ):
        html = html.replace(token, (src / fname).read_text(encoding='utf-8'))
    (d / out_name).write_text(html, encoding='utf-8')
    print(f'{out_name} gerado: {len(html):,} bytes')


build('shell.html', '/*__APP__*/', 'app.js', 'index.html')
build('executive_shell.html', '/*__EXECUTIVE__*/', 'executive.js', 'executive.html')
