const xml2js = require('xml2js');
const config = require('../config.json');

let eventCache = { timestamp: 0, data: null, promise: null };

function safeString(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return val['_'] ? String(val['_']) : '';
    return String(val);
}

async function fetchSoap(action, bodyStr, timeoutMs = config.soapTimeoutMs) {
    const envelope = `
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Body>${bodyStr}</s:Body>
    </s:Envelope>`;
    
    try {
        const response = await fetch(config.targetUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': `http://tempuri.org/iInfoInterface/${action}`
            },
            body: envelope
        });
        if (!response.ok) return null;
        const xml = await response.text();
        return new Promise((resolve) => {
            xml2js.parseString(xml, { explicitArray: false, ignoreAttrs: true }, (err, res) => {
                if (err) resolve(null);
                else resolve(res['s:Envelope'] ? res['s:Envelope']['s:Body'] : null);
            });
        });
    } catch (e) {
        return null;
    }
}

async function getCachedEventData(force = false) {
    const now = Date.now();
    if (!force && eventCache.data && (now - eventCache.timestamp < config.eventCacheTtlMs)) {
        return eventCache.data;
    }
    if (eventCache.promise) {
        return eventCache.promise;
    }

    eventCache.promise = (async () => {
        try {
            const xml = await fetchSoap('GetEventData', '<GetEventData xmlns="http://tempuri.org/" />');
            if (xml && xml['GetEventDataResponse']) {
                eventCache.data = xml;
                eventCache.timestamp = Date.now();
            }
            return eventCache.data;
        } finally {
            eventCache.promise = null;
        }
    })();

    return eventCache.promise;
}

function getResultRows(xml) {
    if (!xml || !xml['GetResultResponse'] || !xml['GetResultResponse']['GetResultResult'] || !xml['GetResultResponse']['GetResultResult']['a:Result']) {
        return [];
    }
    const rows = xml['GetResultResponse']['GetResultResult']['a:Result']['a:clsInfoResultRow'];
    if (!rows) return [];
    return Array.isArray(rows) ? rows : [rows];
}

async function fetchRaceRanking(raceId, rankingNr) {
    return fetchSoap('GetResult', `<GetResult xmlns="http://tempuri.org/"><RaceId>${raceId}</RaceId><RankingNr>${rankingNr}</RankingNr><CatId></CatId></GetResult>`);
}

module.exports = {
    safeString,
    fetchSoap,
    getCachedEventData,
    getResultRows,
    fetchRaceRanking
};