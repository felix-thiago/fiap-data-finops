import http.client, json, pathlib, sys, threading, time

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import serve


def _fake_root(tmp_path):
    (tmp_path / "index.html").write_text("<html>ok</html>", encoding="utf-8")
    (tmp_path / "pricing.json").write_text(json.dumps({"meta": {"generated_at": "2026-01-01", "fx": {"BRL": 5.0}}, "pricing": []}), encoding="utf-8")
    return tmp_path


def _start(tmp_path, collector_code):
    root = _fake_root(tmp_path)
    py = sys.executable
    srv, job = serve.make_server(root, port=0, collector_cmd=[py, "-c", collector_code],
                                 build_cmd=[py, "-c", "print('index.html gerado')"])
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, job, srv.server_address[1]


def _req(port, method, path, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    c.request(method, path, headers=headers or {})
    r = c.getresponse()
    return r.status, json.loads(r.read() or b"{}") if r.getheader("Content-Type", "").startswith("application/json") else None


def _wait(port, state, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        _, st = _req(port, "GET", "/api/prices/status")
        if st["state"] == state:
            return st
        time.sleep(0.1)
    raise AssertionError(f"não chegou em {state}: {st}")


OK = "import time; print('→ AWS'); time.sleep(0.6); print('→ Azure'); print('→ Câmbio'); print('35 preços gravados')"


def test_status_idle_and_static_routes(tmp_path):
    srv, job, port = _start(tmp_path, OK)
    try:
        code, st = _req(port, "GET", "/api/prices/status")
        assert code == 200 and st["state"] == "idle" and st["generated_at"] == "2026-01-01"
        assert [s["id"] for s in st["steps"]] == ["aws", "azure", "fx", "save", "build"]
        c = http.client.HTTPConnection("127.0.0.1", port); c.request("GET", "/"); assert c.getresponse().status == 200
        assert _req(port, "GET", "/etc/passwd")[0] == 404
    finally:
        srv.shutdown()


def test_refresh_requires_header_and_same_origin(tmp_path):
    srv, job, port = _start(tmp_path, OK)
    try:
        assert _req(port, "POST", "/api/prices/refresh")[0] == 403
        assert _req(port, "POST", "/api/prices/refresh", {"X-DataCost": "1", "Origin": "https://evil.example"})[0] == 403
        assert job.state == "idle"
    finally:
        srv.shutdown()


def test_refresh_runs_once_and_finishes(tmp_path):
    srv, job, port = _start(tmp_path, OK)
    try:
        h = {"X-DataCost": "1", "Origin": f"http://127.0.0.1:{port}"}
        code, st = _req(port, "POST", "/api/prices/refresh", h)
        assert code == 202 and st["state"] == "running"
        code, st2 = _req(port, "POST", "/api/prices/refresh", h)
        assert code == 200 and st2["already_running"] is True
        st = _wait(port, "done")
        assert all(s["status"] == "done" for s in st["steps"])
        assert job.last_duration and (tmp_path / ".cache" / "last_refresh.json").exists()
    finally:
        srv.shutdown()


def test_collector_failure_reports_error(tmp_path):
    srv, job, port = _start(tmp_path, "import sys; print('→ AWS'); sys.exit(3)")
    try:
        _req(port, "POST", "/api/prices/refresh", {"X-DataCost": "1"})
        st = _wait(port, "error")
        assert "código 3" in st["error"]
    finally:
        srv.shutdown()
