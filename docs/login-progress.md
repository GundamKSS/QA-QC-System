# ความคืบหน้าหน้า Login — 19 ต.ค. 2026

> **จุดที่หยุด (19 ต.ค. 2026):** Login ระบบกลางจริงครบ 9 บทบาท + **ผู้ใช้หน้างานเข้าด้วย PIN (DEC-12) พร้อมหน้า Admin จัดการผู้ใช้และบังคับเปลี่ยน PIN** · Pass 1–6 เสร็จ (เหลือทดสอบมือถือจริง) · SQL Server เชื่อมจากเครื่องพัฒนาได้แล้ว (TLS trust ตั้งเฉพาะ `.env.local`); พบตารางแอป 20 ตาราง แต่ยังไม่มีประวัติ `schema_migrations` · 231 tests ผ่าน · Home ยังเป็นข้อมูลตัวอย่าง · แผน: [07](07-login-art-direction.md), [08 Login กลาง](08-central-auth-plan.md), [09 App shell](09-app-shell.md)

## 1. สถานะปัจจุบัน

- ตั้ง `PIN_PEPPER` ฝั่งเซิร์ฟเวอร์เครื่องพัฒนาแล้ว และ Chrome ตรวจ Server Action ผ่านด่านการตั้งค่าไปถึงการตรวจชื่อ-นามสกุลได้ โดยใช้ฟอร์มว่างที่ไม่สร้างข้อมูล · ต้องเก็บค่านี้ให้คงเดิมเมื่อ restart/deploy และตั้ง server environment บนเครื่องปลายทางด้วย; ยังไม่ทดสอบสร้างผู้ใช้จริงในรอบนี้

- แก้ TLS SQL Server บนเครื่องพัฒนา: DATACENTER เดิมใช้ `TrustServerCertificate=yes` แต่ QCheck เดิมใช้ false; ตั้ง `DB_ENCRYPT=on` + `DB_TRUST_CERT=on` เฉพาะ `.env.local` แล้ว โดยคงค่า default ใน source/`.env.example` เดิม · เชื่อม QCheck จริงได้ และ Chrome เปิด `/admin/users` อ่าน SQL store ได้แล้ว (LOCAL 0 คน)
- พบ schema รุ่นเดิมมี `pin_hash` แล้ว แต่ขาด `nickname`, `pin_must_change`, `updated_by`; เพิ่มและรันเฉพาะ `008_users_schema_repair.sql` ใน transaction เติมคอลัมน์/FK ที่ขาด โดยไม่แก้ migration 003 ที่เคยรัน · ทดสอบ repair ซ้ำและตรวจจำนวนผู้ใช้ไม่เปลี่ยน; ไม่รัน seed · ยังไม่มี `schema_migrations` จึงยังไม่ยืนยันประวัติ runner ทั้งชุดหรือความครบทุก constraint ของ Master
- ผลตรวจรอบซ่อม DB: 37 tests ของ `lib/db` ผ่าน และตรวจคิวรีรายชื่อ/หน้า Admin กับ SQL Server จริงผ่าน; การเพิ่ม/แก้ไขผู้ใช้/PIN บน DB จริงยังไม่ทดสอบ และตั้ง `PIN_PEPPER` ใน `.env.local` แล้วด้วยค่าสุ่ม 32 bytes (ไม่แสดง/บันทึกค่าลงเอกสาร)

