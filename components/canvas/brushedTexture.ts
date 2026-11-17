import { DataTexture, NoColorSpace, RepeatWrapping, RGBAFormat, UnsignedByteType } from "three";

/** Small deterministic PRNG, so the brushing looks the same on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Roughness streaks for brushed metal, generated in code (docs/07: no texture files).
 * Rows vary, columns don't: along the UV tangent the value is constant, so streaks run the
 * same way as the anisotropic highlight. The green channel multiplies `material.roughness`
 * and hovers around 0.65, so set roughness ≈ target / 0.65.
 */
export function createBrushedRoughness(rows = 512, seed = 7): DataTexture {
  const random = mulberry32(seed);
  const width = 4;
  const data = new Uint8Array(width * rows * 4);
  let drift = 0;
  for (let y = 0; y < rows; y++) {
    drift = drift * 0.9 + (random() - 0.5) * 0.03; // slow bands
    const fine = (random() - 0.5) * 0.12; // individual scratches
    const value = Math.min(1, Math.max(0, 0.65 + drift + fine * (random() < 0.3 ? 1 : 0.35)));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(value * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new DataTexture(data, width, rows, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const BRUSHED_MEAN = 0.65;
