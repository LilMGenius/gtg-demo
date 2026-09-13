// Reuse Chromium's pseudo-state sampler through Playwright (Apache-2.0), rather than
// reconstructing the :active cascade: https://chromedevtools.github.io/devtools-protocol/tot/CSS/#method-forcePseudoState
// The shadow parser follows gym-gate's edges reader; project offsets through the native
// DOMMatrix so the pressed shadow, as well as the pressed border, must fit the viewport.
export const readCloseFloor = async (page, selector) => {
  const button = page.locator(selector);
  const read = (e) => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    const m = new DOMMatrixReadOnly(s.transform);
    let shadowY = 0, shadowDrop = 0;
    for (const one of s.boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(one) || one === "none") continue;
      const n = one.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/);
      if (!n) throw new Error("Unparsed close shadow: " + one);
      const spread = +(n[4] || 0), blur = +n[3];
      shadowY = Math.max(shadowY, +n[2] + blur + spread);
      shadowDrop = Math.max(shadowDrop, m.b * +n[1] + m.d * +n[2] + blur + spread);
    }
    return { bottom: r.bottom, spare: innerHeight - r.bottom, viewport: innerHeight,
      rotationDrop: Math.max(0, (r.height - e.offsetHeight) / 2),
      shadowY, shadowDrop, translateY: m.m42 };
  };
  const rest = await button.evaluate(read);
  const cdp = await page.context().newCDPSession(page);
  let nodeId;
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    ({ nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector }));
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    const active = await button.evaluate(read);
    const floor = Math.max(rest.shadowY + rest.rotationDrop, active.translateY + rest.rotationDrop);
    const pressedBottom = active.bottom + active.shadowDrop;
    return { floor, spare: rest.spare, shadowY: rest.shadowY, rotationDrop: rest.rotationDrop,
      activeY: active.translateY, pressedBottom, viewport: rest.viewport,
      pressedInside: pressedBottom <= rest.viewport };
  } finally {
    try {
      if (nodeId) await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    } finally { await cdp.detach(); }
  }
};

export const closeFloorSaid = (f) => "floor " + f.floor.toFixed(2) + " = max(shadow "
  + f.shadowY.toFixed(2) + " + rotation " + f.rotationDrop.toFixed(2) + ", active "
  + f.activeY.toFixed(2) + " + rotation " + f.rotationDrop.toFixed(2) + ")px, pressed ink bottom "
  + f.pressedBottom.toFixed(2) + " of " + f.viewport;
