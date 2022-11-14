import { performDamageAndSendToChat, performRollAndSendToChat } from '../rolls/roll-manager.mjs';
import { sheetControlHideToggle } from '../hooks-manager.mjs';

export class ListeningDialog extends Dialog {
    constructor(data, options) {
        super(data, options);
    }

    otherListeners(html) {}

    activateListeners(html) {
        super.activateListeners(html);
        this.otherListeners(html);
    }
}

export async function prepareDamageRoll(rollData) {
    rollData.dh = CONFIG.dh;
    const html = await renderTemplate('systems/dark-heresy-2nd/templates/prompt/damage-roll-prompt.hbs', rollData);
    let dialog = new ListeningDialog(
        {
            title: 'Damage Roll',
            content: html,
            buttons: {
                roll: {
                    icon: '<i class=\'dh-material\'>casino</i>',
                    label: 'Roll',
                    callback: async (html) => {
                        rollData.damage = html.find('#damage')[0].value;
                        rollData.penetration = html.find('#penetration')[0].value;
                        rollData.damageType = html.find('[name=damageType] :selected').val();
                        rollData.pr = html.find('#pr')[0]?.value;
                        await performDamageAndSendToChat(rollData);
                    },
                },
                cancel: {
                    icon: '<i class=\'dh-material\'>close</i>',
                    label: 'Cancel',
                    callback: () => {
                    },
                },
            },
            default: 'roll',
            close: () => {
            },
        },
        {
            width: 300,
        },
    );
    dialog.otherListeners = (html) => {
        html.find('.roll-control__hide-control').click(async (ev) => game.dh.sheetControlHideToggle(ev));
    };
    dialog.render(true);
}
