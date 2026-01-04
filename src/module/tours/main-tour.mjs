import { RogueTraderTour } from './rogue-trader-tour.mjs';

export class DHTourMain extends RogueTraderTour {
    constructor() {
        super({
            title: "Get started with Rogue Trader",
            description: "Learn the basic features of the Rogue Trader system",
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
                    selector: "[data-pack=\"rogue-trader.ammo\"]",
                    title: 'Import Compendiums',
                    content: 'Import the rogue-trader compendiums for the item and data lists.',
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
