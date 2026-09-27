// The colour-theme button: Auto -> Light -> Dark, remembered per browser.
import { T } from "./text.js";
import { storage } from "./dom.js";

const ORDER = ["auto", "light", "dark"];

export function initTheme(button) {
  let mode = storage.get("kp-theme");
  if (!ORDER.includes(mode)) mode = "auto";
  const apply = () => {
    if (mode === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", mode);
    button.setAttribute("aria-label", T.theme(T.themeNames[mode]));
    button.title = T.theme(T.themeNames[mode]);
    button.dataset.mode = mode;
  };
  apply();
  button.addEventListener("click", () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    storage.set("kp-theme", mode);
    apply();
  });
}
