const { safeString } = require('./soapClient');
const { getLocalCompetitionData, formatMsToTime } = require('./localXmlReader');

function formatDate(dateStr) {
    if (!dateStr) return 'Другие дни';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Другие дни';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function parseEventSchedule(data) {
    let schedule = data['a:Schedule'] ? data['a:Schedule']['a:clsInfoScheduledEvent'] : [];
    if (!schedule) schedule = [];
    if (!Array.isArray(schedule)) schedule = [schedule];

    const racesMap = {};
    schedule.forEach(event => {
        const raceId = safeString(event['a:RaceId']);
        if (!racesMap[raceId]) {
            let rankings = event['a:Rankings'] ? event['a:Rankings']['a:clsInfoRankingDefinition'] : [];
            if (!rankings) rankings = [];
            if (!Array.isArray(rankings)) rankings = [rankings];
            
            const checkpoints = rankings.map(r => {
                let title = safeString(r['a:ProgressTitle']);
                if (title.trim() === '') title = safeString(r['a:ShortTitle']);
                title = title.trim();
                return { nr: safeString(r['a:RankingNr']), title: title };
            }).filter(r => r.title !== '');

            const rawDate = safeString(event['a:StartDateTime']);

            racesMap[raceId] = {
                id: raceId,
                title: safeString(event['a:RaceTitle']),
                date: formatDate(rawDate),
                rawDate: rawDate,
                checkpoints: checkpoints
            };
        }
    });

    return {
        title: safeString(data['a:MainTitle']),
        location: safeString(data['a:Location']),
        facility: safeString(data['a:CompetitionFacility']),
        races: Object.values(racesMap)
    };
}

