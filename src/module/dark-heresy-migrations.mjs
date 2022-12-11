import { DarkHeresySettings } from './dark-heresy-settings.mjs';
import { SYSTEM_ID } from './hooks-manager.mjs';

export async function checkAndMigrateWorld() {
    const worldVersion = 157;
    const currentVersion = game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion);
    if(worldVersion !== currentVersion && game.user.isGM) {
        ui.notifications.info("Upgrading the world, please wait...");

        // Update Actors
        for (let actor of game.actors.contents) {
            try {
                await migrateActorData(actor, currentVersion);
            } catch (e) {
                console.error(e);
            }
        }

        // Display Release Notes
        await displayReleaseNotes(worldVersion);

        game.settings.set(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion, worldVersion);
        ui.notifications.info("Upgrade complete!");
    }

    async function migrateActorData(actor, currentVersion) {
        if(currentVersion < 1) {
            // Update Storage Locations to Hold Consumables
            for(const location of actor.items.filter(i => i.isStorageLocation)) {
                await location.update({
                    system: {
                        containerTypes: ["ammunition", "armour", "armourModification", "cybernetic", "consumable", "drug", "forceField", "gear", "tool", "weapon", "weaponModification"]
                    }
                });
            }
        }
    }

    async function displayReleaseNotes(version) {
        switch(version) {
            case 157:
                await releaseNotes({
                    version: '1.5.7',
                    notes: [
                        'Fixed duplication bug when dropping the same item on an actor.',
                        'Added missing plentiful availability.',
                        'Added Drugs and Consumables compendium with information from the core book.',
                        'Added support for creating new specialist skills.'
                    ]
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
