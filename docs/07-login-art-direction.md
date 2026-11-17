# 07 — หน้า Login: Art Direction · Storyboard · โครงสร้างไฟล์

> สถานะ: **อนุมัติแล้ว 16 ต.ค. 2026** (ใช้ค่าตั้งต้น L1–L6 ทั้งหมด — ดู §14) · สร้างแล้ว Pass 1–4 และแก้ review Pass 3–4 ผ่านการตรวจแล้ว · สร้างแล้ว Pass 5 (ฝุ่น, vignette+grain CSS, เผยข้อความไทย); เหลือ Pass 6–7 (ดู §13 และ [บันทึกความคืบหน้า](login-progress.md)) · ปรับล่าสุด 19 ต.ค. 2026
> ขอบเขต: หน้าจอ S01 (Login) ตาม FR-AUTH-01..05
> โจทย์จากผู้ใช้: Next.js · เรียบหรู · สี **ไทเทเนียม / ดำ / ส้ม** · มีอนิเมชัน · มี 3D · ใช้ Ref prompt แบบ "Awwwards WebGL" แต่ปรับให้เข้ากับ QCheck
> เอกสารนี้เริ่มจากขั้นที่ 1 ของ Process ใน Ref (art direction + storyboard + file structure → รอ OK) และตอนนี้ใช้เป็นเอกสารอ้างอิงของหน้า Login ที่สร้างจริงด้วย — ส่วนที่ทำต่างจากแผนเขียนไว้เป็น *"ที่ทำจริง"* ในแต่ละหัวข้อ

---

## 0. สรุปสั้น

- **ภาพหลัก:** "ห้องตรวจยามค่ำ" — กระบอกสูบปั๊มลมแบบมีครีบระบายความร้อน ทำจากไทเทเนียมขัดเสี้ยน วางนิ่งในความมืด มี **วงแหวนเลเซอร์สีส้ม** กวาดตรวจขึ้นลงตามแนวกระบอกสูบ ส่วนที่เลเซอร์ผ่านจะเปลี่ยนจาก "เส้นแบบพิมพ์เขียว" เป็น "โลหะจริง" = การตรวจ QC
- **ฟอร์มมาก่อน 3D เสมอ:** ฟอร์ม Login เป็น HTML จาก Server พร้อมใช้ทันทีแม้ 3D ยังไม่โหลด/โหลดไม่ได้/เครื่องอ่อน — 3D เป็นของแถมที่ทำให้หรู ไม่ใช่สิ่งที่ขวางการทำงาน
- **ไม่มีไฟล์ 3D ภายนอก:** สร้างโมเดลและแสงด้วยโค้ดทั้งหมด (asset 0 KB) จึงใช้ได้แม้เน็ตโรงงานช้า/ออฟไลน์
- **3D อยู่เฉพาะกลุ่มหน้า Auth:** หน้าทำงานจริง (Checklist, กล้อง, สแกน) ไม่มี WebGL เพื่อไม่แย่ง GPU/แบตบนมือถือหน้างาน

---

## 1. Brief (กรอกตาม Ref)

| หัวข้อ | QCheck Login |
|---|---|
| Project | **QCheck** — ระบบตรวจรับคุณภาพปั๊มลม ธีรวัฒน์ (TRW) × PUMA |
| What it is | ประตูเข้าเว็บแอปภายใน (PWA) สำหรับ QC / QA / จัดซื้อ / ผู้บริหาร / Admin |
| Goal | รู้สึก "แม่นยำ น่าเชื่อถือ ระดับพรีเมียม" ใน 1 วินาทีแรก → แล้ว **เข้าสู่ระบบได้เร็วที่สุด** |
| Audience | พนักงานหน้างาน (มือถือ Android ราคาประหยัด / PDA / iPhone) และพนักงานออฟฟิศ (Laptop) — ใช้ทุกวัน หลายครั้งต่อวันบนเครื่องส่วนกลาง |
| Mood | Dark · Machined · Calm · Exact — มืด เงียบ แม่นยำ ไม่หวือหวา |
| Palette | ไทเทเนียม / ดำคาร์บอน / ส้ม Ember (ดู §2.2) |
| Fonts | IBM Plex Sans Thai Looped + IBM Plex Mono (ดู §2.3) |
| 3D assets | ไม่มี — สร้าง procedural ทั้งหมด |
| Copy | ร่างใน §5 (ไม่มี lorem ipsum) |
| Language | ไทยเป็นหลัก + ศัพท์เทคนิคอังกฤษ (QC, QA) |
| Chapters | หน้า Login ไม่มี scroll → ใช้ **"State storyboard"** แทน chapter (§4) |

---

## 2. Art direction

### 2.1 Mood

> เครื่องจักรที่เงียบสงบในห้องตรวจยามค่ำคืน — โลหะไทเทเนียมขัดเสี้ยนรับแสง softbox แถบเดียวจากด้านบน ขอบชิ้นงานถูกแสงส้มจากด้านหลังลูบเบา ๆ และมีเลเซอร์ตรวจสีส้มกวาดผ่านอย่างช้า แม่นยำ ไม่เร่งรีบ

คำหลัก: **แม่นยำ · หนักแน่น · เงียบ · พรีเมียมแบบเครื่องมือช่าง** (ไม่ใช่พรีเมียมแบบแฟชั่น)

สิ่งที่ **ไม่** ทำ: gradient ม่วง, ลูกบอลลอยมั่ว, glassmorphism จัด ๆ, neon หลายสี, ฟอนต์ default, ข้อความใน WebGL

### 2.2 Palette (design tokens)

| Token | Hex | ใช้กับ |
|---|---|---|
| `carbon-950` | `#08090A` | พื้นหลังลึกสุด / หมอก 3D |
| `carbon-900` | `#0E0F11` | พื้นหลังหน้า |
| `carbon-800` | `#16181B` | แผงฟอร์ม |
| `carbon-700` | `#212328` | พื้นช่องกรอก |
| `carbon-600` | `#2E3137` | เส้นตกแต่ง (hairline) |
| `ti-50` | `#F2F1EE` | ข้อความหลัก |
| `ti-200` | `#CFCDC7` | หัวข้อรอง |
| `ti-400` | `#9A9890` | Label, placeholder |
| `ti-500` | `#85837C` | ข้อความช่วย (hint) |
| `ti-600` | `#6B6A64` | ขอบช่องกรอก |
| `ti-metal` | `#8C8A84` | สีฐานโลหะใน 3D |
| `ember-500` | `#FF6B2C` | ปุ่มหลัก, focus ring, เลเซอร์ |
| `ember-400` | `#FF8A55` | hover |
| `ember-600` | `#E0541A` | pressed |
| `pass` | `#3FD08A` | สำเร็จ / ผ่าน |
| `fail` | `#F2546B` | ผิดพลาด (โทนชมพูแดง — แยกจากส้มแบรนด์ + มีไอคอน/ข้อความเสมอ) |

**Contrast (WCAG AA):**

| คู่สี | อัตราส่วน |
|---|---|
| `ti-50` บน `carbon-900` | 17.0 : 1 |
| `ti-400` บน `carbon-800` | 6.2 : 1 |
| `ti-400` (placeholder) บน `carbon-700` | 5.4 : 1 |
| `ti-500` บน `carbon-800` | 4.7 : 1 |
| ข้อความ `carbon-900` บนปุ่ม `ember-500` | 6.8 : 1 |
| `fail` บน `carbon-900` | 5.7 : 1 |
| ขอบช่องกรอก `ti-600` บน `carbon-800` (UI ≥ 3:1) | 3.3 : 1 |

> ปุ่มส้มใช้ **ตัวอักษรดำ** (ตัวขาวบนส้มได้แค่ 2.8:1 ไม่ผ่าน) — ดูหรูและอ่านง่ายกว่าด้วย

