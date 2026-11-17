# QCheck — ระบบยืนยันตัวตนและความปลอดภัย (Auth & Security)

เอกสารสรุปสถาปัตยกรรมระบบล็อกอิน การจัดการสิทธิ์ (RBAC) และการรักษาความปลอดภัยของ QCheck

---

## 1. รูปแบบการล็อกอินแบบคู่ขนาน (Dual Authentication Model)

ระบบ QCheck รองรับผู้ใช้งาน 2 กลุ่มหลัก ซึ่งแยกกระบวนการตรวจสอบสิทธิ์อย่างสิ้นเชิง:

```
                  ┌───────────────────────────────┐
                  │          หน้า Login           │
                  │ รหัสพนักงาน (username) + รหัส │
                  └──────────────┬────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
[รหัสพนักงานปกติ (Office)]                  [รหัสช่างหน้างาน (ขึ้นต้นด้วย 'F')]
- ส่งตรวจสอบกับระบบกลาง (DataCenter)        - ตรวจสอบใน QCheck โดยตรง
- PROGRAM_CODE = PRG003                      - รหัสผ่าน = PIN ตัวเลข 6 หลัก
- อ่านบทบาทจาก role_prog                     - แฮชด้วย SHA-256 + PIN_PEPPER
- ซิงก์ข้อมูลลงตาราง users (origin='CENTRAL') - ข้อมูลอยู่ในตาราง local_users (origin='LOCAL')
```

### การตั้งค่าโหมด Auth (`.env.local`)
- `QCHECK_AUTH=central` (โหมดจริง): ตรวจสอบบัญชีพนักงานออฟฟิศผ่าน API กลาง (`API_DATACENTER`)
- `QCHECK_AUTH=mock` (โหมดพัฒนา/ทดสอบ): ใช้บัญชีจำลองในหน่วยความจำโดยไม่ต้องเชื่อมต่อระบบกลางหรือฐานข้อมูลจริง
  - บัญชีตัวอย่าง: `ADM0001` (Admin จัดการได้ทุกอย่าง), `QCH0001` (QC Head), `QCI0001` (QC Inspector), `F0001` (Local Field User)

---

## 2. การจัดการ PIN ของผู้ใช้หน้างาน (Field User PIN)

- **รหัสพนักงาน**: ขึ้นต้นด้วยอักษรตัวใหญ่ `F` ตามด้วยตัวเลข เช่น `F0001`
- **PIN**: ตัวเลข 6 หลักเท่านั้น (ไม่อนุญาตตัวอักษร)
- **PIN Pepper**: ต้องกำหนด `PIN_PEPPER` ใน `.env.local` ให้มีความยาว $\ge 32$ ตัวอักษร
- **การบังคับเปลี่ยน PIN**:
  - เมื่อแอดมินสร้างบัญชีหรือ Reset PIN ค่าสถานะ `pin_must_change` จะเป็น `1`
  - เมื่อเข้าสู่ระบบ จะถูกบังคับ redirect ไปหน้า `/change-password` ทันที และ API อื่นจะปฏิเสธคำขอด้วยรหัส `403` จนกว่าจะเปลี่ยนสำเร็จ
- **การป้องกัน Brute-Force**:
  - นับจำนวนครั้งที่ใส่ผิด หากเกินกำหนดบัญชีจะถูกล็อก (`423 Locked`)
  - แอดมินหรือ QC Head สามารถปลดล็อกได้ผ่านเมนู `/admin/users`

---

## 3. บทบาทและตารางสิทธิ์ (Roles & Page Access)

สิทธิ์การเข้าถึงหน้าจอและ API กำหนดไว้ที่ `lib/auth/page-access.ts` ผ่านอ็อบเจกต์ `PAGE_ACCESS`:

| หน้า / ฟีเจอร์ (`page`) | บทบาทที่อนุญาต |
|---|---|
| `home` | `admin`, `qc_head`, `qa_head`, `pm`, `purchasing`, `management` |
| `plans` / `plans-list` | `admin`, `qc_head`, `qc_inspector`, `qa_head`, `qa_inspector` |
| `plan-open` (เปิดแผนใหม่) | `admin`, `qc_head`, `qa_head` |
| `jobs` (งานตรวจของฉัน) | ทุกบทบาทที่มีสิทธิ์ตรวจ (`qc_inspector`, `qa_inspector`, `qc_head`, `qa_head`, `admin`) |
| `history` | ทุกบทบาทข้างต้น + ผู้บริหาร |
| `master` (ดูข้อมูลหลัก) | ทุกคนในระบบออฟฟิศ |
| `master-edit` (แก้ข้อมูลหลัก) | `admin` (Master Admin เท่านั้น) |
| `users` (จัดการผู้ใช้หน้างาน) | `admin`, `qc_head` (ปลดล็อกได้เฉพาะลูกทีม) |

### การบังคับใช้สิทธิ์ (Enforcement)
1. **ใน Server Component (`page.tsx`)**:
   ```ts
   const user = await requirePageAccess("plan-open");
   ```
2. **ใน Route Handler (`app/api/**/route.ts`)**:
   ```ts
   const guard = await guardApi(request, { page: "plan-open" });
   if ("response" in guard) return guard.response;
   ```

---

## 4. Session และความปลอดภัยของไคลเอนต์

- **Cookie**: เซสชันเข้ารหัสด้วย JWT (ไลบรารี `jose`) เก็บในคุกกี้ชื่อ `qcheck_session` กำหนดค่า `HttpOnly`, `SameSite=Lax`, `Secure` (ใน production)
- **Idle Timeout**: ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งานตามระยะเวลาที่กำหนด
- **BfcacheGuard (`components/dom/BfcacheGuard.tsx`)**: ป้องกันการกดย้อนกลับ (Back Button) ของเบราว์เซอร์เพื่อดูข้อมูลที่เคยล็อกอินไว้ โดยจะตรวจเช็ค session ซ้ำเมื่อหน้าถูกดึงมาจาก Back-Forward Cache
