import { Color, type MeshStandardMaterial } from "three";
import { palette } from "@/lib/config/experience";

export type ScanUniforms = {
  /** World-space height of the inspection plane. Metal is below the plane. */
  scanY: { value: number };
  /** 0 = scan reveal; 1 = complete metal (no blueprint above the plane). */
  reveal: { value: number };
  /** Strength of the ember band where the plane crosses the surface (0–1), independent of `reveal`. */
  glow: { value: number };
};

export function createScanUniforms(): ScanUniforms {
  return { scanY: { value: -0.15 }, reveal: { value: 0 }, glow: { value: 0 } };
}

const vertexDeclarations = /* glsl */ `
varying vec3 vQcheckWorldPosition;
varying vec3 vQcheckPatternPosition;
`;

const worldPosition = /* glsl */ `
// <worldpos_vertex> only declares worldPosition for certain lighting features.
// Derive our own so the scan also works on an unlit-environment fallback.
vec4 qcheckWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  qcheckWorldPosition = batchingMatrix * qcheckWorldPosition;
#endif
#ifdef USE_INSTANCING
  qcheckWorldPosition = instanceMatrix * qcheckWorldPosition;
#endif
// Keep the grid attached to the assembled model, including its instance offsets,
// before the parent's idle/drag rotation is applied by modelMatrix.
vQcheckPatternPosition = qcheckWorldPosition.xyz;
vQcheckWorldPosition = ( modelMatrix * qcheckWorldPosition ).xyz;
`;

const fragmentDeclarations = /* glsl */ `
uniform float qcheckScanY;
uniform float qcheckReveal;
uniform float qcheckGlow;
uniform vec3 qcheckBlueprintColor;
uniform vec3 qcheckScanColor;
varying vec3 vQcheckWorldPosition;
varying vec3 vQcheckPatternPosition;

// An anti-aliased engineering grid, independent of tessellation. The coarse
// quarter-unit spacing keeps the fins readable without a dense triangle mesh.
float qcheckEngineeringGrid( vec3 patternPosition, vec3 patternNormal ) {
  vec3 grid = patternPosition * 4.0;
  vec3 width = max( fwidth( grid ), vec3( 0.0001 ) );
  vec3 distanceToLine = abs( fract( grid + 0.5 ) - 0.5 ) / width;
  vec3 lines = 1.0 - smoothstep( vec3( 0.3 ), vec3( 0.9 ), distanceToLine );
  vec3 weights = pow( abs( patternNormal ), vec3( 6.0 ) );
  weights /= max( weights.x + weights.y + weights.z, 0.0001 );
  return dot( weights, vec3(
    max( lines.y, lines.z ),
    max( lines.x, lines.z ),
    max( lines.x, lines.y )
  ) );
}
`;

const revealFragment = /* glsl */ `
float qcheckBypass = clamp( qcheckReveal, 0.0, 1.0 );
float qcheckDistance = vQcheckWorldPosition.y - qcheckScanY;
float qcheckMetal = mix(
  1.0 - smoothstep( -0.045, 0.045, qcheckDistance ),
  1.0,
  qcheckBypass
);

vec3 qcheckWorldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
// Position derivatives produce the geometric normal in the same common model
// coordinates, including rotated/scaled instances. World-space normals here
// would still make the triplanar blend slide as the parent turns.
vec3 qcheckPatternNormal = normalize( cross( dFdx( vQcheckPatternPosition ), dFdy( vQcheckPatternPosition ) ) );
float qcheckGrid = qcheckEngineeringGrid( vQcheckPatternPosition, qcheckPatternNormal );
float qcheckRim = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 3.0 );
float qcheckBlueprintAlpha = clamp( qcheckGrid * 0.48 + qcheckRim * 0.72, 0.0, 0.85 );
vec3 qcheckBlueprint = qcheckBlueprintColor * ( qcheckGrid * 0.75 + qcheckRim * 0.65 );

// A height-only band would light each horizontal fin face all at once. Limit
// the light to the vertical sides/bevels while the reveal plane still crosses
// the entire object. The restrained halo never washes a whole fin in HDR light.
float qcheckSide = 1.0 - smoothstep( 0.1, 0.65, abs( qcheckWorldNormal.y ) );
float qcheckCore = 1.0 - smoothstep( 0.004, 0.016, abs( qcheckDistance ) );
float qcheckHalo = 1.0 - smoothstep( 0.016, 0.045, abs( qcheckDistance ) );
float qcheckScan = qcheckSide * clamp( qcheckGlow, 0.0, 1.0 );
float qcheckStripe = qcheckCore * qcheckScan;
outgoingLight = mix( qcheckBlueprint, outgoingLight, qcheckMetal );
// Tint the narrow core towards scene-linear ember instead of adding a 3x HDR
// pulse to the studio reflections (AgX would turn that sum pale peach).
outgoingLight = mix( outgoingLight, qcheckScanColor * ( 0.8 + qcheckRim * 0.2 ), qcheckStripe );
outgoingLight += qcheckScanColor * qcheckHalo * qcheckScan * 0.12;
diffuseColor.a *= max(
  mix( qcheckBlueprintAlpha, 1.0, qcheckMetal ),
  qcheckStripe * ( 1.0 - qcheckBypass )
);

// Empty blueprint cells must not occlude the rear silhouette or the laser.
if ( diffuseColor.a < 0.012 ) discard;
`;

/**
 * Add a scan to Standard or Physical PBR without replacing its lights, maps or
 * anisotropy. Apply once when creating the material, then update the shared
 * uniform objects each frame; changing values does not recompile the shader.
 *
 * Alpha blending softens the blueprint. Keep depth writing for the solid metal
 * and discard empty blueprint cells, so the many overlapping fins still occlude
 * correctly. This is a surface blueprint, not an x-ray of every rear-facing fin.
 * Scene.overrideMaterial (e.g. ContactShadows) deliberately remains untouched.
 */
export function applyScanReveal(material: MeshStandardMaterial, uniforms: ScanUniforms): void {
  const previousCompile = material.onBeforeCompile;
  // Capture before replacing the callback: Three's default key reads the
  // current onBeforeCompile source, which would otherwise lose an older patch.
  const previousCacheKey = material.customProgramCacheKey();

  material.transparent = true;
  material.depthWrite = true;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.qcheckScanY = uniforms.scanY;
    shader.uniforms.qcheckReveal = uniforms.reveal;
    shader.uniforms.qcheckGlow = uniforms.glow;
    shader.uniforms.qcheckBlueprintColor = { value: new Color("#68b8e4") };
    shader.uniforms.qcheckScanColor = { value: new Color(palette.ember500) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${vertexDeclarations}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${worldPosition}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${fragmentDeclarations}`)
      .replace("#include <opaque_fragment>", `${revealFragment}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey}|qcheck-scan-reveal-v3`;
  material.needsUpdate = true;
}
