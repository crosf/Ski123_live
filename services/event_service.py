# services/event_service.py
import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime
from services.soap_client import soap_call
import aiohttp

# XML namespaces (как в оригинале)
NS = {
    's': 'http://schemas.xmlsoap.org/soap/envelope/',
    'temp': 'http://tempuri.org/',
    'a': 'http://schemas.datacontract.org/2004/07/Ski123'
}


def run_sync(coro):
    """Запуск async-корутин из синхронного кода."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _get_eventdata_raw():
    """Возвращает сырый XML GetEventData (строка) или None."""
    async with aiohttp.ClientSession() as session:
        return await soap_call(session, "http://tempuri.org/iInfoInterface/GetEventData",
                               "<GetEventData xmlns='http://tempuri.org/'/>")


async def _get_result_raw(race_id: str, ranking_nr: int):
    """Возвращает сырый XML GetResult для указанного ранкинга."""
    body = f"""
    <GetResult xmlns="http://tempuri.org/">
        <RaceId>{race_id}</RaceId>
        <RankingNr>{ranking_nr}</RankingNr>
        <CatId></CatId>
        <AttId></AttId>
    </GetResult>
    """
    async with aiohttp.ClientSession() as session:
        return await soap_call(session, "http://tempuri.org/iInfoInterface/GetResult", body)


def _time_to_seconds(t: str):
    """Преобразует строку времени MM:SS.ss или HH:MM:SS.ss в секунды (float)."""
    try:
        if not t:
            return 999999.0
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
            # возможно чистые секунды
            return float(parts[0])
    except:
        return 999999.0


class EventService:
    def __init__(self):
        self.NS = NS

    async def fetch_event_data(self):
        """
        Возвращает dict:
          {
            title: str,
            participants: {Id: {Name, Club, CatId, ClassId}},
            schedule: [{RaceId, RaceTitle, Rankings: [{RankingNr, ProgressTitle}], StartDateTime}]
          }
        """
        xml = await _get_eventdata_raw()
        if not xml:
            return None
        try:
            root = ET.fromstring(xml)
        except Exception as e:
            print("Parse event_xml error:", e)
            return None

        result = root.find('.//temp:GetEventDataResult', self.NS)
        if result is None:
            return None

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

        # schedule: группируем по RaceId, убираем дубли (группы)
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
                # если уже есть запись, но нет StartDateTime — попробуем заполнить
                if not schedule_dict[race_id].get("StartDateTime") and start_dt:
                    schedule_dict[race_id]["StartDateTime"] = start_dt

        schedule = list(schedule_dict.values())
        return {"title": title, "participants": participants, "schedule": schedule}

    async def get_dates_grouped_by_date(self, data):
        """Группировка гонок по дате (YYYY-MM-DD)."""
        schedule = data.get("schedule", [])
        groups = {}
        for s in schedule:
            dt = s.get("StartDateTime", "")
            key = self._parse_date_only(dt)
            groups.setdefault(key, []).append({
                "RaceId": s["RaceId"],
                "RaceTitle": s["RaceTitle"],
                "StartDateTime": s.get("StartDateTime", "")
            })
        # сортировка дат: "Без даты" в конце
        dates = sorted([d for d in groups.keys() if d != "Без даты"])
        if "Без даты" in groups:
            dates.append("Без даты")
        out = []
        for d in dates:
            races = sorted(groups[d], key=lambda x: x.get("StartDateTime") or "")
            out.append({"date": d, "races": races})
        return out

    def _parse_date_only(self, dt_str):
        """Пытаемся извлечь YYYY-MM-DD из StartDateTime, иначе 'Без даты'."""
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

    async def get_live_table(self, data, race_id: str = "", cat_filter: str = ""):
        """
        Формирует таблицу результатов для гонки.
        Если cat_filter задан — таблица и расчёт отставания выполняются внутри этой категории.
        Возвращает:
           {
             title, race_title, race_id, races, headers, rows, categories, selected_cat
           }
        """
        title = data.get("title", "")
        participants = data.get("participants", {})
        schedule = data.get("schedule", [])
        race = schedule[0] if not race_id else next((r for r in schedule if r["RaceId"] == race_id), schedule[0])
        race_id = race["RaceId"]

        table = {}
        headers = []

        # --- Старт (RankingNr = 1) ---
        start_xml = await _get_result_raw(race_id, 1)
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
                print("parse start_xml:", e)

        headers.append("Start")
        finish_column = None

        # --- Остальные этапы ---
        for rank in race.get("Rankings", []):
            if rank["RankingNr"] == "1":
                continue
            # RankingNr может приходить как строка; приводим к int для _get_result_raw
            try:
                ranking_nr = int(rank["RankingNr"])
            except:
                # если не удалось - пропускаем
                ranking_nr = rank["RankingNr"]

            title_rank = rank["ProgressTitle"]
            result_xml = await _get_result_raw(race_id, ranking_nr)
            if not result_xml:
                headers.append(title_rank)
                continue
            try:
                root3 = ET.fromstring(result_xml)
                result3 = root3.find('.//temp:GetResultResult', self.NS)
            except Exception as e:
                print("parse result_xml:", e)
                result3 = None

            headers.append(title_rank)
            if "ФИНИШ" in (title_rank or "").upper():
                finish_column = title_rank

            if result3 is None:
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

                # Отставание берём и заполняем только по финишу (далее будет перерасчёт)
                if "ФИНИШ" in (title_rank or "").upper():
                    table[bib]["Отставание_raw"] = behind  # временное поле, перезапишем ниже

        rows_all = list(table.values())

        # --- Список категорий для селекта ---
        categories = sorted(set(r.get("CatId", "") for r in rows_all if r.get("CatId")))

        # --- Фильтрация по категории (если задана) ---
        rows = [r for r in rows_all if not cat_filter or r.get("CatId") == cat_filter]

        # --- СОРТИРОВКА и РАСЧЁТ МЕСТ/ОТСТАВАНИЯ ---
        if finish_column:
            # Отдельно финишировавшие и НЕ финишировавшие внутри уже отфильтрованного набора rows
            finished = [r for r in rows if r.get(finish_column) and r.get(finish_column) != "-"]
            not_finished = [r for r in rows if not r.get(finish_column) or r.get(finish_column) == "-"]

            # Сортируем финишировавших по времени (меньше — лучше)
            finished.sort(key=lambda x: _time_to_seconds(x.get(finish_column)))

            # Нефинишировавшие — по bib
            not_finished.sort(key=lambda x: int(x.get("Bib", 9999)))

            # Лидер считается в рамках выбранной категории (finished уже отфильтрованы)
            leader_time = None
            if finished:
                leader_time = _time_to_seconds(finished[0].get(finish_column))

            # Проставляем места и пересчитываем отставание относительно leader_time
            place = 1
            for r in finished:
                r["Место"] = place
                place += 1

                if leader_time is not None:
                    cur_time = _time_to_seconds(r.get(finish_column))
                    diff = cur_time - leader_time
                    if diff <= 0.0001:
                        r["Отставание"] = ""  # лидер — пустое отставание
                    else:
                        # формат +M:SS.ss (минуты и секунды с двумя знаками после запятой)
                        minutes = int(diff // 60)
                        seconds = diff - minutes * 60
                        # seconds с двумя знаками после запятой, pad с ведущим нулём при необходимости
                        r["Отставание"] = f"+{minutes}:{seconds:05.2f}"
                else:
                    r["Отставание"] = ""
                # удалим временное поле, если было
                if "Отставание_raw" in r:
                    del r["Отставание_raw"]

            # у не финишировавших места и отставание пустые
            for r in not_finished:
                r["Место"] = ""
                r["Отставание"] = ""
                if "Отставание_raw" in r:
                    del r["Отставание_raw"]

            rows = finished + not_finished
        else:
            # если нет колонки финиша — сортируем просто по bib
            rows.sort(key=lambda x: int(x.get("Bib", 9999)))
            for r in rows:
                r["Место"] = ""
                r["Отставание"] = ""

        # Гарантируем, что заголовки содержат "Отставание" и "Место"
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
