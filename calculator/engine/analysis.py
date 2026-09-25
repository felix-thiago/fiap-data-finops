"""Varredura de schedule, variantes, score multicritério, otimizações, sensibilidade e break-even."""

from __future__ import annotations
import copy, math

from .catalog import ENGINES, FREQUENCIES
from .core import calc_pipeline


def schedule_sweep(g, stages, scope=None):
    out = []
    for runs, label in FREQUENCIES:
        st = [({**s, "runs_per_day": runs} if (scope is None or s["key"] in scope) else s) for s in stages]
        r = calc_pipeline(g, st)
        out.append(dict(runs_per_day=runs, label=label, monthly=r["monthly"],
                        latency_min=r["latency_min"], processing_min=r["processing_min"],
                        sla_status=r["sla_status"],
                        per_stage={row["stage"]["key"]: row["total_disc"] for row in r["rows"]}))
    return out


def _swap_transforms(stages, engine):
    ok = "transform" in ENGINES[engine]["roles"]
    return [({**s, "engine": engine} if s["kind"] == "transform" and ok else s) for s in stages]


def _elt(g, s):
    def f(x):
        if x["kind"] == "transform" and x["key"] != "bronze":
            return {**x, "engine": "snowflake_wh", "wh_size": "M"}
        if x["kind"] == "load":
            return {**x, "engine": "snowpipe"}
        return x
    return g, [f(x) for x in s]


def _azure(g, s):
    def f(x):
        if x["kind"] in ("ingest", "transform"):
            return x if ENGINES[x["engine"]]["kind"] == "snowflake" else {**x, "engine": "databricks"}
        if x["kind"] == "serve" and x["engine"] == "athena":
            return {**x, "engine": "dbsql"}
        return x
    return {**g, "cloud": "azure"}, [f(x) for x in s]


VARIANTS = {
    "asis": dict(id="asis", name="As-is (configuração atual)",
                 note="O pipeline exatamente como está configurado na aba Pipeline.",
                 apply=lambda g, s: (g, s)),
    "dbx": dict(id="dbx", name="Databricks Photon nas transformações",
                note="Bronze/Silver/Gold migrados para Databricks Jobs com Photon; ingestão e DW inalterados.",
                apply=lambda g, s: (g, _swap_transforms(s, "databricks_photon"))),
    "glue6": dict(id="glue6", name="AWS Glue 6.0+",
                  note="Todos os jobs Glue migrados para Glue 6.0+ (US$ 0,308/DPU-h contra US$ 0,44); assume o mesmo throughput — validar com execução real.",
                  apply=lambda g, s: (g, [({**x, "engine": "glue6"} if x["engine"] == "glue" else x) for x in s])),
    "emr": dict(id="emr", name="PySpark em EMR",
                note="Transformações em cluster EMR próprio (EC2 + uplift EMR), maior complexidade operacional.",
                apply=lambda g, s: (g, _swap_transforms(s, "emr_spark"))),
    "lake": dict(id="lake", name="Servir do lake (Athena), sem DW",
                 note="Remove a carga no Snowflake; o consumo passa a ler a camada Gold direto no S3 via Athena.",
                 apply=lambda g, s: (g, [({**x, "engine": "athena"} if x["kind"] == "serve" else x)
                                         for x in s if x["kind"] != "load"])),
    "azure": dict(id="azure", name="Azure: Databricks + ADLS",
                  note="Ingestão e transformações em Databricks Jobs (Azure), storage em ADLS Gen2 e consumo em Databricks SQL; DW Snowflake mantido. Preços da Azure Retail Prices API.",
                  apply=lambda g, s: _azure(g, s)),
    "elt": dict(id="elt", name="ELT dentro do Snowflake",
                note="Ingestão para o S3, carga bruta via Snowpipe e transformações Silver/Gold executadas em virtual warehouse.",
                apply=_elt),
}

PROFILES = {
    "cost":        dict(label="Cost Optimized", w=dict(cost=.55, sla=.20, perf=.15, scale=.05, cx=.05)),
    "balanced":    dict(label="Balanced", w=dict(cost=.40, sla=.25, perf=.20, scale=.10, cx=.05)),
    "performance": dict(label="Performance Optimized", w=dict(cost=.20, sla=.35, perf=.30, scale=.10, cx=.05)),
}


def score_variants(results, weights):
    def norm(v, mn, mx):
        return 1 if mx == mn else 1 - (v - mn) / (mx - mn)

    costs = [r["monthly"] for r in results]
    times = [r["processing_min"] for r in results]
    cxs = [r["complexity"] for r in results]
    out = []
    for r in results:
        s_cost = norm(r["monthly"], min(costs), max(costs))
        s_perf = norm(r["processing_min"], min(times), max(times))
        s_cx = norm(r["complexity"], min(cxs), max(cxs))
        s_sla = {"PASS": 1, "PARTIAL": 0.5}.get(r["sla_status"], 0)
        s_scale = 1 if any(ENGINES[x["stage"]["engine"]]["kind"] in ("dbx", "dbx_sl") for x in r["rows"]) else 0.8
        total = (weights["cost"] * s_cost + weights["sla"] * s_sla + weights["perf"] * s_perf
                 + weights["scale"] * s_scale + weights["cx"] * s_cx)
        out.append({**r, "score": total * 100})
    return sorted(out, key=lambda r: -r["score"])