### 2.3 Typography

| บทบาท | ฟอนต์ | เหตุผล |
|---|---|---|
| UI ไทย + อังกฤษ | **IBM Plex Sans Thai Looped** (300/400/500/600) | ไทยแบบมีหัว อ่านง่าย สบายตา ชัดเจนสำหรับงานตรวจรับและฟอร์ม มีรากแบบ engineering เข้ากับงานเครื่องจักรและกลมกลืนกับ IBM Plex Mono |
| ป้ายเทคนิค / รหัส | **IBM Plex Mono** (400/500) ตัวพิมพ์ใหญ่ ระยะห่าง 0.14em | ให้ฟีล "ป้ายสเปกบนตัวเครื่อง" เช่น `QUALITY INSPECTION · TRW`, ช่องรหัสพนักงาน |
| Wordmark | **SVG วาดเอง** — "QCheck" หาง Q เป็นเครื่องหมายถูกสีส้ม | ไม่ต้องโหลดฟอนต์เพิ่ม และเป็นโลโก้ใช้ต่อใน PWA icon ได้ |

- โหลดผ่าน `next/font/google` (self-host อัตโนมัติ ไม่เรียก Google ตอนใช้งาน)
- ช่องกรอกบนมือถือ ≥ 16px (กัน iOS zoom) · ไทย line-height ≥ 1.6 (body) / ≥ 1.35 (หัวข้อ)
- อนิเมชันข้อความไทยตัดคำด้วย `Intl.Segmenter('th', { granularity: 'word' })` และ mask มี padding บน-ล่าง 0.2em กันวรรณยุกต์/สระบน-ล่างโดนตัด

### 2.4 วัสดุ แสง และบรรยากาศ 3D

- **ไทเทเนียมขัดเสี้ยน:** `MeshPhysicalMaterial` metalness 1, roughness ≈ 0.3, `anisotropy` ≈ 0.6 (ลายเสี้ยนวงรอบกระบอกสูบ), clearcoat บาง ๆ
  - *ที่ทำจริง (Pass 2):* สีวัสดุ `#C3BDB5` = ค่าสะท้อน (F0) ของไทเทเนียมจริง — สีของโลหะใน PBR คือค่าสะท้อน ถ้าใช้ token `ti-metal` `#8C8A84` ตรง ๆ จะออกมาเกือบดำ · roughness 0.32 + ลายเสี้ยนจาก DataTexture ที่สร้างในโค้ด · anisotropy 0.65 · clearcoat 0.18 · ครีบและโดมใช้ผิวพ่นทราย (satin `#A8A39C`, roughness 0.5) · น็อต/แกนยึดเหล็กรมดำ · แถบ anodize สีส้มเส้นเดียวที่ฐานโดม — ค่าทั้งหมดอยู่ `stage` ใน `lib/config/experience.ts`
- **Environment สร้างเอง:** `<Environment>` + `<Lightformer>` (softbox แถบยาวด้านบน + แถบข้าง) — ได้เงาสะท้อนแบบสตูดิโอโดยไม่ต้องโหลดไฟล์ HDRI จาก CDN
- **Key light** ขาวอมฟ้าเล็กน้อยจากบนซ้าย · **Rim light** ส้มจากหลังขวาความเข้มต่ำ
  - *ที่ทำจริง (Pass 2):* แผงแสง 7 แผ่น — softbox ยาวด้านบน, softbox ใหญ่ด้านบน-หลัง (ให้หน้าครีบรับแสง), แถบตั้ง 2 ข้าง, แผงเติมแสงหลังกล้อง, ผนังหลังจาง ๆ, rim ส้มจากหลังขวา · โลหะสะท้อนสิ่งรอบตัวเกือบทั้งหมด แผงจึงต้องใหญ่ ไม่งั้นผิวเรียบจะดำ
- **หมอก** สีเดียวกับพื้นหลัง → วัตถุจมหายในความมืดอย่างนุ่มนวล — *ไม่ได้ใช้:* canvas โปร่งใสวางบนฉากพื้นหลัง CSS (grid + vignette) ซึ่งทำหน้าที่นี้แล้ว
- **พื้น "Inspection bay":** เส้นกริดวิศวกรรมจาง ๆ (shader) ที่จางหายตามระยะ + `ContactShadows` แบบ bake ครั้งเดียว (ไม่มี real-time shadow)
- **Tone mapping:** AgX · color management ถูกต้อง (sRGB output)
- **Post-processing (เบา):** Bloom เฉพาะเลเซอร์ส้ม (threshold สูง) · Vignette · Grain บาง ๆ — ไม่ใช้ Depth of field

### 2.5 หลักการเคลื่อนไหว

| หลัก | ค่า |
|---|---|
| Easing | ข้อความ/ฟอร์ม `expo.out` · กล้อง damping (ไล่ตามเป้าแบบนุ่ม ขัดจังหวะได้ทุกเมื่อ) |
| ความเร็ว | หมุนวัตถุ idle ≈ 3°/วินาที · เลเซอร์กวาด 1 รอบ ≈ 6 วินาที |
| Parallax เมาส์ | สูงสุด 2.5° |
| Intro | ครั้งแรกของวันบนเครื่องนั้น ≤ 1.6 วิ · ครั้งถัดไป ≤ 0.5 วิ · กดคีย์/คลิกข้ามได้ |
| กระพริบ | ไม่เกิน 1 ครั้งต่อเหตุการณ์ (เกณฑ์ ≤ 3 ครั้ง/วินาที) |

---

## 3. แนวคิด 3D: "Titanium Cylinder" (แนะนำ)

กระบอกสูบปั๊มลมลูกสูบ (ภาพที่คนในโรงงานเห็นทุกวัน) ตีความใหม่ให้เป็นวัตถุหรู

| ชิ้นส่วน | วิธีสร้าง |
|---|---|
| ตัวกระบอกสูบ | `LatheGeometry` / `CylinderGeometry` |
| ครีบระบายความร้อน ~14 แผ่น | `RoundedBox` ทรงเหลี่ยมมุมมน + **Instancing** (1 draw call) |
| ฝาสูบ + น็อต 4 ตัว | Geometry + Instancing |
| ท่อลมเข้า/ออก | `TubeGeometry` |
| วงแหวนเลเซอร์ส้ม | Torus บาง + emissive (ติด Bloom) |
| จุดตรวจ (checkpoint) 5 จุด | จุดเล็กบนผิว ติดสีส้มเมื่อเลเซอร์ผ่าน → กลายเป็น ✓ เมื่อ login สำเร็จ |
| ฝุ่นในลำแสง | Points + shader (จำนวนตาม quality tier) |

**Signature shader — "Scan-Reveal":** แทรกเข้า `MeshPhysicalMaterial` ด้วย `onBeforeCompile` (ยังได้แสง PBR ครบ) มี uniform `uScanY`
- ใต้แนวเลเซอร์ = โลหะไทเทเนียมจริง · เหนือแนว = เส้นพิมพ์เขียวโปร่ง (wire/edge) สี ti-400
- แถบเลเซอร์มี emissive ส้ม + fresnel เรืองที่ขอบ
- ใช้เล่าเรื่อง: เปิดหน้า = เครื่องถูก "ตรวจ" ให้เห็นทีละส่วน, login สำเร็จ = ตรวจครบทุกจุด

**ทางเลือก B — "Q-Ring":** มู่เล่/พูลเลย์ไทเทเนียม ซี่ล้อจัดเป็นรูปตัว Q หางเป็น ✓ สีส้ม — นามธรรมกว่า เป็นโลโก้ได้ แต่ผูกกับงานตรวจน้อยกว่า A

---

