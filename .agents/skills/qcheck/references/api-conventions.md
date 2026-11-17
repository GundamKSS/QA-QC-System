# QCheck — สัญญาและการสร้าง API Routes (API Conventions)

เอกสารสรุปข้อกำหนด การออกแบบ และตัวอย่างโค้ดของ API Routes ใน QCheck ตามมาตรฐานใน [docs/19-api-routes-plan.md](docs/19-api-routes-plan.md)

---

## 1. สัญญาของ API (API Contract)

### การเขียนข้อมูล (POST / PUT / PATCH / DELETE)
- **Body ที่รับเข้า**: รองรับทั้ง JSON (`application/json`) และ Form Data (`x-www-form-urlencoded`, `multipart/form-data`) ผ่าน `readFields(request)`
- **Body ที่ส่งออก**: JSON ที่ต้องมีฟิลด์ `status` เสมอ (`"done"`, `"error"`, หรือสถานะเฉพาะเช่น `"duplicate"`)
  - สำเร็จ: `apiJson({ status: "done", message?: string, redirectTo?: string }, 200 หรือ 201)`
  - ล้มเหลว: `apiError(statusCode, "ข้อความภาษาไทย", { fieldErrors?: Record<string, string> })`
- **CSRF / Same-Origin**: `guardApi` ตรวจสอบ Header `Origin` หรือ `Referer` โดยอัตโนมัติ คำขอข้ามเว็บจะถูกปฏิเสธด้วย `403`

### การอ่านข้อมูล (GET)
- **Body ที่ส่งออก**: ข้อมูลตรง ๆ โดยใช้ `apiData(payload)` **ไม่ต้องห่อ `status`** (เหมือนสไตล์ log-book)
- **เมื่อเกิด Error**: ใช้รูป `{ status: "error", message: string, redirectTo?: string }` เหมือนฝั่งเขียน ฝั่งเบราว์เซอร์ (`readApi`) จะแยกด้วย HTTP Status Code
- **การตรวจสิทธิ์**: ตรวจสอบ Session และสิทธิ์ตามหน้า (`page`) ผ่าน `guardApi` แต่ **ไม่ตรวจ same-origin**

### HTTP Status Code มาตรฐาน
| รหัส | สถานการณ์ | ฟังก์ชันที่ใช้ |
|---|---|---|
| `200` / `201` | สำเร็จ (ปกติ / สร้างทรัพยากรใหม่) | `apiJson(body, 200/201)` หรือ `apiData(data)` |
| `401` | ยังไม่ได้ล็อกอิน | `guardApi` ส่งกลับให้อัตโนมัติ (`redirectTo: /login?next=...`) |
| `403` | ไม่มีสิทธิ์ตามหน้า / ข้ามเว็บ / ค้างเปลี่ยน PIN | `guardApi` ส่งกลับให้อัตโนมัติ (`redirectTo: /change-password`) |
| `404` | ไม่พบข้อมูลที่ระบุ | `apiError(404, "ไม่พบข้อมูล...")` |
| `409` | ข้อมูลซ้ำ หรือสถานะไม่อนุญาตให้แก้ไข | `apiError(409, "...")` |
| `422` | ข้อมูลนำเข้าไม่ถูกต้องตามกติกา | `apiError(422, "กรุณากรอก...", { fieldErrors })` |
| `423` | บัญชีถูกระงับหรือถูกล็อก | `apiError(423, "...")` |
| `503` | ฐานข้อมูลขัดข้อง (ไม่แสดง error ดิบ) | `dbFailure(error, "label")` |
| `500` | บั๊กที่ไม่ได้คาดคิด | โยน Exception ต่อให้ระบบจับ |

---

## 2. ตัวช่วยใน `lib/api/`

- **`guardApi(request, options)`**:
  - `page`: รหัสหน้าที่กำหนดใน `PAGE_ACCESS` (เช่น `"plans"`, `"plan-open"`, `"users"`, `"master"`)
  - `returnTo`: URL สำหรับ redirect หากยังไม่ล็อกอิน
  - `allowPasswordChange`: อนุญาตสำหรับผู้ใช้ที่ติดสถานะ `pin_must_change` (เช่น endpoint เปลี่ยน PIN)
  - คืนค่า `{ user }` หากผ่าน หรือ `{ response: NextResponse }` หากไม่ผ่าน
- **`readFields(request)`**:
  - อ่านฟิลด์จาก Request: `.get(name)`, `.text(name)`, `.all(name)`
- **`apiData(data)`**:
  - ใช้ในคำขอ `GET` ส่งคืน JSON พร้อม header `Cache-Control: private, no-store` และ `Vary: Cookie`
- **`apiJson(body, status)`**:
  - ใช้ในคำขอเขียนข้อมูล ส่งคืน JSON พร้อม header ห้ามแคช
