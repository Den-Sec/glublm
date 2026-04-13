// companion/server/prompt-builder.js
import { THRESHOLD_STARVING, THRESHOLD_FILTHY, THRESHOLD_CRITICAL } from '../shared/constants.js';

export function buildPrompt(userText, state) {
  const tags = [];

  // Health-critical overrides everything
  if (state.health < THRESHOLD_CRITICAL) {
    tags.push('[mood:dying]');
  } else {
    // Hunger mood
    if (state.hunger < THRESHOLD_STARVING) tags.push('[mood:starving]');
    else if (state.hunger < 30) tags.push('[mood:hungry]');
    else if (state.hunger < 50) tags.push('[mood:peckish]');
    else tags.push('[mood:happy]');

    // Water quality
    if (state.cleanliness < THRESHOLD_FILTHY) tags.push('[water:dirty]');
    else if (state.cleanliness < 40) tags.push('[water:murky]');
  }

  return tags.join(' ') + ' ' + userText;
}
