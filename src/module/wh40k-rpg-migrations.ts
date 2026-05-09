import { SYSTEM_ID } from './constants.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

// Baseline release. Version 0.0.1 ships with migration worldVersion = 1.
// No migrations run against a fresh 0.0.1 world — every prior migration below
// was inherited from the upstream fork and has been retained, commented out,
// purely as reference for future schema changes. When you add the first real
// migration past v1, bump WORLD_VERSION and branch on `currentVersion < N`.
const WORLD_VERSION = 1;

export async function checkAndMigrateWorld(): Promise<void> {
    const currentVersion = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion) as number;
    if (WORLD_VERSION !== currentVersion && game.user.isGM) {
        await game.settings.set(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, WORLD_VERSION);
    }
}

/* ---------------------------------------------------------------------------
 * Historical migrations (pre-0.0.1). Preserved for reference only — this code
 * does not run. When authoring the next migration, lift whichever pattern you
 * need from here and wire it into `checkAndMigrateWorld` above.
 * ---------------------------------------------------------------------------

const DEAD_ICON_REMAPS: Record<string, string> = {
    'icons/svg/backpack.svg': 'modules/game-icons-net-font/svg/backpack.svg',
    'icons/svg/alien.svg': 'modules/game-icons-net-font/svg/alien-bug.svg',
    'icons/svg/astronaut.svg': 'modules/game-icons-net-font/svg/astronaut-helmet.svg',
    'icons/svg/brain.svg': 'modules/game-icons-net-font/svg/brain.svg',
    'icons/svg/car.svg': 'modules/game-icons-net-font/svg/jeep.svg',
    'icons/svg/cogwheel.svg': 'modules/game-icons-net-font/svg/gears.svg',
    'icons/svg/connected.svg': 'modules/game-icons-net-font/svg/network-bars.svg',
    'icons/svg/crowd.svg': 'modules/game-icons-net-font/svg/conversation.svg',
    'icons/svg/crown.svg': 'modules/game-icons-net-font/svg/crown.svg',
    'icons/svg/dagger.svg': 'modules/game-icons-net-font/svg/daggers.svg',
    'icons/svg/dice.svg': 'modules/game-icons-net-font/svg/dice-twenty-faces-twenty.svg',
    'icons/svg/eagle.svg': 'modules/game-icons-net-font/svg/eagle-emblem.svg',
    'icons/svg/energy-weapon.svg': 'modules/game-icons-net-font/svg/laser-gun.svg',
    'icons/svg/eye-horror.svg': 'modules/game-icons-net-font/svg/evil-eyes.svg',
    'icons/svg/gear.svg': 'modules/game-icons-net-font/svg/gears.svg',
    'icons/svg/gears.svg': 'modules/game-icons-net-font/svg/gears.svg',
    'icons/svg/helm.svg': 'modules/game-icons-net-font/svg/crested-helmet.svg',
    'icons/svg/hidden.svg': 'modules/game-icons-net-font/svg/hidden.svg',
    'icons/svg/holy-symbol.svg': 'modules/game-icons-net-font/svg/holy-symbol.svg',
    'icons/svg/horror.svg': 'modules/game-icons-net-font/svg/evil-eyes.svg',
    'icons/svg/masked.svg': 'modules/game-icons-net-font/svg/android-mask.svg',
    'icons/svg/network.svg': 'modules/game-icons-net-font/svg/network-bars.svg',
    'icons/svg/planet.svg': 'modules/game-icons-net-font/svg/ringed-planet.svg',
    'icons/svg/shield-alt.svg': 'modules/game-icons-net-font/svg/shield.svg',
    'icons/svg/ship.svg': 'modules/game-icons-net-font/svg/spaceship.svg',
    'icons/svg/stone.svg': 'modules/game-icons-net-font/svg/rune-stone.svg',
    'icons/svg/sword-cross.svg': 'modules/game-icons-net-font/svg/crossed-swords.svg',
    'icons/svg/throne.svg': 'modules/game-icons-net-font/svg/stone-throne.svg',
    'icons/svg/ammo.svg': 'modules/game-icons-net-font/svg/bullets.svg',
    'icons/svg/compass.svg': 'modules/game-icons-net-font/svg/compass.svg',
    'icons/svg/crew.svg': 'modules/game-icons-net-font/svg/conversation.svg',
    'icons/svg/energy.svg': 'modules/game-icons-net-font/svg/lightning-electron.svg',
    'icons/svg/scroll.svg': 'modules/game-icons-net-font/svg/scroll-unfurled.svg',
};

export async function checkAndMigrateWorld() {
    const worldVersion = 188;

    const currentVersion = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion);
    if (worldVersion !== currentVersion && game.user.isGM) {
        ui.notifications.info('Upgrading the world, please wait...');

        // Update Actors
        for (const actor of game.actors.contents) {
            try {
                await migrateActorData(actor, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Update Items
        for (const item of game.items.contents) {
            try {
                await migrateItemData(item, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Update Compendium Permissions
        await updateCompendiumPermissions(currentVersion);

        // Display Release Notes
        await displayReleaseNotes(worldVersion);

        void game.settings.set(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, worldVersion);
        ui.notifications.info('Upgrade complete!');
    }

    async function updateCompendiumPermissions(version) {
        if (version < 181) {
            // Every compendium in our system should be owned by everyone and have full owner permissions.
            // Otherwise, issues will occur when trying to create items from the compendium.
            const compendiums = game.packs.filter((p) => p.metadata.packageName === SYSTEM_ID);

            for (const compendium of compendiums) {
                await compendium.configure({
                    ownership: {
                        PLAYER: 'OWNER',
                        TRUSTED: 'OWNER',
                        ASSISTANT: 'OWNER',
                        GAMEMASTER: 'OWNER',
                    },
                });
            }
        }
    }

    async function migrateItemData(item, version) {
        if (version < 180) {
            // Get itemcollection.contentsData flag
            const itemCollection = item.flags['itemcollection'];
            if (itemCollection && itemCollection.contentsData) {
                await item.createNestedDocuments(itemCollection.contentsData);
            }
        }

        if (version < 183) {
            if (item.type === 'talent') {
                const updateData = {};
                const system = item.system ?? {};
                if (system.effect && !system.benefit) {
                    updateData['system.benefit'] = system.effect;
                }
                if (system.requirements && !system.prerequisites?.text) {
                    updateData['system.prerequisites.text'] = system.requirements;
                }
                if (Object.keys(updateData).length) {
                    await item.update(updateData);
                }
            }

            if (item.type === 'trait') {
                const updateData = {};
                const system = item.system ?? {};
                if (system.effects && !system.effect) {
                    updateData['system.effect'] = system.effects;
                }
                if (system.descriptionText && !system.description?.value) {
                    updateData['system.description.value'] = `<p>${system.descriptionText}</p>`;
                }
                if (Object.keys(updateData).length) {
                    await item.update(updateData);
                }
            }

            if (item.type === 'skill') {
                const updateData = {};
                const system = item.system ?? {};
                const rawType = system.type?.toString().toLowerCase() ?? '';
                if (!system.skillType && rawType) {
                    if (rawType.includes('specialist')) {
                        updateData['system.skillType'] = 'specialist';
                    } else if (rawType.includes('advanced')) {
                        updateData['system.skillType'] = 'advanced';
                    } else if (rawType.includes('basic')) {
                        updateData['system.skillType'] = 'basic';
                    }
                }
                if (Object.keys(updateData).length) {
                    await item.update(updateData);
                }
            }
        }

        // V13 Compatibility Migration (v184)
        if (version < 184) {
            const updateData = {};
            const system = item.system ?? {};

            // Fix armour coverage (Array → Set is handled by DataModel.migrateData)
            // But we still need to persist the change to the database
            if (item.type === 'armour' && system.coverage) {
                if (Array.isArray(system.coverage)) {
                    // Update to trigger DataModel migration
                    updateData['system.coverage'] = [...system.coverage];
                }
            }

            // Fix HTMLField nulls in description
            if (system.description) {
                if (system.description.chat === null) {
                    updateData['system.description.chat'] = '';
                }
                if (system.description.summary === null) {
                    updateData['system.description.summary'] = '';
                }
            }

            // Fix source field nulls
            if (system.source) {
                if (system.source.book === null) {
                    updateData['system.source.book'] = '';
                }
                if (system.source.page === null) {
                    updateData['system.source.page'] = '';
                }
                if (system.source.custom === null) {
                    updateData['system.source.custom'] = '';
                }
            }

            if (Object.keys(updateData).length) {
                await item.update(updateData);
            }
        }

        if (version < 186) {
            const replacement = DEAD_ICON_REMAPS[item.img];
            if (replacement) {
                await item.update({ img: replacement });
            }
        }
    }

    async function migrateActorData(actor, version) {
        if (version < 1) {
            // Update Storage Locations to Hold Consumables
            for (const location of actor.items.filter((i) => i.isStorageLocation)) {
                await location.update({
                    system: {
                        containerTypes: [
                            'ammunition',
                            'armour',
                            'armourModification',
                            'cybernetic',
                            'consumable',
                            'drug',
                            'forceField',
                            'gear',
                            'tool',
                            'weapon',
                            'weaponModification',
                        ],
                    },
                });
            }
        }

        if (currentVersion < 180) {
            // Update User Items to be Nested
            for (const item of actor.items) {
                // Get itemcollection.contentsData flag
                const itemCollection = item.flags['itemcollection'];
                if (itemCollection && itemCollection.contentsData) {
                    await item.createNestedDocuments(itemCollection.contentsData);
                }
            }
        }

        if (currentVersion < 182) {
            const skills = actor.system?.skills;

            if (skills?.navigate) {
                const navigationSkill = foundry.utils.duplicate(skills.navigate);
                navigationSkill.label = 'Navigation';
                navigationSkill.characteristic = navigationSkill.characteristic ?? 'Int';
                navigationSkill.characteristics = navigationSkill.characteristics?.length ? navigationSkill.characteristics : ['Int'];

                const updateData = {
                    'system.skills.navigation': skills.navigation ?? navigationSkill,
                    'system.skills.-=navigate': null,
                };

                await actor.update(updateData);
            }
        }

        // V13 Compatibility Migration (v184)
        // Migrate embedded items on actors
        if (currentVersion < 184) {
            for (const item of actor.items) {
                const updateData = {};
                const system = item.system ?? {};

                // Fix armour coverage
                if (item.type === 'armour' && system.coverage) {
                    if (Array.isArray(system.coverage)) {
                        updateData['system.coverage'] = [...system.coverage];
                    }
                }

                // Fix HTMLField nulls
                if (system.description) {
                    if (system.description.chat === null) {
                        updateData['system.description.chat'] = '';
                    }
                    if (system.description.summary === null) {
                        updateData['system.description.summary'] = '';
                    }
                }

                // Fix source field nulls
                if (system.source) {
                    if (system.source.book === null) {
                        updateData['system.source.book'] = '';
                    }
                    if (system.source.page === null) {
                        updateData['system.source.page'] = '';
                    }
                    if (system.source.custom === null) {
                        updateData['system.source.custom'] = '';
                    }
                }

                if (Object.keys(updateData).length) {
                    await item.update(updateData);
                }
            }
        }

        // Remove deprecated loadout system flags (v185)
        if (currentVersion < 185) {
            const flags = actor.flags?.['wh40k-rpg'];
            if (flags?.equipmentViewMode !== undefined || flags?.equipmentPresets !== undefined) {
                await actor.update({
                    'flags.wh40k-rpg.-=equipmentViewMode': null,
                    'flags.wh40k-rpg.-=equipmentPresets': null,
                });
            }
        }

        // Repoint dead icons/svg/*.svg paths (v186)
        if (currentVersion < 186) {
            const actorReplacement = DEAD_ICON_REMAPS[actor.img];
            if (actorReplacement) {
                await actor.update({ img: actorReplacement });
            }
            for (const item of actor.items) {
                const itemReplacement = DEAD_ICON_REMAPS[item.img];
                if (itemReplacement) {
                    await item.update({ img: itemReplacement });
                }
            }
        }

        // Dedupe embedded talents + rename Weapon Training (Stock) → (Shock) (v187)
        if (currentVersion < 187) {
            const talents = actor.items.filter((i) => i.type === 'talent');

            // First pass: rename "Weapon Training (Stock)" → "(Shock)" variants
            for (const talent of talents) {
                if (/^Weapon Training \(Stock\)$/i.test(talent.name)) {
                    await talent.update({
                        'name': talent.name.replace(/\(Stock\)/i, '(Shock)'),
                        'system.specialization': 'Shock',
                    });
                }
            }

            // Second pass: group by (base-name, specialization) and dedupe
            const refreshed = actor.items.filter((i) => i.type === 'talent');
            const groups = new Map();
            for (const talent of refreshed) {
                const spec = (talent.system?.specialization ?? '').toString().toLowerCase().trim();
                const match = talent.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                const baseName = (match ? match[1] : talent.name).toLowerCase().trim();
                const key = `${baseName}|${spec || (match ? match[2].toLowerCase().trim() : '')}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(talent);
            }

            const idsToDelete = [];
            for (const group of groups.values()) {
                if (group.length < 2) continue;
                // Keep the one with the highest rank; ties → keep earliest-created
                group.sort((a, b) => {
                    const rankDiff = (b.system?.rank ?? 1) - (a.system?.rank ?? 1);
                    if (rankDiff !== 0) return rankDiff;
                    const aTime = a._stats?.createdTime ?? 0;
                    const bTime = b._stats?.createdTime ?? 0;
                    return aTime - bTime;
                });
                for (let i = 1; i < group.length; i++) {
                    idsToDelete.push(group[i].id);
                }
            }

            if (idsToDelete.length) {
                await actor.deleteEmbeddedDocuments('Item', idsToDelete);
            }
        }

        // Collapse talent names with duplicate or chained parens: "Name (X) (Y)" → "Name (X)" (v188)
        // Caused by earlier grant-composition bug where specialization was appended on top of an
        // already-specialized source name.
        if (currentVersion < 188) {
            const talents = actor.items.filter((i) => i.type === 'talent');
            for (const talent of talents) {
                // Match names ending in two or more `(...)` groups
                const match = talent.name.match(/^(.*?)\s*(\([^)]+\))\s*(\([^)]+\))\s*$/);
                if (!match) continue;
                const base = match[1].trim();
                const firstParen = match[2].slice(1, -1).trim();
                const secondParen = match[3].slice(1, -1).trim();
                // Prefer the current system.specialization if set; otherwise keep the first paren
                const keptSpec = (talent.system?.specialization ?? '').toString().trim() || firstParen;
                const newName = `${base} (${keptSpec})`;
                if (newName !== talent.name) {
                    await talent.update({
                        'name': newName,
                        'system.specialization': keptSpec,
                    });
                    game.wh40k?.log?.(`Repaired talent name: "${talent.name}" (had "${firstParen}" and "${secondParen}") → "${newName}"`);
                }
            }

            // Second dedup pass — a rename may have surfaced new duplicates
            const afterRename = actor.items.filter((i) => i.type === 'talent');
            const groups2 = new Map();
            for (const talent of afterRename) {
                const spec = (talent.system?.specialization ?? '').toString().toLowerCase().trim();
                const m = talent.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                const baseName = (m ? m[1] : talent.name).toLowerCase().trim();
                const key = `${baseName}|${spec || (m ? m[2].toLowerCase().trim() : '')}`;
                if (!groups2.has(key)) groups2.set(key, []);
                groups2.get(key).push(talent);
            }
            const dupIds = [];
            for (const group of groups2.values()) {
                if (group.length < 2) continue;
                group.sort((a, b) => {
                    const rankDiff = (b.system?.rank ?? 1) - (a.system?.rank ?? 1);
                    if (rankDiff !== 0) return rankDiff;
                    return (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0);
                });
                for (let i = 1; i < group.length; i++) dupIds.push(group[i].id);
            }
            if (dupIds.length) {
                await actor.deleteEmbeddedDocuments('Item', dupIds);
            }
        }
    }

    async function displayReleaseNotes(version) {
        switch (version) {
            case 157:
                await releaseNotes({
                    version: '1.5.7',
                    notes: [
                        'Fixed duplication bug when dropping the same item on an actor.',
                        'Added missing plentiful availability.',
                        'Added Drugs and Consumables compendium with information from the core book.',
                        'Added support for creating new specialist skills.',
                    ],
                });
                break;
            case 161:
                await releaseNotes({
                    version: '1.6.1',
                    notes: [
                        'Added Game Settings -> Configure Settings -> Options to enable simple attack and psychic rolls if preferred.',
                        'Added support for Knockdown, Feint, Suppressing Fire, and Stun attack actions.',
                        'Added Fluid Action, Forearm Weapon Mounting, Pistol Grip, Compact, Modified-Stock, and Motion Predictor automation.',
                        'Added active effect support for weapons and armour.',
                        'Added Eye of Vengeance support for attacks.',
                        'Added target size to automated modifiers for attacks.',
                    ],
                });
                break;
            case 180:
                await releaseNotes({
                    version: '1.8.0',
                    notes: [
                        'Added Foundry 12 support. Nested items (like ammunition or weapon specials on items) were drastically changed. I have done my best to migrate the data, but please check your items and actors for any issues.',
                        'Added True Grit talent support when assigning critical damage.',
                    ],
                });
                break;
            case 181:
                await releaseNotes({
                    version: '1.8.1',
                    notes: [
                        'Updated compendium permissions to fix permissions issues for players without ownership permissions.',
                        'Fixed issue with nested items not working: weapon specials and ammunition should now work correctly.',
                    ],
                });
                break;
            case 182:
                await releaseNotes({
                    version: '1.8.2',
                    notes: [
                        'Updated the Navigate skill to Navigation and migrated existing actors to use the new skill key.',
                        'Adjusted skill roll lookups to respect Navigation aliases.',
                    ],
                });
                break;
            case 183:
                await releaseNotes({
                    version: '1.8.3',
                    notes: [
                        'Migrated legacy talent and trait fields into the modern item schema so compendium sheets show full details.',
                        'Inferred specialist/advanced skill types for legacy compendium skill entries.',
                    ],
                });
                break;
            case 184:
                await releaseNotes({
                    version: '1.8.4',
                    notes: [
                        'Foundry V13 compatibility migration.',
                        'Fixed armour coverage field migration (Array to Set).',
                        'Fixed null HTMLField values in item descriptions and sources.',
                        'Consolidated duplicate migration logic in data models.',
                    ],
                });
                break;
            case 185:
                await releaseNotes({
                    version: '1.8.5',
                    notes: [
                        'Removed the equipment loadout/slots system to simplify character sheets.',
                        'Cleaned up deprecated actor flags (equipmentViewMode, equipmentPresets).',
                    ],
                });
                break;
            default:
                break;
        }
    }

    async function releaseNotes(data) {
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/prompt/release-notes-prompt.hbs', data);
        void foundry.applications.api.DialogV2.prompt({
            window: { title: 'Release Notes' },
            content: html,
            ok: { label: 'Ok' },
            position: { width: 300 },
            rejectClose: false,
        });
    }
}

--- end historical migrations reference --- */
