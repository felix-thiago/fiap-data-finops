#!/usr/bin/env python3
"""
Servidor local do DataCost Architect: serve o app e permite atualizar os preços pelo botão
"Atualizar preços" (roda tools/fetch_pricing.py e depois build.py em segundo plano).

    python tools/serve.py            # http://127.0.0.1:8765  (abre o navegador)
    python tools/serve.py --port 9000 --no-browser

Segurança: escuta só em 127.0.0.1; o POST exige o cabeçalho X-DataCost (que força preflight de CORS,
nunca respondido) e, se houver Origin, ele precisa ser o próprio servidor; um único job por vez;
nenhum parâmetro do cliente chega ao subprocesso.
"""

from __future__ import annotations
import argparse, collections, json, os, pathlib, subprocess, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
STEPS = [("aws", "AWS Price List (S3, Glue, Athena, EC2, EMR, DMS)"),
         ("azure", "Azure Retail Prices API (Databricks, ADLS, VMs)"),
         ("fx", "Câmbio USD→BRL/EUR"),
         ("save", "Gravando pricing.json, Parquet e DuckDB"),
         ("build", "Regerando o index.html")]
MARKERS = [("→ AWS", "aws"), ("→ Azure", "azure"), ("→ Câmbio", "fx"), ("preços gravados", "save")]


class RefreshJob:
    def __init__(self, root: pathlib.Path, collector_cmd: list[str], build_cmd: list[str]):
        self.root, self.collector_cmd, self.build_cmd = root, collector_cmd, build_cmd
        self.lock = threading.Lock()
        self.state = "idle"                       # idle | running | done | error
        self.started_at = self.finished_at = None
        self.current = None
        self.done_steps: list[str] = []
        self.log = collections.deque(maxlen=200)
        self.error = ""
        self.last_duration = self._read_last_duration()

    # ---- estimativa -------------------------------------------------------
    def _last_path(self):
        return self.root / ".cache" / "last_refresh.json"

    def _read_last_duration(self):
        try:
            return float(json.loads(self._last_path().read_text())["seconds"])
        except Exception:                                           # noqa: BLE001
            return None

    def estimate_seconds(self) -> int:
        if self.last_duration:
            return int(self.last_duration) + 5
        cached = (self.root / ".cache" / "AmazonEC2_us-east-1.json").exists()
        return 90 if cached else 240

    # ---- execução ---------------------------------------------------------
    def start(self) -> bool:
        with self.lock:
            if self.state == "running":
                return False
            self.state, self.error = "running", ""
            self.started_at, self.finished_at = time.time(), None
            self.current, self.done_steps = "aws", []
            self.log.clear()
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _advance(self, step):
        with self.lock:
            if self.current and self.current not in self.done_steps and self.current != step:
                self.done_steps.append(self.current)
            self.current = step

    def _run(self):
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        try:
            proc = subprocess.Popen(self.collector_cmd, cwd=self.root, env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            for line in proc.stdout:
                line = line.rstrip()
                if not line:
                    continue
                self.log.append(line)
                for marker, step in MARKERS:
                    if line.startswith(marker):
                        self._advance(step)
            if proc.wait() != 0:
                raise RuntimeError(f"o coletor terminou com código {proc.returncode}")
            self._advance("build")
            out = subprocess.run(self.build_cmd, cwd=self.root, env=env, capture_output=True, text=True,
                                 encoding="utf-8", errors="replace")
            self.log.append((out.stdout or out.stderr).strip())
            if out.returncode != 0:
                raise RuntimeError("falha ao regerar o index.html")
            with self.lock:
                self.done_steps = [s for s, _ in STEPS]
                self.state, self.current = "done", None
        except Exception as exc:                                    # noqa: BLE001
            with self.lock:
                self.state, self.error = "error", str(exc)
        finally:
            with self.lock:
                self.finished_at = time.time()
                if self.state == "done":
                    self.last_duration = self.finished_at - self.started_at
                    try:
                        self._last_path().parent.mkdir(exist_ok=True)
                        self._last_path().write_text(json.dumps({"seconds": self.last_duration}))
                    except OSError:
                        pass

    # ---- estado -----------------------------------------------------------
    def status(self) -> dict:
        with self.lock:
            now = time.time()
            end = self.finished_at or now
            steps = []
            for sid, label in STEPS:
                st = "done" if sid in self.done_steps else ("running" if sid == self.current else "pending")
                steps.append({"id": sid, "label": label, "status": st})
            try:
                meta = json.loads((self.root / "pricing.json").read_text(encoding="utf-8"))["meta"]
            except Exception:                                       # noqa: BLE001
                meta = {}
            return {"state": self.state, "elapsed": round(end - self.started_at, 1) if self.started_at else 0,
                    "estimate_seconds": self.estimate_seconds(), "steps": steps, "error": self.error,
                    "log_tail": list(self.log)[-8:], "generated_at": meta.get("generated_at"),
                    "fx": meta.get("fx"), "counts": meta.get("counts")}


def make_handler(job: RefreshJob, root: pathlib.Path, port_ref: list[int]):
    class Handler(BaseHTTPRequestHandler):
        server_version = "DataCostServe/1.0"

        def log_message(self, *a):                                  # silencioso
            pass

        def _send(self, code, body: bytes, ctype="application/json; charset=utf-8"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                return self._send(200, (root / "index.html").read_bytes(), "text/html; charset=utf-8")
            if path == "/api/prices/status":
                return self._json(200, job.status())
            if path == "/api/prices":
                return self._send(200, (root / "pricing.json").read_bytes())
            self._json(404, {"error": "não encontrado"})

        def do_POST(self):
            if self.path.split("?")[0] != "/api/prices/refresh":
                return self._json(404, {"error": "não encontrado"})
            origin = self.headers.get("Origin")
            allowed = {f"http://127.0.0.1:{port_ref[0]}", f"http://localhost:{port_ref[0]}"}
            if self.headers.get("X-DataCost") != "1" or (origin and origin not in allowed):
                return self._json(403, {"error": "origem não permitida"})
            started = job.start()
            self._json(202 if started else 200, {**job.status(), "already_running": not started})

    return Handler


def make_server(root=ROOT, host="127.0.0.1", port=8765, collector_cmd=None, build_cmd=None):
    collector_cmd = collector_cmd or [sys.executable, "-u", str(root / "tools" / "fetch_pricing.py")]
    build_cmd = build_cmd or [sys.executable, str(root / "build.py")]
    job = RefreshJob(root, collector_cmd, build_cmd)
    port_ref = [port]
    srv = ThreadingHTTPServer((host, port), make_handler(job, root, port_ref))
    port_ref[0] = srv.server_address[1]
    return srv, job


def main():
    ap = argparse.ArgumentParser(description="Servidor local do DataCost Architect")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    srv, _ = make_server(port=args.port)
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"DataCost Architect em {url}  (Ctrl+C para parar)")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado")


if __name__ == "__main__":
    main()