## 4. Storyboard (ตามสถานะ แทน chapter)

| # | State | HTML | 3D บนจอ | กล้อง | เปลี่ยนไปถัดไป |
|---|---|---|---|---|---|
| 0 | **Boot** | ฟอร์มพร้อมใช้แล้ว (ซ่อนด้วย opacity เท่านั้น ไม่ block) · เส้น progress ส้มบาง ๆ ตามการโหลด 3D จริง | — | — | 3D พร้อม หรือครบ 600 ms (อะไรถึงก่อน) |
| 1 | **Reveal** | Wordmark → หัวข้อ (ตัดคำไทย) → ช่องกรอก ไล่ขึ้นทีละชั้น | เลเซอร์กวาดจากล่างขึ้นบน เปิดผิวโลหะจากพิมพ์เขียว | เริ่มใกล้ครีบ (macro) → ถอยออกตาม spline สู่มุม 3/4 | จบ timeline (≤ 1.6 วิ / ≤ 0.5 วิ ครั้งถัดไป) |
| 2 | **Idle** | ฟอร์มนิ่ง | หมุนช้า · เลเซอร์กวาดทุก ~6 วิ · เหนือเลเซอร์เป็นพิมพ์เขียวโปร่ง ใต้เลเซอร์เป็นโลหะ (ผู้ใช้ยืนยันแล้ว) · ฝุ่นเพิ่มใน Pass 5 | parallax ตามเมาส์ ≤ 2.5° รวมทุกแกน | focus ช่องกรอก |
| 3 | **Focus / Typing** | ช่องที่ focus มีเส้นส้มใต้ | เลเซอร์หยุดค้างกลางกระบอก · ไฟ rim อุ่นขึ้น · พิมพ์รหัสผ่าน = วงแหวนแรงดันเติมเต็มทีละนิด | ช่องรหัสพนักงาน: ขยายโมเดลเป็นพื้นหลังกลางจอและหรี่ภาพ; ช่องรหัสผ่าน: push-in 6% ในกรอบเดิม | กด "เข้าสู่ระบบ" |
| 4 | **Submitting** | ปุ่มเป็นสถานะกำลังตรวจสอบ (`aria-busy`) | เลเซอร์กวาดเร็วต่อเนื่อง | นิ่ง | ผลจาก Server |
| 5a | **Success** | ข้อความ "ยินดีต้อนรับ, ชื่อ" | checkpoint ทั้ง 5 → ✓ ทีละจุด · วงแหวนปิดเป็นเครื่องหมายถูก | พุ่งเข้าหาปากกระบอกสูบ → fade เป็นสีพื้นหลัง | เข้า `/home` (≤ 900 ms) |
| 5b | **First login** | ไปหน้า "ตั้งรหัสผ่านใหม่" (บังคับ FR-AUTH-02) | ฉากเดิม (Canvas ไม่ถูกสร้างใหม่) — *Pass 1 ยังเป็น full navigation; Pass 7 เปลี่ยนเป็น soft navigation เฉพาะภายในกลุ่ม (auth) ได้ เพราะไม่มีหน้าของผู้ใช้คนก่อนค้างอยู่* | เลื่อนมุมเล็กน้อย | ตั้งรหัสเสร็จ → Success |
| 6 | **Error** | ข้อความ error + ไอคอน (`aria-live`) · ฟอร์มสั่นแนวนอน 1 ครั้ง (ไม่สั่นถ้า reduced motion) | checkpoint 1 จุดเป็นสี fail ครั้งเดียว | นิ่ง | พิมพ์ใหม่ → Focus |
| 7 | **Locked** | "บัญชีถูกล็อกชั่วคราว" + เวลาปลดล็อก (ข้อความคงที่ใน alert) · นับถอยหลัง mm:ss อยู่บนปุ่ม · focus กลับไปช่องรหัสพนักงาน (ล็อกเฉพาะรหัสนั้น คนอื่นใช้เครื่องต่อได้) | ไฟหรี่ · เลเซอร์ดับ (standby) | ถอยออกเล็กน้อย | ครบเวลา → Idle |
| 8 | **Offline** | แถบสถานะ "ออฟไลน์ — ต้องเชื่อมต่อเพื่อเข้าสู่ระบบ" (หายเองเมื่อกลับมาออนไลน์ จึงไม่มีปุ่มลองใหม่ · กดส่งตอนออฟไลน์ = ประกาศแถบซ้ำ) | ปกติ | ปกติ | กลับมาออนไลน์ |

> เป้าหมาย flow: ถ้า session ยังไม่หมดอายุให้เข้าแอปตรง; ถ้า session หมดอายุกลางงานให้ login ผู้ใช้เดิมแล้วกลับไปหน้าร่าง (FR-AUTH-05) · ปัจจุบัน `/login` เป็น static และไม่อ่าน session จึงยังไม่ข้ามหน้า Login อัตโนมัติเมื่อเปิด URL นี้โดยตรง และยังไม่มี flow กลับหน้าร่าง

**ที่ทำจริงหลัง review Pass 3–4 (19 ต.ค. 2026):**

- Boot แสดงฟอร์ม HTML ก่อนโหลด 3D; Reveal ใช้สแกนขึ้นพร้อมกล้องถอยเล็กน้อย 1.4/0.45 วินาที และข้ามได้ด้วยคลิก/คีย์ · ยังไม่มี progress โหลด, macro/spline หรือการเผยข้อความทีละชั้น (งาน polish Pass 5)
- Idle ใช้พิมพ์เขียวเหนือเลเซอร์ทุกวงรอบตามที่ผู้ใช้เลือก เส้นตารางยึดกับตัวโมเดลขณะหมุน; แถบเรืองจำกัดอยู่ที่ด้านข้าง/ขอบ ไม่เรืองทั้งหน้าครีบ
- Focus แสดงโลหะเต็มและเลเซอร์หยุดกลางกระบอก; ช่องรหัสพนักงานขยาย/ย้ายโมเดลมาเป็นพื้นหลังกลางจออย่างต่อเนื่องและลดความสว่างเพื่อให้ฟอร์มอ่านง่าย เมื่อออกจากช่องจะย่อกลับ · ช่องรหัสผ่านใช้กล้องดันเข้า 6% ในกรอบเดิม; วงแรงดันเติมตามเวลาเมื่อมีสัญญาณพิมพ์ ไม่รับข้อความ/ความยาวรหัสผ่าน
- เปลี่ยนสถานะใช้ตำแหน่งเลเซอร์ล่าสุดแล้ว blend 180 ms ไปยังสถานะใหม่; shader กับวงเลเซอร์ใช้ frame เดียวกัน · reduced motion เปลี่ยนเป็นภาพนิ่งทันที
- Success แสดงจุดตรวจเขียวตามลำดับและตราถูกหน้าวัตถุ ปิดแถบส้มบนผิวเพื่อไม่ให้วิ่งแยกจากวงเขียว; เคลื่อนกล้อง/fade โดยรออย่างน้อย 650 ms และรอเฟดทั้งหน้าจบก่อนนำทาง (reduced motion ใช้ตราทันทีและรอ 150 ms)
- Error กระพริบที่จุดเดียวหนึ่งครั้ง; Locked หรี่ไฟและปิดเลเซอร์; Offline ยังหมุน/สแกน/parallax ตามปกติ · ข้อความและการจัดการ auth ยังคงอยู่ใน HTML
- จุดตรวจรักษาระดับความสูงการสแกน แต่ตำแหน่ง/ทิศของสัญลักษณ์ปรับตามกล้องเพื่อให้อ่านได้เมื่อวัตถุหมุน · รายละเอียดการตรวจและงานที่เหลืออยู่ใน [login-progress.md](login-progress.md)

---

## 5. Copy

