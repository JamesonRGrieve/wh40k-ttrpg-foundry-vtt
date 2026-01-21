/**
 * @file critical-injury-migration.mjs
 * Migration utility to consolidate critical injury compendium items.
 *
 * Converts 160 individual items (4 damage types × 4 body parts × 10 severities)
 * into 16 consolidated items (4 damage types × 4 body parts, each holding all 10 severities).
 *
 * Usage:
 *   await CriticalInjuryMigration.migrate();
 */

export default class CriticalInjuryMigration {
    static PACK_NAME = 'rogue-trader.rt-items-critical-injuries';
    static DAMAGE_TYPES = ['impact', 'rending', 'explosive', 'energy'];
    static BODY_PARTS = ['head', 'arm', 'body', 'leg'];

    /**
     * Main migration entry point.
     * @param {object} options - Migration options
     * @param {boolean} options.dryRun - If true, preview changes without saving (default: false)
     * @param {boolean} options.backup - If true, create backup before migration (default: true)
     * @returns {Promise<object>} Migration results
     */
    static async migrate(options = {}) {
        const { dryRun = false, backup = true } = options;

        ui.notifications.info('Starting critical injury migration...');
        console.log('[Critical Injury Migration] Starting migration...');

        const pack = game.packs.get(this.PACK_NAME);
        if (!pack) {
            const msg = `Pack ${this.PACK_NAME} not found!`;
            ui.notifications.error(msg);
            throw new Error(msg);
        }

        // Step 1: Create backup if requested
        if (backup && !dryRun) {
            await this._createBackup(pack);
        }

        // Step 2: Load all existing items
        const existingItems = await pack.getDocuments();
        console.log(`[Critical Injury Migration] Loaded ${existingItems.length} existing items`);

        // Step 3: Group items by damage type + body part
        const grouped = this._groupItems(existingItems);
        console.log(`[Critical Injury Migration] Grouped into ${Object.keys(grouped).length} combinations`);

        // Step 4: Create consolidated items
        const consolidatedItems = this._createConsolidatedItems(grouped);
        console.log(`[Critical Injury Migration] Created ${consolidatedItems.length} consolidated items`);

        if (dryRun) {
            ui.notifications.info(
                `Dry run complete. Would create ${consolidatedItems.length} consolidated items and remove ${existingItems.length} old items.`,
            );
            return {
                dryRun: true,
                consolidated: consolidatedItems,
                oldItems: existingItems,
                summary: this._generateSummary(consolidatedItems, grouped),
            };
        }

        // Step 5: Write consolidated items to pack
        console.log('[Critical Injury Migration] Writing consolidated items to pack...');
        const created = [];
        for (const itemData of consolidatedItems) {
            const doc = await pack.documentClass.create(itemData, { pack: pack.collection });
            created.push(doc);
            console.log(`  Created: ${doc.name} (${doc.id})`);
        }

        // Step 6: Delete old items
        console.log('[Critical Injury Migration] Deleting old items...');
        const deleted = [];
        for (const item of existingItems) {
            await item.delete();
            deleted.push(item.id);
            console.log(`  Deleted: ${item.name} (${item.id})`);
        }

        ui.notifications.info(`Migration complete! Created ${created.length} consolidated items, removed ${deleted.length} old items.`);

        return {
            dryRun: false,
            created,
            deleted,
            summary: this._generateSummary(consolidatedItems, grouped),
        };
    }