- ยืนยันบัญชีระบบกลางจริง `TEST001`–`TEST009` ครบ 9 บทบาทแล้ว: API ส่ง PRG003/role ถูกต้อง และ Chrome Login → Home → แจ้งเตือน → บัญชี → Logout ผ่านทุกบัญชี ทั้งเมนู desktop 1440px และ mobile 390px; ไม่แก้ข้อมูลหรือรหัสผ่านในระบบกลาง
- ใช้ `lib/auth/page-access.ts` เป็นกติกากลางของเมนูและ server guard `requirePageAccess`; Home/แจ้งเตือน/บัญชีตรวจใน data loader ของตัวเอง · หน้าโมดูลอนาคตยังไม่เปิดใช้ และต้องเรียก guard พร้อมกรองสิทธิ์ข้อมูล/การกระทำเมื่อสร้างโมดูล
- แก้ Login บัญชี `DEV` บนเครื่องพัฒนา: log ยืนยันว่าระบบกลางรับบัญชีแล้ว แต่ถูกปฏิเสธเพราะยังไม่เปิด `QCHECK_ALLOW_DEV_ROLE`; ตั้ง `.env.local` เป็น `on` แล้ว (production ยังไม่อนุญาตบทบาทนี้)
- Login เลือก `QCHECK_AUTH=central` (ค่าตั้งต้น) หรือ `mock` ได้ชัดเจน; mock ไม่เรียก API และ central ไม่ fallback เป็น demo อัตโนมัติ
- โฟกัสช่องรหัสพนักงานแล้วโมเดลขยาย/หรี่เป็นฉากหลังกลางจอ และย่อกลับเมื่อ Tab ไป password หรือคลิกออก; reduced motion ไม่ซูม
- โฟกัส username/password แล้วโมเดลยังหมุนช้า 0.8°/วินาที โดยค่อย ๆ ลดจาก idle 3°/วินาที และกลับความเร็วเดิมเมื่อออกจากช่อง; username backdrop ยังไม่รับการลาก และ reduced motion ยังนิ่ง
- มี Home ข้อมูลตัวอย่าง, Sidebar/4 mobile tabs, ค้นหาแผน, แจ้งเตือนว่าง และหน้าเพิ่มเติมสำหรับบัญชี/logout
- เข้าหน้า Home แล้วข้อมูลเฟดพร้อมเลื่อนขึ้นเล็กน้อย 480ms ไล่ส่วนหัว/การ์ด/ตารางห่างกันสูงสุด 170ms; reduced motion แสดงทันที
- เก็บจังหวะ Login → Home ทั้งหน้า: ช่วงท้ายของเครื่องซูมจะเฟดฟอร์ม/ฉากหลังทั้งหมดเป็นสีพื้นเดียวกับแอป และรอเฟดครบก่อน full navigation (650ms เป็นเวลาขั้นต่ำ); Sidebar/Top bar/เนื้อหา/แท็บล่างเฟดรับพร้อมกัน 560ms ไม่แสดง shell skeleton แวบคั่น · Chrome ตรวจเฟรมจริงจอ 1440/390/360px ว่าจางครบก่อนออกและเริ่มหน้าใหม่จาก opacity 0; ใช้ API จำลองบนเครื่อง
- ผู้ใช้ยืนยัน idle แบบ **เหนือเลเซอร์เป็นเส้นพิมพ์เขียวโปร่ง ใต้เลเซอร์เป็นโลหะ** วนทุก 6 วินาทีแล้ว พฤติกรรมนี้จึงไม่ใช่ bug
- ตรวจต่อครบด้าน storyboard, React/R3F, interaction และภาพเคลื่อนไหวกับโค้ดปัจจุบัน โดยยืนยันด้วย tests และ Chrome
- ตรวจ Login กลางทั้ง fixture และบัญชีทดสอบระบบกลางจริงครบ 9 บทบาทแล้ว · ข้อมูลแผน/ผลตรวจยังเป็น demo ไม่มี backend ธุรกิจ และยังไม่ได้ทดสอบมือถือจริง

- Pass 5 เสร็จ: ฝุ่น `Dust.tsx` (26 draw calls), vignette+grain CSS ใน `AuthStage`, เผยหัวข้อทีละคำ `ThaiReveal.tsx` · 150 tests, lint, typecheck, build ผ่าน; ตรวจ Chrome จอคอมแล้ว ยังไม่ได้ตรวจมือถือจริง/Lighthouse (Pass 6)

## 2. สถานะแต่ละ Pass

