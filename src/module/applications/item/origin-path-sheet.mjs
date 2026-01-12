/**
 * @file OriginPathSheet - ApplicationV2 sheet for origin path items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for origin path items (homeworld, birthright, career, etc).
 */
export default class OriginPathSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["origin-path"],
        position: {
            width: 600,
            height: 700
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-origin-path-sheet.hbs",
            scrollable: [".rt-item-body"]
        }
    };

    /* -------------------------------------------- */

    /**
     * @override
     * Prepare context for rendering.
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add origin path specific data
        context.stepChoices = {
            homeWorld: "Home World",
            birthright: "Birthright",
            lureOfTheVoid: "Lure of the Void",
            trialsAndTravails: "Trials and Travails",
            motivation: "Motivation",
            career: "Career"
        };
        
        context.trainingLevels = {
            trained: "Trained",
            plus10: "+10",
            plus20: "+20"
        };
        
        context.choiceTypes = {
            skill: "Skill",
            talent: "Talent",
            characteristic: "Characteristic",
            equipment: "Equipment"
        };
        
        return context;
    }
}
