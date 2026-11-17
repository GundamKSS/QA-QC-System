import { MeshPhysicalMaterial, MeshStandardMaterial, ShaderLib } from "three";
import { describe, expect, it } from "vitest";
import { applyScanReveal, createScanUniforms } from "@/components/canvas/scanReveal";

type CompileShader = Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
type CompileRenderer = Parameters<MeshStandardMaterial["onBeforeCompile"]>[1];

function compileTemplate(material: MeshStandardMaterial, template: "standard" | "physical") {
  const source = ShaderLib[template];
  const shader = {
    uniforms: { ...source.uniforms },
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
  } as CompileShader;
  // No WebGL context is needed to validate the material callback contract.
  material.onBeforeCompile(shader, {} as CompileRenderer);
  return shader;
}

describe("scan reveal material integration", () => {
  it.each(["standard", "physical"] as const)(
    "keeps %s PBR and connects the same live uniforms across program variants",
    (template) => {
      const material = template === "physical"
        ? new MeshPhysicalMaterial({ metalness: 1, anisotropy: 0.65, clearcoat: 0.18 })
        : new MeshStandardMaterial({ metalness: 1 });
      const uniforms = createScanUniforms();
      applyScanReveal(material, uniforms);
      const cacheKey = material.customProgramCacheKey();
      const shader = compileTemplate(material, template);
      const instancedVariant = compileTemplate(material, template);

      uniforms.scanY.value = 1.6;
      uniforms.reveal.value = 1;
      uniforms.glow.value = 0.6;
      expect(shader.uniforms.qcheckScanY).toBe(uniforms.scanY);
      expect(instancedVariant.uniforms.qcheckReveal).toBe(uniforms.reveal);
      expect(instancedVariant.uniforms.qcheckGlow).toBe(uniforms.glow);
      expect(shader.uniforms.qcheckScanY.value).toBe(1.6);
      expect(shader.uniforms.qcheckGlow.value).toBe(0.6);
      expect(shader.uniforms.qcheckReveal.value).toBe(1);
      expect(material.customProgramCacheKey()).toBe(cacheKey);
      expect(material.metalness).toBe(1);
      if (material instanceof MeshPhysicalMaterial) {
        expect(material.anisotropy).toBe(0.65);
        expect(material.clearcoat).toBe(0.18);
      }
      expect(shader.fragmentShader).toContain("#include <lights_physical_fragment>");
      expect(shader.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(shader.vertexShader).toContain("varying vec3 vQcheckWorldPosition;");
      expect(shader.vertexShader).toContain("varying vec3 vQcheckPatternPosition;");
      expect(shader.fragmentShader).toContain("qcheckEngineeringGrid(");
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(true);
      material.dispose();
    },
  );

  it("composes an existing patch and keeps its program key", () => {
    const material = new MeshStandardMaterial();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.existingUniform = { value: 7 };
    };
    const originalKey = material.customProgramCacheKey();
    applyScanReveal(material, createScanUniforms());
    const shader = compileTemplate(material, "standard");
    expect(shader.uniforms.existingUniform.value).toBe(7);
    expect(material.customProgramCacheKey()).toContain(originalKey);
    material.dispose();
  });
});
