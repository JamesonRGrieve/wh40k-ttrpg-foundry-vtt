/**
 * Character sheet: equipment list filtering.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle equipment filtering (search and type/status filters).
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export function filterEquipment(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    const equipmentPanel = this.element.querySelector('.wh40k-all-items-grid');
    if (!equipmentPanel) return;

    // Get filter values
    const searchInput = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-search');
    const typeFilter = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-type-filter');
    const statusFilter = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-status-filter');

    const searchTerm = searchInput?.value.toLowerCase() ?? '';
    const typeValue = typeFilter?.value ?? '';
    const statusValue = statusFilter?.value ?? '';

    // Store filter state for persistence
    this._equipmentFilter = {
        search: searchInput?.value ?? '',
        type: typeValue,
        status: statusValue,
    };

    // Get all item cards
    const itemCards = equipmentPanel.querySelectorAll('.wh40k-inventory-card');

    let visibleCount = 0;

    itemCards.forEach((card: Element) => {
        const element = card as HTMLElement;
        const itemName = element.getAttribute('title')?.toLowerCase() ?? '';
        const itemType = element.getAttribute('data-item-type') ?? '';
        const isEquipped = element.querySelector('.wh40k-inv-equipped') !== null;

        // Check filters
        const matchesSearch = searchTerm === '' || itemName.includes(searchTerm);
        const matchesType = typeValue === '' || itemType === typeValue;
        const matchesStatus = statusValue === '' || (statusValue === 'equipped' && isEquipped) || (statusValue === 'unequipped' && !isEquipped);

        // Show/hide card
        if (matchesSearch && matchesType && matchesStatus) {
            element.style.display = '';
            visibleCount++;
        } else {
            element.style.display = 'none';
        }
    });

    // Toggle clear button visibility
    const clearBtn = this.element.querySelector<HTMLElement>('.wh40k-search-clear');
    if (clearBtn !== null) {
        clearBtn.style.display = searchTerm !== '' ? 'flex' : 'none';
    }

    // Show message if no results
    const existingMsg = equipmentPanel.querySelector('.wh40k-no-results');
    if (existingMsg) existingMsg.remove();

    if (visibleCount === 0 && itemCards.length > 0) {
        const noResults = document.createElement('div');
        noResults.className = 'wh40k-no-results';
        Object.assign(noResults.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--wh40k-space-sm, 0.5rem)',
            padding: 'var(--wh40k-space-lg, 1rem)',
            color: 'var(--color-text-tertiary)',
            fontStyle: 'italic',
            textAlign: 'center',
            pointerEvents: 'none',
        });
        noResults.innerHTML = `<i class="fas fa-search" style="font-size:2rem;opacity:0.5"></i><span style="font-size:var(--wh40k-font-size-base,0.9rem)">${game.i18n.localize(
            'WH40K.CompendiumBrowser.NoResults',
        )}</span>`;
        equipmentPanel.appendChild(noResults);
    }
}

/**
 * Handle clearing equipment search.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export function clearEquipmentSearch(this: CharacterSheet, event: Event, _target: HTMLElement): void {
    const searchInput = this.element.querySelector<HTMLInputElement>('.wh40k-equipment-search');
    if (searchInput) {
        searchInput.value = '';
        // Clear stored filter state
        this._equipmentFilter = { search: '', type: '', status: '' };
        // Trigger filter update
        filterEquipment.call(this, event, searchInput);
    }
}
