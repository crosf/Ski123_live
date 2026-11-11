let globalRaces = [];
let currentRaceId = null;
let currentRankingNr = null;
let currentCategory = 'all'; 
let currentResults = [];     
let refreshInterval = null;
let isStartProtocol = false; 
let isFetching = false;

const rowDomElements = new Map();

function setLiveStatus(state, infoText = '') {
    const statusEl = document.getElementById('liveStatus');
    if (state === 'live') {
        statusEl.innerHTML = `<span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span><span class="text-emerald-400 font-bold">LIVE</span><span class="text-slate-400 font-normal">(${infoText})</span>`;
        statusEl.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-950/40 border border-emerald-500/30';
    } else if (state === 'error') {
        statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span><span class="text-rose-400 font-bold">НЕТ СВЯЗИ</span>`;
        statusEl.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-950/40 border border-rose-500/30';
    } else {
        statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="text-amber-400">ОБНОВЛЕНИЕ...</span>`;
        statusEl.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-950/40 border border-amber-500/30';
    }
}

function parseDateStrToTimestamp(dateStr, sampleRawDate = null) {
    if (sampleRawDate) {
        const dt = new Date(sampleRawDate).getTime();
        if (!isNaN(dt) && dt > 0) return dt;
    }
    if (!dateStr || dateStr === 'Другие дни') return 9999999999999;
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const dt = new Date(year, month, day).getTime();
        if (!isNaN(dt)) return dt;
    }
    return 9999999999999;
}

function parseTimeToMs(timeStr) {
    if (!timeStr) return null;
    timeStr = timeStr.trim();
    const parts = timeStr.split(/[:.]/);
    if (parts.length < 2) return null;
    
    let ms = 0;
    const fractional = parts.pop();
    const msMultiplier = fractional.length === 1 ? 100 : (fractional.length === 2 ? 10 : 1);
    ms += parseInt(fractional) * msMultiplier;

    if (parts.length > 0) ms += parseInt(parts.pop()) * 1000;
    if (parts.length > 0) ms += parseInt(parts.pop()) * 60000;
    if (parts.length > 0) ms += parseInt(parts.pop()) * 3600000;

    return ms;
}

function formatMsToBehind(ms) {
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
        return `+${hours}:${mm}:${ss}.${tenths}`;
    } else if (minutes > 0) {
        return `+${minutes}:${ss}.${tenths}`;
    } else {
        return `+${seconds}.${tenths}`;
    }
}

async function loadEventInfo() {
    try {
        const data = await TimingApi.getEventInfo();

        document.getElementById('mainTitle').innerText = data.title || 'Соревнования';
        
        let subTitleParts = [];
        if (data.location) subTitleParts.push(data.location);
        if (data.facility) subTitleParts.push(data.facility);
        document.getElementById('subTitle').innerText = subTitleParts.join(' | ');
        
        globalRaces = data.races || [];

        const racesList = document.getElementById('racesList');
        racesList.innerHTML = '';

        const racesByDate = {};
        globalRaces.forEach(race => {
            const dateKey = race.date || 'Другие дни';
            if (!racesByDate[dateKey]) racesByDate[dateKey] = [];
            racesByDate[dateKey].push(race);
        });

        const sortedDates = Object.keys(racesByDate).sort((a, b) => {
            const sampleA = racesByDate[a][0]?.rawDate;
            const sampleB = racesByDate[b][0]?.rawDate;
            return parseDateStrToTimestamp(a, sampleA) - parseDateStrToTimestamp(b, sampleB);
        });

        sortedDates.forEach(date => {
            const dateContainer = document.createElement('div');
            dateContainer.className = 'space-y-2';

            const dateHeader = document.createElement('h3');
            dateHeader.className = 'text-blue-400 font-bold text-sm uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-700/80 pb-1 mt-4';
            dateHeader.innerHTML = `📅 ${date}`;
            dateContainer.appendChild(dateHeader);

            racesByDate[date].sort((a, b) => {
                const tA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
                const tB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
                return tA - tB;
            });

            racesByDate[date].forEach(race => {
                const btn = document.createElement('button');
                btn.className = 'w-full block bg-slate-800/80 hover:bg-slate-700/80 text-left p-3.5 rounded-xl transition border border-slate-700/80 hover:border-blue-500 font-medium text-white shadow-sm flex items-center justify-between group';
                btn.innerHTML = `<span>${race.title}</span><span class="text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-transform">→</span>`;
                btn.onclick = () => openRace(race.id);
                dateContainer.appendChild(btn);
            });

            racesList.appendChild(dateContainer);
        });

        setLiveStatus('live', 'Готов');
    } catch (error) {
        console.error("Ошибка loadEventInfo:", error);
        setLiveStatus('error');
        document.getElementById('racesList').innerHTML = '<p class="text-rose-400">Ошибка подключения к серверу.</p>';
    }
}

