import { performRollAndSendToChat } from '../rolls/roll-manager.mjs';

export async function prepareSimpleRoll(rollData) {
    const html = await renderTemplate('systems/dark-heresy-2nd/templates/prompt/simple-roll-prompt.hbs', rollData);
    let dialog = new Dialog(
        {
            title: 'Roll Modifier',
            content: html,
            buttons: {
                roll: {
                    icon: '<i class=\'dh-material\'>casino</i>',
                    label: 'Roll',
                    callback: async (html) => {
                        console.log(html.find('[name=difficulty] :selected'));
                        rollData.modifiers.difficulty = parseInt(html.find('[name=difficulty] :selected').val());
                        rollData.modifiers.modifier = html.find('#modifier')[0].value;
                        console.log('Roll Data');
                        console.log(rollData);
                        await performRollAndSendToChat(rollData);
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
    dialog.render(true);
}
