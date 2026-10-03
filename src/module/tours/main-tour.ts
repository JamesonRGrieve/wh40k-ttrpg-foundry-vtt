import { WH40KTour } from './wh40k-rpg-tour.ts';

export class DHTourMain extends WH40KTour {
    constructor() {
        super({
            title: 'WH40K.Tour.Main.Title',
            description: 'WH40K.Tour.Main.Description',
            canBeResumed: false,
            display: true,
            steps: [
                {
                    id: 'goto-compendium',
                    selector: '[data-tab="compendium"]',
                    title: 'WH40K.Tour.Main.CompendiumTab.Title',
                    content: 'WH40K.Tour.Main.CompendiumTab.Content',
                    action: 'click',
                },
                {
                    id: 'import-compendium',
                    selector: '[data-pack="wh40k-rpg.ammo"]',
                    title: 'WH40K.Tour.Main.ImportCompendiums.Title',
                    content: 'WH40K.Tour.Main.ImportCompendiums.Content',
                },
                {
                    id: 'goto-actors',
                    selector: '[data-tab="actors"]',
                    title: 'WH40K.Tour.Main.Actors.Title',
                    content: 'WH40K.Tour.Main.Actors.Content',
                },
                {
                    id: 'goto-action-bar',
                    selector: '#action-bar',
                    title: 'WH40K.Tour.Main.Macros.Title',
                    content: 'WH40K.Tour.Main.Macros.Content',
                },
                {
                    id: 'goto-attack',
                    selector: '[data-tool="Attack"]',
                    title: 'WH40K.Tour.Main.Attack.Title',
                    content: 'WH40K.Tour.Main.Attack.Content',
                },
                {
                    id: 'goto-damage',
                    selector: '[data-tool="Assign Damage"]',
                    title: 'WH40K.Tour.Main.AssignDamage.Title',
                    content: 'WH40K.Tour.Main.AssignDamage.Content',
                },
            ] as foundry.nue.Tour.Step[],
        } as foundry.nue.Tour.Config);
    }
}