ข้อความที่ใช้จริงอยู่ใน `lib/config/experience.ts` (`loginCopy`) · หัวข้อปัจจุบันปรับจากตัวเลือก ก. ที่ใช้ตอนเริ่มงาน

| ตำแหน่ง | ข้อความ |
|---|---|
| Eyebrow (mono) | `QUALITY INSPECTION · TRW × PUMA` |
| หัวข้อปัจจุบัน (2 บรรทัด) | "QCheck · ตรวจทุกเครื่อง" / "ครบทุกจุด" |
| คำโปรย | ซ่อนอยู่ (`lead: null`); ใส่ข้อความใน config เพื่อเปิดย่อหน้าได้ |
| Label 1 | รหัสพนักงาน |
| Label 2 | รหัสผ่าน (+ ปุ่มแสดง/ซ่อน) |
| ปุ่ม | เข้าสู่ระบบ → ระหว่างรอ: "กำลังตรวจสอบ…" |
| ใต้ปุ่ม | "ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ (Admin) เพื่อรีเซ็ต" — ไม่มีลิงก์สมัคร/รีเซ็ตเอง (FR-AUTH-02) |
| Caps Lock (laptop) | "Caps Lock เปิดอยู่" |
| แป้นพิมพ์ไทยค้าง | "รหัสผ่านมีอักษรไทย — ตรวจว่าแป้นพิมพ์เป็นภาษาอังกฤษ" |
| Error | "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง" (ไม่บอกว่าผิดช่องไหน) |
| เตือนก่อนล็อก (ผิดครั้งที่ 3–4) | "เหลืออีก 2 ครั้ง ก่อนบัญชีถูกล็อก 15 นาที" |
| Locked | ข้อความ: "บัญชีถูกล็อกชั่วคราว — ลองใหม่ได้เวลา 10:15 น. หรือติดต่อ Admin" · ปุ่ม: "ลองใหม่ได้ในอีก 14:32" (ตัวเลขที่เปลี่ยนทุกวินาทีไม่อยู่ใน alert เพื่อไม่ให้ screen reader อ่านซ้ำทุกวินาที) |
| เครื่องส่วนกลาง (แผน Pass 7) | "เครื่องส่วนกลาง · ออกจากระบบอัตโนมัติเมื่อไม่ใช้งาน 30 นาที" — ยังไม่ได้เปิดใช้ |
| Footer (mono) | `QCheck v1.0 · © 2026 Tirawatgroup` |

---

## 6. Layout

| หน้าจอ | องค์ประกอบ |
|---|---|
| **Laptop ≥ 1024 px** | Canvas เต็มจอ · วัตถุอยู่ซ้าย-กลาง (≈ 55% ของจอ) · แผงฟอร์มทางขวา กว้าง 420 px บนพื้น `carbon-800` โปร่ง 85% + เส้นขอบ hairline ไทเทเนียม · wordmark มุมซ้ายบน · footer mono มุมซ้ายล่าง |
| **แท็บเล็ต 768–1023** | วัตถุกลางบน · แผงฟอร์มกลางล่าง |
| **มือถือแนวตั้ง < 768** | องค์ประกอบใหม่ ไม่ใช่ย่อจาก desktop: วัตถุครึ่งบน ~38dvh (กล้อง FOV กว้างขึ้น + ตำแหน่งต่างจาก desktop) · ฟอร์มเป็น bottom sheet · ปุ่มสูง 52 px · รองรับ safe-area |
| ↳ *ที่ทำจริง (Pass 1)* | พื้นที่วัตถุ 30svh (จอเตี้ย ≤ 700 px: 20svh) แทน 38dvh — เพื่อให้ปุ่มเข้าสู่ระบบอยู่ในจอแรกบนมือถือ 360×640 · ใช้ svh ไม่ใช่ dvh เพราะ dvh เปลี่ยนขนาดตอน toolbar ของเบราว์เซอร์ยุบ ทำให้ฟอร์มกระโดด |
| **มือถือ + คีย์บอร์ดเปิด** | ตรวจด้วย `visualViewport` → ซ่อนวัตถุ 3D (fade) และหยุด render ให้ฟอร์มเต็มพื้นที่ |
| **แนวนอน (มือถือ)** | วัตถุซ้าย ฟอร์มขวา แบบย่อ |

---

## 7. Interaction

| สิ่งที่ทำ | รายละเอียด |
|---|---|
| Mouse parallax | ≤ 2.5° เฉพาะอุปกรณ์ที่มี hover |
| ลากหมุนวัตถุ | แกน Y ±35° มีแรงเฉื่อย ปล่อยแล้วค่อยกลับท่าเดิม · ใช้ `eventSource` ของ R3F ให้ทำงานใต้ HTML |
| โฟกัสช่องรหัสพนักงาน | ขยายโมเดลเป็นฉากหลังกลางจออย่างนุ่มนวลและหรี่ภาพ; blur/Tab ไปช่องอื่นย่อกลับต่อเนื่อง · ไม่ทำการซูมเมื่อ reduced motion และให้ submitting/success/locked มีลำดับความสำคัญสูงกว่า |
| Hover บนวัตถุ | ครีบที่ถูกชี้สว่างขึ้นเล็กน้อย + cursor `grab` |
| Keyboard | Tab เรียง รหัสพนักงาน → รหัสผ่าน → แสดงรหัส → เข้าสู่ระบบ · Enter ส่ง · focus ring ส้มชัดเจน |
| ตัดออกจาก Ref | Click-to-focus info panel, custom cursor, เสียง ambient — ไม่เหมาะกับหน้า login ของระบบงาน |

---

## 8. Performance — Quality tiers

| Tier | เมื่อไร | DPR | Effects | ฝุ่น |
|---|---|---|---|---|
| **High** | Laptop / มือถือแรง | ≤ 2 | Bloom + Vignette + Grain + anisotropy | 600 |
| **Medium** | มือถือทั่วไป หรือ `PerformanceMonitor` ลดระดับ | ≤ 1.5 | Vignette + Grain (glow เลเซอร์ใช้ sprite แทน Bloom) | 150 |
| **Low** | fps < 30 ต่อเนื่อง | 1 | ไม่มี post · `frameloop="demand"` (render เฉพาะตอนเปลี่ยน state) | 0 |
| **Static** | ไม่มี WebGL · `deviceMemory ≤ 2` · Save-Data · เครื่องส่วนกลางที่ Admin ตั้ง "Lite" | — | ภาพนิ่ง AVIF ที่ render จากฉากจริง + เส้นเลเซอร์ CSS | — |

**งบประมาณ:**
- JS หน้า Login (ไม่รวม 3D): **โค้ดของแอป ≤ 20 KB gz** บน baseline ของ React 19 + Next 16 (วัดจริง Pass 1: รวม ~139 KB gz ซึ่ง ~135 KB เป็น runtime ของ framework ที่ลดไม่ได้ · LoginForm ~4.5 KB) — เดิมตั้ง ≤ 120 KB รวม ซึ่งต่ำกว่า baseline ตั้งแต่ยังไม่มีโค้ด · ฟอร์มกดได้ก่อน 3D เสมอ
- 3D chunk (three + R3F + drei ที่ใช้) โหลดแบบ `next/dynamic` `ssr:false` หลัง first paint / idle
  - *วัดจริง 19 ต.ค. (production build):* JS ตอนเปิดหน้า Login 141.6 KB gz (เท่าก่อนมี 3D) · 3D chunk 270 KB gz โหลดหลัง `load` + idle เท่านั้น · Save-Data / RAM ≤ 2 GB / ไม่มี WebGL2 → ไม่โหลดเลย
