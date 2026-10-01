// Entry point: wires the page to the engine.  The hero renders from
// data/hero.json straight away; the engine then re-encodes it when the
// browser is idle (loading the dictionaries it needs) and must reproduce
// it.  If the page's own data can't load, a banner says so and offers
// Retry, and nothing throws unhandled.
import { createEngine, dumpsKeyWithSpans } from "./engine/index.js";
import { $, h } from "./ui/dom.js";
import { T } from "./ui/text.js";
import { makeLegends } from "./ui/walk.js";
import { initTheme } from "./ui/theme.js";
import { initPlayground } from "./ui/playground.js";
import { initChallenges } from "./ui/challenges.js";
import { initShare, parseFragment, linkKind, showPuzzleBanner } from "./ui/share.js";
import { initWorkbench } from "./ui/workbench.js";

const PUZZLES = "https://github.com/Tz-Ray/keypath/tree/main/puzzles";
const idle = fn => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 1000));

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !local) return;
  navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url)).catch(() => {});
}

/** The banner shown when the page's own data can't load: Retry, or the puzzles on GitHub. */
function showLoadError() {
  if ($("#load-error")) return;
  const retry = h("button.btn.small", { type: "button" }, T.retry);
  retry.addEventListener("click", () => location.reload());
  const banner = h("div#load-error.card.load-error", { role: "alert" },
    h("p", T.bootFailed, " ", retry),
    h("p.small", T.bootPuzzles[0], h("a", { href: PUZZLES, rel: "noopener" }, T.bootPuzzles[1]), T.bootPuzzles[2]));
  $("#puzzle-slot").before(banner);
  document.documentElement.classList.add("load-failed");
}

async function main() {
  initTheme($("#theme"));
  document.documentElement.classList.add("js");
  const heroP = fetch(new URL("../../data/hero.json", import.meta.url)).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  heroP.catch(() => {}); // awaited below; a failure there shows the banner
  let engine;
  try {
    engine = await createEngine();
  } catch {
    showLoadError();
    return;
  }
  const legends = makeLegends(engine.layouts);
  const getEngine = async () => engine;
  const playground = initPlayground({ engine, legends, getEngine, dumpsKeyWithSpans });
  const surfaces = new Map(engine.surfaces.map(s => [s.id, s]));
  const ids = engine.surfaces.map(s => s.id);
  window.__keypath = { engine, playground }; // for the browser checks

  const frag = parseFragment(location.hash, ids);
  const hero = await heroP;
  if (frag && frag.try) {
    await playground.load(frag.try);
    $("#try").scrollIntoView({ block: "start" });
  } else {
    playground.showPrecomputed(hero);
    idle(() => playground.verifyHero(hero).catch(() => {}));
  }
  playground.initialOpen();
  initShare({ playground, getEngine, engine });
  // the link the page opened with, and any pasted into this tab later
  const slot = $("#puzzle-slot");
  const dispatch = (f, kind) => {
    if (!f) {
      // a link that names a share kind but can't be read: say so, once
      if (kind) slot.replaceChildren(h("p.card.link-note", { role: "status" }, T.linkIncomplete));
      return;
    }
    if (f.puzzle) {
      showPuzzleBanner(slot, f.puzzle, surfaces);
      return;
    }
    if (slot.querySelector(".link-note")) slot.replaceChildren();
    if (f.walk) {
      // a #walk link: the walk back of its ciphertext and key (or the refusal)
      playground.openWalk(f.walk);
      $("#try").scrollIntoView({ block: "start" });
    }
  };
  dispatch(frag && !frag.try ? frag : null, frag ? null : linkKind(location.hash));
  window.addEventListener("hashchange", () => {
    const f = parseFragment(location.hash, ids);
    if (f && f.try) {
      playground.showEncode();
      playground.load(f.try).catch(() => {});
      $("#try").scrollIntoView({ block: "start" });
      return;
    }
    dispatch(f, linkKind(location.hash));
    if (f && f.puzzle) $("#top").scrollIntoView({ block: "start" });
  });
  initChallenges({ host: $("#challenge-grid"), getEngine, registry: engine.registry, layouts: engine.layouts, legends, surfaces });
  initWorkbench({ root: $("#workbench"), engine });
  document.documentElement.classList.add("ready");
  registerServiceWorker();
}

main().catch(() => showLoadError());