function openRace(raceId) {
    currentRaceId = raceId;
    currentCategory = 'all'; 
    currentResults = [];
    
    rowDomElements.clear();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `<tr id="row-empty"><td colspan="8" class="p-8 text-center text-slate-500 font-medium">Загрузка данных гонки...</td></tr>`;
    
    document.getElementById('categoriesList').innerHTML = ''; 

    const race = globalRaces.find(r => r.id === raceId);
    document.getElementById('raceTitle').innerText = race.title;
    document.getElementById('view-races').classList.remove('active-view');
    document.getElementById('view-results').classList.add('active-view');

    const isRelay = race.title.toLowerCase().includes('эстаф');
    const categoryRow = document.getElementById('categoryRow');
    if (categoryRow) {
        categoryRow.style.display = isRelay ? 'none' : 'flex';
    }

    const cpContainer = document.getElementById('checkpointsList');
    cpContainer.innerHTML = '';
    
    race.checkpoints.forEach(cp => {
        const btn = document.createElement('button');
        btn.className = 'btn-cp px-3 py-1.5 rounded-lg text-xs font-semibold transition border border-slate-600 bg-slate-700 hover:bg-slate-600 text-slate-200';
        btn.innerText = cp.title;
        btn.onclick = () => selectCheckpoint(cp.nr, cp.title);
        btn.dataset.nr = cp.nr; 
        cpContainer.appendChild(btn);
    });

    if (race.checkpoints.length > 0) {
        selectCheckpoint(race.checkpoints[0].nr, race.checkpoints[0].title);
    }
}

function selectCheckpoint(rankingNr, title) {
    currentRankingNr = rankingNr;
    isStartProtocol = title.toLowerCase().includes('старт');

    const thRank = document.getElementById('thRank');
    if (thRank) {
        thRank.style.display = isStartProtocol ? 'none' : '';
    }

    const thBehind = document.getElementById('thBehind');
    if (thBehind) {
        thBehind.style.display = isStartProtocol ? 'none' : '';
    }

    document.getElementById('thResult').innerText = isStartProtocol ? 'Время старта' : 'Результат';

    document.querySelectorAll('.btn-cp').forEach(b => {
        b.className = 'btn-cp px-3 py-1.5 rounded-lg text-xs font-medium transition border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700';
    });
    const activeBtn = document.querySelector(`.btn-cp[data-nr="${rankingNr}"]`);
    if (activeBtn) {
        activeBtn.className = 'btn-cp px-3 py-1.5 rounded-lg text-xs font-bold transition border border-emerald-500 bg-emerald-600 text-white shadow-sm';
    }

    rowDomElements.clear();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = `<tr id="row-empty"><td colspan="8" class="p-8 text-center text-slate-500 font-medium">Загрузка данных...</td></tr>`;

    loadResults();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadResults, 2000);
}

function selectCategory(catName) {
    currentCategory = catName;
    
    document.querySelectorAll('.btn-cat').forEach(b => {
        b.className = 'btn-cat px-3 py-1 rounded-lg text-xs font-medium transition border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700';
    });
    const activeBtn = document.querySelector(`.btn-cat[data-cat="${catName}"]`);
    if (activeBtn) {
        activeBtn.className = 'btn-cat px-3 py-1 rounded-lg text-xs font-bold transition border border-blue-500 bg-blue-600 text-white shadow-sm';
    }
    
    renderTableSmart(); 
}

async function loadResults() {
    if (!currentRaceId || !currentRankingNr || isFetching) return;
    isFetching = true;
    try {
        currentResults = await TimingApi.getResults(currentRaceId, currentRankingNr);
        
        updateCategoryButtons(currentResults);
        renderTableSmart();

        const nowTime = new Date().toTimeString().split(' ')[0];
        setLiveStatus('live', nowTime);
    } catch (error) {
        console.error("Ошибка загрузки результатов:", error);
        setLiveStatus('error');
    } finally {
        isFetching = false;
    }
}

