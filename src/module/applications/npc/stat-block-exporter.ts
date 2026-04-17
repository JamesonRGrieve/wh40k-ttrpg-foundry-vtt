/**
 * @file StatBlockExporter - Export NPC data to various formats
 * Phase 6: Advanced GM Tools
 *
 * Provides:
 * - Export to formatted text (for sharing/printing)
 * - Export to JSON (for backup/import)
 * - Copy to clipboard functionality
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for exporting NPC stat blocks in various formats.
 * @extends {ApplicationV2}
 */
export default class StatBlockExporter extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'stat-block-exporter-{id}',
        classes: ['wh40k-rpg', 'stat-block-exporter'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.Export.Title',
            icon: 'fa-solid fa-file-export',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 700,
            height: 600,
        },
        /* eslint-disable @typescript-eslint/unbound-method */
        actions: {
            copyToClipboard: StatBlockExporter.#onCopyToClipboard,
            exportJson: StatBlockExporter.#onExportJson,
            exportText: StatBlockExporter.#onExportText,
            close: StatBlockExporter.#onClose,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/stat-block-exporter.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor being exported.
     * @type {Actor}
     */
    #actor = null;

    /**
     * Current export format.
     * @type {string}
     */
    #format = 'text';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The NPC actor to export.
     * @param {Object} [options] - Application options.
     */
    constructor(actor, options = {}) {
        super(options);
        this.#actor = actor;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return game.i18n.format('WH40K.NPC.Export.Title', { name: this.#actor?.name || 'NPC' });
    }

    /* -------------------------------------------- */
    /*  Static Export Methods                       */
    /* -------------------------------------------- */

    /**
     * Export an NPC to formatted text.
     * @param {Actor} actor - The actor to export.
     * @returns {string} Formatted text stat block.
     */
    static toText(actor: any): string {
        const sys = actor.system;
        const lines = [];

        this._appendHeader(lines, actor, sys);
        this._appendCharacteristics(lines, sys);
        this._appendVitals(lines, sys);
        this._appendArmour(lines, sys);
        this._appendSkills(lines, sys);
        this._appendWeapons(lines, sys);
        this._appendItemSection(lines, actor, 'talent', 'TALENTS');
        this._appendItemSection(lines, actor, 'trait', 'TRAITS');
        this._appendHtmlSection(lines, sys.specialAbilities, 'SPECIAL ABILITIES');
        this._appendHtmlSection(lines, sys.quickNotes, 'GM NOTES');

        lines.push('═'.repeat(50));
        return lines.join('\n');
    }

    /** @private */
    static _appendHeader(lines: string[], actor: any, sys: any): void {
        lines.push('═'.repeat(50));
        lines.push(actor.name.toUpperCase());
        lines.push('═'.repeat(50));
        lines.push('');
        if (sys.faction) lines.push(`Faction: ${sys.faction}`);
        if (sys.subfaction) lines.push(`Subfaction: ${sys.subfaction}`);
        lines.push(`Type: ${sys.type?.titleCase() || 'Unknown'} | Role: ${sys.role?.titleCase() || 'Unknown'}`);
        lines.push(`Threat Level: ${sys.threatLevel || 5}`);
        lines.push('');
    }

    /** @private */
    static _appendCharacteristics(lines: string[], sys: any): void {
        lines.push('─'.repeat(50));
        lines.push('CHARACTERISTICS');
        lines.push('─'.repeat(50));
        const chars = sys.characteristics;
        if (chars) {
            const formatLine = (keys: string[]): string =>
                keys
                    .filter((key) => chars[key])
                    .map((key) => `${chars[key].short}: ${chars[key].total}`)
                    .join(' | ');
            lines.push(formatLine(['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility']));
            lines.push(formatLine(['intelligence', 'perception', 'willpower', 'fellowship', 'influence']));
        }
        lines.push('');
    }

    /** @private */
    static _appendVitals(lines: string[], sys: any): void {
        lines.push('─'.repeat(50));
        lines.push('VITALS');
        lines.push('─'.repeat(50));
        lines.push(`Wounds: ${sys.wounds?.value || 0}/${sys.wounds?.max || 0}`);
        if (sys.horde?.enabled) {
            lines.push(`Magnitude: ${sys.horde.magnitude?.current || 0}/${sys.horde.magnitude?.max || 100}`);
        }
        const mv = sys.movement;
        if (mv) {
            lines.push(`Movement: H${mv.half} / F${mv.full} / C${mv.charge} / R${mv.run}`);
        }
        lines.push('');
    }

    /** @private */
    static _appendArmour(lines: string[], sys: any): void {
        lines.push('─'.repeat(50));
        lines.push('ARMOUR');
        lines.push('─'.repeat(50));
        if (sys.armour?.mode === 'simple') {
            lines.push(`Total AP: ${sys.armour.total || 0}`);
        } else if (sys.armour?.locations) {
            const locs = sys.armour.locations;
            lines.push(`Head: ${locs.head || 0} | Body: ${locs.body || 0}`);
            lines.push(`Arms: ${locs.leftArm || 0}/${locs.rightArm || 0} | Legs: ${locs.leftLeg || 0}/${locs.rightLeg || 0}`);
        }
        lines.push('');
    }

    /** @private */
    static _appendSkills(lines: string[], sys: any): void {
        if (!sys.trainedSkills || Object.keys(sys.trainedSkills).length === 0) return;
        lines.push('─'.repeat(50));
        lines.push('SKILLS');
        lines.push('─'.repeat(50));
        const skillLines = [];
        for (const [key, skill] of Object.entries(sys.trainedSkills as Record<string, any>)) {
            let level = '';
            if (skill.plus20) level = '+20';
            else if (skill.plus10) level = '+10';
            const bonus = skill.bonus ? ` (+${skill.bonus})` : '';
            skillLines.push(`${skill.name || key}${level}${bonus}`);
        }
        lines.push(skillLines.join(', '));
        lines.push('');
    }

    /** @private */
    static _appendWeapons(lines: string[], sys: any): void {
        if (!sys.weapons?.simple?.length) return;
        lines.push('─'.repeat(50));
        lines.push('WEAPONS');
        lines.push('─'.repeat(50));
        for (const w of sys.weapons.simple) {
            const special = w.special ? ` [${w.special}]` : '';
            lines.push(`${w.name}: ${w.damage} Pen ${w.pen} | ${w.range} | RoF: ${w.rof}${special}`);
        }
        lines.push('');
    }

    /** @private */
    static _appendItemSection(lines: string[], actor: any, itemType: string, title: string): void {
        const items = actor.items.filter((i) => i.type === itemType);
        if (items.length === 0) return;
        lines.push('─'.repeat(50));
        lines.push(title);
        lines.push('─'.repeat(50));
        lines.push(items.map((t) => t.name).join(', '));
        lines.push('');
    }

    /** @private */
    static _appendHtmlSection(lines: string[], html: string, title: string): void {
        if (!html) return;
        const plainText = this._stripHtml(html);
        if (!plainText.trim()) return;
        lines.push('─'.repeat(50));
        lines.push(title);
        lines.push('─'.repeat(50));
        lines.push(plainText);
        lines.push('');
    }

    /**
     * Export an NPC to JSON format.
     * @param {Actor} actor - The actor to export.
     * @param {Object} [options] - Export options.
     * @param {boolean} [options.includeItems=true] - Include embedded items.
     * @param {boolean} [options.prettyPrint=true] - Pretty print JSON.
     * @returns {string} JSON string.
     */
    static toJSON(actor: any, options: Record<string, unknown> = {}): any {
        const { includeItems = true, prettyPrint = true } = options;

        const exportData = {
            name: actor.name,
            img: actor.img,
            type: actor.type,
            system: foundry.utils.deepClone(actor.system),
            items: includeItems
                ? actor.items.map((i) => ({
                      name: i.name,
                      type: i.type,
                      img: i.img,
                      system: foundry.utils.deepClone(i.system),
                  }))
                : [],
            exportedAt: new Date().toISOString(),
            exportedBy: game.user?.name || 'Unknown',
            systemVersion: game.system.version,
        };

        return prettyPrint ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
    }

    /**
     * Strip HTML tags from a string.
     * @param {string} html - HTML string.
     * @returns {string} Plain text.
     * @private
     */
    static _stripHtml(html: string): string {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: any): Promise<any> {
        const context: any = await super._prepareContext(options);

        // Generate export content based on format
        const textContent = StatBlockExporter.toText(this.#actor);
        const jsonContent = StatBlockExporter.toJSON(this.#actor);

        return {
            ...context,
            actor: this.#actor,
            format: this.#format,
            textContent,
            jsonContent,
            buttons: [
                { action: 'copyToClipboard', icon: 'fa-solid fa-clipboard', label: 'WH40K.NPC.Export.CopyToClipboard', cssClass: 'primary' },
                { action: 'exportText', icon: 'fa-solid fa-file-lines', label: 'WH40K.NPC.Export.DownloadText' },
                { action: 'exportJson', icon: 'fa-solid fa-file-code', label: 'WH40K.NPC.Export.DownloadJSON' },
                { action: 'close', icon: 'fa-solid fa-times', label: 'Close' },
            ],
        };
    }

    /** @override */
    _onRender(context: any, options: any): any {
        void super._onRender(context, options);

        // Handle format toggle
        const formatTabs = this.element.querySelectorAll('[data-format]');
        for (const tab of formatTabs) {
            tab.addEventListener('click', (e: any) => {
                this.#format = (e.currentTarget as HTMLElement).dataset.format;
                void this.render({ parts: ['content'] });
            });
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Copy current content to clipboard.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCopyToClipboard(this: any, event: Event, target: HTMLElement): Promise<void> {
        const content = this.#format === 'json' ? StatBlockExporter.toJSON(this.#actor) : StatBlockExporter.toText(this.#actor);

        try {
            await navigator.clipboard.writeText(content);
            ui.notifications.info(game.i18n.localize('WH40K.NPC.Export.CopiedToClipboard'));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Export.CopyFailed'));
        }
    }

    /**
     * Download as JSON file.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onExportJson(this: any, event: Event, target: HTMLElement): void {
        const content = StatBlockExporter.toJSON(this.#actor);
        const filename = `${this.#actor.name.slugify()}.json`;

        StatBlockExporter._downloadFile(content, filename, 'application/json');
        ui.notifications.info(game.i18n.format('WH40K.NPC.Export.Downloaded', { filename }));
    }

    /**
     * Download as text file.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onExportText(this: any, event: Event, target: HTMLElement): void {
        const content = StatBlockExporter.toText(this.#actor);
        const filename = `${this.#actor.name.slugify()}.txt`;

        StatBlockExporter._downloadFile(content, filename, 'text/plain');
        ui.notifications.info(game.i18n.format('WH40K.NPC.Export.Downloaded', { filename }));
    }

    /**
     * Close the dialog.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onClose(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Download a file.
     * @param {string} content - File content.
     * @param {string} filename - File name.
     * @param {string} mimeType - MIME type.
     * @private
     */
    static _downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Open the exporter for an actor.
     * @param {Actor} actor - The actor to export.
     * @returns {StatBlockExporter} The exporter instance.
     */
    static show(actor: any): any {
        const exporter = new this(actor);
        void exporter.render(true);
        return exporter;
    }

    /**
     * Quick export to clipboard without dialog.
     * @param {Actor} actor - The actor to export.
     * @param {string} [format="text"] - Export format ("text" or "json").
     * @returns {Promise<void>}
     */
    static async quickExport(actor: any, format: any = 'text'): Promise<void> {
        const content = format === 'json' ? this.toJSON(actor) : this.toText(actor);

        try {
            await navigator.clipboard.writeText(content);
            ui.notifications.info(game.i18n.localize('WH40K.NPC.Export.CopiedToClipboard'));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Export.CopyFailed'));
        }
    }
}
