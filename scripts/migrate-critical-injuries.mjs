/**
 * @file migrate-critical-injuries.mjs
 * Node script to consolidate critical injury JSON source files.
 *
 * Run with: node scripts/migrate-critical-injuries.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.join(__dirname, '../src/packs/rt-items-critical-injuries/_source');
const OUTPUT_DIR = SOURCE_DIR; // Will replace files in place
const DRY_RUN = process.argv.includes('--dry-run');

const DAMAGE_TYPES = ['impact', 'rending', 'explosive', 'energy'];
const BODY_PARTS = ['head', 'arm', 'body', 'leg'];

/**
 * Main migration function.
 */
async function migrate() {
    console.log('🔧 Critical Injury Migration Script');
    console.log('='.repeat(60));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}`);
    console.log(`Source: ${SOURCE_DIR}`);
    console.log('');

    // Step 1: Read all JSON files
    const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json'));
    console.log(`📂 Found ${files.length} JSON files`);

    const items = [];
    for (const file of files) {
        const filePath = path.join(SOURCE_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const item = JSON.parse(content);
        items.push({ file, item });
    }

    // Step 2: Group by damage type + body part
    const grouped = {};
    for (const { file, item } of items) {
        const { damageType, bodyPart, severity, effect, permanent, description, source } = item.system;
        const key = `${damageType}-${bodyPart}`;

        if (!grouped[key]) {
            grouped[key] = {
                damageType,
                bodyPart,
                effects: {},
                source: source || { book: 'Rogue Trader Core Rulebook', page: '254-257', custom: '' },
                description: description || { value: '', chat: '', summary: '' },
                originalFiles: [],
            };
        }

        grouped[key].effects[severity] = {
            text: effect || '',
            permanent: permanent || false,
        };
        grouped[key].originalFiles.push(file);
    }

    console.log(`📦 Grouped into ${Object.keys(grouped).length} combinations`);
    console.log('');

    // Step 3: Create consolidated items
    const consolidated = [];
    for (const [key, data] of Object.entries(grouped)) {
        const { damageType, bodyPart, effects, source, description, originalFiles } = data;

        // Create display name
        const damageLabel = damageType.charAt(0).toUpperCase() + damageType.slice(1);
        const bodyLabel = bodyPart.charAt(0).toUpperCase() + bodyPart.slice(1);
        const name = `${damageLabel} Critical - ${bodyLabel}`;

        // Create identifier
        const identifier = `crit_${damageType}_${bodyPart}_consolidated`;

        // Create consolidated description
        const consolidatedDesc =
            description.value ||
            `<p><strong>${damageLabel} Damage to ${bodyLabel}</strong></p><p>This injury has effects for all severity levels 1-10. Use the severity slider to select the appropriate level.</p>`;

        // Generate new ID (using simple hash of key)
        const _id = generateId(key);

        // Build item data
        const itemData = {
            _id,
            name,
            type: 'criticalInjury',
            img: 'icons/svg/blood.svg',
            system: {
                identifier,
                damageType,
                bodyPart,
                severity: 1,
                effects,
                effect: '',
                permanent: false,
                notes: '',
                description: {
                    value: consolidatedDesc,
                    chat: description.chat || '',
                    summary: description.summary || `${damageLabel} ${bodyLabel} injury`,
                },
                source: source || { book: 'Rogue Trader Core Rulebook', page: '254-257', custom: '' },
            },
            effects: [],
            flags: {
                rt: {
                    generated: false,
                    consolidated: true,
                    version: '2.0',
                    migrationDate: new Date().toISOString(),
                },
            },
        };

        consolidated.push({ key, itemData, originalFiles });

        // Log severity coverage
        const severities = Object.keys(effects)
            .map((k) => parseInt(k))
            .sort((a, b) => a - b);
        const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((s) => !severities.includes(s));
        console.log(`  ${name}:`);
        console.log(`    Severities: ${severities.join(', ')}`);
        if (missing.length > 0) {
            console.log(`    ⚠️  Missing: ${missing.join(', ')}`);
        }
        console.log(`    Files: ${originalFiles.length}`);
    }

    console.log('');
    console.log(`✅ Created ${consolidated.length} consolidated items`);
    console.log('');

    // Step 4: Validation
    console.log('🔍 Validation:');
    const expectedTotal = DAMAGE_TYPES.length * BODY_PARTS.length;
    if (consolidated.length !== expectedTotal) {
        console.error(`  ❌ Expected ${expectedTotal} consolidated items, got ${consolidated.length}`);
        process.exit(1);
    }

    // Check all combinations exist
    for (const damageType of DAMAGE_TYPES) {
        for (const bodyPart of BODY_PARTS) {
            const key = `${damageType}-${bodyPart}`;
            if (!grouped[key]) {
                console.error(`  ❌ Missing combination: ${key}`);
                process.exit(1);
            }
        }
    }

    console.log(`  ✅ All ${expectedTotal} combinations present`);
    console.log('');

    if (DRY_RUN) {
        console.log('🏁 DRY RUN complete - no files modified');
        console.log('   Run without --dry-run to apply changes');
        return;
    }

    // Step 5: Write consolidated files
    console.log('💾 Writing consolidated files...');
    for (const { key, itemData, originalFiles } of consolidated) {
        const fileName = `${key}-consolidated_${itemData._id}.json`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        fs.writeFileSync(filePath, JSON.stringify(itemData, null, 2));
        console.log(`  ✅ ${fileName}`);
    }

    // Step 6: Delete original files
    console.log('');
    console.log('🗑️  Removing original files...');
    for (const { file } of items) {
        const filePath = path.join(SOURCE_DIR, file);
        fs.unlinkSync(filePath);
        console.log(`  ✅ ${file}`);
    }

    console.log('');
    console.log('🎉 Migration complete!');
    console.log(`   Created: ${consolidated.length} consolidated items`);
    console.log(`   Removed: ${items.length} original items`);
}

/**
 * Generate a deterministic 16-character ID from a key.
 */
function generateId(key) {
    // Simple hash function for demonstration
    // In production, you might want to use a proper UUID or existing ID
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    // Convert to base36 and pad
    const id = Math.abs(hash).toString(36).padStart(16, '0').substring(0, 16);
    return id;
}

// Run migration
migrate().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
