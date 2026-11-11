const fs = require('fs');
const path = require('path');

let cache = {
    filePath: null,
    mtime: 0,
    racesMap: new Map() // raceId -> Map(athleteId -> { bib, startTime, status, rnk, catRnk })
};

function findLatestCompetitionXml() {
    const baseDir = 'C:\\Users\\user\\Documents\\Ski123\\Archives';
    if (!fs.existsSync(baseDir)) return null;

    let latestFile = null;
    let latestMtime = 0;

    function scan(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.xml') && !entry.name.includes('.backup') && !entry.name.includes('.save')) {
                    const stat = fs.statSync(fullPath);
                    if (stat.mtimeMs > latestMtime) {
                        latestMtime = stat.mtimeMs;
                        latestFile = fullPath;
                    }
                }
            }
        } catch (e) {}
    }

    scan(baseDir);
    return latestFile;
}

function getLocalCompetitionData(raceId) {
    try {
        const currentFile = findLatestCompetitionXml();
        if (!currentFile || !fs.existsSync(currentFile)) return new Map();

        const stat = fs.statSync(currentFile);
        if (cache.filePath !== currentFile || cache.mtime !== stat.mtimeMs) {
            // Файл обновился или изменился — перечитываем
            cache.filePath = currentFile;
            cache.mtime = stat.mtimeMs;
            cache.racesMap.clear();

            const content = fs.readFileSync(currentFile, 'utf-8');
            const regex = /<Results>([\s\S]*?)<\/Results>/g;
            let match;

            const getTag = (block, t) => {
                const m = block.match(new RegExp(`<${t}>([^<]*)<\\/${t}>`));
                return m ? m[1].trim() : '';
            };

            while ((match = regex.exec(content)) !== null) {
                const block = match[1];
                const rId = getTag(block, 'RaceId');
                const aId = getTag(block, 'Id');
                if (rId && aId) {
                    if (!cache.racesMap.has(rId)) {
                        cache.racesMap.set(rId, new Map());
                    }
                    cache.racesMap.get(rId).set(aId, {
                        id: aId,
                        bib: getTag(block, 'Bib'),
                        startTime: getTag(block, 'StartTime'),
                        status: getTag(block, 'Status'),
                        rnk: getTag(block, 'Rnk'),
                        catRnk: getTag(block, 'CatRnk'),
                        shooting: getTag(block, 'ShootingTemp'),
                        split1: getTag(block, 'Split1'),
                        split2: getTag(block, 'Split2'),
                        split3: getTag(block, 'Split3'),
                        split4: getTag(block, 'Split4'),
                        runTime: getTag(block, 'RunTime'),
                        totalTime: getTag(block, 'TotalTime')
                    });
                }
            }
        }

        return cache.racesMap.get(raceId) || new Map();
    } catch (e) {
        console.error('Ошибка в localXmlReader:', e.message);
        return new Map();
    }
}

function formatMsToTime(msStr) {
    if (!msStr || isNaN(parseInt(msStr))) return '';
    const ms = parseInt(msStr);
    if (ms <= 0) return '';
    
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    const ss = seconds.toString().padStart(2, '0');
    if (hours > 0) {
        const mm = minutes.toString().padStart(2, '0');
        return `${hours}:${mm}:${ss}.${tenths}`;
    } else if (minutes > 0) {
        return `${minutes}:${ss}.${tenths}`;
    } else {
        return `${seconds}.${tenths}`;
    }
}

module.exports = {
    getLocalCompetitionData,
    formatMsToTime
};
