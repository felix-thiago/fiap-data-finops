#!/usr/bin/env python3
"""
Métrica 1 do TCC: erro de estimativa = |estimado - oficial| / oficial × 100.

Lê `validation/official.json` (preenchido a partir das calculadoras oficiais) e compara com o modelo.
Linhas e totais com `official_usd: null` são listados como pendentes.

Uso:  python tools/validation_compare.py
"""

from __future__ import annotations
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "validation"))
sys.path.insert(0, str(ROOT / "tools"))

from validation_worksheet import worksheet, LINES
from workloads import WORKLOADS


def err_pct(est, ref):
    return abs(est - ref) / ref * 100 if ref else float("nan")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    official = json.loads((ROOT / "validation" / "official.json").read_text(encoding="utf-8"))
    labels = {k: label for k, label, *_ in LINES}
    rows, pending = [], 0
    for name, fn in WORKLOADS.items():
        g, s = fn()
        r, L = worksheet(g, s)
        o = official.get(name, {})
        print(f"\n== {name}: modelo US$ {r['monthly']:,.2f}")
        comparable_model_total = 0.0
        for key, val in o.get("lines", {}).items():
            model = round(L[key]["cost"], 2)
            ref = val.get("official_usd")
            if ref is None:
                pending += 1
                note = f"  ({val['note']})" if val.get("note") else ""
                print(f"  {labels[key]:<58} modelo {model:>10,.2f}   oficial  pendente{note}")
                continue
            comparable_model_total += model
            e = err_pct(model, ref)
            rows.append((name, labels[key], model, ref, e))
            err_txt = "N/A (oficial=0, ex.: free tier)" if e != e else f"{e:5.1f}%"
            print(f"  {labels[key]:<58} modelo {model:>10,.2f}   oficial {ref:>10,.2f}   erro {err_txt}")
        ref = o.get("official_total_usd")
        if ref is None:
            pending += 1
            print("  TOTAL: oficial pendente")
        else:
            # Compara o total oficial só com a soma das linhas do modelo que têm equivalente oficial
            # (exclui linhas "pendente", como manutenção, que nenhuma calculadora oficial modela).
            e = err_pct(comparable_model_total, ref)
            rows.append((name, "TOTAL (linhas comparáveis)", comparable_model_total, ref, e))
            print(f"  TOTAL (linhas comparáveis) modelo {comparable_model_total:,.2f}  oficial {ref:,.2f}  erro {e:.1f}%")
            if abs(comparable_model_total - r["monthly"]) > 0.01:
                print(f"  (memo: custo total do modelo p/ este workload, incl. linhas sem equivalente oficial: {r['monthly']:,.2f})")
    if rows:
        errs = [x[4] for x in rows if x[4] == x[4]]
        print(f"\nErro médio absoluto: {sum(errs) / len(errs):.1f}%  ({len(errs)} comparações, {pending} pendentes)")
    else:
        print(f"\nNenhum valor oficial preenchido ainda ({pending} pendentes). Preencha validation/official.json.")


if __name__ == "__main__":
    main()