function buildLiveBoard(eventData, totalList, startList, currentList, raceId, rankingNr) {
    let schedule = eventData['a:Schedule'] ? eventData['a:Schedule']['a:clsInfoScheduledEvent'] : [];
    if (!schedule) schedule = [];
    if (!Array.isArray(schedule)) schedule = [schedule];

    const currentEvent = schedule.find(e => safeString(e['a:RaceId']) === raceId);
    const raceTitle = currentEvent ? safeString(currentEvent['a:RaceTitle']) : '';
    const isRelay = raceTitle.toLowerCase().includes('эстаф');

    let rankings = currentEvent && currentEvent['a:Rankings'] ? currentEvent['a:Rankings']['a:clsInfoRankingDefinition'] : [];
    if (!rankings) rankings = [];
    if (!Array.isArray(rankings)) rankings = [rankings];

    const currentRankingDef = rankings.find(r => safeString(r['a:RankingNr']) == rankingNr);
    const rTitle = currentRankingDef ? (safeString(currentRankingDef['a:ProgressTitle']) || safeString(currentRankingDef['a:ShortTitle'])).toLowerCase() : '';
    const isFinish = rankingNr == 0 || rTitle.includes('финиш') || rTitle.includes('finish');
    const isStart = rankingNr == 1;

    let scheduledStartStr = '';
    if (currentEvent && currentEvent['a:StartDateTime']) {
        const dtStr = safeString(currentEvent['a:StartDateTime']);
        const timeMatch = dtStr.match(/T(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) scheduledStartStr = timeMatch[1];
        else {
            const dt = new Date(dtStr);
            if (!isNaN(dt.getTime())) scheduledStartStr = dt.toTimeString().substring(0, 8);
        }
    }

    const entitiesById = {};
    let participants = eventData['a:Participants'] ? eventData['a:Participants']['a:clsInfoParticipant'] : [];
    if (!participants) participants = [];
    if (!Array.isArray(participants)) participants = [participants];
    participants.forEach(p => {
        const id = safeString(p['a:Id']);
        if (id) entitiesById[id] = p;
    });

    let teams = eventData['a:Teams'] ? eventData['a:Teams']['a:clsInfoTeam'] : [];
    if (!teams) teams = [];
    if (!Array.isArray(teams)) teams = [teams];
    teams.forEach(t => {
        const id = safeString(t['a:Id']);
        if (id) entitiesById[id] = t;
    });

    let anchorBib = null;
    let anchorTimeSec = null;
    startList.forEach(s => {
        const bNum = parseInt(safeString(s['a:Bib']));
        const r = safeString(s['a:Result']);
        if (!isNaN(bNum) && r.includes(':') && anchorBib === null) {
            const parts = r.split(':');
            if (parts.length >= 3) {
                anchorBib = bNum;
                anchorTimeSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            }
        }
    });

    const localParticipants = getLocalCompetitionData(raceId);

    const raceIdsSet = new Set();
    totalList.forEach(r => { if (safeString(r['a:Id'])) raceIdsSet.add(safeString(r['a:Id'])); });
    startList.forEach(r => { if (safeString(r['a:Id'])) raceIdsSet.add(safeString(r['a:Id'])); });
    currentList.forEach(r => { if (safeString(r['a:Id'])) raceIdsSet.add(safeString(r['a:Id'])); });
    localParticipants.forEach((p, pId) => raceIdsSet.add(pId));

    Object.values(entitiesById).forEach(entity => {
        if (entity['a:Registrations'] && entity['a:Registrations']['a:clsInfoRegistration']) {
            let regs = entity['a:Registrations']['a:clsInfoRegistration'];
            regs = Array.isArray(regs) ? regs : [regs];
            if (regs.some(rg => safeString(rg['a:RaceId']) === raceId)) {
                raceIdsSet.add(safeString(entity['a:Id']));
            }
        }
    });

    let liveBoard = Array.from(raceIdsSet).map(id => {
        const entity = entitiesById[id] || {};
        const tRow = totalList.find(r => safeString(r['a:Id']) === id) || {};
        const sRow = startList.find(r => safeString(r['a:Id']) === id) || {};
        const cRow = currentList.find(r => safeString(r['a:Id']) === id) || {};

        const localRow = localParticipants.get(id);

        let bib = safeString(tRow['a:Bib']) || safeString(sRow['a:Bib']) || safeString(cRow['a:Bib']);
        if (!bib && localRow) bib = localRow.bib;
        if (!bib) bib = safeString(entity['a:StartNo']) || safeString(entity['a:Bib']) || safeString(entity['a:TeamNo']) || safeString(entity['a:No']);
        
        const teamId = safeString(entity['a:TeamId']);
        if (!bib && teamId && entitiesById[teamId]) {
            const team = entitiesById[teamId];
            bib = safeString(team['a:StartNo']) || safeString(team['a:Bib']) || safeString(team['a:TeamNo']);
        }
        bib = String(bib).trim();

        // Исключаем участников без номера (не участвуют)
        if (!bib) return null;

        let status = safeString(tRow['a:Status']) || safeString(entity['a:Status']) || safeString(entity['a:Note']);
        if (!status && localRow && localRow.status) status = localRow.status;
        if (!status && teamId && entitiesById[teamId]) {
            status = safeString(entitiesById[teamId]['a:Status']) || safeString(entitiesById[teamId]['a:Note']);
        }

        let name = safeString(tRow['a:Name']) || safeString(entity['a:Name']) || safeString(entity['a:TeamName']) || 'Неизвестный';
        let club = safeString(tRow['a:Club']) || safeString(entity['a:Club']) || '-';
        let cat = safeString(tRow['a:CatId']) || safeString(entity['a:CatId']) || safeString(entity['a:ClassId']) || '';

        let cellResult = '';
        if (rankingNr == 1) {
            const sRes = safeString(sRow['a:Result']);
            if (sRes.trim() !== '') {
                cellResult = sRes;
            } else if (localRow && localRow.startTime) {
                cellResult = localRow.startTime;
            } else {
                const bNum = parseInt(bib);
                if (!isNaN(bNum) && bNum > 0 && bNum < 10000 && anchorBib !== null && anchorTimeSec !== null) {
                    const intervalSec = isRelay ? 0 : 30; 
                    const theoreticalSec = anchorTimeSec + ((bNum - anchorBib) * intervalSec);
                    const hh = Math.floor(theoreticalSec / 3600).toString().padStart(2, '0');
                    const mm = Math.floor((theoreticalSec % 3600) / 60).toString().padStart(2, '0');
                    const ss = (theoreticalSec % 60).toString().padStart(2, '0');
                    cellResult = `${hh}:${mm}:${ss}`;
                } else if (scheduledStartStr) {
                    cellResult = scheduledStartStr;
                } else {
                    cellResult = status ? status : 'НС';
                }
            }
        } else {
            let cRes = safeString(cRow['a:Result']) || 
                       safeString(cRow['a:RunTime']) || 
                       safeString(cRow['a:TimeOfDay']) ||
                       safeString(cRow['a:LegTime']) || 
                       safeString(cRow['a:TotalTime']);
            
            if (!cRes && teamId && entitiesById[teamId]) {
                 const team = entitiesById[teamId];
                 cRes = safeString(team['a:Result']) || safeString(team['a:RunTime']);
            }

            if (cRes.trim() !== '') {
                cellResult = cRes.trim();
            } else if (!isFinish && localRow) {
                let splitMs = '';
                if (rankingNr == 3) splitMs = localRow.split2 || localRow.split1;
                else if (rankingNr == 2) splitMs = localRow.split1;
                else if (rankingNr == 4) splitMs = localRow.split3 || localRow.split2;
                else splitMs = localRow.split1 || localRow.split2;

                if (splitMs && splitMs !== '0') {
                    cellResult = formatMsToTime(splitMs);
                } else {
                    cellResult = '';
                }
            } else {
                cellResult = '';
            }
        }

        let addInfo = safeString(cRow['a:AddInfo']) || safeString(tRow['a:AddInfo']);
        if (!addInfo && status) {
            addInfo = status;
        }

        let sOrder = cRow['a:SortOrder'] ? parseInt(safeString(cRow['a:SortOrder'])) : 99999;
        if (sOrder === 99999 && cellResult) {
            const parts = cellResult.split(/[:.]/);
            if (parts.length >= 2) {
                let ms = 0;
                const frac = parts.pop();
                ms += parseInt(frac) * (frac.length === 1 ? 100 : (frac.length === 2 ? 10 : 1));
                if (parts.length > 0) ms += parseInt(parts.pop()) * 1000;
                if (parts.length > 0) ms += parseInt(parts.pop()) * 60000;
                if (parts.length > 0) ms += parseInt(parts.pop()) * 3600000;
                sOrder = ms;
            }
        }

        return {
            id: id || `${bib}_${name}`,
            rank: safeString(cRow['a:Rank']),
            bib: bib,
            name: name,
            club: club,
            category: cat,
            result: cellResult,
            behind: safeString(cRow['a:Behind']),
            addInfo: addInfo,
            status: status || '',
            sortOrder: sOrder
        };
    }).filter(Boolean);

    if (!isStart) {
        if (isFinish) {
            // На финише оставляем участников, у которых либо есть время финиша, либо есть официальный статус (НС, НФ, ДСКВ)
            liveBoard = liveBoard.filter(athlete => {
                const hasTime = athlete.result && athlete.result.trim() !== '';
                const hasStatus = athlete.status && athlete.status.trim() !== '';
                return hasTime || hasStatus;
            });
        } else {
            // На промежуточных отсечках (круги, этапы) сошедшие не нужны — оставляем только тех, кто имеет реальное время
            liveBoard = liveBoard.filter(athlete => {
                return athlete.result && athlete.result.trim() !== '';
            });
        }
    }

    liveBoard.sort((a, b) => {
        if (rankingNr == 1) {
            const bibA = parseInt(a.bib) || 99999;
            const bibB = parseInt(b.bib) || 99999;
            return bibA - bibB;
        } else {
            const hasResA = a.result && a.result.trim() !== '';
            const hasResB = b.result && b.result.trim() !== '';
            if (hasResA && !hasResB) return -1;
            if (!hasResA && hasResB) return 1;

            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            const bibA = parseInt(a.bib) || 99999;
            const bibB = parseInt(b.bib) || 99999;
            return bibA - bibB;
        }
    });

    return liveBoard;
}

module.exports = {
    parseEventSchedule,
    buildLiveBoard
};