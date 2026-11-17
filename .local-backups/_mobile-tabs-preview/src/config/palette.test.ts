import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palette } from "./experience";

/** CSS reads the @theme tokens, WebGL reads `palette` — they must stay the same colours. */
describe("palette ↔ globals.css @theme", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const tokens = Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, hex]) => [
      // carbon-950 → carbon950, ti-metal → tiMetal
      name.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase()),
      hex.toLowerCase(),
    ]),
  );

  it("declares every palette colour with the same hex value", () => {
    const expected = Object.fromEntries(Object.entries(palette).map(([name, hex]) => [name, hex.toLowerCase()]));
    expect(tokens).toEqual(expected);
  });
});
