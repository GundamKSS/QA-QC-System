"use client";

import { useEffect, useRef, type RefObject } from "react";
import { inspectionPart, inspectionParts, type InspectionId } from "./inspectionParts";

export function InspectionOverlay({ selected, highlighted, available, inputFocused, targets, onSelect, onHighlight, onClose }: {
  selected: InspectionId | null; highlighted: string | null; available: boolean; inputFocused: boolean;
  targets: RefObject<(HTMLButtonElement | null)[]>;
  onSelect: (id: InspectionId) => void; onHighlight: (id: string | null) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const definition = selected ? inspectionPart(selected) : null;
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (selected && !node.open) node.showModal();
    else if (!selected && node.open) node.close();
  }, [selected]);
  useEffect(() => {const node=dialog.current;return()=>{if(node?.open)node.close();};},[]);
  return <>
    <nav className="auth-inspection-hotspots" aria-label="จุดตรวจบนโมเดล" hidden={!available || !!selected || inputFocused}>
      {inspectionParts.map((part,index)=><button key={part.id} ref={(node)=>{targets.current[index]=node;}} type="button" className="auth-inspection-hotspot" aria-label={`ดูรายละเอียด${part.shortLabel}`} aria-haspopup="dialog" aria-controls="auth-inspection-dialog" onClick={()=>onSelect(part.id)} style={{visibility:"hidden"}}><span className="sr-only">{part.shortLabel}</span></button>)}
      <p className="auth-inspection-hint">คลิกจุดสีส้มเพื่อสำรวจชิ้นส่วน</p>
    </nav>
    <dialog ref={dialog} id="auth-inspection-dialog" className="auth-inspection-dialog" aria-labelledby="auth-inspection-title" aria-describedby="auth-inspection-description" onCancel={(event)=>{event.preventDefault();onClose();}} onClick={(event)=>{if(event.target===event.currentTarget)onClose();}}>
      {definition && <section className="auth-inspection-card">
        <header className="auth-inspection-heading"><div><p>สำรวจชิ้นส่วน · แยกชิ้นประกอบ</p><h2 id="auth-inspection-title">{definition.label}</h2></div><button type="button" className="auth-inspection-close" aria-label="กลับไปดูทั้งเครื่อง" onClick={onClose}>×</button></header>
        <nav className="auth-inspection-tabs" aria-label="เลือกชุดชิ้นส่วน">{inspectionParts.map(part=><button key={part.id} type="button" aria-pressed={selected===part.id} onClick={()=>onSelect(part.id)}>{part.shortLabel}</button>)}</nav>
        <p id="auth-inspection-description" className="auth-inspection-subtitle">{definition.subtitle}</p>
        <div className="auth-inspection-items" aria-label="ชิ้นส่วนย่อย">{definition.items.map((item,index)=><button type="button" key={item.id} aria-pressed={highlighted===item.id} onClick={()=>onHighlight(item.id)} onPointerEnter={()=>onHighlight(item.id)} onFocus={()=>onHighlight(item.id)}><span>{String(index+1).padStart(2,"0")}</span>{item.label}</button>)}</div>
        <p className="auth-inspection-note" aria-live="polite">{definition.items.find(item=>item.id===highlighted)?.description ?? "แตะชื่อชิ้นส่วนเพื่อไฮไลต์บนโมเดล"}</p>
        <footer><span>โครงสร้างจำลองเพื่อสำรวจชิ้นส่วน</span><button type="button" onClick={onClose}>← ดูทั้งเครื่อง</button></footer>
      </section>}
    </dialog>
  </>;
}
