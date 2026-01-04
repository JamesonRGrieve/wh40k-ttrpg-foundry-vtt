/**
 * Roll Table Utilities for Rogue Trader
 * Provides integration with Foundry VTT's RollTable system for:
 * - Psychic Phenomena
 * - Perils of the Warp
 * - Fear Effects
 * - Mutations
 * - Malignancies
 * - Navigator Mutations
 * - Gifts of the Gods
 */

export class RollTableUtils {

    /**
     * Roll on a roll table by name and send results to chat.
     * @param {string} tableName - The name of the roll table
     * @param {object} options - Options for the roll
     * @param {boolean} options.displayChat - Whether to display in chat (default: true)
     * @param {Roll} options.roll - Optional pre-rolled Roll object
     * @returns {Promise<TableResult>} The table result
     */
    static async rollTable(tableName, options = {}) {
        const { displayChat = true, roll = null } = options;

        // Find the table in world tables first, then compendiums
        let table = game.tables.getName(tableName);

        if (!table) {
            // Search in compendium packs
            table = await this.findTableInCompendiums(tableName);
        }

        if (!table) {
            ui.notifications.warn(`Roll table "${tableName}" not found.`);
            return null;
        }

        // Roll on the table
        const rollResult = await table.roll({ roll });
        
        if (displayChat) {
            await table.toMessage(rollResult.results, {
                roll: rollResult.roll,
                messageData: {
                    speaker: ChatMessage.getSpeaker()
                }
            });
        }

        return rollResult;
    }

    /**
     * Find a roll table in compendium packs.
     * @param {string} tableName - The name of the table to find
     * @returns {Promise<RollTable|null>} The found table or null
     */
    static async findTableInCompendiums(tableName) {
        for (const pack of game.packs) {
            if (pack.documentName !== 'RollTable') continue;

            const index = await pack.getIndex();
            const entry = index.find(e => e.name === tableName);

            if (entry) {
                return await pack.getDocument(entry._id);
            }
        }
        return null;
    }

    /**
     * Roll on the Psychic Phenomena table.
     * @param {Actor} actor - The actor rolling
     * @param {number} modifier - Modifier to the roll (e.g., from Psy Rating)
     * @returns {Promise<TableResult>}
     */
    static async rollPsychicPhenomena(actor, modifier = 0) {
        const roll = new Roll(`1d100 + ${modifier}`);
        await roll.evaluate();

        const result = await this.rollTable('Psychic Phenomena', {
            displayChat: true,
            roll: roll
        });

        // Check if result triggers Perils of the Warp (typically on 75+)
        if (roll.total >= 75) {
            await this.rollPerilsOfTheWarp(actor);
        }

        return result;
    }

    /**
     * Roll on the Perils of the Warp table.
     * @param {Actor} actor - The actor rolling
     * @returns {Promise<TableResult>}
     */
    static async rollPerilsOfTheWarp(actor) {
        return await this.rollTable('Perils of the Warp', { displayChat: true });
    }

    /**
     * Roll on the Fear Effects table.
     * @param {number} fearRating - The Fear rating (1-4)
     * @param {number} degreeOfFailure - Degrees of failure on the Fear test
     * @returns {Promise<TableResult>}
     */
    static async rollFearEffects(fearRating = 1, degreeOfFailure = 1) {
        const modifier = (fearRating - 1) * 10 + (degreeOfFailure * 10);
        const roll = new Roll(`1d100 + ${modifier}`);
        await roll.evaluate();

        return await this.rollTable('Fear Effects', {
            displayChat: true,
            roll: roll
        });
    }

    /**
     * Roll on the Mutations table.
     * @returns {Promise<TableResult>}
     */
    static async rollMutation() {
        return await this.rollTable('Mutations', { displayChat: true });
    }

    /**
     * Roll on the Malignancies table.
     * @returns {Promise<TableResult>}
     */
    static async rollMalignancy() {
        return await this.rollTable('Malignancies', { displayChat: true });
    }

    /**
     * Roll on the Navigator Mutations table.
     * @returns {Promise<TableResult>}
     */
    static async rollNavigatorMutation() {
        return await this.rollTable('Navigator Mutations', { displayChat: true });
    }

    /**
     * Roll on the Gifts of the Gods table.
     * @param {string} godName - Optional god name to filter results
     * @returns {Promise<TableResult>}
     */
    static async rollGiftOfTheGods(godName = null) {
        const tableName = godName ? `Gifts of ${godName}` : 'Gifts of the Gods';
        return await this.rollTable(tableName, { displayChat: true });
    }

    /**
     * Roll for a critical injury based on damage type and location.
     * @param {string} damageType - The damage type (Energy, Impact, Rending, Explosive)
     * @param {string} location - The hit location (Head, Body, Arm, Leg)
     * @param {number} severity - The critical damage value
     * @returns {Promise<TableResult>}
     */
    static async rollCriticalInjury(damageType, location, severity) {
        const tableName = `Critical ${damageType} - ${location}`;
        const roll = new Roll(`${severity}`);
        await roll.evaluate();

        return await this.rollTable(tableName, {
            displayChat: true,
            roll: roll
        });
    }

    /**
     * Create a quick roll dialog for common tables.
     * Opens a dialog allowing the user to select which table to roll on.
     */
    static async showRollTableDialog() {
        const tables = [
            { name: 'Psychic Phenomena', category: 'Psychic' },
            { name: 'Perils of the Warp', category: 'Psychic' },
            { name: 'Fear Effects', category: 'Mental' },
            { name: 'Mutations', category: 'Corruption' },
            { name: 'Malignancies', category: 'Corruption' },
            { name: 'Navigator Mutations', category: 'Navigator' },
            { name: 'Gifts of the Gods', category: 'Corruption' }
        ];

        const content = `
            <form>
                <div class="form-group">
                    <label>Select Roll Table:</label>
                    <select name="tableName">
                        ${tables.map(t => `<option value="${t.name}">${t.name} (${t.category})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Modifier:</label>
                    <input type="number" name="modifier" value="0" />
                </div>
            </form>
        `;

        new Dialog({
            title: 'Roll Table',
            content: content,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: 'Roll',
                    callback: async (html) => {
                        const tableName = html.find('[name="tableName"]').val();
                        const modifier = parseInt(html.find('[name="modifier"]').val()) || 0;
                        
                        if (modifier !== 0) {
                            const roll = new Roll(`1d100 + ${modifier}`);
                            await roll.evaluate();
                            await this.rollTable(tableName, { roll });
                        } else {
                            await this.rollTable(tableName);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: 'Cancel'
                }
            },
            default: 'roll'
        }).render(true);
    }
}

// Register global access
Hooks.once('ready', () => {
    game.rt = game.rt || {};
    game.rt.rollTable = RollTableUtils;
});
