"""O relatório de métricas roda e a classificação de SLA do motor bate com o recálculo independente."""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def test_metrics_report_runs_and_sla_agrees(tmp_path):
    out = tmp_path / "metrics.md"
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "metrics_report.py"), "--no-js", "--out", str(out)],
                       capture_output=True, text=True, encoding="utf-8", check=True)
    assert "168/168" in r.stdout
    text = out.read_text(encoding="utf-8")
    for section in ("Métrica 2", "Métrica 3", "Métrica 4", "Métrica 5", "Etapa 5"):
        assert section in text


def test_expert_concordance(tmp_path):
    import json
    experts = tmp_path / "experts.json"
    experts.write_text(json.dumps({"avaliadores": [
        {"escolhas": {"medium": {"cost": "lake", "balanced": "lake", "performance": "elt"}}},
        {"escolhas": {"medium": {"cost": "lake", "balanced": "dbx", "performance": "elt"}}},
        {"escolhas": {"medium": {"cost": "lake", "balanced": "lake"}}},
    ]}), encoding="utf-8")
    out = tmp_path / "metrics.md"
    subprocess.run([sys.executable, str(ROOT / "tools" / "metrics_report.py"), "--no-js", "--out", str(out),
                    "--experts", str(experts)], capture_output=True, text=True, encoding="utf-8", check=True)
    text = out.read_text(encoding="utf-8")
    # médio: ferramenta põe "lake" em 1º nos perfis cost e balanced e Photon em 1º no performance
    assert "Concordância no 1º lugar: 2/3" in text
    assert "Escolha do especialista entre os 3 primeiros: 3/3" in text
    assert "(2/3)" in text                                   # placar da maioria no balanced
    assert "Concordância entre avaliadores" in text
