# services/event_service.py
import xml.etree.ElementTree as ET
from datetime import datetime

NS = {
    's': 'http://schemas.xmlsoap.org/soap/envelope/',
    'temp': 'http://tempuri.org/',
    'a': 'http://schemas.datacontract.org/2004/07/Ski123'
}

def _time_to_seconds(t: str):
    try:
        if not t or t == "-":
            return float("inf")
        parts = t.replace(",", ".").split(":")
        parts = [p.strip() for p in parts if p != ""]
        if len(parts) == 2:
            minutes = int(parts[0])
            seconds = float(parts[1])
            return minutes * 60.0 + seconds
        elif len(parts) == 3:
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = float(parts[2])
            return hours * 3600.0 + minutes * 60.0 + seconds
        else:
            return float(parts[0])
    except:
        return float("inf")

class EventService:
    def __init__(self):
        self.NS = NS

    def parse_eventdata_from_payload(self, payload: dict):
        """
        payload: {
          "event_xml": "<GetEventData SOAP response>",
          "results": { "raceid_1": "<GetResult SOAP response>", ... }
        }
        Возвращает dict: title, participants, schedule (unique by RaceId)
        """
        event_xml = payload.get("event_xml")
        if not event_xml:
            return {}

        try:
            root = ET.fromstring(event_xml)
        except Exception as e:
            print("parse_eventdata error:", e)
            return {}

        result = root.find('.//temp:GetEventDataResult', self.NS)
        if result is None:
            return {}

        title = result.findtext('a:MainTitle', default="", namespaces=self.NS)

        participants = {}
        for p in result.findall('.//a:clsInfoParticipant', self.NS):
            pid = p.findtext('a:Id', default="", namespaces=self.NS)
            participants[pid] = {
                "Name": p.findtext('a:Name', default="", namespaces=self.NS),
                "Club": p.findtext('a:Club', default="", namespaces=self.NS),
                "CatId": p.findtext('a:CatId', default="", namespaces=self.NS),
                "ClassId": p.findtext('a:ClassId', default="", namespaces=self.NS)
            }

        schedule_dict = {}
        for s in result.findall('.//a:clsInfoScheduledEvent', self.NS):
            race_id = s.findtext('a:RaceId', default="", namespaces=self.NS)
            race_title = s.findtext('a:RaceTitle', default="", namespaces=self.NS)
            start_dt = s.findtext('a:StartDateTime', default="", namespaces=self.NS) or ""
            clean_title = race_title.split("-")[0].strip()

            rankings = []
            for r in s.findall('.//a:clsInfoRankingDefinition', self.NS):
                rankings.append({
                    "RankingNr": r.findtext('a:RankingNr', default="", namespaces=self.NS),
                    "ProgressTitle": r.findtext('a:ProgressTitle', default="", namespaces=self.NS)
                })

            if race_id not in schedule_dict:
                schedule_dict[race_id] = {
                    "RaceId": race_id,
                    "RaceTitle": clean_title,
                    "Rankings": rankings,
                    "StartDateTime": start_dt
                }
            else:
                if not schedule_dict[race_id].get("StartDateTime") and start_dt:
                    schedule_dict[race_id]["StartDateTime"] = start_dt

        schedule = list(schedule_dict.values())

        return {"title": title, "participants": participants, "schedule": schedule}

    def group_dates(self, parsed_event: dict):
        """Группирует schedule по дате StartDateTime (YYYY-MM-DD)."""
        schedule = parsed_event.get("schedule", [])
        groups = {}
        for s in schedule:
            dt = s.get("StartDateTime", "")
            key = self._parse_date_only(dt)
            groups.setdefault(key, []).append({
                "RaceId": s["RaceId"],
                "RaceTitle": s["RaceTitle"],
                "StartDateTime": s.get("StartDateTime", "")
            })
        dates = sorted([d for d in groups.keys() if d != "Без даты"])
        if "Без даты" in groups:
            dates.append("Без даты")
        out = []
        for d in dates:
            races = sorted(groups[d], key=lambda x: x.get("StartDateTime") or "")
            out.append({"date": d, "races": races})
        return out

    def build_live_from_payload(self, parsed_event: dict, payload: dict, race_id: str = "", cat_filter: str = ""):
        """
        Формирует таблицу используя parsed_event (title/participants/schedule)
        и payload['results'] — словарь raw xml ответов GetResult.
        """
        title = parsed_event.get("title", "")
        participants = parsed_event.get("participants", {})
        schedule = parsed_event.get("schedule", [])
        if not schedule:
            return {}

        # выберем гонку
        race = schedule[0] if not race_id else next((r for r in schedule if r["RaceId"] == race_id), schedule[0])
        race_id = race["RaceId"]

        table = {}
        headers = []
        finish_column = None

        # Старт (RankingNr = 1) — ключ results: f"{race_id}_1"
        start_key = f"{race_id}_1"
        start_xml = payload.get("results", {}).get(start_key)
        if start_xml:
            try:
                root2 = ET.fromstring(start_xml)
                result2 = root2.find('.//temp:GetResultResult', self.NS)
                if result2 is not None:
                    for r in result2.findall('.//a:clsInfoResultRow', self.NS):
                        bib = r.findtext('a:Bib', default="-", namespaces=self.NS)
                        athlete_id = r.findtext('a:Id', default="", namespaces=self.NS)
                        start_time = r.findtext('a:Result', default="", namespaces=self.NS)
                        pinfo = participants.get(athlete_id, {})
                        table[bib] = {
                            "Bib": bib,
                            "Name": pinfo.get("Name", athlete_id),
                            "Club": pinfo.get("Club", ""),
                            "CatId": pinfo.get("CatId", ""),
                            "Start": start_time
                        }
            except Exception as e:
                print("parse start_xml error:", e)
        headers.append("Start")

        # остальные ранкинги — берем их из race['Rankings']
        for rank in race.get("Rankings", []):
            if rank["RankingNr"] == "1":
                continue
            ranking_nr = rank["RankingNr"]
            title_rank = rank["ProgressTitle"]
            key = f"{race_id}_{ranking_nr}"
            xml = payload.get("results", {}).get(key)
            headers.append(title_rank)
            if "ФИНИШ" in (title_rank or "").upper():
                finish_column = title_rank
            if not xml:
                continue
            try:
                root3 = ET.fromstring(xml)
                result3 = root3.find('.//temp:GetResultResult', self.NS)
            except Exception as e:
                print("parse result xml:", e)
                result3 = None
            if not result3:
                continue
            for r in result3.findall('.//a:clsInfoResultRow', self.NS):
                bib = r.findtext('a:Bib', default="-", namespaces=self.NS)
                value = r.findtext('a:Result', default="-", namespaces=self.NS)
                behind = r.findtext('a:Behind', default="", namespaces=self.NS)
                athlete_id = r.findtext('a:Id', default="", namespaces=self.NS)
                if bib not in table:
                    pinfo = participants.get(athlete_id, {})
                    table[bib] = {
                        "Bib": bib,
                        "Name": pinfo.get("Name", athlete_id),
                        "Club": pinfo.get("Club", ""),
                        "CatId": pinfo.get("CatId", ""),
                        "Start": ""
                    }
                table[bib][title_rank] = value
                if "ФИНИШ" in (title_rank or "").upper():
                    table[bib]["Отставание_raw"] = behind

        rows_all = list(table.values())
        # категории
        categories = sorted(set(r.get("CatId", "") for r in rows_all if r.get("CatId")))
        rows = [r for r in rows_all if not cat_filter or r.get("CatId") == cat_filter]

        # сортировка и отставание (по финишу внутри категории, если выбран)
        if finish_column:
            finished = [r for r in rows if r.get(finish_column) and r.get(finish_column) != "-"]
            not_finished = [r for r in rows if not r.get(finish_column) or r.get(finish_column) == "-"]

            finished.sort(key=lambda x: _time_to_seconds(x.get(finish_column)))
            not_finished.sort(key=lambda x: int(x.get("Bib", 9999)))

            leader_time = None
            if finished:
                leader_time = _time_to_seconds(finished[0].get(finish_column))

            place = 1
            for r in finished:
                r["Место"] = place
                place += 1
                if leader_time is not None:
                    cur = _time_to_seconds(r.get(finish_column))
                    diff = cur - leader_time
                    if diff <= 0.0001:
                        r["Отставание"] = ""
                    else:
                        minutes = int(diff // 60)
                        seconds = diff - minutes * 60
                        r["Отставание"] = f"+{minutes}:{seconds:05.2f}"
                else:
                    r["Отставание"] = ""
                if "Отставание_raw" in r:
                    del r["Отставание_raw"]

            for r in not_finished:
                r["Место"] = ""
                r["Отставание"] = ""
                if "Отставание_raw" in r:
                    del r["Отставание_raw"]

            rows = finished + not_finished
        else:
            rows.sort(key=lambda x: int(x.get("Bib", 9999)))
            for r in rows:
                r["Место"] = ""
                r["Отставание"] = ""

        if "Отставание" not in headers:
            headers.append("Отставание")
        if "Место" not in headers:
            headers.append("Место")

        return {
            "title": title,
            "race_title": race["RaceTitle"],
            "race_id": race_id,
            "races": schedule,
            "headers": headers,
            "rows": rows,
            "categories": categories,
            "selected_cat": cat_filter
        }

    def _parse_date_only(self, dt_str):
        if not dt_str:
            return "Без даты"
        try:
            if "T" in dt_str:
                d = datetime.fromisoformat(dt_str.split(".")[0])
                return d.date().isoformat()
            else:
                d = datetime.fromisoformat(dt_str)
                return d.date().isoformat()
        except:
            if len(dt_str) >= 10:
                maybe = dt_str[:10]
                try:
                    datetime.fromisoformat(maybe)
                    return maybe
                except:
                    pass
            return "Без даты"