    /**
     * Create a backup of the compendium pack.
     * @param {CompendiumCollection} pack - Pack to backup
     * @private
     */
    static async _createBackup(pack) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${pack.metadata.name}-backup-${timestamp}`;

        ui.notifications.info(`Creating backup: ${backupName}...`);
        console.log(`[Critical Injury Migration] Creating backup: ${backupName}`);

        // Note: Foundry doesn't have a built-in pack duplication API,
        // but we can export the data to a JSON file
        const items = await pack.getDocuments();
        const backupData = items.map((item) => item.toObject());

        // Save to world data folder
        const backupPath = `worlds/${game.world.id}/critical-injury-backup-${timestamp}.json`;
        console.log(`[Critical Injury Migration] Backup data prepared (${backupData.length} items)`);
        console.log(`[Critical Injury Migration] Manual step: Save backup to ${backupPath}`);

        // Log backup data to console for manual save
        console.log('[Critical Injury Migration] Backup data:', JSON.stringify(backupData, null, 2));

        ui.notifications.warn('Backup data logged to console. Please save manually if needed.');
    }

    /**
     * Group items by damage type + body part combination.
     * @param {Item[]} items - Items to group
     * @returns {object} Grouped items by "damageType-bodyPart" key
     * @private
     */
    static _groupItems(items) {
        const grouped = {};

        for (const item of items) {
            const { damageType, bodyPart, severity, effect, permanent, description, source } = item.system;
            const key = `${damageType}-${bodyPart}`;

            if (!grouped[key]) {
                grouped[key] = {
                    damageType,
                    bodyPart,
                    effects: {},
                    source: source || { book: '', page: '', custom: '' },
                    description: description || { value: '', chat: '', summary: '' },
                };
            }

            // Store effect data for this severity level
            grouped[key].effects[severity] = {
                text: effect || '',
                permanent: permanent || false,
            };
        }

        return grouped;
    }

    /**
     * Create consolidated item data from grouped items.
     * @param {object} grouped - Grouped items
     * @returns {object[]} Array of consolidated item data
     * @private
     */
    static _createConsolidatedItems(grouped) {
        const consolidated = [];

        for (const [key, data] of Object.entries(grouped)) {
            const { damageType, bodyPart, effects, source, description } = data;

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

            // Build item data
            const itemData = {
                name,
                type: 'criticalInjury',
                img: 'icons/svg/blood.svg',
                system: {
                    identifier,
                    damageType,
                    bodyPart,
                    severity: 1, // Default to severity 1
                    effects, // Consolidated effects object
                    effect: '', // Legacy field, now empty
                    permanent: false, // Legacy field, now in effects
                    notes: '',
                    description: {
                        value: consolidatedDesc,
                        chat: description.chat || '',
                        summary: description.summary || `${damageLabel} ${bodyLabel} injury`,
                    },
                    source: source || { book: 'Rogue Trader Core Rulebook', page: '254-257', custom: '' },
                },
                flags: {
                    rt: {
                        generated: false,
                        consolidated: true,
                        version: '2.0',
                        migrationDate: new Date().toISOString(),
                    },
                },
            };

            consolidated.push(itemData);
        }

        return consolidated;
    }

    /**
     * Generate a summary report of the migration.
     * @param {object[]} consolidated - Consolidated items
     * @param {object} grouped - Grouped data
     * @returns {object} Summary report
     * @private
     */
    static _generateSummary(consolidated, grouped) {
        const summary = {
            totalConsolidated: consolidated.length,
            byDamageType: {},
            byBodyPart: {},
            severityCoverage: {},
        };

        for (const [key, data] of Object.entries(grouped)) {
            const { damageType, bodyPart, effects } = data;

            // Count by damage type
            summary.byDamageType[damageType] = (summary.byDamageType[damageType] || 0) + 1;

            // Count by body part
            summary.byBodyPart[bodyPart] = (summary.byBodyPart[bodyPart] || 0) + 1;

            // Track severity coverage
            const severities = Object.keys(effects)
                .map((k) => parseInt(k))
                .sort((a, b) => a - b);
            summary.severityCoverage[key] = severities;
        }

        return summary;
    }

    /**
     * Validate migration results.
     * @param {object} results - Migration results
     * @returns {boolean} True if validation passes
     */
    static validateMigration(results) {
        const { summary } = results;

        console.log('[Critical Injury Migration] Validation Report:');
        console.log(`  Total consolidated items: ${summary.totalConsolidated}`);
        console.log(`  By damage type:`, summary.byDamageType);
        console.log(`  By body part:`, summary.byBodyPart);

        // Check expected counts
        const expectedTotal = this.DAMAGE_TYPES.length * this.BODY_PARTS.length; // 16
        if (summary.totalConsolidated !== expectedTotal) {
            console.error(`  ❌ Expected ${expectedTotal} consolidated items, got ${summary.totalConsolidated}`);
            return false;
        }

        // Check all damage types represented
        for (const damageType of this.DAMAGE_TYPES) {
            if (summary.byDamageType[damageType] !== this.BODY_PARTS.length) {
                console.error(`  ❌ Expected ${this.BODY_PARTS.length} items for ${damageType}, got ${summary.byDamageType[damageType]}`);
                return false;
            }
        }

        // Check all body parts represented
        for (const bodyPart of this.BODY_PARTS) {
            if (summary.byBodyPart[bodyPart] !== this.DAMAGE_TYPES.length) {
                console.error(`  ❌ Expected ${this.DAMAGE_TYPES.length} items for ${bodyPart}, got ${summary.byBodyPart[bodyPart]}`);
                return false;
            }
        }

        // Check severity coverage (each should have 1-10)
        for (const [key, severities] of Object.entries(summary.severityCoverage)) {
            const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const missing = expected.filter((s) => !severities.includes(s));
            if (missing.length > 0) {
                console.warn(`  ⚠️ ${key} missing severities: ${missing.join(', ')}`);
            }
        }

        console.log('[Critical Injury Migration] ✅ Validation passed!');
        return true;
    }
}
