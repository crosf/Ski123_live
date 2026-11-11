const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const newIp = process.argv[2];

if (!newIp) {
    console.log('Ошибка: IP не указан');
    process.exit(1);
}

try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Поддерживаем формат с http:// или без
    let cleanIp = newIp.trim().replace(/^https?:\/\//i, '').replace(/\/Info.*$/i, '').replace(/\/$/, '');
    config.targetUrl = `http://${cleanIp}/Info`;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`IP успешно изменён на: ${cleanIp}`);
    console.log(`Новый URL: ${config.targetUrl}`);
} catch (e) {
    console.error('Ошибка записи config.json:', e.message);
    process.exit(1);
}
