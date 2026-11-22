(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SheetSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const safe = key => typeof key === 'string' && key.length <= 160 && !['__proto__', 'constructor', 'prototype'].includes(key);
  function diff(before, after, path = [], result = []) {
    if (JSON.stringify(before) === JSON.stringify(after)) return result;
    if (object(after) && !object(before)) before = {};
    if (object(before) && object(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (safe(key)) diff(before[key], after[key], [...path, key], result);
      }
    } else if (path.length) {
      result.push(after === undefined ? { path, remove: true } : { path, value: copy(after) });
    }
    return result;
  }
  function clean(ops) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 1000) throw new Error('Invalid sheet changes');
    return ops.map(op => {
      if (!Array.isArray(op?.path) || op.path[0] !== 'parsed' || op.path.length < 2 || op.path.length > 16 || !op.path.every(safe)) throw new Error('Invalid sheet path');
      if (!op.remove && !Object.hasOwn(op, 'value')) throw new Error('Missing sheet value');
      // JSON-only values; paths never address ownership, initiative or token placement.
      return op.remove ? { path: [...op.path], remove: true } : { path: [...op.path], value: copy(op.value) };
    });
  }
  function apply(sheet, ops) {
    const target = copy(sheet || { parsed: {} });
    for (const op of clean(ops)) {
      let node = target;
      for (const key of op.path.slice(0, -1)) {
        if (!object(node[key])) node[key] = {};
        node = node[key];
      }
      const key = op.path.at(-1);
      if (op.remove) delete node[key];
      else node[key] = copy(op.value);
    }
    return target;
  }
  function isHot(op) {
    return ['vitality', 'conditions', 'conditionsList', 'appearance', 'wildShape'].includes(op.path[1]);
  }
  function merge(older, newer) {
    const result = [...older];
    for (const op of newer) {
      // Keep a parent replacement before its later child change. A newer parent
      // replacement supersedes every older child, including an undone edit.
      for (let i = result.length - 1; i >= 0; i--) {
        if (op.path.every((key, j) => key === result[i].path[j])) result.splice(i, 1);
      }
      result.push(op);
    }
    return result;
  }
  return { diff, clean, apply, isHot, merge };
});
