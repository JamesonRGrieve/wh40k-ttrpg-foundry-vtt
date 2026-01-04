import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';
import { ActionData } from '../rolls/action-data.mjs';

export async function prepareDamageRoll(rollData) {
    rollData.dh = CONFIG.rt;
    const html = await renderTemplate('systems/rogue-trader/templates/prompt/damage-roll-prompt.hbs', rollData);
    let dialog = new Dialog(
        {
            title: 'Damage Roll',
            content: html,
            buttons: {
                roll: {
                    icon: "<i class='dh-material'>casino</i>",
                    label: 'Roll',
                    callback: async (dialogHtml) => {
                        const actionData = new ActionData();
                        actionData.template = 'systems/rogue-trader/templates/chat/damage-roll-chat.hbs';

                        rollData.damage = dialogHtml.find('#damage')[0].value;
                        rollData.penetration = dialogHtml.find('#penetration')[0].value;
                        rollData.damageType = dialogHtml.find('[name=damageType] :selected').val();
                        rollData.pr = dialogHtml.find('#pr')[0]?.value;
                        rollData.template = 'systems/rogue-trader/templates/chat/damage-roll-chat.hbs';
                        rollData.roll = new Roll(rollData.damage, rollData);
                        await rollData.roll.evaluate();

                        actionData.rollData = rollData;
                        await sendActionDataToChat(actionData);
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