- Draw calls < 40 · ไม่มี texture (procedural) · GPU memory < 64 MB
  - *วัดจริง:* 25 draw calls · ~23k triangles · texture 7 ตัว (สร้างในโค้ดทั้งหมด) · DPR สูงสุด 1.75 และลดเป็น 1 เมื่อ `PerformanceMonitor` เห็นว่า fps ตก
- หยุด render เมื่อ: แท็บถูกซ่อน, คีย์บอร์ดมือถือเปิด, ไม่มีอะไรขยับ (Low tier) · dispose ทุก resource เมื่อออกจากกลุ่มหน้า Auth
- เป้า: 60 fps laptop ทั่วไป / 30+ fps มือถือระดับกลาง

---

## 9. Accessibility · Fallback · Security

- **prefers-reduced-motion:** ไม่มี camera fly-through/parallax/สั่น → crossfade 200 ms · วัตถุ 3D นิ่ง
- ข้อความทั้งหมดเป็น HTML จริง · `<h1>` · label ผูกกับ input · error ผูกด้วย `aria-describedby` · Canvas เป็น `aria-hidden`
- ผลการส่งฟอร์ม (ผิด/ล็อก/ปิดใช้งาน) อยู่ใน `role="alert"` ที่ถูกล้างระหว่างรอ server — error เดิมซ้ำก็ถูกอ่านใหม่ · error ของแต่ละช่อง, Caps Lock, แป้นไทย ใช้ `aria-live="polite"` · ระหว่างรอ: ปุ่ม `aria-busy` + ข้อความ "กำลังตรวจสอบ…" ใน `role="status"`
- ข้อความภาษาอังกฤษ (eyebrow, footer) ใส่ `lang="en"` และเก็บเป็นตัวพิมพ์ปกติ ทำตัวใหญ่ด้วย CSS
- **ฟอร์ม login ต้องใช้ JavaScript** (26 ต.ค. 2026 — ตัดสินใจใน [19](19-api-routes-plan.md) ขั้น 6 แทนข้อเดิมที่ว่า "ทำงานได้แม้ JS ไม่โหลด ด้วย `<form action={serverAction}>`"): ส่งผ่าน `POST /api/auth/login` ปุ่มถูกล็อกและเขียน "กำลังเตรียม…" จนหน้าพร้อม (JS ที่ต้องโหลด ~184 KB gzip ส่วนฉาก 3D ~279 KB โหลดทีหลังตอนเบราว์เซอร์ว่าง จึงไม่ทำให้ฟอร์มช้า) · ข้อความที่พิมพ์ระหว่างรอไม่หาย (React ไม่เขียนทับค่าในช่องตอน hydrate) และ Enter ส่งก่อนเวลาไม่ได้เพราะปุ่มหลักถูกปิด · ตัวฟอร์มไม่มี URL ให้ส่งแบบเปล่า ๆ จึงไม่มีทางที่รหัสผ่านจะไปต่อท้าย URL · ถ้าปิด JavaScript มีข้อความ `<noscript>` บอกให้เปิด · เครือข่ายหลุดกลางทางแสดง "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" ในฟอร์ม · ออกจากระบบยังเป็นฟอร์ม POST ธรรมดา ไม่ต้องใช้ JS
- `autocomplete="username"` / `"current-password"` ให้ password manager ทำงาน · ไม่บล็อก paste
- ข้อความ error ไม่บอกว่าผิดช่องไหน · ล็อก 5 ครั้ง/15 นาที ทำฝั่ง Server (จองสิทธิ์ก่อนตรวจรหัส — ยิงคำขอพร้อมกันก็ตรวจได้ไม่เกิน 5 ครั้ง) · ทุก login/logout ลง Audit log (FR-AUD-01) พร้อม IP/User-Agent · สิ่งที่พิมพ์ในช่องรหัสพนักงานถูกบันทึกเฉพาะเมื่อตรงกับรหัสจริง (กันรหัสผ่านที่พิมพ์ผิดช่องหลุดลง log)
- เป็นระบบภายใน: `robots: noindex, nofollow` (ไม่ทำ SEO/Open Graph แบบเว็บการตลาด — มีแค่ title, icon, manifest)
- เป้า Lighthouse Accessibility ≥ 90

---

## 10. สิ่งที่ปรับจาก Ref prompt

| Ref | ใน QCheck Login | เหตุผล |
|---|---|---|
| Scroll chapters + Lenis + ScrollTrigger | ไม่ใช้ → State storyboard (§4) | หน้า Login ไม่มี scroll (จะเพิ่ม Lenis เมื่อมีหน้าที่ scroll เป็นเรื่องราวจริง) |
| Canvas ใน root layout | Canvas ใน `app/(auth)/layout.tsx` | คงอยู่ข้ามหน้า Login → เปลี่ยนรหัส → เลือกผู้ใช้ แต่ไม่ติดเข้าไปในหน้าทำงาน |
| Loader ก่อนเข้า hero | ฟอร์มไม่ต้องรอ loader · intro สั้นและข้ามได้ | ผู้ใช้ login ทุกวันหลายครั้ง |
| glTF + Draco + KTX2 | ไม่มีไฟล์ — procedural | asset 0 KB, ใช้ offline ได้ |
| HDRI environment | `Lightformer` สร้างในโค้ด | ไม่พึ่ง CDN |
| SEO + Open Graph | noindex | ระบบภายใน |
| Click-to-focus, custom cursor, sound | ตัด | ไม่ช่วยงาน login |
| leva (`?debug`) + r3f-perf | เก็บไว้ (dev เท่านั้น) | ใช้จูนสี/แสง/กล้อง |

---

## 11. Stack (เช็คเวอร์ชันจาก npm เมื่อ 16 ต.ค. 2026)

| Package | เวอร์ชันที่วางแผน | ติดตั้งจริง (19 ต.ค.) | หมายเหตุ |
|---|---|---|---|
| `next` | 16.4.x | **16.4.2** | App Router + TypeScript + Turbopack · `cacheComponents` เปิด |
| `react` / `react-dom` | 19.x (< 19.4) | **19.3.0** (ล็อก) | R3F 9 รองรับ React `>=19 <19.4` |
| `three` | 0.186.x | **0.186.1** | |
| `@react-three/fiber` | 9.8.x | **9.8.2** | |
| `@react-three/drei` | 10.7.x | **10.7.9** | ใช้ Environment, Lightformer, ContactShadows, PerformanceMonitor (RoundedBox ไม่ได้ใช้ — ครีบใช้ ExtrudeGeometry) |
| `@react-three/postprocessing` | 3.2.x | ไม่ติดตั้ง | Pass 5 ตัดสินใจไม่ใช้: glow อยู่ใน shader, vignette/grain ทำด้วย CSS |
| `gsap` + `@gsap/react` | 3.15 / 2.1 | **ไม่ใช้** | timeline ของ intro/กล้องเขียนเป็นฟังก์ชันล้วน (`scanTimeline.ts`, `cameraMotion.ts`) ทดสอบได้ด้วย unit test |
| `maath` | — | ไม่ติดตั้งตรง (มากับ drei) | damping เขียนเอง (`interactionMotion.ts`) |
| `zustand` | 5.x | **ไม่ใช้** | สถานะฟอร์ม → ฉาก ใช้ store เล็ก ๆ ด้วย `useSyncExternalStore` (`lib/auth-stage.ts`) |
| `tailwindcss` | 4.x | **4.x** | tokens ผ่าน `@theme` |
| `jose` · `vitest` | — | **6.2 · 5.0** | session cookie (A256GCM) · unit test |
| `@serwist/next` | 9.x | ยังไม่ติดตั้ง | ใช้ตอนทำ offline/PWA |
| `leva`, `r3f-perf` | dev only | ไม่ใช้ | ใช้ `window.__qcheckStage` (dev) อ่าน `gl.info` แทน |