function updateCategoryButtons(results) {
    const container = document.getElementById('categoriesList');
    const uniqueCats = [...new Set(results.map(r => r.category))].filter(Boolean);
    if (uniqueCats.length === 0) return;

    if (!container.querySelector('[data-cat="all"]')) {
        container.innerHTML = `<button class="btn-cat px-3 py-1 rounded-lg text-xs font-bold border border-blue-500 bg-blue-600 text-white shadow-sm" data-cat="all" onclick="selectCategory('all')">Все категории</button>`;
    }

    uniqueCats.forEach(cat => {
        if (!container.querySelector(`[data-cat="${cat}"]`)) {
            const btn = document.createElement('button');
            btn.className = 'btn-cat px-3 py-1 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700';
            btn.innerText = cat;
            btn.dataset.cat = cat;
            btn.onclick = () => selectCategory(cat);
            container.appendChild(btn);
        }
    });
}

function updateCellText(el, text) {
    if (el.textContent !== text) {
        el.textContent = text;
    }
}

function renderTableSmart() {
    const tbody = document.getElementById('tableBody');
    
    const filtered = currentCategory === 'all' 
        ? currentResults 
        : currentResults.filter(r => r.category === currentCategory);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr id="row-empty"><td colspan="8" class="p-8 text-center text-slate-500 font-medium">Нет данных для отображения</td></tr>`;
        rowDomElements.clear();
        return;
    } else {
        const emptyRow = document.getElementById('row-empty');
        if (emptyRow) emptyRow.remove();
    }

    let localRank = 1; 
    let leaderMs = null;
    let prevMs = null;
    let prevRank = 1;
    const seenKeys = new Set();

    filtered.forEach((row, index) => {
        const key = String(row.id || `${row.bib}_${row.name}`);
        seenKeys.add(key);

        const hasResult = !row.result.includes('На трассе') && !row.result.includes('DNS') && !row.result.includes('НС') && row.result.trim() !== '';
        
        let displayRank = '';
        let displayBehind = row.behind || ''; 

        if (isStartProtocol) {
            displayRank = '';
            displayBehind = '';
        } else if (hasResult) {
            const currentMs = parseTimeToMs(row.result);

            if (currentMs !== null) {
                if (leaderMs === null) {
                    leaderMs = currentMs;
                } else if (!displayBehind || currentCategory !== 'all') {
                    // Если отставание пустое или выбрана группа — рассчитываем его точно
                    displayBehind = formatMsToBehind(currentMs - leaderMs);
                }

                // Расчет места
                if (currentCategory === 'all') {
                    if (row.rank && String(row.rank).trim() !== '') {
                        displayRank = String(row.rank);
                        prevRank = parseInt(row.rank) || prevRank;
                    } else {
                        // Если сервер не прислал ранг — вычисляем по времени
                        if (prevMs !== null && currentMs === prevMs) {
                            displayRank = String(prevRank);
                        } else {
                            displayRank = String(localRank);
                            prevRank = localRank;
                        }
                    }
                } else {
                    if (prevMs !== null && currentMs === prevMs) {
                        displayRank = String(prevRank);
                    } else {
                        displayRank = String(localRank);
                        prevRank = localRank;
                    }
                }
                prevMs = currentMs;
                localRank++;
            } else {
                displayRank = row.rank || '';
            }
        }

        let tr = rowDomElements.get(key);
        if (!tr) {
            tr = document.createElement('tr');
            tr.dataset.key = key;
            tr.className = "hover:bg-slate-800/40 transition-colors duration-150";
            tr.innerHTML = `
                <td class="cell-rank py-2 px-1 md:p-3 text-center font-bold text-rose-400 text-xs md:text-sm"></td>
                <td class="cell-bib py-2 px-1 md:p-3 text-center text-slate-400 font-semibold font-mono text-xs"></td>
                <td class="cell-name py-2 px-2 md:p-3 font-semibold text-white">
                    <div class="athlete-name text-xs md:text-sm"></div>
                    <div class="athlete-sub text-[11px] font-normal text-slate-400 md:hidden mt-0.5"></div>
                </td>
                <td class="cell-club p-3 text-slate-400 text-xs hidden md:table-cell"></td>
                <td class="cell-category p-3 text-slate-400 text-xs hidden md:table-cell"></td>
                <td class="cell-result py-2 px-2 md:p-3 text-right font-mono">
                    <div class="res-time font-medium text-white text-xs md:text-sm"></div>
                    <div class="res-behind-mobile text-[11px] font-semibold text-amber-400 md:hidden"></div>
                </td>
                <td class="cell-behind p-3 text-right font-mono text-amber-400 font-semibold text-xs hidden md:table-cell"></td>
                <td class="cell-addinfo py-2 px-1 md:p-3 text-center text-xs"></td>
            `;
            rowDomElements.set(key, tr);
        }

        const rankCell = tr.querySelector('.cell-rank');
        if (rankCell) {
            rankCell.style.display = isStartProtocol ? 'none' : '';
        }

        const behindCell = tr.querySelector('.cell-behind');
        if (behindCell) {
            behindCell.style.display = isStartProtocol ? 'none' : '';
        }

        updateCellText(tr.querySelector('.cell-rank'), displayRank);
        updateCellText(tr.querySelector('.cell-bib'), row.bib || '');

        // Имя и мобильный подстрочник
        let nameEl = tr.querySelector('.athlete-name');
        let subEl = tr.querySelector('.athlete-sub');
        if (!nameEl) {
            const cellName = tr.querySelector('.cell-name');
            if (cellName) {
                cellName.innerHTML = `
                    <div class="athlete-name text-xs md:text-sm"></div>
                    <div class="athlete-sub text-[11px] font-normal text-slate-400 md:hidden mt-0.5"></div>
                `;
                nameEl = cellName.querySelector('.athlete-name');
                subEl = cellName.querySelector('.athlete-sub');
            }
        }
        if (nameEl) updateCellText(nameEl, row.name || '');
        if (subEl) {
            const subParts = [];
            if (row.club && row.club !== '-') subParts.push(row.club);
            if (row.category) subParts.push(row.category);
            updateCellText(subEl, subParts.join(' • '));
        }

        updateCellText(tr.querySelector('.cell-club'), row.club || '');
        updateCellText(tr.querySelector('.cell-category'), row.category || '');

        // Результат и мобильное отставание
        let resTimeEl = tr.querySelector('.res-time');
        let resBehindMobEl = tr.querySelector('.res-behind-mobile');
        if (!resTimeEl) {
            const cellRes = tr.querySelector('.cell-result');
            if (cellRes) {
                cellRes.innerHTML = `
                    <div class="res-time font-medium text-white text-xs md:text-sm"></div>
                    <div class="res-behind-mobile text-[11px] font-semibold text-amber-400 md:hidden"></div>
                `;
                resTimeEl = cellRes.querySelector('.res-time');
                resBehindMobEl = cellRes.querySelector('.res-behind-mobile');
            }
        }
        if (resTimeEl) updateCellText(resTimeEl, row.result || '');
        if (resBehindMobEl) {
            updateCellText(resBehindMobEl, (!isStartProtocol && displayBehind) ? displayBehind : '');
        }

        updateCellText(tr.querySelector('.cell-behind'), displayBehind);

        const addInfoCell = tr.querySelector('.cell-addinfo');
        const infoVal = (row.addInfo || row.status || '').trim();
        if (infoVal === 'НС' || infoVal === 'DNS') {
            addInfoCell.innerHTML = `<span class="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-950/70 text-rose-400 border border-rose-500/40">НС</span>`;
        } else if (infoVal === 'НФ' || infoVal === 'DNF') {
            addInfoCell.innerHTML = `<span class="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-950/70 text-amber-400 border border-amber-500/40">НФ</span>`;
        } else if (infoVal === 'ДСК' || infoVal === 'DSQ') {
            addInfoCell.innerHTML = `<span class="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-purple-950/70 text-purple-400 border border-purple-500/40">ДСК</span>`;
        } else if (infoVal !== '') {
            addInfoCell.innerHTML = `<span class="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-700/80 text-amber-300 border border-slate-600/60">${infoVal}</span>`;
        } else {
            addInfoCell.innerHTML = `<span class="text-slate-600">-</span>`;
        }

        const resCell = tr.querySelector('.cell-result');
        const targetResClass = 'cell-result py-2 px-2 md:p-3 text-right font-mono';
        if (resCell.className !== targetResClass) {
            resCell.className = targetResClass;
        }

        if (resTimeEl) {
            resTimeEl.className = hasResult 
                ? 'font-medium text-white text-xs md:text-sm' 
                : 'text-slate-500 italic text-xs';
        }

        if (tbody.children[index] !== tr) {
            tbody.insertBefore(tr, tbody.children[index] || null);
        }
    });

    Array.from(tbody.children).forEach(child => {
        if (child.id === 'row-empty') return;
        const k = child.dataset.key;
        if (!k || !seenKeys.has(k)) {
            child.remove();
            if (k) rowDomElements.delete(k);
        }
    });
}

function showRacesView() {
    if (refreshInterval) clearInterval(refreshInterval);
    currentRaceId = null;
    currentRankingNr = null;
    rowDomElements.clear();
    
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('view-results').classList.remove('active-view');
    document.getElementById('view-races').classList.add('active-view');
}

// Запуск при старте
loadEventInfo();