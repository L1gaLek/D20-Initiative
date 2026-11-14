(function (root) {
  'use strict';
  // Shared by the browser and server: persist the complete breakdown in kind_text.
  function resolve(parts, randomRoll) {
    if (!Array.isArray(parts) || !parts.length) throw new Error('Damage parts required');
    const resolved = parts.map(part => {
      const description = String(part?.description || '').trim();
      if (part?.type === 'flat') {
        const value = Number(part.value);
        if (!Number.isSafeInteger(value)) throw new Error('Invalid damage value');
        return { type: 'flat', description, value };
      }
      const sides = Number(part?.sides);
      const count = Number(part?.count);
      if (part?.type !== 'dice' || !Number.isInteger(sides) || sides < 2 || sides > 100
        || !Number.isInteger(count) || count < 1 || count > 20) throw new Error('Invalid damage dice');
      const rolls = randomRoll ? Array.from({ length: count }, () => randomRoll(sides)) : part.rolls;
      if (!Array.isArray(rolls) || rolls.length !== count
        || rolls.some(value => !Number.isInteger(value) || value < 1 || value > sides)) throw new Error('Invalid damage rolls');
      return { type: 'dice', description, sides, count, rolls: [...rolls] };
    });
    const dice = resolved.filter(part => part.type === 'dice');
    if (!dice.length) throw new Error('Base damage dice required');
    const rolls = dice.flatMap(part => part.rolls);
    const bonus = resolved.filter(part => part.type === 'flat').reduce((sum, part) => sum + part.value, 0);
    const sum = rolls.reduce((total, value) => total + value, 0);
    if (!Number.isSafeInteger(sum + bonus)) throw new Error('Damage total is too large');
    return { damageParts: resolved, sides: dice[0].sides, count: rolls.length, rolls, bonus, sum, total: sum + bonus };
  }
  function event(parts, title = 'Урон', randomRoll) {
    const result = resolve(parts, randomRoll);
    const detail = result.damageParts.map(part => {
      const value = part.type === 'dice' ? `${part.count}d${part.sides} [${part.rolls.join(' + ')}]` : `${part.value >= 0 ? '+' : ''}${part.value}`;
      return `${part.description || 'Доп. урон'}: ${value}`;
    }).join('; ');
    return { ...result, damageTitle: String(title), kindText: `${title} — ${detail}`, crit: '' };
  }
  const api = { resolve, event };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DamageRolls = api;
})(typeof window === 'object' ? window : globalThis);
