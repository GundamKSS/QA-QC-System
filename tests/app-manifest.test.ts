import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

/** Chrome offers "ติดตั้ง" only when the manifest has these; a missing icon file silently drops the offer. */
describe("web app manifest", () => {
  const data = manifest();

  it("names the app, opens /home full screen", () => {
    expect(data).toMatchObject({ name: expect.stringContaining("QA & QC System"), short_name: "QA & QC System", start_url: "/home", display: "standalone", lang: "th" });
  });

  it("lists 192 and 512 px icons plus a maskable one, and every file exists as the size it claims", () => {
    const icons = data.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of icons) {
      const file = join(process.cwd(), "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      // PNG IHDR: width and height are big-endian at bytes 16 and 20.
      const png = readFileSync(file);
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });

  it("has an iPhone home-screen icon", () => {
    expect(existsSync(join(process.cwd(), "app", "apple-icon.png"))).toBe(true);
  });
});
