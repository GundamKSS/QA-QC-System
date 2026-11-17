# QCheck — การทดสอบและการแก้ปัญหา (Testing & Troubleshooting)

เอกสารสรุปแนวทางการเขียนเทสต์ วิธีรันการตรวจสอบคุณภาพ และคู่มือแก้ปัญหาที่พบบ่อย (Troubleshooting Runbook)

---

## 1. แนวทางการทดสอบ (Testing Guidelines)

โปรเจกต์นี้ใช้ **Vitest** ในการทดสอบโค้ดทั้งหมด

### กติกาการเขียนเทสต์
1. **ตำแหน่งไฟล์**: อยู่ใน `tests/` ทั้งหมดแบบ Flat (ห้ามสร้างโฟลเดอร์ย่อย และห้ามวางข้างโค้ด)
2. **การตั้งชื่อไฟล์**: ใช้ kebab-case ตามหมวดหมู่: `<หมวด>-<เรื่อง>.test.ts`
   - ตัวอย่าง: `api-plans.test.ts`, `auth-pin.test.ts`, `master-registry.test.ts`, `canvas-stage.test.ts`
3. **การ Import**: ใช้ Path Alias `@/*` เท่านั้น **ห้ามใช้ Relative Path (`../../`)**
4. **การทดสอบ Route Handler**:
   - สามารถสร้าง Request object ตรง ๆ: `new Request("http://localhost/api/...", { method: "POST", body: ... })`
   - ทำ Mock ที่ระดับชั้นล่าง เช่น Mock session ใน `@/lib/auth/dal` หรือ Mock store ฟังก์ชัน

### คำสั่งรันเทสต์
```bash
npm test                  # รันเทสต์ทั้งหมดแบบ Single Run
npm run test:watch        # รันเทสต์พร้อม watch โหมดสำหรับพัฒนา
```

### การทดสอบกับ SQL Server จริง
เทสต์ที่มีการต่อ Database จริงจะถูกป้องกันด้วยสวิตช์ `QCHECK_DB_TESTS=on`:
```bash
QCHECK_DB_TESTS=on node --env-file=.env.local node_modules/.bin/vitest run tests/master-db.test.ts
```
*(ทุกเคสจะรันใน Transaction และ Rollback ข้อมูลกลับเสมอ ไม่ทิ้งข้อมูลขยะ)*

---

## 2. ขั้นตอนตรวจความพร้อมก่อนส่งมอบงาน (Pre-flight Quality Gate)

ก่อนจะแจ้งผู้ใช้ว่าทำงานเสร็จสมบูรณ์ **ต้องรันผ่านทั้ง 4 คำสั่งนี้โดยไม่มี Error**:

```bash
npm run lint          # 1. ตรวจ ESLint
npm run build         # 2. ทำ Production Build (เพื่อสร้าง type ใน .next/types)
npm run typecheck     # 3. ตรวจสอบ TypeScript Types ทั้งหมด
npm test              # 4. รัน Unit Tests ทั้งหมด
```

> **ข้อสำคัญ**: หากมีการเพิ่มหรือลบไฟล์ API Route ให้รัน `npm run build` ก่อน `npm run typecheck` เพื่อให้ Next.js อัปเดต Type คำจำกัดความของ Route ใน `.next/types/` ให้เรียบร้อย

---

## 3. ปัญหาที่พบบ่อยและวิธีแก้ (Troubleshooting Runbook)

### ปัญหาที่ 1: `type.validate is not a function` หรือปัญหา DateTime2 ใน mssql
- **สาเหตุ**: เกิดจาก Webpack/Turbopack พยายาม bundle ไลบรารี `mssql` หรือ `tedious` ทำให้ dynamic require type ขาดหาย
- **วิธีแก้**: ตรวจสอบว่าใน `next.config.ts` ได้ระบุ:
  ```ts
  serverExternalPackages: ["mssql", "tedious"]
  ```

### ปัญหาที่ 2: เชื่อมต่อ SQL Server ไม่ได้ (TLS / Certificate Error)
- **สาเหตุ**: SQL Server ใช้ Self-Signed Certificate หรือเปิดใช้งานการเข้ารหัสข้อมูล
- **วิธีแก้**: ตรวจสอบค่าใน `.env.local`:
  ```bash
  DB_ENCRYPT=on
  DB_TRUST_CERT=on
  ```

### ปัญหาที่ 3: Route Handler ตอบกลับ `403 Forbidden` โดยไม่ทราบสาเหตุ
- **สาเหตุที่ 1 (Same-Origin)**: ส่งคำขอ POST/PUT/PATCH/DELETE จากเครื่องมือที่ไม่ส่ง Header `Origin` หรือ `Referer` ที่ตรงกับ Host ของเว็บ
- **สาเหตุที่ 2 (PIN Must Change)**: บัญชีที่ล็อกอินอยู่มีสถานะ `pin_must_change = 1` ระบบจะบล็อก API อื่นทั้งหมดเพื่อให้ไปเปลี่ยน PIN ที่ `/change-password` ก่อน
- **สาเหตุที่ 3 (Page Access)**: ตรวจสอบว่าบทบาท (Role) ของผู้ใช้มีสิทธิ์ใน `PAGE_ACCESS[page]` หรือไม่

### ปัญหาที่ 4: Type Error หลังจากเพิ่ม Route ใหม่ใน `app/api/`
- **สาเหตุ**: `.next/types/app/api/...` ยังไม่ได้ถูกสร้างขึ้น
- **วิธีแก้**: รัน `npm run build` หนึ่งครั้งเพื่อเจน type ใหม่ แล้วค่อยรัน `npm run typecheck`

### ปัญหาที่ 5: ค่าค้างหลัง Hot-Reload ระหว่างรัน `next dev`
- **สาเหตุ**: มีการบันทึก Object ที่ผูกติดกับ closure function ลงใน `globalThis` ทำให้โค้ดเก่าค้างอยู่ในหน่วยความจำ
- **วิธีแก้**: ให้เก็บเฉพาะ Connection Pool หรือ Static Config ใน `globalThis` หลีกเลี่ยงการเก็บ Handler หรือ Service instance

### ปัญหาที่ 6: ห้ามฆ่าเซิร์ฟเวอร์ Turbopack พอร์ต 3000
- **ข้อควรระวัง**: ผู้ใช้อาจเปิด `npm run dev` ทิ้งไว้ที่พอร์ต 3000
- อย่าใช้คำสั่ง `kill -9` หรือฆ่า process Node โดยไม่จำเป็น
- ห้ามแก้ไข `next.config.ts` ในระหว่างที่ต้องการให้ dev server รันต่อเนื่อง
