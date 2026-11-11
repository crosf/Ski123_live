const fs = require('fs');
const path = require('path');

try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
    const match = config.targetUrl.match(/http:\/\/([^:/]+)/);
    const ip = match ? match[1] : config.targetUrl;
    console.log(ip);
} catch (e) {
    console.log('неизвестно');
}
