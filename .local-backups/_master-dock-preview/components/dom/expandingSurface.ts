/** Share the Home mat's scroll response without moving its readable content. */
export function bindExpandingSurface(card: HTMLElement | null): (() => void) | undefined {
  const area = card?.closest<HTMLElement>(".app-page-area");
  if (!card || !area) return;
  const media = window.matchMedia("(prefers-reduced-motion: no-preference)");
  const controller = new AbortController();
  let frame = 0;
  let shown = 0;

  const step = () => {
    const goal = media.matches ? Math.min(1, Math.max(0, window.scrollY / 140)) : 0;
    shown += (goal - shown) * 0.2;
    if (Math.abs(goal - shown) < 0.001) shown = goal;
    card.style.setProperty("--apart", shown.toFixed(4));
    frame = shown === goal ? 0 : window.requestAnimationFrame(step);
  };
  const wake = () => {
    if (!frame) frame = window.requestAnimationFrame(step);
  };
  const measure = () => {
    const box = card.getBoundingClientRect();
    const room = area.getBoundingClientRect();
    card.style.setProperty("--welcome-left", `${Math.max(0, box.left - room.left)}px`);
    card.style.setProperty("--welcome-right", `${Math.max(0, room.right - box.right)}px`);
    card.style.setProperty("--welcome-top", `${Math.max(0, box.top - room.top)}px`);
    wake();
  };

  window.addEventListener("scroll", wake, { passive: true, signal: controller.signal });
  window.addEventListener("resize", measure, { passive: true, signal: controller.signal });
  media.addEventListener("change", wake, { signal: controller.signal });
  measure();
  return () => {
    controller.abort();
    window.cancelAnimationFrame(frame);
    for (const key of ["--apart", "--welcome-left", "--welcome-right", "--welcome-top"]) card.style.removeProperty(key);
  };
}
