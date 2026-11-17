# QCheck — กติกาและสถาปัตยกรรม (Architecture & Rules)

เอกสารอ้างอิงกติกาหลักของโปรเจกต์ **QCheck** (ระบบตรวจรับคุณภาพปั๊มลม TRW × PUMA) ซึ่งพัฒนาตามสไตล์โปรเจกต์ `../log-book` อย่างเคร่งครัด

---

## 1. กฎเหล็กของโปรเจกต์ (Non-Negotiable Rules)

1. **ห้ามมีโฟลเดอร์ `src/`**:
   - โค้ดทั้งหมดต้องอยู่ที่ root: `app/`, `components/`, `lib/`, `db/`, `docs/`, `tests/`, `tools/`, `tmp/`
   - ใช้ Path Alias `@/*` ชี้ที่ root เสมอ (เช่น `@/lib/...`, `@/components/...`)
2. **ห้ามใช้ Server Actions (`"use server"`) เด็ดขาด**:
   - การเขียนข้อมูล (Write/Mutate) ทุกอย่างต้องทำผ่าน Route Handler ใน `app/api/**/route.ts`
   - ฝั่งไคลเอนต์ใช้ hook `useApiAction` หรือ `useApiCall` (จาก `@/lib/api/client`)
3. **การเข้าถึง Database อยู่ใน `lib/` เท่านั้น**:
   - ห้ามเขียน SQL หรือเรียก Connection Pool ใน `page.tsx`, component หรือ route handler โดยตรง
   - Route Handler ต้องทำหน้าที่เป็น controller บาง ๆ เรียก service/repository ใน `lib/`
4. **ทุกหน้าอ่านข้อมูลผ่าน `GET /api` (Client-side Data Fetching)**:
   - `page.tsx` ต้องบาง: ทำหน้าที่ตรวจ session และสิทธิ์ที่ฝั่ง server ด้วย `requirePageAccess(page)` แล้วส่ง prop ให้ Feature Component
   - Feature Component ใน `components/<feature>/` เป็น `"use client"` และดึงข้อมูลผ่าน hook `useApiRead` (ห่อ `GET /api/<feature>`)
   - ห้ามดึงข้อมูล DB ตรง ๆ ใน Server Component ของหน้า
5. **ห้ามแก้ไฟล์ Migration ที่รันไปแล้ว**:
   - โฟลเดอร์ `db/` เก็บไฟล์ migration `NNN_ชื่อ.sql`
   - ถ้าต้องการแก้สคีมาหรือข้อมูล ให้สร้างไฟล์เลขลำดับถัดไปเสมอ
6. **ห้าม Relative Imports ใน Tests และ App**:
   - ใช้ `@/*` เสมอในทุกที่ รวมถึงไฟล์ใน `tests/`
   - ห้ามวางไฟล์เทสต์ `*.test.ts` ข้างโค้ดเด็ดขาด เทสต์ทั้งหมดต้องอยู่ใน `tests/` แบบ flat
7. **สำรองข้อมูลก่อนเริ่มงานใหญ่**:
   - เนื่องจากโปรเจกต์นี้ไม่มี git ให้สำรองไฟล์ก่อนแก้โครงสร้างใหญ่ลงใน `.local-backups/before-<เรื่อง>-<วันที่>/originals.tar.gz`
8. **เซิร์ฟเวอร์รันอยู่ (Turbopack port 3000)**:
   - ผู้ใช้อาจเปิด `npm run dev` ค้างไว้ อย่าสั่ง kill กระบวนการ
   - ห้ามแก้ไข `next.config.ts` ขณะเซิร์ฟเวอร์รัน เพราะจะทริกเกอร์ server restart

---

## 2. โครงสร้างไดเรกทอรี (Directory Structure)

