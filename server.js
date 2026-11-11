const express = require('express');
const path = require('path');
const config = require('./config.json');
const { getCachedEventData, getResultRows, fetchRaceRanking } = require('./services/soapClient');
const { parseEventSchedule, buildLiveBoard } = require('./services/timingParser');

const app = express();
const resultsCache = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.text({ type: '*/*' }));

// API 1: Список гонок
app.get('/api/event', async (req, res) => {
    try {
        const xml = await getCachedEventData();
        if (!xml || !xml['GetEventDataResponse']) {
            return res.json({ title: '', location: '', facility: '', races: [] });
        }
        const data = xml['GetEventDataResponse']['GetEventDataResult'];
        res.json(parseEventSchedule(data));
    } catch (error) {
        console.error("Ошибка в /api/event:", error);
        res.status(500).json({ error: 'Ошибка получения расписания' });
    }
});

// API 2: Результаты гонки
app.get('/api/results', async (req, res) => {
    const { raceId, rankingNr } = req.query;
    if (!raceId || !rankingNr) return res.status(400).json({ error: 'Укажите raceId и rankingNr' });

    const cacheKey = `${raceId}_${rankingNr}`;
    const now = Date.now();
    const cached = resultsCache.get(cacheKey);

    if (cached && (now - cached.timestamp < config.resultsCacheTtlMs)) {
        return res.json(cached.data);
    }
    if (cached && cached.promise) {
        return res.json(await cached.promise);
    }

    const fetchPromise = (async () => {
        try {
            const eventXml = await getCachedEventData();
            if (!eventXml || !eventXml['GetEventDataResponse']) return [];
            const eventData = eventXml['GetEventDataResponse']['GetEventDataResult'];

            const [totalXml, startXml, currentXml] = await Promise.all([
                fetchRaceRanking(raceId, 0),
                fetchRaceRanking(raceId, 1),
                (rankingNr != 1 && rankingNr != 0) ? fetchRaceRanking(raceId, rankingNr) : Promise.resolve(null)
            ]);

            const totalList = getResultRows(totalXml);
            const startList = getResultRows(startXml);
            const currentList = (rankingNr == 0) ? totalList : (currentXml ? getResultRows(currentXml) : []);

            return buildLiveBoard(eventData, totalList, startList, currentList, raceId, rankingNr);
        } catch (err) {
            console.error("Ошибка в /api/results:", err);
            return [];
        }
    })();

    resultsCache.set(cacheKey, { timestamp: now, data: null, promise: fetchPromise });
    const finalData = await fetchPromise;
    resultsCache.set(cacheKey, { timestamp: Date.now(), data: finalData, promise: null });

    res.json(finalData);
});

app.listen(config.port, '0.0.0.0', () => {
    console.log(`Сервер запущен на http://localhost:${config.port}`);
});