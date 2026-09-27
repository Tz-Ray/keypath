// Entry point: wires the page to the engine.  The hero renders from
// data/hero.json straight away; the engine then re-encodes it when the
// browser is idle (loading the dictionaries it needs) and must reproduce it.
import { createEngine, dumpsKeyWithSpans } from "./engine/index.js";
import { $ } from "./ui/dom.js";
import { makeLegends } from "./ui/walk.js";
import { initTheme } from "./ui/theme.js";
import { initPlayground } from "./ui/playground.js";
import { initChallenges } from "./ui/challenges.js";
import { initShare, parseFragment, showPuzzleBanner } from "./ui/share.js";

const idle = fn => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 1000));

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !local) return;
  navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url)).catch(() => {});
}

async function main() {
  initTheme($("#theme"));
  document.documentElement.classList.add("js");
  const heroP = fetch(new URL("../../data/hero.json", import.meta.url)).then(r => r.json());
  const engine = await createEngine();
  const legends = makeLegends(engine.layouts);
  const getEngine = async () => engine;
  const playground = initPlayground({ engine, legends, getEngine, dumpsKeyWithSpans });
  const surfaces = new Map(engine.surfaces.map(s => [s.id, s]));
  window.__keypath = { engine, playground }; // for the browser checks

  const frag = parseFragment(location.hash, engine.surfaces.map(s => s.id));
  const hero = await heroP;
  if (frag && frag.try) {
    await playground.load(frag.try);
    $("#try").scrollIntoView({ block: "start" });
  } else {
    playground.showPrecomputed(hero);
    idle(() => playground.verifyHero(hero));
  }
  if (frag && frag.puzzle) showPuzzleBanner($("#puzzle-slot"), frag.puzzle, surfaces);
  playground.initialOpen();
  initShare({ playground, getEngine });
  initChallenges({ host: $("#challenge-grid"), getEngine, registry: engine.registry, layouts: engine.layouts, legends, surfaces });
  document.documentElement.classList.add("ready");
  registerServiceWorker();
}

main();
