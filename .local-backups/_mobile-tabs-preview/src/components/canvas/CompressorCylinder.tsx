"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Matrix4,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three";
import { stage } from "@/config/experience";
import { BRUSHED_MEAN, createBrushedRoughness } from "./brushedTexture";
import { buildCompressorGeometry, disposeCompressorGeometry } from "./compressorGeometry";
import { applyScanReveal, type ScanUniforms } from "./scanReveal";

function createMaterials(uniforms: ScanUniforms) {
  const brushed = createBrushedRoughness();
  const { titanium, fins, steel, accent } = stage;
  const materials = {
    brushed,
    titanium: new MeshPhysicalMaterial({
      color: titanium.color,
      metalness: 1,
      roughness: titanium.roughness / BRUSHED_MEAN,
      roughnessMap: brushed,
      anisotropy: titanium.anisotropy,
      clearcoat: titanium.clearcoat,
      clearcoatRoughness: titanium.clearcoatRoughness,
      envMapIntensity: titanium.envMapIntensity,
    }),
    fins: new MeshPhysicalMaterial({
      color: fins.color,
      metalness: 1,
      roughness: fins.roughness,
      envMapIntensity: titanium.envMapIntensity,
    }),
    steel: new MeshStandardMaterial({ color: steel.color, metalness: 1, roughness: steel.roughness }),
    accent: new MeshStandardMaterial({ color: accent.color, metalness: 1, roughness: accent.roughness }),
  };
  for (const material of [materials.titanium, materials.fins, materials.steel, materials.accent]) {
    applyScanReveal(material, uniforms);
  }
  materials.fins.name = "compressor-fins";
  return materials;
}

function InstancedPart({
  geometry,
  material,
  matrices,
  name,
}: {
  geometry: BufferGeometry;
  material: Material;
  matrices: Matrix4[];
  name?: string;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    if (name === "compressor-fins") {
      const white = new Color(1, 1, 1);
      matrices.forEach((_, index) => mesh.setColorAt(index, white));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, name]);
  return <instancedMesh ref={ref} name={name} args={[geometry, material, matrices.length]} />;
}

/** The finned titanium cylinder (docs/07 §3). One draw call per part; fins, rods and nuts are instanced. */
export function CompressorCylinder({ uniforms }: { uniforms: ScanUniforms }) {
  const parts = useMemo(() => buildCompressorGeometry(), []);
  const materials = useMemo(() => createMaterials(uniforms), [uniforms]);

  useEffect(
    () => () => {
      disposeCompressorGeometry(parts);
      for (const value of Object.values(materials)) value.dispose();
    },
    [parts, materials],
  );

  const { titanium, fins, steel, accent } = materials;
  return (
    <group name="compressor-model">
      <mesh geometry={parts.base} material={titanium} />
      <mesh geometry={parts.barrel} material={titanium} />
      <InstancedPart name="compressor-fins" geometry={parts.fin} material={fins} matrices={parts.finMatrices} />
      <mesh geometry={parts.head} material={titanium} />
      {/* Satin, not brushed: a polished dome would only mirror the dark studio. */}
      <mesh geometry={parts.cap} material={fins} />
      <mesh geometry={parts.accent} material={accent} />
      <InstancedPart geometry={parts.rod} material={steel} matrices={parts.rodMatrices} />
      <InstancedPart geometry={parts.nut} material={steel} matrices={parts.nutMatrices} />
      <mesh geometry={parts.pipe} material={titanium} />
      <InstancedPart geometry={parts.collar} material={steel} matrices={parts.collarMatrices} />
      <mesh geometry={parts.stub} material={steel} />
      <mesh geometry={parts.filter} material={fins} />
    </group>
  );
}