> **ผลต่อเอกสารเดิม:** DEC-02 ใน 04 เดิมเสนอ React + Vite — เปลี่ยนเป็น **Next.js (App Router)** ตามที่ตัดสิน · ส่วน offline-first ยังทำได้ด้วย Serwist + IndexedDB และหน้าทำงานเป็น client component เป็นหลัก

---

## 12. โครงสร้างไฟล์

> 26 ต.ค. 2026: ย้ายออกจาก `src/` ให้เหมือนโปรเจกต์ log-book — `app/` `components/` `lib/` อยู่ที่ root, `config/` กับ `hooks/` ไปอยู่ใน `lib/`, `scripts/` → `tools/`, `wireframes/` → `docs/wireframes/` ผังด้านล่างเป็นภาพตอนเริ่มทำ (ดูโครงสร้างปัจจุบันใน README)

```
QCheck/
├─ docs/ · wireframes/                  (เดิม)
├─ package.json · next.config.ts · tsconfig.json · eslint.config.mjs
├─ public/
│  ├─ brand/qcheck-mark.svg
│  └─ auth/poster-landscape.avif · poster-portrait.avif   ← ภาพ fallback (render จากฉากจริง)
└─ src/
   ├─ app/
   │  ├─ layout.tsx                ← html lang="th", ฟอนต์, metadata (noindex)
   │  ├─ globals.css               ← Tailwind v4 @theme จาก tokens
   │  ├─ (auth)/
   │  │  ├─ layout.tsx             ← วาง <AuthStage/> ครั้งเดียว (คงอยู่ข้ามหน้า auth)
   │  │  ├─ login/page.tsx
   │  │  ├─ login/actions.ts       ← Server Action
   │  │  ├─ change-password/page.tsx    (รอบถัดไป)
   │  └─ (app)/home/page.tsx       ← หน้าหลังเข้าสู่ระบบ (placeholder, ไม่มี WebGL)
   ├─ components/
   │  ├─ canvas/   AuthStage · Scene · CompressorCylinder · ScanRing · Checkpoints
   │  │            · Dust · StudioLights · InspectionFloor · CameraRig · Effects · QualityGovernor
   │  └─ dom/      LoginForm · Field · PasswordField · SubmitButton · Wordmark
   │               · ThaiReveal · StaticStage · IntroGate · StatusBar
   ├─ shaders/     scanReveal.ts · inspectionFloor.(vert|frag).glsl · dust.(vert|frag).glsl
   ├─ hooks/       useQualityTier · useReducedMotion · useKeyboardInset · useIntroPolicy · useThaiSegments
   ├─ store/       authStage.ts            ← Zustand
   ├─ config/      experience.ts           ← สี, keyframe กล้อง, timing, tiers, copy — ค่าที่จูนได้อยู่ไฟล์เดียว
   └─ lib/auth/    types.ts · mock-adapter.ts · rate-limit.ts · session.ts
```

**โครงสร้างที่สร้างจริง (19 ต.ค. 2026):**

```
src/
├─ app/
│  ├─ layout.tsx · globals.css · icon.svg      ← ฟอนต์, metadata noindex, BfcacheGuard, tokens
│  ├─ (auth)/layout.tsx                        ← <AuthStage><StaticStage/></AuthStage>
│  ├─ (auth)/login/  page · actions.ts · error.tsx
│  ├─ (auth)/change-password/page.tsx          ← placeholder (ฟอร์มจริง Pass 7)
│  ├─ (app)/layout.tsx                        ← shell + fade ทั้งหน้า; fallback สีพื้น
│  ├─ (app)/alerts/page.tsx · more/page.tsx     ← แจ้งเตือน/บัญชี + page guard
│  ├─ (app)/home/page.tsx                      ← Home ข้อมูลตัวอย่าง + page guard (ไม่มี WebGL)
│  └─ auth/logout/route.ts                     ← POST → 303 /login
├─ components/
│  ├─ canvas/  AuthStage · Scene · CompressorCylinder · compressorGeometry · brushedTexture
│  │           · StudioLights · framing · CameraRig · cameraMotion · ModelInteraction
│  │           · interactionMotion · ScanRing · Checkpoints · scanReveal (shader) · scanTimeline
│  │           (+ *.test.ts) — มี Dust แล้ว · ยังไม่มี: InspectionFloor, Effects, QualityGovernor (Pass 6)
│  ├─ shell/   AppSidebar · TopAppBar · BottomTabBar · ShellLink · nav
│  └─ dom/     LoginForm · Wordmark · StaticStage · SignOutButton · BfcacheGuard
│              (Field/PasswordField/SubmitButton รวมอยู่ใน LoginForm · ThaiReveal/IntroGate/StatusBar ยังไม่มี)
├─ hooks/      useBrowserState (hydrated/online/reduced-motion/countdown) · useStageTier (3D ได้ไหม + รอ idle)
├─ config/     auth.ts (นโยบาย login, path) · experience.ts (สี, copy, ค่า stage ทั้งหมด)
└─ lib/        auth-stage.ts (สถานะฟอร์ม → ฉาก) · auth/ (types · mock-users · mock-adapter · attempts
               · password · session · dal · page-access · roles · authenticate · datacenter-adapter
               · audit · employee-code · same-origin)
```

> ต่างจากแผน: shader อยู่ใน `components/canvas/scanReveal.ts` (ไม่มีโฟลเดอร์ `shaders/`) · ไม่มี `store/` (ไม่ใช้ Zustand) · ไม่มี `public/brand` (โลโก้เป็น SVG ใน `Wordmark.tsx` และ `app/icon.svg`) · poster fallback: `public/auth/poster-landscape.avif` (32 KB) และ `poster-portrait.avif` (15 KB)

---

## 13. ลำดับการสร้าง (หลังได้ OK)

| Pass | งาน | สิ่งที่ให้ตรวจหลังจบ pass | สถานะ |
|---|---|---|---|
| 1 | Scaffold + tokens + ฟอนต์ + ฟอร์ม Login (HTML ล้วน) + Server Action แบบ mock | login ได้/ผิด/ล็อก ครบ, ใช้คีย์บอร์ดได้, มือถือไม่ zoom | ✅ เสร็จ · review แล้ว (42 ข้อ แก้ครบ) |
| 2 | Canvas + กระบอกสูบ procedural + แสงสตูดิโอ + วัสดุไทเทเนียม | ความรู้สึก "หรู" ของโลหะ สีไทเทเนียมถูกใจไหม | ✅ เสร็จ · รอผู้ใช้ดูโลหะ/สี |
| 3 | Shader Scan-Reveal + intro + state storyboard | จังหวะ intro, ความเร็วเลเซอร์ | ✅ แก้ผล review และตรวจ Chrome แล้ว — ดูผลด้านล่าง |
| 4 | Interaction (parallax, ลากหมุน, typing/success/error) | ความนุ่มของกล้อง, success transition | ✅ แก้ผล review และตรวจ Chrome แล้ว — ดูผลด้านล่าง |
| 5 | Polish: post, grain, ข้อความไทย reveal, copy | วรรณยุกต์ไม่โดนตัด, อ่านง่าย | ✅ ฝุ่น + vignette/grain (CSS) + เผยข้อความไทยทีละคำ — ดูสถานะ implementation; ไม่ทำ Bloom (เลเซอร์เรืองใน shader แล้ว) |
| 6 | Quality tiers, ภาพ fallback, reduced motion, a11y, ทดสอบเครื่องจริง | fps บนมือถือจริง, Lighthouse ≥ 90, ไม่มี console error | ⬜ ยังไม่เริ่ม (reduced motion + fallback พื้นฐานมีแล้ว) |
| 7 | ~~เลือกผู้ใช้/PIN~~ และ ~~ตั้งรหัสใหม่~~ — **ตัดแล้ว** (DEC-11, DEC-09) เหลือแค่หมดเวลาไม่ใช้งานบนเครื่องส่วนกลาง | | ⬜ ดู [10](10-pass7-shared-device-plan.md); logic พร้อมแล้ว ยังไม่ต่อ UI |

