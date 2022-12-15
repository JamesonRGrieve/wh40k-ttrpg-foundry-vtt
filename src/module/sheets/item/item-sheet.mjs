import { toggleUIExpanded } from '../../rules/config.mjs';

export class DarkHeresyItemSheet extends ItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 650,
            height: 500,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'description' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.flags = context.item.flags;
        context.dh = CONFIG.dh;
        context.effects = this.item.getEmbeddedCollection('ActiveEffect').contents;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        html.find('.sheet-control__hide-control').click(async (ev) => await this._sheetControlHideToggle(ev));
        html.find('.effect-delete').click(async (ev) => await this._effectDelete(ev));
        html.find('.effect-edit').click(async (ev) => await this._effectEdit(ev));
        html.find('.effect-create').click(async (ev) => await this._effectCreate(ev));
        html.find('.effect-enable').click(async (ev) => await this._effectEnable(ev));
        html.find('.effect-disable').click(async (ev) => await this._effectDisable(ev));
    }

    async _sheetControlHideToggle(event) {
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span:first', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
        toggleUIExpanded(target);
    }

    async _effectDisable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.update({disabled: true});
    }

    async _effectEnable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.update({disabled: false});
    }

    async _effectDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.delete();
    }

    async _effectEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.sheet.render(true);
    }

    async _effectCreate(event) {
        event.preventDefault();
        return this.item.createEmbeddedDocuments('ActiveEffect', [{
            label: 'New Effect',
            icon: 'icons/svg/aura.svg',
            origin: this.item.uuid,
            disabled: true
        }], { renderSheet: true })
    }
}
