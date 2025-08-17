import os
import threading
from typing import Iterator

import yaml
import requests
from flask import Flask, Response, jsonify, render_template, request, stream_with_context


def load_config() -> dict:
    config_path = os.path.join(os.path.dirname(__file__), "conf.yml")
    # Support running from repo root as well
    if not os.path.exists(config_path):
        config_path = os.path.join(os.getcwd(), "conf.yml")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


CONFIG = load_config()
# New config keys with backward-compatible fallbacks
BOT_IP = str(CONFIG.get("bot-ip", CONFIG.get("ip", "127.0.0.1"))).strip().strip('"')
BOT_PORT = str(CONFIG.get("bot-port", CONFIG.get("port", "8888"))).strip().strip('"')
BOT_API_BASE = f"http://{BOT_IP}:{BOT_PORT}"
DEFAULT_DASHBOARD_PORT = int(str(CONFIG.get("dashboard-port", 80)).strip().strip('"'))


app = Flask(__name__, static_folder="static", template_folder="templates")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/config")
def get_config():
    # Keep response shape simple for frontend; include legacy fields for convenience
    return jsonify({
        "ip": BOT_IP,
        "port": BOT_PORT,
        "base": BOT_API_BASE,
        "dashboard_port": DEFAULT_DASHBOARD_PORT,
    })


def _proxy_get(path: str):
    upstream_url = f"{BOT_API_BASE}/{path}"
    try:
        upstream = requests.get(upstream_url, params=request.args, timeout=10)
        headers = {"Content-Type": upstream.headers.get("Content-Type", "application/json"),
                   "Cache-Control": "no-cache"}
        return Response(upstream.content, status=upstream.status_code, headers=headers)
    except requests.RequestException as exc:
        return jsonify({"error": str(exc), "upstream": upstream_url}), 502


@app.route("/proxy/<path:subpath>")
def proxy(subpath: str):
    # Special case handled by dedicated SSE endpoint
    if subpath.startswith("stream_video"):
        return proxy_stream_video()
    return _proxy_get(subpath)


def _proxy_post(path: str):
    upstream_url = f"{BOT_API_BASE}/{path}"
    try:
        # Forward the raw body so empty arrays ([]) are preserved; using json= would
        # coerce [] to {} due to falsy checks upstream.
        upstream = requests.post(
            upstream_url,
            params=request.args,
            data=request.get_data(),
            headers={"Content-Type": request.headers.get("Content-Type", "application/json")},
            timeout=10,
        )
        headers = {"Content-Type": upstream.headers.get("Content-Type", "application/json"),
                   "Cache-Control": "no-cache"}
        return Response(upstream.content, status=upstream.status_code, headers=headers)
    except requests.RequestException as exc:
        return jsonify({"error": str(exc), "upstream": upstream_url}), 502


@app.route("/proxy_post/<path:subpath>", methods=["POST"])
def proxy_post(subpath: str):
    return _proxy_post(subpath)


@app.route("/proxy/stream_video")
def proxy_stream_video():
    upstream_url = f"{BOT_API_BASE}/stream_video"
    try:
        upstream = requests.get(upstream_url, params=request.args, stream=True, timeout=None)
        upstream.raise_for_status()
    except requests.RequestException as exc:
        err = f"event: error\ndata: {{\"message\": \"{str(exc)}\"}}\n\n"
        return Response(err.encode("utf-8"), mimetype="text/event-stream")

    def generate() -> Iterator[bytes]:
        with upstream:
            for chunk in upstream.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": upstream.headers.get("Content-Type", "multipart/x-mixed-replace;boundary=frame"),
    }
    return Response(stream_with_context(generate()), headers=headers, direct_passthrough=True)


@app.route("/health")
def health():
    try:
        r = requests.get(f"{BOT_API_BASE}/game_state", timeout=5)
        ok = r.ok
    except requests.RequestException:
        ok = False
    return jsonify({"ok": ok, "upstream": BOT_API_BASE})


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    # Env var overrides config; fall back to config's dashboard-port; then 80
    port_env = os.environ.get("PORT")
    port = int(port_env) if port_env else int(DEFAULT_DASHBOARD_PORT)
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == "__main__":
    main()


