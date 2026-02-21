// static/js/race.js
let raceId = document.getElementById('raceId').value || '';
let currentCat = '';

function buildQuery(){
    let q = '?race=' + encodeURIComponent(raceId);
    if(currentCat) q += '&cat=' + encodeURIComponent(currentCat);
    return q;
}

async function loadRace(){
    if(!raceId) { document.getElementById('tbody').innerText = 'race param missing'; return; }
    const res = await fetch('/api/live' + buildQuery());
    const data = await res.json();
    if(!data.rows) { document.getElementById('tbody').innerText = 'Нет данных'; return; }

    document.getElementById('title').innerText = data.race_title;

    const cat = document.getElementById('catSelect');
    cat.innerHTML = '<option value="">Все категории</option>';
    (data.categories || []).forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c; opt.text = c;
        cat.appendChild(opt);
    });
    cat.value = data.selected_cat || '';
    cat.onchange = function(){ currentCat = this.value; loadRace(); }

    let header = '<tr class="bg-slate-700">';
    header += '<th>№</th><th>Имя</th><th>Клуб</th>';
    data.headers.forEach(h => header += '<th>' + h + '</th>');
    header += '</tr>';
    document.getElementById('thead').innerHTML = header;

    let body = '';
    data.rows.forEach(r=>{
        body += '<tr class="border-t border-slate-700">';
        body += '<td>' + (r.Bib || '') + '</td>';
        body += '<td>' + (r.Name || '') + '</td>';
        body += '<td>' + (r.Club || '') + '</td>';
        data.headers.forEach(h=>{
            body += '<td>' + (r[h] !== undefined ? r[h] : '') + '</td>';
        });
        body += '</tr>';
    });
    document.getElementById('tbody').innerHTML = body;
}

document.getElementById('btnRefresh').addEventListener('click', loadRace);
window.addEventListener('load', function(){
    loadRace();
    setInterval(loadRace, 3000);
});
