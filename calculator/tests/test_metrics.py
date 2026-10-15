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
