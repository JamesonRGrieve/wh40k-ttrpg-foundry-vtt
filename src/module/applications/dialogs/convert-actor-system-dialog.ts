import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import {
    CONVERTIBLE_CHARACTER_SYSTEMS,
    convertCharacterActorSystem,
    getCharacterSystemId,
    type ConvertibleCharacterSystem,
} from '../../utils/actor-system-converter.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 DialogV2 ctor not in shipped types
const dialogV2Ctor = foundry.applications.api.DialogV2;

export class ConvertActorSystemDialog {
    static async open(actor: WH40KBaseActor): Promise<WH40KBaseActor | null> {
        const currentSystem = getCharacterSystemId(actor.type);
        if (currentSystem === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Actor.ConvertSystem.NotConvertible'));
            return null;
        }

        const targetOptions = CONVERTIBLE_CHARACTER_SYSTEMS.filter((systemId) => systemId !== currentSystem)
            .map((systemId) => `<option value="${systemId}">${game.i18n.localize(`WH40K.TYPES.Actor.${systemId}-character`)}</option>`)
            .join('');

        const content = `
            <form class="wh40k-convert-actor-system-form">
                <p>${game.i18n.format('WH40K.Actor.ConvertSystem.Description', { actor: actor.name })}</p>
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.Actor.ConvertSystem.Current')}</label>
                    <input type="text" value="${game.i18n.localize(`WH40K.TYPES.Actor.${currentSystem}-character`)}" disabled />
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.Actor.ConvertSystem.Target')}</label>
                    <select name="targetSystem">${targetOptions}</select>
                </div>
                <p>${game.i18n.localize('WH40K.Actor.ConvertSystem.Warning')}</p>
            </form>
        `;

        return new Promise((resolve) => {
            const dialog = new dialogV2Ctor({
                window: { title: game.i18n.localize('WH40K.Actor.ConvertSystem.Title'), icon: 'fa-solid fa-shuffle' },
                position: { width: 440 },
                content,
                buttons: [
                    {
                        action: 'convert',
                        label: game.i18n.localize('WH40K.Actor.ConvertSystem.Confirm'),
                        icon: 'fa-solid fa-right-left',
                        default: true,
                        callback: async (_event: Event, button: HTMLElement) => {
                            const form = button.closest('form');
                            const targetField = form?.querySelector('[name="targetSystem"]');
                            const targetValue = targetField instanceof HTMLSelectElement ? targetField.value : '';
                            const validSystems: readonly string[] = CONVERTIBLE_CHARACTER_SYSTEMS;
                            const isValid = (v: string): v is ConvertibleCharacterSystem => validSystems.includes(v);
                            if (targetValue === '' || !isValid(targetValue)) {
                                resolve(null);
                                return;
                            }
                            const targetSystem: ConvertibleCharacterSystem = targetValue;

                            try {
                                const converted = await convertCharacterActorSystem(actor, targetSystem);
                                ui.notifications.info(
                                    game.i18n.format('WH40K.Actor.ConvertSystem.Success', {
                                        actor: converted.name,
                                        system: game.i18n.localize(`WH40K.TYPES.Actor.${targetSystem}-character`),
                                    }),
                                );
                                if (converted.sheet) await converted.sheet.render(true);
                                resolve(converted);
                            } catch (error) {
                                console.error(error);
                                ui.notifications.error(game.i18n.localize('WH40K.Actor.ConvertSystem.Failure'));
                                resolve(null);
                            }
                        },
                    },
                    {
                        action: 'cancel',
                        label: game.i18n.localize('WH40K.Actor.ConvertSystem.Cancel'),
                        icon: 'fa-solid fa-xmark',
                        callback: () => resolve(null),
                    },
                ],
                rejectClose: false,
            });

            void dialog.render(true);
        });
    }
}

export default ConvertActorSystemDialog;
