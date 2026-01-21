const fs = require('fs');
const path = require('path');

const packDir = path.join(__dirname, 'src', 'packs', 'rt-items-weapons', '_source');
const files = fs.readdirSync(packDir).filter((f) => f.endsWith('.json'));

const usage = {};
const allQualities = new Set();

files.forEach((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(packDir, f), 'utf8'));
    const special = data.system?.special || [];
    special.forEach((q) => {
        allQualities.add(q);
        usage[q] = (usage[q] || 0) + 1;
    });
});

const result = {
    totalWeapons: files.length,
    uniqueQualities: allQualities.size,
    qualities: Array.from(allQualities).sort(),
    usage,
};

fs.writeFileSync('weapon-qualities-usage.json', JSON.stringify(result, null, 2));
console.log('Scanned ' + result.totalWeapons + ' weapons, found ' + result.uniqueQualities + ' unique qualities');