| Pass | งาน | สถานะ |
|---|---|---|
| 1 | ฟอร์ม + mock auth + session/logout | เสร็จ; review เดิม 42 ข้อแก้ครบ |
| 2 | Canvas + procedural cylinder + แสง/ไทเทเนียม | เสร็จ; ความชอบเรื่องสี/โลหะยังรอผู้ใช้ดู |
| 3 | Scan-Reveal + intro + storyboard | แก้ผล review และตรวจใน browser แล้ว |
| 4 | Parallax + drag + typing/success/error | แก้ผล review และตรวจใน browser แล้ว |
| 5 | Polish: ฝุ่น, vignette+grain, ข้อความไทย reveal | เสร็จ 19 ต.ค.; ใช้ CSS แทน post-processing (ไม่มี Bloom) |
| 6 | Quality tiers, fallback, a11y, มือถือจริง, Lighthouse | quality level high/medium/low เสร็จแล้ว (`?quality=` ทดสอบได้); poster สำรอง Static เสร็จ (AVIF 32/15 KB); a11y พื้นฐานตรวจแล้ว; Lighthouse วัดแล้ว: desktop 100, mobile 63 (มี 3D, TBT 5.5 s) / 94 (static) — ดู docs/07; เหลือ Lighthouse, มือถือจริง; reduced motion/fallback พื้นฐานมีแล้ว |
| 7 | หมดเวลาไม่ใช้งานบนเครื่องส่วนกลาง (PIN กลับมาสำหรับผู้ใช้หน้างานตาม DEC-12 — แผน [12](12-field-users-pin-plan.md); หน้าตั้งรหัสใหม่ตัดตาม DEC-09) | logic + test พร้อม ([10](10-pass7-shared-device-plan.md)); ยังไม่ต่อ UI/session |

## 3. ลำดับที่ทำในรอบนี้

- [x] ใช้ตัวเลือก idle ที่ผู้ใช้ยืนยันไว้แล้ว และแบ่งเจ้าของไฟล์ที่แก้ชัดเจน
- [x] ยืนยันข้อค้นพบเดิมกับ source และพฤติกรรมจริง รวมด้าน storyboard และ React/R3F ที่ค้าง
- [x] แก้ shader/ภาพ ตามด้วยการเปลี่ยนสถานะ, การลาก และการ bake แสง/เงา
- [x] รัน tests/lint/typecheck/build และตรวจ Chrome จอคอม มือถือจำลอง และ reduced motion
- [x] อัปเดต “ที่ทำจริง” ใน §4 และสถานะ implementation ใน §13 ของ docs/07 พร้อมบันทึกงานที่เหลือ

### งานเพิ่มเติมที่เก็บต่อ

- [x] Username backdrop: ส่งแค่ boolean focus, ขยาย/ย่อ/จัดเลนส์ต่อเนื่องและหรี่ภาพ; คลิกโมเดลพื้นหลังเพื่อออกจากช่องได้
- [x] ตรวจ 3D ห้าโหมดและการสลับช่อง/ขัดจังหวะเร็ว โดยไม่ย้ายฟอร์มหรือ bake แสงซ้ำ
- [x] แก้ props ของ App shell, เอาหน้าจริงออกจาก skeleton เพื่อไม่ render ซ้ำ และเผื่อ safe-area แท็บมือถือ
- [x] แยก central/mock, รักษา case ของ username หลังรหัสผิด, ตรวจชนิด permission flags, dev role แบบ opt-in และ audit เฉพาะบัญชีที่ยืนยันแล้ว
- [x] Home ค้นหาได้จริง, KPI มาจาก fixtures, เมนูอนาคต disabled แทน 404 และมี logout บนมือถือ
- [x] ให้โมเดลหมุนช้าขณะ focus และต่อจังหวะเฟดทั้งหน้า Login → Home โดยรอ exit animation จบก่อนเปลี่ยนหน้า
- [x] รวมกติกาสิทธิ์ใน `page-access.ts`; Home/แจ้งเตือน/บัญชีตรวจผ่าน `requirePageAccess` ใน data loader
- [x] แก้ sidebar/mobile tabs ตามหน้าที่ รวม QA Head เข้าสแกนและผู้ตรวจดูรายงานตามกติกา; Admin ไม่ได้สิทธิ์แผน/งาน QC โดยอัตโนมัติ
- [x] ทดสอบบัญชีระบบกลางจริง TEST001–TEST009 ครบ 9 บทบาท: Login, เมนูคอม/มือถือ, บทบาทในบัญชี, Logout และเข้าหน้าหลัง Logout ไม่ได้

## 4. ผลยืนยันและการแก้

