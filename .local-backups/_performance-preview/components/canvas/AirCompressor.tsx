"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { CanvasTexture, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from "three";
import { buildCompressorGeometry, disposeCompressorGeometry } from "./compressorGeometry";
import { applyScanReveal, type ScanUniforms } from "./scanReveal";

function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function createResources(uniforms: ScanUniforms) {
  const badgeMap = texture(1024, 300, (ctx) => {
    ctx.fillStyle = "#1649a2"; ctx.fillRect(0, 0, 1024, 300);
    ctx.fillStyle = "#f58032"; ctx.fillRect(0, 208, 1024, 92);
    ctx.fillStyle = "#fff"; ctx.font = "900 210px Arial, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("PUMA", 490, 184);
    ctx.fillStyle = "#184990"; ctx.font = "bold 67px Arial, sans-serif";
    ctx.fillText("AIR COMPRESSOR", 512, 280);
  });
  const dialMap = texture(256, 256, (ctx) => {
    ctx.fillStyle = "#eeede6"; ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    for (let i = 0; i <= 30; i++) {
      const angle = (-225 + i * 9) * Math.PI / 180;
      ctx.save(); ctx.rotate(angle); ctx.strokeStyle = i > 25 ? "#d44732" : "#34383f";
      ctx.lineWidth = i % 5 === 0 ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(82, 0); ctx.lineTo(i % 5 === 0 ? 106 : 98, 0); ctx.stroke(); ctx.restore();
    }
    ctx.textAlign = "center"; ctx.fillStyle = "#4d535d"; ctx.font = "bold 19px Arial"; ctx.fillText("bar", 0, 68);
    ctx.strokeStyle = "#dc5538"; ctx.lineWidth = 5; ctx.beginPath();ctx.moveTo(-12, 10);ctx.lineTo(-50, -51);ctx.stroke();
    ctx.fillStyle = "#434a52";ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
  });
  const materials = {
    paint: new MeshPhysicalMaterial({ color: "#2253b6", metalness: 0.22, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.22 }),
    metal: new MeshStandardMaterial({ color: "#bdc2c8", metalness: 0.78, roughness: 0.34 }),
    rubber: new MeshStandardMaterial({ color: "#202329", metalness: 0.05, roughness: 0.72 }),
    dark: new MeshStandardMaterial({ color: "#414650", metalness: 0.55, roughness: 0.4 }),
    brass: new MeshStandardMaterial({ color: "#b88c45", metalness: 0.72, roughness: 0.3 }),
    red: new MeshStandardMaterial({ color: "#c4412e", metalness: 0.12, roughness: 0.4 }),
    cream: new MeshStandardMaterial({ color: "#d1c9b5", metalness: 0.06, roughness: 0.55 }),
    badge: new MeshStandardMaterial({ map: badgeMap, roughness: 0.45, metalness: 0.12, polygonOffset: true, polygonOffsetFactor: -1 }),
    dial: new MeshStandardMaterial({ map: dialMap, roughness: 0.55, metalness: 0.02 }),
  };
  Object.values(materials).forEach((material) => applyScanReveal(material, uniforms));
  return { parts: buildCompressorGeometry(), materials, maps: [badgeMap, dialMap] };
}

/** Photo-inspired V-twin machine, built locally with nine batched finishes and two small labels. */
export function AirCompressor({ uniforms, inspecting, still, assemblyRef }: { uniforms: ScanUniforms; inspecting: boolean; still: boolean; assemblyRef: RefObject<number> }) {
  const resources = useMemo(() => createResources(uniforms), [uniforms]);
  const opacity = useRef(1);
  useFrame((_, delta) => {
    opacity.current += ((inspecting ? 0.16 : 1) - opacity.current) * (still ? 1 : 1 - Math.exp(-7 * Math.min(delta, 0.05)));
    Object.values(resources.materials).forEach((material) => {material.opacity = opacity.current;material.depthWrite = !inspecting && assemblyRef.current < 0.001;});
  });
  useEffect(() => () => {
    disposeCompressorGeometry(resources.parts);
    Object.values(resources.materials).forEach((material) => material.dispose());
    resources.maps.forEach((map) => map.dispose());
  }, [resources]);
  return <group name="compressor-model">
    {Object.entries(resources.parts).map(([name, geometry]) => <mesh key={name} name={`compressor-${name}`} geometry={geometry} material={resources.materials[name as keyof typeof resources.materials]} />)}
  </group>;
}
