# app.py
import os
import threading
from flask import Flask, request, jsonify, render_template
from services.event_service import EventService

app = Flask(__name__, template_folder="templates", static_folder="static")

# Секретный токен: установи в окружении на VPS или в docker run: -e SECRET_TOKEN=твой_токен
SECRET_TOKEN = os.environ.get("SECRET_TOKEN", "changeme_replace")

# Хранилище последнего пришедшего пакета от агента
_latest_lock = threading.Lock()
_latest_payload = None  # будет хранить dict: {"event_xml": "...", "results": {"raceid_rank": "...", ...}}

event_svc = EventService()

@app.route("/")
def index_page():
    return render_template("index.html")

@app.route("/race")
def race_page():
    race_id = request.args.get("race", "")
    return render_template("race.html", race_id=race_id)

@app.route("/api/push", methods=["POST"])
def receive_push():
    """Агент посылает JSON: { "event_xml": "<xml...>", "results": { "raceid_1": "<xml...>", ... } }"""
    global _latest_payload
    # проверяем токен
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "unauthorized"}), 401
    token = auth.split(" ", 1)[1]
    if token != SECRET_TOKEN:
        return jsonify({"error": "forbidden"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "bad request"}), 400

    with _latest_lock:
        _latest_payload = data

    return jsonify({"status": "ok"})

@app.route("/api/dates")
def api_dates():
    """Возвращает даты и гонки (берёт данные из последнего payload)."""
    with _latest_lock:
        payload = _latest_payload
    if not payload:
        return jsonify({"error": "no data"}), 404

    parsed = event_svc.parse_eventdata_from_payload(payload)
    dates = event_svc.group_dates(parsed)
    return jsonify({"title": parsed.get("title", ""), "dates": dates})

@app.route("/api/live")
def api_live():
    """Возвращает разобранную таблицу для выбранной гонки.
       Параметры: race, cat (опционально)."""
    race = request.args.get("race", "")
    cat = request.args.get("cat", "")

    with _latest_lock:
        payload = _latest_payload
    if not payload:
        return jsonify({})

    parsed = event_svc.parse_eventdata_from_payload(payload)
    result = event_svc.build_live_from_payload(parsed, payload, race_id=race, cat_filter=cat)
    return jsonify(result)

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    # Запуск дев-сервером (в продакшн лучше запустить через gunicorn + nginx)
    app.run(host="0.0.0.0", port=5000, debug=True)
