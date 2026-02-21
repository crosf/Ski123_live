// static/js/index.js
async function loadDates(){
    const res = await fetch('/api/dates');
    const data = await res.json();
    if(data.error){ document.getElementById('dates').innerText = data.error; return; }

    document.getElementById('title').innerText = data.title || 'Календарь';

    const container = document.getElementById('dates');
    container.innerHTML = '';

    data.dates.forEach(block => {
        const box = document.createElement('div');
        box.className = 'card mb-3';
        const h = document.createElement('h3');
        h.className = 'text-lg font-semibold mb-2';
        h.innerText = block.date === 'Без даты' ? 'Без даты' : block.date;
        box.appendChild(h);

        const list = document.createElement('div');
        block.races.forEach(r=>{
            const row = document.createElement('div');
            row.className = 'flex justify-between items-center py-1';

            const left = document.createElement('div');
            left.innerHTML = `<div class="font-medium">${r.RaceTitle}</div><div class="text-sm text-slate-400">${r.StartDateTime || ''}</div>`;
            row.appendChild(left);

            const btn = document.createElement('a');
            btn.href = '/race?race=' + encodeURIComponent(r.RaceId);
            btn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded';
            btn.innerText = 'Открыть';
            row.appendChild(btn);

            list.appendChild(row);
        });

        box.appendChild(list);
        container.appendChild(box);
    });
}
window.addEventListener('load', loadDates);
