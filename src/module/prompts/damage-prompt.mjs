import { sendAttackDataToChat } from '../rolls/roll-helpers.mjs';

export class ListeningDialog extends Dialog {
    constructor(data, options) {
        super(data, options);
    }

    otherListeners(html) {
        html.find('.roll-control__hide-control').click(async (ev) => {
            game.dh.log('roll-control-toggle');
            this.sheetControlHideToggle(ev);
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.otherListeners(html);
    }

    sheetControlHideToggle(event) {
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span:first', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
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
                    icon: "<i class='dh-material'>casino</i>",
                    label: 'Roll',
                    callback: async (html) => {
                        rollData.damage = html.find('#damage')[0].value;
                        rollData.penetration = html.find('#penetration')[0].value;
                        rollData.damageType = html.find('[name=damageType] :selected').val();
                        rollData.pr = html.find('#pr')[0]?.value;
                        rollData.template = 'systems/dark-heresy-2nd/templates/chat/damage-roll-chat.hbs';
                        rollData.roll = new Roll(rollData.damage, rollData);
                        await sendAttackDataToChat(rollData);
                    },
                },
                cancel: {
                    icon: "<i class='dh-material'>close</i>",
                    label: 'Cancel',
                    callback: () => {},
                },
            },
            default: 'roll',
            close: () => {},
        },
        {
            width: 300,
        },
    );
    dialog.render(true);
}
