import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, RingGeometry, Shape, ShapeGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { InspectionId } from "./inspectionParts";

type Point = [number, number, number];
export type DetailFinish = "blue" | "steel" | "dark" | "copper" | "red" | "ivory" | "glass";
export type DetailPiece = { id: string; finish: DetailFinish; geometry: BufferGeometry; assembled: Point; exploded: Point };

function pack(geometries: BufferGeometry[]) {
  const flat = geometries.map((geometry) => {
    if (!geometry.index) return geometry;
    const result = geometry.toNonIndexed(); geometry.dispose(); return result;
  });
  const result = mergeGeometries(flat, false)!;
  flat.forEach((geometry) => geometry.dispose());
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}
const box = (x: number, y: number, z: number) => new BoxGeometry(x, y, z);
const cylinder = (r: number, length: number, segments = 32) => new CylinderGeometry(r, r, length, segments);
const ring = (r: number, tube = 0.018) => new TorusGeometry(r, tube, 8, 36);

export function buildInspectionGeometry(kind: InspectionId): DetailPiece[] {
  const pieces: DetailPiece[] = [];
  const add = (id: string, finish: DetailFinish, geometry: BufferGeometry[], assembled: Point, exploded: Point) => pieces.push({id,finish,geometry:pack(geometry),assembled,exploded});
  if (kind === "gauge") {
    add("case","blue",[ring(0.285,0.035),cylinder(0.273,0.09).rotateX(Math.PI/2).translate(0,0,-0.055)],[0,0,0],[-0.48,0,-0.15]);
    add("mechanism","copper",[new TorusGeometry(0.16,0.025,8,32,Math.PI*1.45).rotateZ(-0.4),box(0.06,0.14,0.035).translate(0,-0.1,0)],[0,0,0.015],[-0.42,0,0.05]);
    const ticks: BufferGeometry[]=[];
    for(let i=0;i<=30;i++){const a=(-225+i*9)*Math.PI/180;ticks.push(box(i%5===0?0.045:0.025,0.007,0.008).translate(0.22,0,0).rotateZ(a));}
    add("dial","ivory",[new CircleGeometry(0.255,40)],[0,0,0.065],[-0.05,0,0.12]);
    add("dial","dark",ticks,[0,0,0.07],[-0.05,0,0.13]);
    const needle=new Shape();needle.moveTo(-0.015,-0.045);needle.lineTo(0.012,0.21);needle.lineTo(0.02,-0.045);needle.closePath();
    add("needle","red",[new ShapeGeometry(needle).rotateZ(Math.PI/3.5),cylinder(0.035,0.025).rotateX(Math.PI/2)],[0,0,0.09],[0.27,0,0.36]);
    add("glass","glass",[new CircleGeometry(0.265,40)],[0,0,0.13],[0.62,0,0.55]);
    add("glass","steel",[ring(0.272,0.014)],[0,0,0.135],[0.62,0,0.56]);
    add("fitting","copper",[cylinder(0.055,0.19,6),cylinder(0.04,0.11).translate(0,-0.13,0),...Array.from({length:5},(_,i)=>ring(0.041,0.005).rotateX(Math.PI/2).translate(0,-0.09-i*0.018,0))],[0,-0.34,-0.04],[-0.48,-0.42,-0.19]);
    add("screws","steel",[-1,1].flatMap(x=>[-1,1].map(y=>cylinder(0.021,0.09,6).rotateX(Math.PI/2).translate(x*0.19,y*0.19,0))),[0,0,0.14],[0.73,0,0.8]);
  } else if(kind === "pump") {
    add("head","blue",[box(0.61,0.13,0.54),box(0.49,0.09,0.44).translate(0,0.09,0)],[0,0.46,0],[-0.12,0.91,-0.06]);
    add("valves","steel",[box(0.55,0.025,0.49),cylinder(0.075,0.015).translate(-0.1,0.02,0),cylinder(0.075,0.015).translate(0.1,0.02,0)],[0,0.365,0],[-0.06,0.65,0]);
    add("barrel","blue",[new CylinderGeometry(0.25,0.25,0.43,32,1,true),...Array.from({length:8},(_,i)=>new RingGeometry(0.25,0.35,32).rotateX(-Math.PI/2).translate(0,-0.19+i*0.054,0))],[0,0.12,0],[-0.22,0.24,0]);
    add("piston","steel",[cylinder(0.194,0.19),cylinder(0.06,0.4).rotateX(Math.PI/2).translate(0,-0.06,0)],[0,0.18,0],[0.48,0.11,0.24]);
    add("rings","dark",[ring(0.196,0.008).rotateX(Math.PI/2),ring(0.196,0.008).rotateX(Math.PI/2).translate(0,0.038,0),ring(0.196,0.011).rotateX(Math.PI/2).translate(0,-0.04,0)],[0,0.23,0],[0.75,0.34,0.38]);
    add("rod","steel",[box(0.09,0.39,0.06),ring(0.09,0.023).translate(0,-0.23,0),ring(0.045,0.016).translate(0,0.23,0)],[0,-0.15,0],[0.13,-0.37,0.19]);
    add("crank","dark",[cylinder(0.09,0.65).rotateZ(Math.PI/2),cylinder(0.18,0.06).rotateZ(Math.PI/2).translate(0.14,0.06,0),cylinder(0.075,0.17).rotateZ(Math.PI/2).translate(0.18,0.15,0)],[0,-0.48,0],[-0.12,-0.84,0.04]);
    add("bolts","steel",[-1,1].flatMap(x=>[-1,1].map(z=>cylinder(0.018,0.46).translate(x*0.24,0,z*0.2))),[0,0.22,0],[-0.43,0.48,0.29]);
  } else {
    const ribs=Array.from({length:18},(_,i)=>{const a=i/18*Math.PI*2;return box(0.025,0.045,0.62).translate(0,0.35,0).rotateZ(a);});
    add("housing","blue",[new CylinderGeometry(0.34,0.34,0.65,40,1,true).rotateX(Math.PI/2),...ribs],[0,0,0],[-0.62,0,-0.12]);
    add("stator","copper",Array.from({length:12},(_,i)=>{const a=i/12*Math.PI*2;return new TorusGeometry(0.085,0.024,8,22).scale(1,2.4,1).rotateX(Math.PI/2).translate(0,0.24,0).rotateZ(a);}),[0,0,0],[-0.23,0,-0.02]);
    add("rotor","steel",[cylinder(0.16,0.53).rotateX(Math.PI/2),cylinder(0.045,1.02).rotateX(Math.PI/2),...Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2;return box(0.013,0.026,0.5).translate(0,0.162,0).rotateZ(a);})],[0,0,0],[0.2,0,0.23]);
    add("bearings","steel",[ring(0.1,0.023).translate(0,0,-0.31),ring(0.1,0.023).translate(0,0,0.31)],[0,0,0],[0.34,0,0.4]);
    add("fan","dark",[cylinder(0.055,0.045).rotateX(Math.PI/2),...Array.from({length:8},(_,i)=>box(0.1,0.22,0.025).translate(0,0.13,0).rotateZ(i*Math.PI/4))],[0,0,0.41],[0.64,0,0.71]);
    const grille:BufferGeometry[]=[ring(0.29,0.02)];
    for(let i=-4;i<=4;i++){const o=i*0.055;const length=Math.sqrt(0.275**2-o**2)*2;grille.push(box(length,0.012,0.018).translate(0,o,0),box(0.012,length,0.018).translate(o,0,0));}
    add("cover","blue",grille,[0,0,0.5],[0.99,0,0.94]);
    add("bolts","steel",[-1,1].flatMap(x=>[-1,1].map(y=>cylinder(0.019,0.12,6).rotateX(Math.PI/2).translate(x*0.2,y*0.2,0))),[0,0,0.54],[1.12,0,1.09]);
  }
  return pieces;
}
