import { Box3, PerspectiveCamera, Vector3 } from "three";
import { afterAll, describe, expect, it } from "vitest";
import { stage } from "@/lib/config/experience";
import { BRUSHED_MEAN, createBrushedRoughness } from "@/components/canvas/brushedTexture";
import { buildCompressorGeometry, dims, disposeCompressorGeometry } from "@/components/canvas/compressorGeometry";
import { framingFor, placeCamera } from "@/components/canvas/framing";

describe("framing", () => {
  it.each([[1440,900,"laptop"],[1024,768,"laptop"],[844,390,"phoneLandscape"],[820,1180,"tablet"],[390,844,"phone"],[360,640,"phoneShort"]] as const)("%i×%i → %s", (width,height,layout) => {
    expect(framingFor(width,height)).toBe(stage.framing[layout]);
  });
  it("reserves horizontal space for a complete machine as well as vertical space", () => {
    const width=1024,height=768;
    const slim=placeCamera(width,height,dims.height);
    const wide=placeCamera(width,height,dims.height,8);
    const distance=(p:typeof slim)=>new Vector3(...p.position).distanceTo(new Vector3(...p.target));
    expect(distance(wide)).toBeGreaterThan(distance(slim));
    expect(wide.offsetX).toBeGreaterThan(0);
    expect(placeCamera(390,844,dims.height).offsetY).toBeGreaterThan(0);
  });
  it.each([[1440,900],[1024,768],[844,390],[820,1180],[390,844],[360,640]])("keeps the complete machine inside the viewport at %i×%i", (width,height) => {
    const placement=placeCamera(width,height,dims.height+0.5,Math.hypot(dims.width,dims.depth)+0.2);
    const camera=new PerspectiveCamera(stage.camera.fovDeg,width/height,0.5,60);
    camera.position.set(...placement.position);camera.lookAt(...placement.target);
    camera.setViewOffset(width,height,placement.offsetX,placement.offsetY,width,height);camera.updateMatrixWorld();camera.updateProjectionMatrix();
    for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/8) for(const x of [-dims.width/2,dims.width/2]) for(const y of [0,dims.height]) for(const z of [-dims.depth/2,dims.depth/2]) {
      const corner=new Vector3(x,y,z).applyAxisAngle(new Vector3(0,1,0),yaw).project(camera);
      expect(Math.abs(corner.x)).toBeLessThan(1);expect(Math.abs(corner.y)).toBeLessThan(1);
    }
  });
});

describe("complete compressor geometry", () => {
  const parts=buildCompressorGeometry();
  afterAll(()=>disposeCompressorGeometry(parts));
  it("rests on its wheels and fits the declared camera/scan envelope", () => {
    const bounds=new Box3();
    for(const geometry of Object.values(parts)){geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);}
    expect(bounds.min.y).toBeCloseTo(0,4);expect(bounds.max.y).toBeLessThanOrEqual(dims.height);
    expect(bounds.max.x-bounds.min.x).toBeLessThanOrEqual(dims.width);
    expect(bounds.max.z-bounds.min.z).toBeLessThanOrEqual(dims.depth);
  });
  it("batches details into nine surfaces within a modest geometry budget", () => {
    let triangles=0;
    expect(Object.keys(parts)).toHaveLength(9);
    for(const geometry of Object.values(parts)) {
      const positions=geometry.getAttribute("position"),normals=geometry.getAttribute("normal");
      triangles+=(geometry.index?.count??positions.count)/3;
      for(let i=0;i<positions.count;i++) {
        expect(Number.isFinite(positions.getX(i)+positions.getY(i)+positions.getZ(i))).toBe(true);
        expect(new Vector3().fromBufferAttribute(normals,i).length()).toBeGreaterThan(0.9);
      }
    }
    expect(triangles).toBeLessThan(100_000);
  });
  it("keeps all physical parts inside the elliptical scanner orbit", () => {
    for (const geometry of Object.values(parts)) {
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const radial = (positions.getX(i) / stage.scan.ringRadius) ** 2 + (positions.getZ(i) / (stage.scan.ringRadius * 0.52)) ** 2;
        expect(radial).toBeLessThan(1);
      }
    }
  });
  it("places the tank label on its curved surface with outward-facing normals", () => {
    const positions=parts.badge.getAttribute("position"),normals=parts.badge.getAttribute("normal");
    for(let i=0;i<positions.count;i++) {
      const radial=new Vector3(0,positions.getY(i)-dims.tankY,positions.getZ(i));
      expect(radial.length()).toBeCloseTo(dims.tankRadius+0.004,5);
      expect(new Vector3().fromBufferAttribute(normals,i).dot(radial.normalize())).toBeGreaterThan(0.98);
    }
  });
});

describe("brushed roughness", () => {
  it("remains deterministic for metallic finishes", () => {
    const textureA=createBrushedRoughness(256,3),textureB=createBrushedRoughness(256,3);
    const a=textureA.image.data as Uint8Array,b=textureB.image.data as Uint8Array;
    expect(Array.from(a)).toEqual(Array.from(b));
    let sum=0;for(let i=1;i<a.length;i+=4)sum+=a[i];
    expect(sum/(a.length/4)/255).toBeCloseTo(BRUSHED_MEAN,1);
    textureA.dispose();textureB.dispose();
  });
});