### สถานะ implementation — 19 ต.ค. 2026

- **Pass 1–2:** มีฟอร์ม mock auth และฉากกระบอกสูบไทเทเนียมพร้อมแสงสตูดิโอแล้ว
- **Pass 2 (ปิดงาน 19 ต.ค.):** กระบอกสูบ procedural — ครีบเหลี่ยม 12 แผ่น (instanced), ฝาสูบ, โดม + แถบส้ม, แกนยึด 4 เส้น + น็อตหกเหลี่ยม, ท่อลมออก, ไส้กรองอากาศ · วางวัตถุตามแต่ละ layout ด้วย lens shift (`camera.setViewOffset`) ค่าแยก laptop / tablet / มือถือ / มือถือจอเตี้ย / แนวนอน · ฉาก 3D โหลดหลังฟอร์มพร้อมเสมอ · ตรวจแล้ว: render 5 ขนาดจอ, reduced motion, `?stage=static`, WebGL context หลุด/ฟื้น, คลิกฟอร์มไม่โดน canvas · ยังไม่ได้ทดสอบบน GPU มือถือจริง (Pass 6)
- **Scan-Reveal:** ระหว่าง idle สแกนวนทุก 6 วินาที โดยเหนือแนวเลเซอร์เป็นเส้นพิมพ์เขียวโปร่งและใต้แนวเป็นโลหะไทเทเนียม · uniform `glow` แยกจาก `reveal` เพื่อให้เส้นเรืองส้มยังทำงานเมื่อแสดงโลหะเต็มระหว่างกรอก/ส่งฟอร์ม และ reduced motion; ปิดแถบส้มบนผิวเมื่อ success
- **Pass 3:** เพิ่ม shader Scan-Reveal, วงเลเซอร์พร้อม glow, intro ถอยกล้องเล็กน้อย และสแกนวน 6 วินาที · เริ่มวันใหม่ 1.4 วินาที/กลับมาในวันเดียวกัน 0.45 วินาที (Asia/Bangkok) · คลิกหรือกดคีย์เพื่อข้าม intro โดยฟอร์มพร้อมใช้ตลอด
- ฉากรับสถานะจริงจากฟอร์ม: focus = หยุดสแกนและเห็นโลหะเต็ม แต่โมเดลยังหมุนช้า 0.8°/วินาที (ปรับตามผู้ใช้ยืนยัน 19 ต.ค. 2026) โดยลด/เพิ่มความเร็วอย่างต่อเนื่องจาก idle 3°/วินาที; reduced motion ยังคงนิ่ง · submitting = สแกนเร็ว, success = เลเซอร์เขียวแล้วจาง, locked = ดับเลเซอร์ · รับเฉพาะสถานะ ไม่มีค่าช่องกรอกส่งเข้า WebGL
- Reduced motion ใช้โลหะเต็มและวงเลเซอร์นิ่ง, ซ่อนแท็บแล้วพัก render, WebGL หลุดใช้ฉากสำรองและกลับมาได้เมื่อ context ฟื้น · ค่าเวลาอยู่ `lib/config/experience.ts` ใน `stage.scan`
- **Pass 4:** กล้อง parallax บนเมาส์ ≤ 2.5°, ลากหมุนแกน Y ±35° พร้อมแรงเฉื่อยและค่อย ๆ กลับท่าเดิม, hover ครีบ, กล้องดันเข้า 6% และแสงอุ่นเมื่อกรอก · วงแรงดันตอบสนองต่อสัญญาณเริ่มพิมพ์ ไม่รับข้อความหรือความยาวรหัสผ่าน
- จุดตรวจ 5 จุดเปลี่ยนเป็นเครื่องหมายถูกสีเขียวตามลำดับ, วงเลเซอร์เปลี่ยนเป็นตราถูก แล้วกล้องเคลื่อนเข้าและจางก่อนเปลี่ยนหน้า · รออย่างน้อย 650 ms แล้วรอเฟดทั้งหน้าจบและวาดเฟรมที่ปิดภาพก่อนนำทาง; รหัสผิดกระพริบเตือนที่จุดเดียวหนึ่งครั้ง · reduced motion แสดงผลสำเร็จทันทีและใช้ช่วงรอเดิม 150 ms
- ตรวจใน Chrome และมือถือจำลองแล้ว: การลากไม่ดึงโฟกัสจากฟอร์ม, ปัดแนวตั้งบนโมเดลยังเลื่อนหน้าได้, จอ 360 px ในสถานะ focus อยู่กลางและไม่ทับฟอร์ม · การทดสอบเครื่องจริงและ Lighthouse ยังคงอยู่ Pass 6
- **Review Pass 3–4:** ตรวจต่อครบด้าน storyboard, React/R3F, interaction และภาพเคลื่อนไหว · แก้การเลือกข้อความ/หลุด focus ตอนลาก, ย้าย non-passive touch listener มาเฉพาะ gesture บนโมเดล, จำกัด parallax รวมทุกแกนและให้ทำงาน offline · memo แสง/เงาที่ bake ไว้ และสร้างใหม่เฉพาะเมื่อ context ฟื้น · ดูผลตรวจใน [login-progress.md](login-progress.md)
- **ส่งต่อเข้า Home:** ช่วงท้ายเครื่องซูมมี veil สี carbon-900 ปิดทั้งฟอร์ม/StaticStage/Canvas; รอ CSS exit animation จบก่อน full navigation แล้ว App shell ทั้งหน้าเฟดเข้า 560 ms พร้อมเนื้อหา Home; ไม่แสดง shell skeleton แวบคั่น และ reduced motion ข้ามเอฟเฟกต์
- **ระบบกลางจริงและ RBAC:** ยืนยัน TEST001–TEST009 ครบ 9 บทบาทผ่าน Login/PRG003/เมนูคอมและมือถือ/บัญชี/Logout; Home/แจ้งเตือน/บัญชีใช้ server page guard แล้ว ส่วนโมดูลธุรกิจยังไม่เปิดใช้ · กติกาและข้อจำกัดตาม [09 §8](09-app-shell.md#8-กติกาสิทธิ์หน้าจอที่ใช้ร่วมกัน)
- **ผลตรวจล่าสุด 19 ต.ค. (ตอนนั้น):** 150 tests (ปัจจุบัน 231) รวม Login กลาง, App shell และสิทธิ์หน้า/เมนู, lint, typecheck และ production build ผ่าน · Chrome จอคอม 1440×900, มือถือจำลอง 390×844/360×640 และ reduced motion ผ่าน · จุดตรวจทั้ง 5 ทดสอบ 24 มุมหมุนใน browser และ 125 ตำแหน่งใน actual-geometry test · การตรวจบนมือถือจริง/Lighthouse และ flash threshold อยู่ Pass 6
- **Username backdrop:** โฟกัสรหัสพนักงานขยายฉากหลังกลางจอและหรี่ภาพ; blur/Tab ย่อกลับต่อเนื่อง · ค่าจูน `stage.interaction.usernameBackdrop`; reduced motion ไม่ซูม และ auth states มีลำดับสูงกว่า · ส่งเฉพาะ boolean focus เข้า 3D
- **Pass 5 (19 ต.ค. 2026):** ฝุ่น `Dust.tsx` (Points + shader ตัวเดียว 220 เม็ด, วนในกล่องรอบโมเดล, หยุดเมื่อ reduced motion, +1 draw call = 26) · vignette + grain เป็น CSS overlay ใน `AuthStage` (ไม่ติดตั้ง `@react-three/postprocessing`, bundle 3D ไม่เพิ่ม, ใช้ได้ทุก tier และกับ StaticStage) · เผยหัวข้อทีละคำ `ThaiReveal.tsx` ใช้ `Intl.Segmenter("th")` แบ่งคำ, CSS ล้วน, ข้อความอยู่ใน DOM ตั้งแต่แรก (ปิดเมื่อ reduced motion) · ค่าจูน: `stage.dust`, `stage.finish`, `motion.thaiReveal` · Bloom ไม่ทำ · Dust ยังไม่แยกจำนวนตาม tier (Pass 6) · ตรวจ Chrome จอคอมแล้ว ยังไม่ได้ตรวจมือถือจริง
- **Pass 6 ข้อ 1 — quality level (19 ต.ค. 2026):** `quality.ts` แบ่ง high/medium/low เริ่มจากสัญญาณเครื่อง (จอสัมผัส, ≤ 6 คอร์, ≤ 4 GB → medium) แล้ว `PerformanceMonitor` ลดทีละขั้น ไม่ขึ้นกลับ · high = DPR ≤ 1.75 + ฝุ่น 220, medium = 1.5 + 80, low = 1 + 0 · ทดสอบบังคับระดับด้วย `?quality=high|medium|low` · ค่าอยู่ `stage.quality` · ต่างจากตาราง §8: ยังไม่ใช้ `frameloop="demand"` ที่ Low (เลเซอร์จะหยุดวน) และ grain/vignette เป็น CSS ทุกระดับ · 154 tests ผ่าน
- **Pass 6 ข้อ 2 — poster Static (19 ต.ค. 2026):** render จาก canvas 3D จริง (high, โฟกัสรหัสผ่านให้เห็นโลหะเต็ม) ที่ 1440×900 และ 390×844 แล้วแปลงเป็น AVIF มีโปร่งใส · `StaticPoster` ใน `AuthStage.tsx` ใช้ `<picture>` เลือกภาพตาม aspect ratio, `object-cover`, โหลดเฉพาะ tier static (3D tier ไม่ดึงไฟล์) · ภาพเป็นท่าเดียว จึงต้อง render ใหม่ถ้าเปลี่ยนรูปทรง/framing โมเดล · ตรวจ `?stage=static` จอคอมแล้ว ยังไม่ได้ตรวจ portrait บน Static
- **Pass 6 ข้อ 3 — ตรวจ a11y (19 ต.ค. 2026, Chrome จอคอม):** ผ่าน — `lang="th"`, landmark banner/main, h1 เดียว, ฉาก 3D/poster เป็น `aria-hidden`, label ผูกกับช่องทั้งสอง, `autocomplete` username/current-password, live region (status/alert) ครบ, ลำดับ Tab ถูก (รหัสพนักงาน → รหัสผ่าน → ปุ่มแสดง → เข้าสู่ระบบ) ไม่มี tabindex บวก, focus ring ขึ้นเมื่อกด Tab (2px) · คอนทราสต์ข้อความบนแผ่นฟอร์มต่ำสุด 4.68:1 (ข้อความรอง/footer) ผ่าน AA 4.5 · poster portrait บน Static ตรวจแล้ว (390×844 ไม่มีเลื่อนแนวนอน) · **ยังไม่ได้ตรวจ:** การอ่านข้อความ error/locked ด้วย screen reader จริง (ไม่ลองรหัสผิดกับระบบกลางเพราะนับเข้าการล็อกบัญชี — พึ่ง unit test ของฟอร์ม) และคอนทราสต์ของข้อความที่ทับภาพ 3D
- **Pass 6 ข้อ 4 — Lighthouse (19 ต.ค. 2026, production build, Chrome headless บน Mac ตัวนี้, จำลอง CPU 4× / 4G):**
  - Desktop: Performance 100 · A11y 100 · Best Practices 100 · SEO 60 (LCP 0.6 s, TBT 0, CLS 0)
  - Mobile (มี 3D): Performance **63** · A11y 100 · BP 100 · SEO 60 — FCP 0.8 s, LCP 3.1 s, CLS 0, **TBT 5.46 s** (Script Evaluation ~8 s จาก chunk three/R3F ที่โหลดหลัง idle) → ต่ำกว่าเป้า ≥ 90
  - Mobile `?stage=static`: Performance **94** (TBT 20 ms, LCP 3.1 s) → เกณฑ์ผ่านเมื่อไม่มี 3D
  - SEO 60 เกิดจาก `noindex` ที่ตั้งใจ (ระบบภายใน) ไม่ใช่ข้อบกพร่อง
  - LCP 3.1 s บนมือถือจำลองมาจากฟอนต์ 10 ไฟล์ (~110 KB: Plex Thai 4 น้ำหนัก × thai/latin + Mono 2 น้ำหนัก) ที่ preload พร้อมกัน; องค์ประกอบ LCP คือคำว่า "Check" ใน Wordmark
  - ข้อจำกัด: เป็นค่าจากห้องแล็บบน Mac (WebGL แบบซอฟต์แวร์) ไม่ใช่มือถือจริง; ยังไม่ได้ลดงานหรือหน่วง 3D
- **งานถัดไป Pass 6:** ตัดสินใจเรื่อง TBT ของ 3D บนมือถือ, ลดน้ำหนักฟอนต์, ทดสอบมือถือจริง (ต้องให้ผู้ใช้ลอง); Pass 7 ตามตารางเดิม

---

## 14. คำถามก่อนเริ่ม — ตอบแล้ว 16 ต.ค. 2026

ผู้ใช้ตอบ "ใช้ค่าตั้งต้น L1–L6 ทั้งหมด"

| # | คำถาม | คำตอบ | ผลในงาน |
|---|---|---|---|
| L1 | แนวคิด 3D: A "Titanium Cylinder" หรือ B "Q-Ring" | **A** | กระบอกสูบครีบระบายความร้อน (§3) |
| L2 | ทำ UI + mock auth ก่อน หรือ Backend จริงเลย | **UI + mock auth** (ค่าเริ่มต้น) | ปัจจุบันมี Login กลางตาม [08](08-central-auth-plan.md); demo เลือก `QCHECK_AUTH=mock` และ production demo ต้องเปิด `QCHECK_MOCK_AUTH=on` เพิ่ม · ข้อมูลธุรกิจยังเป็นตัวอย่าง |
| L3 | มีโลโก้ QCheck / TRW ที่ต้องใช้ไหม | **วาด wordmark ใหม่** | `Wordmark.tsx` + `app/icon.svg` (วง Q หางเป็นเครื่องหมายถูกสีส้ม) |
| L4 | รหัสพนักงานเป็นตัวเลขล้วนไหม | **ตัวอักษร+ตัวเลข** | `inputmode="text"`; ปัจจุบันรักษา case เพื่อส่งชื่อให้ระบบกลาง ส่วน mock/ตัวนับล็อกใช้ค่า normalize |
| L5 | หัวข้อ copy ก. / ข. / ค. | **ก.** (ค่าเริ่มต้น) | เดิม "ตรวจทุกเครื่อง มั่นใจทุกแรงลม"; ข้อความปัจจุบันดู §5 |
| L6 | วาง Next.js ที่ root ของโฟลเดอร์ QCheck | **ใช่ ใช้ `src/`** | ภายหลัง (26 ต.ค. 2026) ย้ายออกจาก `src/` ตามโครงสร้าง log-book |

**ยังเปิดอยู่ (ไม่ขวางหน้า Login):** Backend/DB จริง (DEC-02) · นโยบายเครื่องส่วนกลาง (หมดเวลา 30 นาที; ไม่มี PIN) ก่อนต่อ idle เข้า UI
