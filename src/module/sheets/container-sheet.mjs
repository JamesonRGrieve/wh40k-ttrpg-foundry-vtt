/**
 * An item sheet that can accept other items within it --
 * e.g. weapons with associated weapon mods
 */
import {DarkHeresyItemSheet} from "./item-sheet.mjs";

export class DarkHeresyContainerSheet extends DarkHeresyItemSheet {

    containerTypes = ['weapon'];

    getData() {
        const context = super.getData();
        const type = this.item.type;

        if (!this.containerTypes.includes(type)) {
            this.options.editable = false;
            options.editable = false;
            return context;
        }

        const item = this.item;
        context.flags = duplicate(item.data.flags);
    }


    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Roll handlers, click handlers, etc. would go here.
    }
}
