import { describe, expect, it } from "vitest";
import { Group, InstancedMesh, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { buildCompressorGeometry, dims, disposeCompressorGeometry } from "./compressorGeometry";
import { checkpointAccessories, checkpointAnchor, checkpointOffset, checkpointPositions, sampleCheckpoint } from "./Checkpoints";

describe("inspection checkpoints", () => {
  it("keeps all five stations on the near side and at their scan height through a full turn", () => {
    for (let angle = -Math.PI; angle <= Math.PI; angle += Math.PI / 12) {
      checkpointPositions.forEach((position, index) => {
        const [x, y, z] = checkpointAnchor(index, angle);
        expect(y).toBe(position[1]);
        expect(x * Math.sin(angle) + z * Math.cos(angle)).toBeGreaterThan(0);
        const surface = index === 4 ? dims.head : dims.fins;
        const corner = surface.size / 2 - surface.radius;
        const qx = Math.abs(x) - corner;
        const qz = Math.abs(z) - corner;
        const clearance = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - surface.radius;
        expect(clearance).toBeGreaterThan(0);
        expect(clearance).toBeLessThanOrEqual(0.026);
      });
    }
  });

  it("keeps marker centers clear of the actual head, pipe and filter throughout a full turn", () => {
    const parts = buildCompressorGeometry();
    const model = new Group();
    const material = new MeshBasicMaterial();
    const matrices = { fin: parts.finMatrices, rod: parts.rodMatrices, nut: parts.nutMatrices, collar: parts.collarMatrices };
    for (const [name, geometry] of Object.entries(parts)) {
      if (Array.isArray(geometry)) continue;
      const instances = matrices[name as keyof typeof matrices];
      const mesh = instances ? new InstancedMesh(geometry, material, instances.length) : new Mesh(geometry, material);
      if (instances) instances.forEach((matrix, index) => (mesh as InstancedMesh).setMatrixAt(index, matrix));
      mesh.name = name;
      model.add(mesh);
    }
    const camera = new Vector3(0.62, 0.34, 0.71).normalize().multiplyScalar(9).add(new Vector3(0, 1.15, 0));
    const ray = new Raycaster();
    const accessories = checkpointAccessories(model);
    const offsets = checkpointPositions.map(([x, , z]) => Math.atan2(x, z));
    expect(accessories).toHaveLength(4); // pipe, filter, stub and instanced collars
    try {
      for (const yaw of [38 * Math.PI / 180, ...Array.from({ length: 24 }, (_, index) => index * Math.PI / 12)]) {
        model.rotation.y = yaw;
        model.updateMatrixWorld(true);
        const localCamera = model.worldToLocal(camera.clone());
        const azimuth = Math.atan2(localCamera.x, localCamera.z);
        checkpointPositions.forEach((_, index) => {
          const offset = checkpointOffset(index, (candidate) => {
            const marker = model.localToWorld(new Vector3(...checkpointAnchor(index, azimuth, candidate)));
            ray.set(camera, marker.clone().sub(camera).normalize());
            ray.far = camera.distanceTo(marker) - 0.003;
            return ray.intersectObjects(accessories, false).length > 0;
          }, offsets[index]);
          offsets[index] = offset;
          const marker = model.localToWorld(new Vector3(...checkpointAnchor(index, azimuth, offset)));
          const distance = camera.distanceTo(marker);
          ray.set(camera, marker.sub(camera).normalize());
          ray.far = Infinity;
          const hit = ray.intersectObject(model, true)[0];
          expect(!hit || hit.distance >= distance - 0.003, `station ${index + 1} at yaw ${yaw}`).toBe(true);
        });
      }
    } finally {
      disposeCompressorGeometry(parts);
      material.dispose();
    }
  });

  it("lights each point after the laser reaches its model-local height", () => {
    checkpointPositions.forEach(([, height], index) => {
      expect(sampleCheckpoint(index, height - 0.001, 0, "idle", false).tone).toBe("dim");
      expect(sampleCheckpoint(index, height, 0, "idle", false).tone).toBe("active");
    });
  });

  it("reveals successful checks in order and finishes all five within the navigation hold", () => {
    const at = (time: number) => checkpointPositions.map((_, index) => sampleCheckpoint(index, 0, time, "success", false));
    expect(at(0.05).filter((sample) => sample.checkProgress > 0)).toHaveLength(1);
    expect(at(0.25).filter((sample) => sample.checkProgress > 0)).toHaveLength(3);
    expect(at(0.6).every((sample) => sample.checkProgress === 1 && sample.tone === "pass")).toBe(true);
  });

  it("flashes one failed checkpoint once and leaves the others dim", () => {
    const early = checkpointPositions.map((_, index) => sampleCheckpoint(index, 3, 0.05, "error", false));
    expect(early.filter((sample) => sample.tone === "fail")).toHaveLength(1);
    expect(early[2].tone).toBe("fail");
    for (const time of [0.3, 1, 10]) {
      expect(sampleCheckpoint(2, 3, time, "error", false).tone).toBe("dim");
    }
  });

  it("keeps locked points dim even after a completed scan", () => {
    checkpointPositions.forEach((_, index) => {
      expect(sampleCheckpoint(index, 3, 1, "locked", false)).toEqual({ tone: "dim", checkProgress: 0 });
    });
  });

  it("shows complete success checks immediately and skips error flashes with reduced motion", () => {
    checkpointPositions.forEach((_, index) => {
      expect(sampleCheckpoint(index, 0, 0, "success", true)).toEqual({ tone: "pass", checkProgress: 1 });
      expect(sampleCheckpoint(index, 3, 0, "error", true)).toEqual({ tone: "dim", checkProgress: 0 });
    });
  });
});