| ข้อค้นพบเดิม | ผล / การแก้ |
|---|---|
| Idle กลับเป็นพิมพ์เขียวทุกวงรอบ | เป็นตัวเลือกที่ผู้ใช้ยืนยัน; เก็บไว้ และใช้โลหะเต็มเมื่อกรอก/ส่งฟอร์ม/สำเร็จ/reduced motion |
| แสงสแกนท่วมหน้าครีบ | ยืนยันว่าแถบตาม Y ทำให้หน้าครีบแนวนอนเรืองทั้งแผ่น; จำกัดแสงตามด้านข้าง/ขอบ ลด core/halo และใช้สี ember แทนการบวก HDR แรง ๆ |
| เส้นพิมพ์เขียวไหลตอนหมุน | พิกัดตารางและ normal ของ pattern ยึดกับโมเดลหลัง instance transform; ระดับสแกนยังใช้ world Y |
| เลเซอร์กระโดดเมื่อเปลี่ยนสถานะ | เริ่มจาก frame ล่าสุด แล้ว blend ระดับ/reveal/opacity ใน 180 ms; ขัดจังหวะซ้ำได้โดยเริ่มจากภาพที่เห็นอยู่ |
| แถบส้มแยกจากวงเขียวตอน success | ปิด surface glow ตอน success |
| ตราถูกถูกโมเดลบัง | เฉพาะตราถูกใช้ depthTest=false และ render หลังโมเดล; วงสแกนจริงยังตรวจ depth |
| จุดตรวจหันหนี/ถูกบัง | วางบนด้านเข้ากล้อง รักษาความสูงเดิม และหันสัญลักษณ์เข้ากล้อง; จุดบนฝาสูบใช้ขอบฝาสูบจริง มีการตรวจท่อ/ไส้กรองและเลือกตำแหน่งใกล้เคียงที่ไม่ถูกบังแบบ cache |
| จุดตรวจเล็กบนมือถือ | วงมีขนาดประมาณ 9 CSS px โดยจำกัดการขยาย |
| วงแรงดันเหมือนเส้นเหลื่อม | ใช้รัศมีเดียวกับวงสแกนและแทนเส้น core ระหว่างเติม |
| ลากแล้วเลือกข้อความ/หลุด focus | ก่อนแก้เลือกข้อความ 188 ตัวและ focus ไป BODY; หลังแก้ยกเลิก default เฉพาะ mouse gesture บนโมเดล และคืน user-select เมื่อจบ/ยกเลิก |
| เปลี่ยนสถานะแล้ว bake แสง/เงาซ้ำ | ก่อนแก้ 32 offscreen render ต่อ focus/blur; memo แล้วเหลือ 0 และ bake ใหม่เมื่อ WebGL context ฟื้น |
| Non-passive touchmove ทั้งหน้า | เปิดเฉพาะ touch gesture ที่เริ่มบนโมเดล; ล้างเมื่อจบ/ปัดแนวตั้ง/cancel |
| Parallax แนวทแยงเกินเพดาน | จำกัดงบมุมร่วมของสองแกนและทดสอบ quaternion ≤ 2.5° |
| Offline ปิด parallax | ให้ offline ใช้กล้องปกติเช่น idle |
| Reduced motion อาศัย frame จากการ bake ซ้ำ | ขอ frame เมื่อ typing เปลี่ยนโดยตรง; เริ่ม/ล้างรหัสผ่านอัปเดตวงได้ครั้งละ 1 frame |

เพิ่มเติม: รองรับ loginCopy.lead=null และซ่อนย่อหน้าที่ไม่มีคำโปรย เพื่อให้ copy ปัจจุบันผ่าน typecheck โดยคงหัวข้อ/ข้อความของผู้ใช้ไว้

## 5. ผลตรวจ

**ผลล่าสุดหลังเก็บงานทั้งสองส่วน — 19 ต.ค. 2026:**

- `npm test` **231 tests ผ่าน** (เดิม 150 → รวม PIN/ผู้ใช้หน้างาน/audit ลงตาราง/ตรวจ migration), lint/typecheck/production build ผ่าน · เพิ่มตารางสิทธิ์ทุกบทบาท, เมนู desktop/mobile และ server guard กรณีมี/ไม่มีสิทธิ์หรือไม่มี session
- Username backdrop ผ่าน Chrome 1440×900, 390×844, 360×640, reduced motion และ static fallback; form ไม่ขยับ, Tab/password ย่อกลับ, blur/สลับเร็วทำงาน และ 0 offscreen bake เพิ่ม
- Production build + API กลางจำลอง: ไม่มี PRG003, dev role ใน production, response ผิดรูปแบบ, บัญชีปิด, รหัสผิด 5 ครั้งแล้วล็อก และระบบกลางล่ม 6 ครั้งโดยไม่ล็อก
- Login-to-Home ผ่าน QC Head/QC Inspector/QA Inspector บนคอมและมือถือ: ค้นหาเจอ/ไม่เจอ, แจ้งเตือน, เพิ่มเติม, logout ล้าง cookie และ Home หลัง logout กลับ Login; ไม่พบ page/console error
- Home มือถือกว้างพอดีอุปกรณ์: 390/360 px โดยตรวจ `scrollWidth` เทียบขนาดอุปกรณ์; ตารางเลื่อนภายในกรอบได้ และข้อความช่วยอ่านของเมนู disabled ไม่ล้นออกจากตาราง
- รอบทดสอบอนิเมชันก่อนหน้านี้ใช้ API fixture ในเครื่อง โดยเปิดอนิเมชันปกติจาก username backdrop ไปสู่ success และ Home; การยืนยันบัญชีระบบกลางจริงรอบล่าสุดสรุปใน §5.1