_BAD_FORMATS = ("csv-gzip", "json-none", "avro-snappy")


def _table_gold(g, s):
    return g, [({**x, "table_format": "iceberg", "maintenance_runs_per_month": 0 if x["kind"] == "serve" else 30}
                if (x["key"] == "gold" or x["kind"] == "serve") else x) for x in s]


def _wh_rightsize(g, s):
    return g, [({**x, "wh_size": "M" if x["wh_size"] == "L" else "S"}
                if ENGINES[x["engine"]]["kind"] == "snowflake" and x["wh_size"] in ("M", "L") else x) for x in s]


OPT_RULES = [
    dict(id="full-to-incremental", title="Migrar de Full Load para Incremental",
         why="O delta diário é uma fração pequena da base; reprocessar tudo a cada execução multiplica compute, escrita e storage.",
         applies=lambda g, s, b: g["ingestion"] == "full" and g["daily_delta_gb"] < g["source_volume_gb"] * 0.25,
         patch=lambda g, s: ({**g, "ingestion": "incremental"}, s)),
    dict(id="glue-6", title="Migrar os jobs Glue para Glue 6.0+",
         why="O Glue 6.0+ cobra US$ 0,308 por DPU-hora contra US$ 0,44 do Glue anterior (~30% menos). Assume o mesmo throughput; validar com uma execução real.",
         applies=lambda g, s, b: any(x["enabled"] and x["engine"] == "glue" for x in s),
         patch=lambda g, s: (g, [({**x, "engine": "glue6"} if x["engine"] == "glue" else x) for x in s])),
    dict(id="columnar-raw", title="Adotar Parquet + ZSTD nas camadas em CSV/JSON",
         why="Formato colunar comprimido reduz storage, requests e o volume lido pelos estágios seguintes.",
         applies=lambda g, s, b: any(x["enabled"] and x["file_format"] in _BAD_FORMATS for x in s),
         patch=lambda g, s: (g, [({**x, "file_format": "parquet-zstd"} if x["file_format"] in _BAD_FORMATS else x) for x in s])),
    dict(id="table-format-gold", title="Adotar Iceberg na camada consumida",
         why="Partition e file pruning reduzem o volume escaneado por consulta; o custo extra de metadados costuma ser menor que a economia de scan.",
         applies=lambda g, s, b: any(x["enabled"] and x["kind"] == "serve" and ENGINES[x["engine"]]["kind"] == "athena" for x in s)
         and any(x["enabled"] and x["key"] == "gold" and x["table_format"] == "hive" for x in s),
         patch=_table_gold),
    dict(id="raw-lifecycle", title="Mover a camada bruta para S3 Standard-IA",
         why="A camada bruta com retenção longa é lida raramente depois de processada — candidata natural a classe de armazenamento mais barata.",
         applies=lambda g, s, b: any(x["enabled"] and x["kind"] == "ingest" and x["storage_class"] == "standard" and x["retention_days"] >= 180 for x in s),
         patch=lambda g, s: (g, [({**x, "storage_class": "ia"} if x["kind"] == "ingest" else x) for x in s])),
    dict(id="raw-retention", title="Reduzir a retenção da camada bruta para 90 dias",
         why="Com Silver e Gold versionadas, manter a bruta por mais de um ano raramente atende a um requisito real de negócio ou compliance.",
         applies=lambda g, s, b: any(x["enabled"] and x["kind"] == "ingest" and x["retention_days"] > 180 for x in s),
         patch=lambda g, s: (g, [({**x, "retention_days": 90} if x["kind"] == "ingest" else x) for x in s])),
    dict(id="file-compaction", title="Compactar arquivos para ~128 MB",
         why="Muitos arquivos pequenos elevam o custo de requests e o overhead de planejamento das engines.",
         applies=lambda g, s, b: g["target_file_mb"] < 64,
         patch=lambda g, s: ({**g, "target_file_mb": 128}, s)),
    dict(id="downscale-schedule", title="Reduzir a frequência dos estágios com folga de freshness",
         why="Há folga entre a latência atual e o requisito de freshness; executar menos vezes reduz startups e mínimos de cobrança.",
         applies=lambda g, s, b: b is not None and b["latency_min"] < g["freshness_hours"] * 60 * 0.45
         and any(x["enabled"] and x["runs_per_day"] > 1 for x in s),
         patch=lambda g, s: (g, [({**x, "runs_per_day": max(1, math.floor(x["runs_per_day"] / 2 + 0.5))} if x["runs_per_day"] > 1 else x) for x in s])),
    dict(id="wh-autosuspend", title="Reduzir auto-suspend do warehouse para 60 s",
         why="Warehouse suspenso não consome créditos; janelas de ociosidade longas são cobradas a cada execução ou sessão.",
         applies=lambda g, s, b: any(x["enabled"] and ENGINES[x["engine"]]["kind"] == "snowflake" and (x.get("auto_suspend_sec") or 0) > 120 for x in s),
         patch=lambda g, s: (g, [({**x, "auto_suspend_sec": 60} if ENGINES[x["engine"]]["kind"] == "snowflake" else x) for x in s])),
    dict(id="wh-rightsize", title="Reduzir o tamanho do virtual warehouse",
         why="O tempo total de processamento está bem abaixo do SLA; um warehouse menor mantém o SLA a metade do custo em créditos.",
         applies=lambda g, s, b: b is not None and b["processing_min"] < g["sla_max_minutes"] * 0.5
         and any(x["enabled"] and ENGINES[x["engine"]]["kind"] == "snowflake" and x["wh_size"] in ("M", "L") for x in s),
         patch=_wh_rightsize),
]


