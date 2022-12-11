import { DarkHeresyTour } from './dark-heresy-tour.mjs';

export class DHTourMain extends DarkHeresyTour {
    constructor() {
        super({
            title: "Get started with DH2",
            description: "Learn the basic features of the Dark Heresy 2nd edition system",
            canBeResumed: false,
            display: true,
            steps: [
                {
                    id: "goto-compendium",
                    selector: "[data-tab=\"compendium\"]",
                    title: 'Compendium tab',
                    content: 'Go to your compendium tab',
                    action: "click"
                },
                {
                    id: "import-compendium",
                    selector: "[data-pack=\"dark-heresy-2nd.ammo\"]",
                    title: 'Import Compendiums',
                    content: 'Import the dark-heresy-2nd compendiums for the item and data lists.',
                },
                {
                    id: "goto-actors",
                    selector: "[data-tab=\"actors\"]",
                    title: 'Actors',
                    content: 'Items can be drag-and-dropped onto actors. Some items like weapons can contain other items such as specials, ammo, and modifications.',
                },
                {
                    id: "goto-action-bar",
                    selector: "#action-bar",
                    title: 'Macros',
                    content: 'Characteristics, Skills and Items from the Actor sheet can be dragged onto the action bar for easy access.',
                },
                {
                    id: "goto-attack",
                    selector: "[data-tool=\"Attack\"]",
                    title: 'Attack',
                    content: 'Select a token and optionally target a token then click here to perform an attack with equipped weapons.',
                },
                {
                    id: "goto-damage",
                    selector: "[data-tool=\"Assign Damage\"]",
                    title: 'Assign Damage',
                    content: 'Select a token click here to assign damage and fatigue.'
                }
            ]
        });
    }
}
