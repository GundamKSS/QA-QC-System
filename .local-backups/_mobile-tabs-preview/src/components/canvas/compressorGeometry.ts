import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

/**
 * The "Titanium Cylinder" (docs/07 §3): a finned piston-compressor cylinder, built from code
 * so the page ships no model files. Y is up; the base sits on y = 0.
 *
 * Lathe parts get their UV `u` around the axis, so the material's anisotropy (which follows
 * the UV tangent) brushes them in rings — the lathe-turned look.
 */
export const dims = {
  base: { size: 1.62, height: 0.11, radius: 0.28 },
  barrel: { radius: 0.5, from: 0.1, to: 1.72 },
  fins: { count: 12, size: 1.5, thickness: 0.03, radius: 0.26, from: 0.27, to: 1.56 },
  head: { size: 1.38, height: 0.26, radius: 0.3, y: 1.68 },
  valve: { radius: 0.42, y: 1.94 },
  rods: { inset: 0.55, radius: 0.032 },
  /** Overall height, for camera framing. */
  height: 2.3,
} as const;

/** Square with rounded corners, centred on the origin. */
export function roundedSquare(size: number, radius: number): Shape {
  const h = size / 2;
  const r = Math.min(radius, h);
  const shape = new Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return shape;
}

/** A rounded-square slab lying flat (extruded along +Y), with softened edges. */
function slab(size: number, height: number, radius: number, bevel: number): BufferGeometry {
  const geometry = new ExtrudeGeometry(roundedSquare(size - bevel * 2, radius), {
    depth: height - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function lathe(points: [number, number][], segments = 96): LatheGeometry {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

export type CompressorGeometry = ReturnType<typeof buildCompressorGeometry>;

export function buildCompressorGeometry() {
  const { base, barrel, fins, head, valve, rods } = dims;

  // Bore sleeve between the fins, with small shoulders where it meets base and head.
  const barrelGeometry = lathe([
    [barrel.radius + 0.05, barrel.from],
    [barrel.radius, barrel.from + 0.04],
    [barrel.radius, barrel.to - 0.04],
    [barrel.radius + 0.05, barrel.to],
  ]);

  const finGeometry = slab(fins.size, fins.thickness, fins.radius, 0.008);
  const finStep = (fins.to - fins.from) / (fins.count - 1);
  const finMatrices = Array.from({ length: fins.count }, (_, i) =>
    new Matrix4().makeTranslation(0, fins.from + i * finStep - fins.thickness / 2, 0),
  );

  const baseGeometry = slab(base.size, base.height, base.radius, 0.022);
  const headGeometry = slab(head.size, head.height, head.radius, 0.03);
  headGeometry.translate(0, head.y, 0);

  // Valve plate boss and domed cap on top of the head. Lathe profiles run bottom → top,
  // otherwise the faces point inwards and get culled.
  const capGeometry = lathe([
    [valve.radius + 0.07, valve.y - 0.08],
    [valve.radius + 0.07, valve.y - 0.03],
    [valve.radius + 0.06, valve.y + 0.01],
    [valve.radius, valve.y + 0.02],
    [valve.radius, valve.y + 0.05],
    [valve.radius - 0.02, valve.y + 0.07],
    [0.41, valve.y + 0.12],
    [0.36, valve.y + 0.19],
    [0.26, valve.y + 0.25],
    [0.12, valve.y + 0.285],
    [0, valve.y + 0.29],
  ]);
  // The one ember accent: a thin anodised band where the cap meets the plate.
  const band = valve.y + 0.022;
  const accentGeometry = lathe([
    [valve.radius - 0.002, band],
    [valve.radius + 0.006, band + 0.004],
    [valve.radius + 0.006, band + 0.018],
    [valve.radius - 0.002, band + 0.022],
  ]);

  // Four tie rods through the fin corners, with hex nuts on the head and the base.
  const rodTop = head.y + head.height;
  const rodGeometry = new CylinderGeometry(rods.radius, rods.radius, rodTop + 0.05, 16, 1);
  rodGeometry.translate(0, (rodTop + 0.05) / 2, 0);
  // Unshared vertices so each of the six faces gets its own normal (reads as a hex nut, not a disc).
  const nutGeometry = new CylinderGeometry(0.068, 0.068, 0.07, 6, 1).toNonIndexed();
  nutGeometry.computeVertexNormals();
  nutGeometry.translate(0, 0.035, 0);
  const corners = [
    [rods.inset, rods.inset],
    [-rods.inset, rods.inset],
    [rods.inset, -rods.inset],
    [-rods.inset, -rods.inset],
  ] as const;
  const rodMatrices = corners.map(([x, z]) => new Matrix4().makeTranslation(x, 0, z));
  const nutMatrices = corners.flatMap(([x, z]) => [
    new Matrix4().makeTranslation(x, rodTop, z),
    new Matrix4().makeTranslation(x, base.height, z),
  ]);

  // Discharge pipe: out of the head's side, round the bend and down past the fins.
  const pipeCurve = new CatmullRomCurve3([
    new Vector3(0.62, head.y + 0.13, 0.1),
    new Vector3(0.98, head.y + 0.13, 0.12),
    new Vector3(1.17, head.y - 0.04, 0.16),
    new Vector3(1.22, head.y - 0.45, 0.18),
    new Vector3(1.22, 0.42, 0.18),
  ]);
  const pipeGeometry = new TubeGeometry(pipeCurve, 64, 0.058, 20, false);
  // Pipe union collars where it leaves the head and where it ends.
  const collarGeometry = lathe(
    [
      [0, -0.06],
      [0.085, -0.06],
      [0.092, -0.045],
      [0.092, 0.045],
      [0.085, 0.06],
      [0, 0.06],
    ],
    32,
  );
  const collarMatrices = [
    new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0.78, head.y + 0.13, 0.11),
    new Matrix4().makeTranslation(1.22, 0.44, 0.18),
  ];

  // Intake filter: a grooved canister on a short stub, on the far side.
  const filterProfile: [number, number][] = [[0, 0]];
  for (let i = 0; i < 7; i++) {
    const y = 0.02 + i * 0.05;
    filterProfile.push([0.2, y], [0.185, y + 0.025]);
  }
  filterProfile.push([0.2, 0.38], [0.17, 0.4], [0, 0.4]);
  // Lathe axis (+Y) turned to point away from the head (−Z).
  const filterGeometry = lathe(filterProfile, 64);
  filterGeometry.rotateX(-Math.PI / 2);
  filterGeometry.translate(-0.22, head.y + 0.13, -0.86);
  const stubGeometry = new CylinderGeometry(0.05, 0.05, 0.24, 16, 1);
  stubGeometry.rotateX(Math.PI / 2);
  stubGeometry.translate(-0.22, head.y + 0.13, -0.76);

  return {
    barrel: barrelGeometry,
    fin: finGeometry,
    finMatrices,
    base: baseGeometry,
    head: headGeometry,
    cap: capGeometry,
    accent: accentGeometry,
    rod: rodGeometry,
    rodMatrices,
    nut: nutGeometry,
    nutMatrices,
    pipe: pipeGeometry,
    collar: collarGeometry,
    collarMatrices,
    filter: filterGeometry,
    stub: stubGeometry,
  };
}

export function disposeCompressorGeometry(parts: CompressorGeometry) {
  for (const value of Object.values(parts)) {
    if (value instanceof BufferGeometry) value.dispose();
  }
}
