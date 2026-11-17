"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Color, DoubleSide, MeshPhysicalMaterial, type Group, type Mesh } from "three";
import { buildInspectionGeometry, type DetailFinish } from "./inspectionGeometry";
import { inspectionPart, type InspectionId } from "./inspectionParts";

const finishes: Record<DetailFinish,string> = {blue:"#285db9",steel:"#bdc7d3",dark:"#394653",copper:"#c3884d",red:"#ef713a",ivory:"#e1e7e5",glass:"#99d8ec"};

export function ExplodedPart({ selected, highlighted, still, spreadRef, offset = [0, 0, 0] }: { selected: InspectionId; highlighted: string | null; still: boolean; spreadRef?: RefObject<number>; offset?: readonly [number, number, number] }) {
  const definition = inspectionPart(selected);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {invalidate();}, [invalidate, highlighted, selected]);
  const resources = useMemo(() => buildInspectionGeometry(selected).map((piece) => ({...piece,material:new MeshPhysicalMaterial({
    color:finishes[piece.finish], metalness:piece.finish === "glass" ? 0 : 0.55, roughness:0.32,
    transparent:true, opacity:piece.finish === "glass" ? 0.16 : 1, depthWrite:piece.finish !== "glass", side:DoubleSide,
  })})), [selected]);
  const root = useRef<Group>(null);
  const nodes=useRef<(Mesh|null)[]>([]);
  const progress=useRef(0);
  const orange=useMemo(()=>new Color("#ff7628"),[]);
  useEffect(()=>()=>{resources.forEach(({geometry,material})=>{geometry.dispose();material.dispose();});},[resources]);
  useFrame((_,delta)=>{
    if (spreadRef) progress.current = spreadRef.current;
    else progress.current += (1-progress.current)*(still ? 1 : 1-Math.exp(-5*Math.min(delta,0.05)));
    const amount = progress.current;
    if (root.current) {
      root.current.visible = !spreadRef || amount > 0.001;
      root.current.position.set(definition.anchor[0] + offset[0] * amount, definition.anchor[1] + offset[1] * amount, definition.anchor[2] + 0.16 + offset[2] * amount);
    }
    if (spreadRef && amount <= 0.001) return;
    resources.forEach((piece,index)=>{
      const node=nodes.current[index];
      if(node) node.position.set(
        piece.assembled[0] + (piece.exploded[0] - piece.assembled[0]) * progress.current,
        piece.assembled[1] + (piece.exploded[1] - piece.assembled[1]) * progress.current,
        piece.assembled[2] + (piece.exploded[2] - piece.assembled[2]) * progress.current,
      );
      const match=highlighted===piece.id;
      piece.material.emissive.copy(orange).multiplyScalar(match ? 0.45 : 0);
      const opacity = piece.finish === "glass" ? match ? 0.28 : 0.16 : highlighted && !match ? 0.45 : 1;
      piece.material.opacity = opacity * (spreadRef ? amount : 1);
      piece.material.depthWrite = piece.finish !== "glass" && (!spreadRef || amount > 0.99);
    });
  });
  return <group ref={root} name={spreadRef ? `username-assembly-${selected}` : "inspection-exploded-part"} renderOrder={spreadRef ? 2 : 0} visible={!spreadRef} position={[definition.anchor[0],definition.anchor[1],definition.anchor[2]+0.16]} scale={spreadRef ? 0.65 : 0.75}>
    {resources.map((piece,index)=><mesh key={`${piece.id}-${index}`} name={`detail-${piece.id}`} ref={(node)=>{nodes.current[index]=node;}} geometry={piece.geometry} material={piece.material} />)}
  </group>;
}
