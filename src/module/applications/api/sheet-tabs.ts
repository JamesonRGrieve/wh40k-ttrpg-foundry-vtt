/**
 * @file The sheet tab machinery PrimarySheetMixin runs on every render: bind each
 * configured tab nav's `[data-tab]` buttons and show one panel per group.
 *
 * Foundry-free, so the stories and Vitest drive the same code a live sheet runs.
 * A sheet's template needs a nav matching the config's `navSelector` (`.wh40k-tabs`
 * on item sheets) and a content container matching `contentSelector`
 * (`.wh40k-tab-content`). Without the container nothing is bound, and the tabs
 * cannot switch (#690).
 */

/** One `tabs` entry of a sheet's DEFAULT_OPTIONS. */
export interface SheetTabsConfig {
    navSelector: string;
    contentSelector: string;
    initial?: string;
}

/** The tab config every item sheet carries (BaseItemSheet's DEFAULT_OPTIONS). */
export const ITEM_SHEET_TABS: readonly SheetTabsConfig[] = [{ navSelector: '.wh40k-tabs', contentSelector: '.wh40k-tab-content', initial: 'description' }];

/**
 * A tab group's panels: the content container's `[data-tab]` children, plus any
 * `.tab` panel of the group elsewhere in the sheet (a template whose panels are
 * themselves `.wh40k-tab-content` sections, like the storage location's, has no
 * wrapping container).
 */
export function sheetTabPanels(root: ParentNode, group: string, content: HTMLElement): HTMLElement[] {
    const panels = new Set<HTMLElement>(content.querySelectorAll<HTMLElement>(':scope > [data-tab]'));
    for (const panel of root.querySelectorAll<HTMLElement>(`.tab[data-group="${group}"][data-tab]`)) panels.add(panel);
    return [...panels];
}

/** Show `tab` in `group`: its nav button and panel take `.active`, the others drop it. Records it in `tabGroups`. */
export function activateSheetTab(
    root: HTMLElement,
    tab: string,
    group: string,
    nav: HTMLElement,
    content: HTMLElement,
    tabGroups: Record<string, string>,
): void {
    tabGroups[group] = tab;

    for (const link of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
        const isActive = link.dataset['tab'] === tab;
        link.classList.toggle('active', isActive);
        link.closest('.wh40k-navigation__item, .wh40k-nav-item')?.classList.toggle('active', isActive);
    }

    for (const panel of sheetTabPanels(root, group, content)) {
        panel.classList.toggle('active', panel.dataset['tab'] === tab);
    }

    root.className = root.className.replace(/\btab-\w+/g, '');
    root.classList.add(`tab-${tab}`);
}

/**
 * Bind every configured tab nav under `root` and open each group's remembered tab
 * (`tabGroups`, else the config's `initial`), or, when the template has no panel
 * for it, the panel the template marks active (else the first).
 */
export function bindSheetTabs(root: HTMLElement, configs: readonly SheetTabsConfig[], tabGroups: Record<string, string>): void {
    for (const { navSelector, contentSelector, initial } of configs) {
        const nav = root.querySelector<HTMLElement>(navSelector);
        const content = root.querySelector<HTMLElement>(contentSelector);
        if (nav === null || content === null) continue;

        const group = nav.dataset['group'] ?? 'primary';
        const remembered = tabGroups[group] ?? initial;
        const panels = sheetTabPanels(root, group, content);
        const activeTab = panels.some((panel) => panel.dataset['tab'] === remembered)
            ? remembered
            : (panels.find((panel) => panel.classList.contains('active')) ?? panels.at(0))?.dataset['tab'];

        for (const tabLink of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
            tabLink.addEventListener('click', (event) => {
                event.preventDefault();
                const tab = tabLink.dataset['tab'];
                if (tab !== undefined && tab !== '') activateSheetTab(root, tab, group, nav, content, tabGroups);
            });
        }

        if (activeTab !== undefined && activeTab !== '') activateSheetTab(root, activeTab, group, nav, content, tabGroups);
    }
}