**หลักฐานเดิมจากรอบ review Pass 3–4:**

- Automated ผ่านครบ: `npm test` (85 tests), `npm run lint`, `npm run typecheck`, `npm run build`
- Regression: scan ที่ถูกขัดจังหวะ, live shader uniforms, มุม parallax และ checkpoint/reduced motion รวม actual-geometry raycast หลายมุม
- `/login` ยัง prerender เป็น static และโหลดฉาก 3D ภายหลัง

| รายการ | ผล Chrome / มือถือจำลอง |
|---|---|
| 1440×900, 390×844, 360×640 | shader compile, ไม่มี horizontal overflow หรือ console/page error |
| Idle / Focus | เห็นพิมพ์เขียว/โลหะตามแนวสแกน; focus เห็นโลหะเต็มและเลเซอร์อยู่กลาง |
| Focus/blur GPU work | 0 offscreen render เพิ่ม; context restore สร้าง environment ใหม่และแสดงต่อได้ |
| จุดตรวจตลอดการหมุน | Chrome 24 มุมห่างกัน 15°: ทั้ง 5 หันเข้ากล้องและ center ไม่ถูกโมเดลบัง; actual-geometry unit test ตรวจ 125 ตำแหน่งรวมมุมเริ่มต้น |
| Success จอคอม / มือถือ | ตราถูกเห็นจริง, ครบ 5 จุด, surface glow ส้มเป็น 0; เปลี่ยนหน้าประมาณ 640–652 ms ในรอบที่วัด |
| Reduced motion | demand rendering, ภาพนิ่ง, success ครบ 5 จุดและตราทันที; เปลี่ยนหน้าประมาณ 137–146 ms |
| Draw calls | 25 ปกติ; 26 ใน demand frame ที่ตรวจ |
| Mouse drag | focus ยังอยู่ที่ password, ไม่เลือกข้อความ, ลากได้ประมาณ 35° และคืน user-select |
| Mobile touch | ปัดแนวตั้ง scroll 39 px ไม่หมุน; ลากแนวนอน ~0.599 rad ไม่เลื่อนหน้า; listener ถูกล้างหลังจบ |
| 360×640 ขณะ focus แบบกรอบปกติ (ก่อนเพิ่ม username backdrop) | แกนโมเดล x=180; ขอบล่าง ~123 px ก่อนแผงฟอร์มที่ 128 px |

ผลจำลองบน Chrome/GPU ของเครื่องพัฒนาไม่แทนผลมือถือจริงหรือการรับรอง WCAG ทั้งหน้า

### 5.1 ยืนยันบัญชีระบบกลางจริงและสิทธิ์ — 19 ต.ค. 2026

ทดสอบผ่าน API กลางจริงและ Chrome บน production build ที่รันแยกในเครื่อง ไม่ใช่ production deployment; ปิด DEV role ในเซิร์ฟเวอร์ทดสอบ ใช้ session แยกแต่ละบัญชี ไม่แก้ข้อมูลพนักงาน/สิทธิ์ในฐานข้อมูล และไม่บันทึกรหัสผ่านหรือ access token ในรายงาน

| บัญชี | บทบาท PRG003 | Login / เมนูคอม / เมนูมือถือ / Logout |
|---|---|---|
| TEST001 | ADMIN | ผ่าน |
| TEST002 | MASTER_ADMIN | ผ่าน |
| TEST003 | QC_HEAD | ผ่าน |
| TEST004 | QC_INSPECTOR | ผ่าน |
| TEST005 | QA_HEAD | ผ่าน |
| TEST006 | QA_INSPECTOR | ผ่าน |
| TEST007 | PURCHASING | ผ่าน |
| TEST008 | PM | ผ่าน |
| TEST009 | MANAGEMENT | ผ่าน |