```text
QCheck/
├── app/
│   ├── (app)/               # หน้าในระบบหลังล็อกอิน (layout มี Shell, AppSidebar, BottomTabBar)
│   │   ├── home/            # หน้าแดชบอร์ดหลัก
│   │   ├── plans/           # แผนตรวจรับปั๊มลม (รายการ, สร้างใหม่, รายละเอียด, ใบงาน)
│   │   ├── jobs/            # หน้ารายการงานตรวจสำหรับช่าง/ผู้ตรวจ
│   │   ├── history/         # ประวัติการตรวจ
│   │   ├── master/          # ข้อมูลหลัก (Master Data Catalog)
│   │   ├── admin/users/     # จัดการผู้ใช้หน้างาน (Local Users & PIN)
│   │   ├── alerts/          # การแจ้งเตือน
│   │   └── more/            # เมนูเพิ่มเติม
│   ├── (auth)/              # หน้าล็อกอินและจัดการรหัสผ่าน
│   │   ├── login/           # ล็อกอิน (ฉาก 3D + ฟอร์ม)
│   │   └── change-password/ # บังคับเปลี่ยน PIN เมื่อเข้าสู่ระบบครั้งแรก
│   └── api/                 # Endpoint ทั้งหมด (เขียนและอ่าน)
│       ├── auth/            # login, logout, change-pin
│       ├── admin/users/     # CRUD ผู้ใช้หน้างาน, reset-pin, unlock-pin, active
│       ├── master/          # CRUD ข้อมูลหลักตาม [table]
│       ├── plans/           # แผนตรวจรับ, lookup-doc, work-orders, assignees, cancel
│       ├── home/            # ข้อมูลสรุป Dashboard
│       ├── jobs/            # ข้อมูลงานตรวจ
│       ├── history/         # ข้อมูลประวัติการตรวจ
│       └── notifications/   # ดึงรายการแจ้งเตือน
├── components/              # UI Components แยกโฟลเดอร์ตามฟีเจอร์
│   ├── <feature>/           # เช่น plans/, master/, home/, jobs/, history/, admin/
│   │   ├── <Feature>View.tsx
│   │   └── use<Feature>Data.ts   # Hook ห่อ useApiRead
│   ├── shell/               # AppShell, AppSidebar, TopAppBar, BottomTabBar
│   ├── feedback/            # CardsSkeleton, LoadError
│   ├── dom/                 # LoginForm, BfcacheGuard, ThaiReveal, Icons
│   ├── canvas/              # Three.js 3D (AirCompressor, Scene, CameraRig, etc.)
│   └── scan/                # Barcode/QR Camera Scanner Dialog
├── lib/                     # Business Logic, DB Data Access, Services, Helpers
│   ├── api/                 # guardApi, client helpers, readFields, response, db failure
│   ├── auth/                # Session, Central Auth, PIN Auth, Roles, Page Access
│   ├── db/                  # SQL Server Pool, Error handlers, Users/Plans DB
│   ├── plans/               # Plan domain logic, queries, rules, work-orders
│   ├── master/              # Master catalog registry, table queries, repo
│   ├── notifications/       # Notification types and services
│   ├── scan/                # Barcode/QR detection using ZXing WASM
│   └── config/              # Experience settings, theme palette
├── db/                      # Database migrations (NNN_*.sql) และ seed/
├── docs/                    # เอกสารสเปกและบันทึกการประชุม (01 ถึง 19)
├── tests/                   # Vitest unit tests ทั้งหมด (flat structure)
├── tools/                   # สคริปต์ช่วยงาน (migrate.mjs, defect-lists.mjs, etc.)
└── tmp/                     # ไฟล์ชั่วคราว / ร่างงาน (ไม่อยู่ในโค้ดจริง)
```

---

## 3. วงจรสิทธิ์และการแสดงผล (Page Access & Auth Cycle)

```
[Browser Request]
       │
       ▼
(app)/layout.tsx  ──►  BfcacheGuard (ตรวจ session ตอนย้อนกลับหน้า)
       │
       ▼
app/(app)/<feature>/page.tsx
       │  (1) ตรวจสอบสิทธิ์ฝั่ง Server
       ├────────────────► requirePageAccess(page)
       │                  - ไม่ได้ล็อกอิน -> redirect to /login
       │                  - ต้องเปลี่ยน PIN -> redirect to /change-password
       │                  - ไม่มีสิทธิ์ -> แสดง Forbidden / 403
       │
       ▼  (2) Render Component ฝั่ง Client
components/<feature>/<Feature>View.tsx ("use client")
       │
       ▼  (3) เรียกข้อมูลผ่าน API
use<Feature>Data() ──► useApiRead("/api/<feature>")
       │
       ▼  (4) Route Handler ฝั่ง Server
app/api/<feature>/route.ts (GET)
       ├─► guardApi(request, { page })  ──► ตรวจ Session + PAGE_ACCESS
       ├─► load<Feature>(user, query)   ──► เรียกจาก lib/
       └─► apiData(payload)             ──► ส่งคืน JSON (ข้อมูลตรงๆ)
```
