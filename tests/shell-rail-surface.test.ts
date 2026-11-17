import { describe, expect, it } from "vitest";
import { advanceRailShape, railSurfacePath, type RailShape } from "@/components/shell/railSurface";

const closed: RailShape = {extension:0,center:104,panelHeight:76};
const open: RailShape = {extension:240,center:104,panelHeight:76};

describe("continuous sidebar surface motion", () => {
  it.each([30,60,120])("reaches the same outline after 300ms at %i fps", fps => {
    let shape = closed;
    for(let i=0;i<fps*.3;i++) shape = advanceRailShape(shape,open,1/fps,false);
    expect(shape.extension).toBeCloseTo(240*(1-Math.exp(-6)),5);
  });

  it("reverses from the currently drawn edge and follows a new menu without resetting", () => {
    const opening = advanceRailShape(closed,open,.05,false);
    const closing = advanceRailShape(opening,closed,.016,false);
    expect(closing.extension).toBeLessThan(opening.extension);
    expect(closing.extension).toBeGreaterThan(0);
    const next = advanceRailShape(closing,{...open,center:420},.016,false);
    expect(next.extension).toBeGreaterThan(closing.extension);
    expect(next.center).toBeGreaterThan(closing.center);
    expect(next.center).toBeLessThan(420);
  });

  it("uses the final shape immediately under reduced motion", () => {
    expect(advanceRailShape(closed,open,.016,true)).toEqual(open);
  });

  it.each([NaN,Infinity,-Infinity,-3,0,60])("bounds frame delta %s", delta => {
    const shape = advanceRailShape(closed,open,delta,false);
    expect(Number.isFinite(shape.extension)).toBe(true);
    expect(shape.extension).toBeGreaterThanOrEqual(0);
    expect(shape.extension).toBeLessThanOrEqual(advanceRailShape(closed,open,.05,false).extension);
  });
});

describe("one connected glass outline", () => {
  it.each([68,120,390,696,1156])("keeps a single closed, finite contour at height %i", height => {
    for(const center of [-500,0,height/2,height,height+500,NaN]) {
      for(const extension of [0,.05,1,120,240,Infinity]) {
        const path = railSurfacePath(height,{center,extension,panelHeight:100});
        expect(path.match(/M/g)).toHaveLength(1);
        expect(path.endsWith("Z")).toBe(true);
        expect(path).not.toMatch(/NaN|Infinity/);
        const numbers = path.match(/-?\d*\.?\d+/g)!.map(Number);
        expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
        for(const command of path.match(/[MHVQ][^MHVQZ]*/g)!) {
          const values = command.slice(1).match(/-?\d*\.?\d+/g)!.map(Number);
          const ys = command[0] === "V" ? values : command[0] === "H" ? [] : values.filter((_,i)=>i%2===1);
          ys.forEach(y=>expect(y).toBeLessThanOrEqual(height));
        }
      }
    }
  });
});
