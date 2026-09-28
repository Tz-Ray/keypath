// Candidate lists the decoder picks from, per edge ("homophone:zh",
// "homophone:ko_hanja", "homophone:ja", "translate:en>zh", ...) and value.
//
// A list is {count, entries: Map(index -> item)}: complete lists (the zh and
// hanja cores) know every item; others are registered piecemeal from the
// English rows and the challenge slices, so they may know only some indices.
// `complete` edges know every value too: a value missing there is a
// malformed unit, not missing data.  An edge loaded in parts (the Cangjie
// lists, sharded by first letter) says which values it knows completely.

export class NotCarried extends Error {}
export class PickError extends Error {}

export function createLists() {
  const edges = new Map();          // edge -> Map(value -> {count, entries})
  const completeEdges = new Set();
  const completeWhen = new Map();   // edge -> value => whether that part is loaded
  const knowsAll = (edge, value) => completeEdges.has(edge) || (completeWhen.has(edge) && completeWhen.get(edge)(value));

  const edgeMap = edge => {
    let m = edges.get(edge);
    if (!m) { m = new Map(); edges.set(edge, m); }
    return m;
  };

  /** Register a full list (array of items). */
  function setFull(edge, value, items) {
    edgeMap(edge).set(value, { count: items.length, entries: null, items });
  }

  /** Register one known item of a list whose length is `count`. */
  function addEntry(edge, value, count, index, item) {
    const m = edgeMap(edge);
    let list = m.get(value);
    if (!list) { list = { count, entries: new Map(), items: null }; m.set(value, list); }
    if (list.count !== count) throw new Error(`inconsistent list data for ${edge} ${value}: ${list.count} != ${count}`);
    if (list.items) {
      if (list.items[index] !== item) throw new Error(`inconsistent list data for ${edge} ${value} #${index}`);
      return;
    }
    const known = list.entries.get(index);
    if (known !== undefined && known !== item) throw new Error(`inconsistent list data for ${edge} ${value} #${index}`);
    list.entries.set(index, item);
  }

  const get = (edge, value) => (edges.has(edge) ? edges.get(edge).get(value) : undefined);
  const itemAt = (list, i) => (list.items ? list.items[i] : list.entries.get(i));

  /**
   * Candidate `index` of `value`'s list on `edge`.  Throws PickError for a
   * missing/out-of-range index or a value a complete edge lacks, and
   * NotCarried when the page lacks the data.
   */
  function pick(edge, value, index, what) {
    const list = get(edge, value);
    if (!list) {
      if (knowsAll(edge, value)) throw new PickError(`${value} has no ${edge} candidates`);
      throw new NotCarried(`the ${edge} candidates of ${value}`);
    }
    if (index === undefined || index === null) throw new PickError(`missing ${what} for ${value}`);
    if (!(Number.isInteger(index) && index >= 0 && index < list.count))
      throw new PickError(`${what} ${index} out of range for ${value} (${list.count} candidates)`);
    const item = itemAt(list, index);
    if (item === undefined) throw new NotCarried(`${edge} candidate ${index} of ${value}`);
    return item;
  }

  /** {count, items: the known leading run, complete} or null. */
  function describe(edge, value) {
    const list = get(edge, value);
    if (!list) return null;
    if (list.items) return { count: list.count, items: list.items.slice(), complete: true };
    const items = [];
    while (items.length < list.count && list.entries.has(items.length)) items.push(list.entries.get(items.length));
    return { count: list.count, items, complete: items.length === list.count };
  }

  return {
    setFull, addEntry, pick, describe, get,
    markComplete: edge => completeEdges.add(edge),
    markCompleteWhen: (edge, knows) => completeWhen.set(edge, knows),
    isComplete: edge => completeEdges.has(edge),
  };
}
