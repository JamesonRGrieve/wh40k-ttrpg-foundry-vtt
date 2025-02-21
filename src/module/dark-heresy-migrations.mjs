import { DarkHeresySettings } from './dark-heresy-settings.mjs';
import { SYSTEM_ID } from './hooks-manager.mjs';

export async function checkAndMigrateWorld() {
    const worldVersion = 181;

    const currentVersion = game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion);
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

        game.settings.set(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion, worldVersion);
        ui.notifications.info('Upgrade complete!');
    }

    async function updateCompendiumPermissions(currentVersion) {
        if (currentVersion < 181) {
            // Every compendium in our system should be owned by everyone and have full owner permissions.
            // Otherwise, issues will occur when trying to create items from the compendium.
            const compendiums = game.packs.filter((p) => p.metadata.packageName === SYSTEM_ID);

            // Print all Pack details
            game.packs.forEach((pack) => {
                console.log('Pack', pack);
            });

            for (let compendium of compendiums) {
                console.log(`Updating permissions for compendium ${compendium.metadata.id}`);

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

    async function migrateItemData(item, currentVersion) {
        if (currentVersion < 180) {
            // Get itemcollection.contentsData flag
            const itemCollection = item.flags['itemcollection'];
            if (itemCollection && itemCollection.contentsData) {
                await item.createNestedDocuments(itemCollection.contentsData);
            }
        }
    }

    async function migrateActorData(actor, currentVersion) {
        if (currentVersion < 1) {
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
            default:
                break;
        }
    }

    async function releaseNotes(data) {
        const html = await renderTemplate('systems/dark-heresy-2nd/templates/prompt/release-notes-prompt.hbs', data);
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
