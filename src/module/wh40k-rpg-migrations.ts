import { SYSTEM_ID } from './constants.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

export async function checkAndMigrateWorld(): Promise<void> {
    const worldVersion = 185;

    // @ts-expect-error - argument type
    const currentVersion = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion);
    // @ts-expect-error - comparison type
    if (worldVersion !== currentVersion && game.user.isGM) {
        ui.notifications.info('Upgrading the world, please wait...');

        // Update Actors
        // @ts-expect-error - dynamic property access
        for (const actor of game.actors.contents) {
            try {
                // eslint-disable-next-line no-await-in-loop -- Sequential actor migration
                await migrateActorData(actor, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Update Items
        // @ts-expect-error - dynamic property access
        for (const item of game.items.contents) {
            try {
                // eslint-disable-next-line no-await-in-loop -- Sequential item migration
                await migrateItemData(item, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Update Compendium Permissions
        await updateCompendiumPermissions(currentVersion);

        // Display Release Notes
        await displayReleaseNotes(worldVersion);

        // @ts-expect-error - argument type
        void game.settings.set(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, worldVersion);
        ui.notifications.info('Upgrade complete!');
    }

    async function updateCompendiumPermissions(version: any): Promise<void> {
        if (version < 181) {
            // Every compendium in our system should be owned by everyone and have full owner permissions.
            // Otherwise, issues will occur when trying to create items from the compendium.
            const compendiums = game.packs.filter((p) => p.metadata.packageName === SYSTEM_ID);

            for (const compendium of compendiums) {
                // eslint-disable-next-line no-await-in-loop -- Sequential compendium configuration
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

    async function migrateItemData(item: any, version: any): Promise<void> {
        if (version < 180) {
            await migrateItemV180(item);
        }

        if (version < 183) {
            await migrateItemV183(item);
        }

        // V13 Compatibility Migration (v184)
        if (version < 184) {
            await migrateItemV184(item);
        }
    }

    async function migrateItemV180(item: any): Promise<void> {
        const itemCollection = item.flags['itemcollection'];
        if (itemCollection && itemCollection.contentsData) {
            await item.createNestedDocuments(itemCollection.contentsData);
        }
    }

    async function migrateItemV183(item: any): Promise<void> {
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

    async function migrateItemV184(item: any): Promise<void> {
        const updateData = {};
        const system = item.system ?? {};

        if (item.type === 'armour' && system.coverage) {
            if (Array.isArray(system.coverage)) {
                updateData['system.coverage'] = [...system.coverage];
            }
        }

        if (system.description) {
            if (system.description.chat === null) {
                updateData['system.description.chat'] = '';
            }
            if (system.description.summary === null) {
                updateData['system.description.summary'] = '';
            }
        }

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

    async function migrateActorData(actor: any, version: any): Promise<void> {
        if (version < 1) {
            await migrateActorV1(actor);
        }

        // @ts-expect-error - operator type
        if (currentVersion < 180) {
            await migrateActorV180(actor);
        }

        // @ts-expect-error - operator type
        if (currentVersion < 182) {
            await migrateActorV182(actor);
        }

        // @ts-expect-error - operator type
        if (currentVersion < 184) {
            await migrateActorV184(actor);
        }

        // @ts-expect-error - operator type
        if (currentVersion < 185) {
            await migrateActorV185(actor);
        }
    }

    async function migrateActorV1(actor: any): Promise<void> {
        for (const location of actor.items.filter((i) => i.isStorageLocation)) {
            // eslint-disable-next-line no-await-in-loop -- Sequential Foundry document updates
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

    async function migrateActorV180(actor: any): Promise<void> {
        for (const item of actor.items) {
            const itemCollection = item.flags['itemcollection'];
            if (itemCollection && itemCollection.contentsData) {
                // eslint-disable-next-line no-await-in-loop -- Sequential Foundry document updates
                await item.createNestedDocuments(itemCollection.contentsData);
            }
        }
    }

    async function migrateActorV182(actor: any): Promise<void> {
        const skills = actor.system?.skills;
        if (skills?.navigate) {
            const navigationSkill = foundry.utils.duplicate(skills.navigate);
            navigationSkill.label = 'Navigation';
            navigationSkill.characteristic = navigationSkill.characteristic ?? 'Int';
            navigationSkill.characteristics = navigationSkill.characteristics?.length ? navigationSkill.characteristics : ['Int'];
            await actor.update({
                'system.skills.navigation': skills.navigation ?? navigationSkill,
                'system.skills.-=navigate': null,
            });
        }
    }

    async function migrateActorV184(actor: any): Promise<void> {
        for (const item of actor.items) {
            // eslint-disable-next-line no-await-in-loop -- Sequential Foundry document updates
            await migrateItemV184(item);
        }
    }

    async function migrateActorV185(actor: any): Promise<void> {
        const flags = actor.flags?.['wh40k-rpg'];
        if (flags?.equipmentViewMode !== undefined || flags?.equipmentPresets !== undefined) {
            await actor.update({
                'flags.wh40k-rpg.-=equipmentViewMode': null,
                'flags.wh40k-rpg.-=equipmentPresets': null,
            });
        }
    }

    async function displayReleaseNotes(version: number): Promise<void> {
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

    async function releaseNotes(data: any): Promise<void> {
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
