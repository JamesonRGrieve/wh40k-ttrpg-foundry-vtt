import { roll1d100, sendAttackDataToChat } from '../rolls/roll-helpers.mjs';


export async function prepareSimpleRoll(rollData) {
    const html = await renderTemplate('systems/dark-heresy-2nd/templates/prompt/simple-roll-prompt.hbs', rollData);
    let dialog = new Dialog(
        {
            title: 'Roll Modifier',
            content: html,
            buttons: {
                roll: {
                    icon: "<i class='dh-material'>casino</i>",
                    label: 'Roll',
                    callback: async (html) => {
                        game.dh.log(html.find('[name=difficulty] :selected'));
                        rollData.modifiers['difficulty'] = parseInt(html.find('[name=difficulty] :selected').val());
                        rollData.modifiers['modifier'] = html.find('#modifier')[0].value;
                        rollData.roll = await roll1d100();
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
