import { RogueTraderSettings } from './rogue-trader-settings.mjs';
import { SYSTEM_ID } from './constants.mjs';

export async function checkAndMigrateWorld() {
    const worldVersion = 185;

    const currentVersion = game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.worldVersion);
    if (worldVersion !== currentVersion && game.user.isGM) {
        ui.notifications.info('Upgrading the world, please wait...');

        // Update Actors
        for (let actor of game.actors.contents) {
            try {
                await migrateActorData(actor, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Update Items
        for (let item of game.items.contents) {
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

        game.settings.set(SYSTEM_ID, RogueTraderSettings.SETTINGS.worldVersion, worldVersion);
        ui.notifications.info('Upgrade complete!');
    }

    async function updateCompendiumPermissions(version) {
        if (version < 181) {
            // Every compendium in our system should be owned by everyone and have full owner permissions.
            // Otherwise, issues will occur when trying to create items from the compendium.
            const compendiums = game.packs.filter((p) => p.metadata.packageName === SYSTEM_ID);

            for (let compendium of compendiums) {

                await compendium.configure({
                    ownership: {
                        "PLAYER": "OWNER",
                        "TRUSTED": "OWNER",
                        "ASSISTANT": "OWNER",
                        "GAMEMASTER": "OWNER",
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
            const flags = actor.flags?.['rogue-trader'];
            if (flags?.equipmentViewMode !== undefined || flags?.equipmentPresets !== undefined) {
                await actor.update({
                    'flags.rogue-trader.-=equipmentViewMode': null,
                    'flags.rogue-trader.-=equipmentPresets': null,
                });
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
        const html = await renderTemplate('systems/rogue-trader/templates/prompt/release-notes-prompt.hbs', data);
        let dialog = new Dialog(
            {
                title: 'Release Notes',
                content: html,
                buttons: {
                    ok: {
                        icon: "<i class='dh-material'>close</i>",
                        label: 'Ok',
                        callback: () => {},
                    },
                },
                default: 'ok',
                close: () => {},
            },
            {
                width: 300,
            },
        );
        dialog.render(true);
    }
}
