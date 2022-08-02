export async function simpleRoll(rollData) {
  await _computeTarget(rollData);
  await _rollTarget(rollData);
  await _sendToChat(rollData);
}

async function _computeTarget(rollData) {
  const formula = `0 + ${rollData.difficulty} + ${rollData.modifier}`;
  let r = new Roll(formula, {});
  await r.evaluate({ async: true });
  if (r.total > 60) {
    rollData.target = rollData.baseTarget + 60;
  } else if (r.total < -60) {
    rollData.target = rollData.baseTarget + -60;
  } else {
    rollData.target = rollData.baseTarget + r.total;
  }
  rollData.rollObject = r;
}

async function _rollTarget(rollData) {
  let r = new Roll('1d100', {});
  await r.evaluate({ async: true });
  rollData.result = r.total;
  rollData.rollObject = r;
  rollData.isSuccess = rollData.result <= rollData.target;
  if (rollData.isSuccess) {
    rollData.dof = 0;
    rollData.dos = 1 + _getDegree(rollData.target, rollData.result);
  } else {
    rollData.dos = 0;
    rollData.dof = 1 + _getDegree(rollData.result, rollData.target);
  }
}

function _getDegree(a, b) {
  return Math.floor(a / 10) - Math.floor(b / 10);
}

async function _sendToChat(rollData) {
  rollData.render = await rollData.rollObject.render();

  const html = await renderTemplate('systems/dark-heresy-2nd/templates/chat/simple-roll-chat.hbs', rollData);
  let chatData = {
    user: game.user.id,
    rollMode: game.settings.get('core', 'rollMode'),
    content: html,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
  };
  if (rollData.rollObject) {
    chatData.roll = rollData.rollObject;
  }
  if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
    chatData.whisper = ChatMessage.getWhisperRecipients('GM');
  } else if (chatData.rollMode === 'selfroll') {
    chatData.whisper = [game.user];
  }
  ChatMessage.create(chatData);
}
