# app.py
from flask import Flask, render_template, request, jsonify
from services.event_service import EventService, run_sync

app = Flask(__name__, static_folder="static", template_folder="templates")

event_svc = EventService()  # создаём сервис (использует SOAP клиент внутри)

# Главная — список дат и гонок
@app.route("/")
def index():
    # template подтянет даты через /api/dates (ajax)
    return render_template("index.html")

# Страница гонки
@app.route("/race")
def race_page():
    race_id = request.args.get("race", "")
    return render_template("race.html", race_id=race_id)

# API: даты + гонки
@app.route("/api/dates")
def api_dates():
    data = run_sync(event_svc.fetch_event_data())
    if not data:
        return jsonify({"error": "Не удалось получить данные"}), 500

    dates = run_sync(event_svc.get_dates_grouped_by_date(data))
    return jsonify({"title": data.get("title", ""), "dates": dates})

# API: live таблица (для страницы гонки)
@app.route("/api/live")
def api_live():
    race = request.args.get("race", "")
    cat = request.args.get("cat", "")
    data = run_sync(event_svc.fetch_event_data())
    if not data:
        return jsonify({}), 500

    result = run_sync(event_svc.get_live_table(data, race_id=race, cat_filter=cat))
    return jsonify(result)

if __name__ == "__main__":
    # Запуск: python app.py
    app.run(host="0.0.0.0", port=5000, debug=True)
