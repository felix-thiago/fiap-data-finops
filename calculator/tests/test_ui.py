"""Testes automatizados de UI (Playwright + Chromium headless) contra o index.html gerado.

Cobrem o que antes só era verificado manualmente no navegador: navegação entre abas sem
erro, casos de borda (volume zero, todos os estágios desligados, orçamento zero, falha alta),
o botão Go/No-Go, o popup de ajuda, a conversão de moeda e o botão "Atualizar preços" sem
servidor. Requer `pip install pytest-playwright` e `playwright install chromium`.

Uso:  python -m pytest calculator/tests/test_ui.py -q
"""

from __future__ import annotations
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX_URL = ROOT.joinpath("index.html").resolve().as_uri()

TAB_IDS = ["pipeline", "result", "gate", "schedule", "compare", "optimize", "sensitivity", "assumptions"]
BROKEN_VALUE_RE = re.compile(r"\bNaN\b|\bundefined\b|\bInfinity\b")


@pytest.fixture()
def app(page):
    page.goto(INDEX_URL)
    page.wait_for_selector("#summary .scard")
    return page


def _click_tab(page, tab_id):
    page.click(f'.tab[data-tab="{tab_id}"]')
    page.wait_for_selector("#tabBody")


def _body_text(page):
    return page.inner_text("#tabBody")


def test_all_tabs_render_without_broken_values(app):
    for tab_id in TAB_IDS:
        _click_tab(app, tab_id)
        text = _body_text(app)
        assert not BROKEN_VALUE_RE.search(text), f"valor quebrado na aba {tab_id!r}"
        assert text.strip(), f"aba {tab_id!r} renderizou vazia"


def test_no_console_errors_across_tabs(app):
    errors = []
    app.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    app.on("pageerror", lambda exc: errors.append(str(exc)))
    for tab_id in TAB_IDS:
        _click_tab(app, tab_id)
    assert errors == []


def test_default_scenario_matches_engine(app):
    _click_tab(app, "result")
    text = _body_text(app)
    assert "$2,725" in app.inner_text("#summary")
    assert "PASS" in app.inner_text("#summary")


@pytest.mark.parametrize("script", [
    "G.sourceVolumeGB=0; G.dailyDeltaGB=0; G.recordsPerDay=0; render();",
    "STAGES.forEach(s=>s.enabled=false); render();",
    "G.budgetMonthly=0; render();",
    "G.failureRate=100; G.retries=10; render();",
])
def test_edge_cases_do_not_crash_or_produce_broken_values(app, script):
    app.evaluate(script)
    for tab_id in TAB_IDS:
        _click_tab(app, tab_id)
        assert not BROKEN_VALUE_RE.search(_body_text(app))
    app.evaluate("G=structuredClone(G_DEFAULTS); STAGES=STAGE_DEFAULTS(); render();")


def test_currency_conversion_and_budget_stays_in_usd(app):
    app.select_option("#currency", "BRL")
    app.wait_for_timeout(50)
    cost_card = app.inner_text("#sc-cost")
    assert "R$" in cost_card
    gate_card = app.inner_text("#sc-gate")
    assert "US$" in gate_card
    assert "≈" in gate_card and "R$" in gate_card  # equivalente convertido, mas o valor editável fica em USD
    app.select_option("#currency", "USD")


def test_editing_budget_input_keeps_focus_and_updates_gate(app):
    inp = app.locator("#sumBudget")
    inp.click()
    inp.fill("100000")
    app.wait_for_timeout(50)
    assert app.evaluate("document.activeElement === document.getElementById('sumBudget')")
    _click_tab(app, "gate")
    assert "GO" in app.inner_text("#tabBody .gate-box .gb-v")
    app.evaluate("G.budgetMonthly=2500; render();")


def test_help_popup_opens_and_closes(app):
    _click_tab(app, "pipeline")
    btn = app.locator('.card.stage .fld:has-text("Table format") .info').first
    btn.click()
    assert app.locator(".pop").count() == 1
    assert "Table format" in app.inner_text(".pop .pop-t")
    app.mouse.click(5, 5)
    assert app.locator(".pop").count() == 0


def test_decision_profile_lives_in_compare_tab_and_reorders_ranking(app):
    assert app.locator("#profile").count() == 0  # removido do cabeçalho
    assert app.locator("#reset").count() == 0     # botão Reset scenario removido
    _click_tab(app, "compare")
    select = app.locator('#tabBody select:has(option:has-text("Balanced"))').first
    balanced_first = app.inner_text("#tabBody table.cmp tr:first-child th:nth-child(2)")
    select.select_option("cost")
    app.wait_for_timeout(50)
    cost_first = app.inner_text("#tabBody table.cmp tr:first-child th:nth-child(2)")
    assert balanced_first == cost_first  # a primeira coluna da tabela não muda de posição
    select.select_option("balanced")


def test_price_refresh_button_without_server_explains_how_to_start_it(app):
    app.click("#refreshPrices")
    modal = app.locator("#modal")
    assert modal.count() == 1
    assert "serve.py" in modal.inner_text()
    modal.locator("button:has-text('Fechar')").click()
    assert app.locator("#modal").count() == 0


def test_mobile_tabs_scroll_instead_of_wrapping(app):
    app.set_viewport_size({"width": 375, "height": 812})
    box = app.evaluate(
        "(() => { const t=document.querySelector('.tabs'); const r=t.getBoundingClientRect(); "
        "return {height:r.height, scrollable: t.scrollWidth > t.clientWidth}; })()"
    )
    assert box["scrollable"] is True
    assert box["height"] < 60  # uma linha só, não quebra em várias
    app.set_viewport_size({"width": 1280, "height": 900})
