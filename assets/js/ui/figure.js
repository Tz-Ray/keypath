// A walk figure wired to the engine: candidate and sense popovers, the
// what-if banner, and unit highlighting.  Used by the playground (both
// modes) and the challenge reveals.
import { renderWalk, renderTable } from "./walk.js";
import { openCandidates, openSense, whatIfBanner } from "./popover.js";

const SHAPE_EDGES = { zh_cangjie: "shape:zh_cangjie", zh_quick: "shape:zh_quick" };
const EDGE = seg => (seg.language !== "zh" ? "homophone:ja"
  : seg.layout === "ko_dubeolsik" ? "homophone:ko_hanja"
  : Object.prototype.hasOwnProperty.call(SHAPE_EDGES, seg.layout) ? SHAPE_EDGES[seg.layout] : "homophone:zh");

/**
 * mountFigure(host, trace, {engine, legends, animate, prevKeys, message, surfaceName,
 *                           whatIfSlot, onFocusUnit, table, heroLists})
 */
export function mountFigure(host, trace, opts) {
  const { engine } = opts;
  let view = null;
  let whatIf = null; // {path, index}

  const clearWhatIf = () => {
    whatIf = null;
    if (view) view.clearOverride();
    if (opts.whatIfSlot) opts.whatIfSlot.replaceChildren();
  };

  async function listFor(u) {
    const edge = EDGE(u.seg);
    if (opts.heroLists && edge === "homophone:zh" && opts.heroLists[u.unit.reading]) {
      const items = Array.from(opts.heroLists[u.unit.reading]);
      return { count: items.length, items, complete: true };
    }
    const e = await engine();
    return e.list(edge, u.unit.reading);
  }

  const ctx = {
    registry: opts.registry,
    layouts: opts.layouts,
    legends: opts.legends,
    animate: opts.animate,
    prevKeys: opts.prevKeys,
    message: opts.message,
    surfaceName: opts.surfaceName,
    limit: opts.limit,
    onFocusUnit: u => opts.onFocusUnit && opts.onFocusUnit(u),
    onReplace: v => { view = v; opts.onReplace && opts.onReplace(v); },
    async onOpenUnit(v, u, invoker) {
      let list;
      try { list = await listFor(u); } catch { return; }
      if (!list || !list.items.length) list = { count: u.unit.count, items: u.unit.head, complete: u.unit.head.length === u.unit.count };
      openCandidates({
        invoker, unit: u.unit, seg: u.seg, list, layouts: opts.layouts,
        current: whatIf && whatIf.path.join() === u.path.join() ? whatIf.index : null,
        async onPick(index, char) {
          if (index === u.unit.index) { clearWhatIf(); return; }
          const e = await engine();
          if (EDGE(u.seg) !== "homophone:ja") await e.list(EDGE(u.seg), u.unit.reading);
          let parts;
          try { parts = e.whatIfParts(trace, u.path, index); } catch { return; }
          whatIf = { path: u.path, index };
          v.setOverride(u.path, char, index, list.count);
          if (opts.whatIfSlot) opts.whatIfSlot.replaceChildren(whatIfBanner(parts, index, u.seg.language, () => {
            clearWhatIf();
            v.focusUnit(u.path);
          }));
        },
      });
    },
    onOpenSense(v, w, hop, invoker) {
      openSense({ invoker, word: w.word, hop, hops: w.seg.hops || [] });
    },
  };

  if (opts.table) {
    renderTable(host, trace, ctx);
    view = null;
  } else {
    view = renderWalk(host, trace, ctx);
  }
  return {
    get view() { return view; },
    clearWhatIf,
  };
}