- **`apiError(status, message, extra)`**:
  - ส่งคืนข้อผิดพลาดในรูปแบบ `{ status: "error", message, ...extra }`
- **`dbFailure(error, label)`**:
  - ถ้าเป็น Database Connection/Query Error จะแปลงเป็นข้อความมิตรภาพ (ภาษาไทย) รหัส 503
  - ถ้าเป็น Error อื่น จะ throw ต่อไปเป็น 500

---

## 3. ตัวช่วยฝั่ง Client (`lib/api/client.ts`)

- **`useApiRead<T>(url)`**:
  - ใช้ในหน้าที่แสดงผล (Data View) ดึงข้อมูลตอน mount และ reload อัตโนมัติเมื่อ `url` เปลี่ยนหรือถูกสั่ง `invalidateApiReads()`
  - ส่งคืน `{ data, loading, error, reload }`
  - หากได้รับ 401 จะพาผู้ใช้ไปหน้า login อัตโนมัติ
- **`useApiAction(url, initial, failed, method?)`**:
  - ใช้กับฟอร์ม `<form action={action}>` ทำงานร่วมกับ `useActionState`
  - รองรับ `pending` state ตลอดเวลาจนกระทั่ง redirect หรือ refresh สำเร็จ
  - เมื่อบันทึกสำเร็จ (ได้สถานะ `done`) จะสั่ง `invalidateApiReads()` อัตโนมัติ
- **`useApiCall(url, failed)`**:
  - สำหรับปุ่มเดี่ยวหรือสวิตช์ที่ไม่ใช่ฟอร์ม (เช่น ปุ่มเปิด/ปิด Active, ปุ่มยกเลิก)
- **`invalidateApiReads()`**:
  - ส่งสัญญาณผ่าน `useSyncExternalStore` ให้ทุก `useApiRead` ในแท็บรีเฟรชข้อมูลล่าสุดโดยไม่ต้อง reload ทั้งหน้าเว็บ

---

## 4. สูตรการสร้าง Endpoint และ Component (Code Recipe)

### 4.1 Route Handler ฝั่งเขียน (`app/api/example/route.ts`)
```ts
import { guardApi } from "@/lib/api/guard";
import { readFields } from "@/lib/api/body";
import { apiJson, apiError } from "@/lib/api/response";
import { dbFailure } from "@/lib/api/db";
import { createExampleItem } from "@/lib/example/service";

export async function POST(request: Request) {
  // 1. ตรวจสอบสิทธิ์
  const guard = await guardApi(request, { page: "example-page", returnTo: "/example" });
  if ("response" in guard) return guard.response;

  // 2. อ่านข้อมูลนำเข้า
  const fields = await readFields(request);
  const name = fields.text("name");

  if (!name) {
    return apiError(422, "กรุณาระบุชื่อรายการ", {
      fieldErrors: { name: "กรุณาระบุชื่อรายการ" },
    });
  }

  // 3. เรียกใช้ Service ใน lib/ พร้อมดักจับ DB Error
  try {
    const item = await createExampleItem(name, guard.user);
    return apiJson(
      { status: "done", message: "บันทึกข้อมูลเรียบร้อยแล้ว", id: item.id },
      201
    );
  } catch (error) {
    return dbFailure(error, "create example item");
  }
}
```

### 4.2 Route Handler ฝั่งอ่าน (`app/api/example/route.ts`)
```ts
import { guardApi } from "@/lib/api/guard";
import { readQuery } from "@/lib/api/query";
import { apiData } from "@/lib/api/response";
import { dbFailure } from "@/lib/api/db";
import { loadExampleList } from "@/lib/example/service";

export async function GET(request: Request) {
  const guard = await guardApi(request, { page: "example-page" });
  if ("response" in guard) return guard.response;

  const query = readQuery(request);

  try {
    const payload = await loadExampleList(guard.user, query);
    return apiData(payload); // ตอบข้อมูลตรง ๆ ไม่ห่อ status
  } catch (error) {
    return dbFailure(error, "load example list");
  }
}
```

### 4.3 Client Data View Component (`components/example/ExampleView.tsx`)
```tsx
"use client";

import { useApiRead } from "@/lib/api/client";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import type { ExamplePayload } from "@/lib/example/types";

export function ExampleView({ apiUrl }: { apiUrl: string }) {
  const { data, loading, error, reload } = useApiRead<ExamplePayload>(apiUrl);

  if (loading && !data) {
    return <CardsSkeleton />;
  }

  if (error && !data) {
    return <LoadError message={error} onRetry={reload} />;
  }

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      {data?.items.map((item) => (
        <div key={item.id} className="p-4 border-b">
          <h3>{item.name}</h3>
        </div>
      ))}
    </div>
  );
}
```
