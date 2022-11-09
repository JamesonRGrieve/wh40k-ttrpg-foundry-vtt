import { toggleUIExpanded } from '../rules/config.mjs';

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
    const itemData = context.item;
    context.data = itemData.system;
    context.flags = itemData.flags;
    context.dh = CONFIG.dh;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find('.sheet-control__hide-control').click(async (ev) => await this._sheetControlHideToggle(ev));
  }

  async _sheetControlHideToggle(event) {
    event.preventDefault();
    const displayToggle = $(event.currentTarget);
    $('span:first', displayToggle).toggleClass('active');
    const target = displayToggle.data('toggle');
    $('.' + target).toggle();
    toggleUIExpanded(target);
  }
}