def find_optimizations(g, stages, base):
    out = []
    for rule in OPT_RULES:
        if not rule["applies"](g, stages, base):
            continue
        ng, ns = rule["patch"](copy.deepcopy(g), copy.deepcopy(stages))
        after = calc_pipeline(ng, ns)
        saving = base["monthly"] - after["monthly"]
        if saving <= base["monthly"] * 0.01:
            continue
        out.append(dict(id=rule["id"], title=rule["title"], why=rule["why"],
                        saving=saving, saving_pct=saving / base["monthly"] * 100,
                        new_monthly=after["monthly"],
                        sla_before=base["sla_status"], sla_after=after["sla_status"],
                        lat_before=base["latency_min"], lat_after=after["latency_min"]))
    return sorted(out, key=lambda o: -o["saving"])


SENS_MULTIPLIERS = [0.25, 0.5, 1, 2, 4, 8, 16]


def scale_g(g, m):
    return {**g, "source_volume_gb": g["source_volume_gb"] * m, "daily_delta_gb": g["daily_delta_gb"] * m,
            "records_per_day": g["records_per_day"] * m, "scan_per_query_gb": g["scan_per_query_gb"] * m}


def sensitivity(g, stages, variant_ids):
    rows = []
    for m in SENS_MULTIPLIERS:
        sg = scale_g(g, m)
        row = dict(multiplier=m, tb=0, costs={})
        for vid in variant_ids:
            vg, vs = VARIANTS[vid]["apply"](sg, stages)
            r = calc_pipeline(vg, vs)
            row["costs"][vid] = r["monthly"]
            if not row["tb"]:
                row["tb"] = r["tb_processed"]
        rows.append(row)
    return rows


def break_even(g, stages, variant_ids):
    steps, lo, hi = 60, math.log10(0.1), math.log10(30)
    prev, out = None, []
    for s in range(steps + 1):
        m = 10 ** (lo + (hi - lo) * s / steps)
        sg = scale_g(g, m)
        best, tb = None, 0
        for vid in variant_ids:
            vg, vs = VARIANTS[vid]["apply"](sg, stages)
            r = calc_pipeline(vg, vs)
            tb = r["tb_processed"]
            if best is None or r["monthly"] < best["cost"]:
                best = dict(id=vid, cost=r["monthly"])
        if prev and best["id"] != prev["id"]:
            out.append(dict(multiplier=m, tb=tb, from_=prev["id"], to=best["id"]))
        prev = best
    return out


def budget_gate(monthly, range_, budget):
    """GO: limite superior cabe no orçamento; REVIEW: valor central cabe, superior estoura; NO-GO: central estoura."""
    if not budget > 0:
        return dict(status="NONE", budget=0, monthly=monthly, headroom=0, used_pct=0)
    status = "NO-GO" if monthly > budget else ("REVIEW" if range_["high"] > budget else "GO")
    return dict(status=status, budget=budget, monthly=monthly, headroom=budget - monthly,
                used_pct=monthly / budget * 100)


def gate_suggestions(g, stages, budget, max_steps=6):
    cg, cs = g, stages
    cur = calc_pipeline(cg, cs)
    steps, used = [], set()
    while cur["monthly"] > budget and len(steps) < max_steps:
        cands = []
        for r in OPT_RULES:
            if r["id"] in used or not r["applies"](cg, cs, cur):
                continue
            ng, ns = r["patch"](copy.deepcopy(cg), copy.deepcopy(cs))
            a = calc_pipeline(ng, ns)
            saving = cur["monthly"] - a["monthly"]
            if saving > cur["monthly"] * 0.01:
                cands.append((r, ng, ns, a, saving))
        if not cands:
            break
        r, ng, ns, a, saving = sorted(cands, key=lambda c: -c[4])[0]
        used.add(r["id"])
        steps.append(dict(id=r["id"], title=r["title"], why=r["why"], saving=saving,
                          new_monthly=a["monthly"], sla_after=a["sla_status"]))
        cg, cs, cur = ng, ns, a
    return dict(steps=steps, final_monthly=cur["monthly"], reachable=cur["monthly"] <= budget,
                final_sla=cur["sla_status"])
