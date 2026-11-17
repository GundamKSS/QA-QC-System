import { Box3, Vector3, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { stage } from "@/config/experience";
import { BRUSHED_MEAN, createBrushedRoughness } from "./brushedTexture";
import { buildCompressorGeometry, dims } from "./compressorGeometry";
import { framingFor, placeCamera } from "./framing";

describe("framing", () => {
  it.each([
    [1440, 900, "laptop"],
    [1024, 768, "laptop"],
    [844, 390, "phoneLandscape"],
    [820, 1180, "tablet"],
    [390, 844, "phone"],
    [360, 640, "phoneShort"],
  ] as const)("%i×%i → %s", (width, height, layout) => {
    expect(framingFor(width, height)).toBe(stage.framing[layout]);
  });

  it("shifts the lens towards the stage area and backs off for a smaller object", () => {
    const laptop = placeCamera(1440, 900, dims.height);
    expect(laptop.offsetX).toBeGreaterThan(0); // object left of centre
    const phone = placeCamera(390, 844, dims.height);
    expect(phone.offsetY).toBeGreaterThan(0); // object above centre
    const distance = (p: { position: readonly number[]; target: readonly number[] }) =>
      Math.hypot(...p.position.map((v, i) => v - p.target[i]));
    expect(distance(phone)).toBeGreaterThan(distance(laptop));
  });
});

/** Every vertex normal should point away from the axis on the sides, up on the top. */
function outwardShare(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  let outward = 0;
  let counted = 0;
  for (let i = 0; i < position.count; i++) {
    const radial = new Vector3(position.getX(i), 0, position.getZ(i));
    if (radial.length() < 1e-4) continue;
    counted++;
    const n = new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i));
    if (n.dot(radial.normalize()) > -0.05 || n.y > 0.5) outward++;
  }
  return outward / counted;
}

describe("compressor geometry", () => {
  const parts = buildCompressorGeometry();

  it("builds every part with the documented counts", () => {
    expect(parts.finMatrices).toHaveLength(dims.fins.count);
    expect(parts.rodMatrices).toHaveLength(4);
    expect(parts.nutMatrices).toHaveLength(8);
    for (const value of Object.values(parts)) {
      if (Array.isArray(value)) continue;
      expect(value.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("keeps lathe faces pointing outwards (a reversed profile renders as a dark hollow)", () => {
    for (const part of [parts.barrel, parts.cap, parts.accent, parts.collar]) {
      expect(outwardShare(part)).toBeGreaterThan(0.95);
    }
  });

  it("stands on y = 0 and stays within the height used for framing", () => {
    const bounds = new Box3();
    for (const part of [parts.base, parts.head, parts.cap, parts.pipe]) {
      part.computeBoundingBox();
      bounds.union(part.boundingBox!);
    }
    expect(bounds.min.y).toBeCloseTo(0, 2);
    expect(bounds.max.y).toBeLessThanOrEqual(dims.height + 0.01);
  });
});

describe("brushed roughness", () => {
  it("is deterministic and averages the documented mean", () => {
    const a = createBrushedRoughness(256, 3).image.data as Uint8Array;
    const b = createBrushedRoughness(256, 3).image.data as Uint8Array;
    expect(Array.from(a)).toEqual(Array.from(b));
    let sum = 0;
    for (let i = 1; i < a.length; i += 4) sum += a[i];
    expect(sum / (a.length / 4) / 255).toBeCloseTo(BRUSHED_MEAN, 1);
  });
});