- API ตอบสำเร็จ, employee code ตรง, PRG003 เปิดใช้, `can_use = true` และ `role_prog` ตรงทั้ง 9 บัญชี
- Chrome desktop 1440×900 / mobile viewport 390×844: sidebar, 4 tabs, ปุ่มเปิดแผน/ข้อมูลหลัก และบทบาทในหน้าเพิ่มเติมตรงตามบัญชี; ไม่มี page/console error หรือหน้าล้นแนวนอน
- เปิด Home/แจ้งเตือน/บัญชีได้ และหลัง Logout cookie ถูกล้าง; เปิด URL ทั้งสามอีกครั้งต้องกลับ Login
- ตารางสิทธิ์ทุกบทบาทและกรณี server guard ปฏิเสธสิทธิ์ตรวจด้วย unit tests; หน้าโมดูลอนาคตยังไม่มี route/business flow จึงยังไม่ได้ทดสอบสิทธิ์รายข้อมูลของโมดูลเหล่านั้นบนระบบจริง
- หลักฐานรอบนี้: `real-role-browser-audit.json` และภาพ `real-role-*-home.png` ในโฟลเดอร์ artifacts ของแชต; เป็นหลักฐานของรอบทดสอบนี้ ไม่ใช่ระบบเฝ้าตรวจต่อเนื่อง
- ข้อจำกัดยังคงเดิม: มือถือจำลองไม่แทนเครื่องจริง, Home ยังเป็น demo, สิทธิ์ใน session เป็น snapshot สูงสุด 12 ชั่วโมง และกรณีระบบกลางปฏิเสธ/ล่มยังตรวจด้วย fixture

## 6. งานที่เหลือและขั้นถัดไป

### เริ่ม Pass 5 ตามลำดับ

- [ ] เก็บการเผยหัวข้อ/ข้อความไทยทีละชั้น โดยไม่ตัดวรรณยุกต์ ไม่หน่วงการใช้ฟอร์ม และรองรับ reduced motion
- [ ] เก็บ post-processing, grain/vignette และฝุ่นในลำแสงตาม art direction โดยรักษางบ draw calls < 40 และโหลดเอฟเฟกต์ภายหลังฟอร์ม
- [ ] จูนสี/ความเข้ม/จังหวะผ่าน `lib/config/experience.ts` และตรวจภาพทั้งจอคอมกับมือถือ
- [ ] รัน tests/lint/typecheck/build และตรวจซ้ำว่าโฟกัส การลาก การเลื่อนหน้า และ success transition ยังทำงานตามเดิม

### หลัง Pass 5

1. **Pass 6:** quality tiers เต็มรูปแบบ, ภาพ fallback จากฉากจริง, มือถือจริง/Lighthouse และประเมิน flash threshold ตาม [WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) — การลดแสงหน้าครีบและรองรับ reduced motion ยังไม่ใช่ผลรับรองผ่านเกณฑ์นี้
2. **Pass 7:** หมดเวลาไม่ใช้งานบนเครื่องส่วนกลาง (ไม่มี PIN); รหัสจริงประสานระบบกลางตาม G4 ใน docs/08 (placeholder เดิมอยู่สำหรับ mock)
3. Backend ของแผน/งาน/การตรวจ และรายละเอียดสัญญา API กลาง G1–G8 ที่ยังค้าง ตาม docs/08–09; การเชื่อม Login/สิทธิ์บัญชีทดสอบจริงยืนยันแล้ว

ยังไม่มี Git repository ในโฟลเดอร์นี้; รอบนี้สำรองไฟล์ที่เกี่ยวข้องไว้ชั่วคราวก่อนแก้ ไม่ได้ initialize repository หรือ commit

## 7. เปิดตรวจต่อ

- Dev: `npm run dev` → http://localhost:3000/login
- ฉากสำรอง: http://localhost:3000/login?stage=static
- ค่าภาพ/เวลา/copy: lib/config/experience.ts
- บัญชี demo: lib/auth/mock-users.ts; ใช้รหัสที่แต่งขึ้นเมื่อตรวจ wrong-password/lock ไม่ใช้รหัสจริงใน seed
