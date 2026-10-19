/**
 * @file Make an NPC from an NPC Template: the one path the template's own sheet
 * and the template selector both create through.
 *
 * The NPC gets the template's generated stats, its traits and talents as owned
 * items, and its carried equipment (#670): each piece that names exactly one
 * compendium item on the NPC's line becomes an owned item linked to it, and the
 * rest stay a named list on the NPC.
 */

import type NPCTemplateData from '../../data/item/npc-template.ts';
import { equipmentCandidates, type LinkedItemRef, linkedOwnedItemData, splitTemplateEquipment } from '../../documents/npc-template-equipment.ts';
import type { WH40KNPC } from '../../documents/npc.ts';
import { newNpcActorType, npcTypeLine } from './npc-actor-type.ts';

/** The template an NPC is made from: its name, image, and the generator and ability lists of its system data. */
export interface NpcTemplateSource {
    name: string;
    img: string | null;
    system: Pick<NPCTemplateData, 'generateAtThreat' | 'traits' | 'talents'>;
}

const DEFAULT_NPC_IMG = 'icons/svg/mystery-man.svg';

/** The template's traits and talents that name a document, as items to give the NPC. */
function abilityRefs(system: NpcTemplateSource['system']): LinkedItemRef[] {
    return [...system.traits, ...system.talents].flatMap((ref) => (ref.uuid === undefined || ref.uuid === '' ? [] : [{ uuid: ref.uuid }]));
}

/**
 * Create an NPC from `template` at `threatLevel`, open its sheet and announce it.
 * Returns the NPC, or null when creation failed (the user is told).
 */
export async function createNpcFromTemplate(template: NpcTemplateSource, threatLevel: number, options: { isHorde?: boolean } = {}): Promise<WH40KNPC | null> {
    try {
        const type = newNpcActorType();
        const system = template.system.generateAtThreat(threatLevel, { isHorde: options.isHorde ?? false });
        const line = npcTypeLine(type);
        const equipment =
            line === null ? { owned: [], listed: system.equipment } : splitTemplateEquipment(system.equipment, await equipmentCandidates(line), line);

        const data = { name: template.name, type, img: template.img ?? DEFAULT_NPC_IMG, system: { ...system, equipment: equipment.listed } };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create params are untyped in Foundry V14
        const actor = (await Actor.create(data as unknown as Parameters<typeof Actor.create>[0])) as WH40KNPC | undefined;
        if (actor === undefined) return null;

        const items = await linkedOwnedItemData([...abilityRefs(template.system), ...equipment.owned]);
        if (items.length > 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments params are untyped in Foundry V14
            await actor.createEmbeddedDocuments('Item', items as unknown as Parameters<typeof actor.createEmbeddedDocuments<'Item'>>[1]);
        }

        ui.notifications.info(game.i18n.format('WH40K.NPC.Created', { name: actor.name }));
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 marks Document.sheet.render legacy in typedefs; minimal local interface mirrors the V2 runtime contract
        (actor as unknown as { sheet?: { render: (force: boolean) => void } }).sheet?.render(true);
        return actor;
    } catch (err) {
        console.error('Failed to create NPC from template:', err);
        ui.notifications.error(game.i18n.localize('WH40K.NPC.Template.CreateError'));
        return null;
    }
}
