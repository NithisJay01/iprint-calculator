# iPrint Worker: Order, Ticket และ Brief

## Data access architecture

Catalog domain rules are isolated in `domain/catalog.js`. Storage access is defined by
`repositories/catalog-repository.js` and the current Notion implementation lives in
`repositories/notion-catalog-repository.js`. Routes and checkout validation must depend
on the repository contract rather than reading Notion properties directly. A future D1
or PostgreSQL implementation should implement the same contract and pass
`catalog-contract-test.mjs` before it is selected in production.

Run the adapter contract test with:

```bash
node worker/catalog-contract-test.mjs
```

ระบบรองรับ 2 flow:

- ส่งบรีฟชิ้นงานเดียวผ่าน `POST /tickets`
- สร้างออเดอร์หลายชิ้นงานผ่าน `POST /orders` โดยสร้าง Ticket หลัก 1 หน้าใน `Iprint Jobs` และสร้าง Order Item แยกตามจำนวนรายการใน `Iprint Order Items`
- อ่านสถานะ Ticket และรายการผ่าน `GET /orders/:ticketId`
- เปลี่ยนสถานะรายการผ่าน `PATCH /order-items/:itemId/status` พร้อมบันทึกประวัติและรวมสถานะกลับไปยัง Ticket
- จัดคิวผลิตอัตโนมัติเมื่อสร้างออเดอร์ หากตั้งค่า Production Allocations พร้อม โดยคำนวณ Capacity Points, แบ่งงานใหญ่ข้ามวัน และตรวจวันส่ง
- จัดการคิวจริงผ่าน `GET /staff/queue`, `PATCH /staff/queue/:allocationId` และ `DELETE /staff/queue/:allocationId`

เมื่อกด **ดาวน์โหลดภาพสรุปบรีฟงาน** หน้าเว็บจะดาวน์โหลด PNG และสร้าง Ticket ใน Notion หากตั้งค่า Worker ครบถ้วน

เพิ่ม Environment Variable ใน Cloudflare Worker:

```
NOTION_TICKETS_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Ticket>
NOTION_ORDER_ITEMS_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Iprint Order Items>
NOTION_CAPACITY_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Iprint Daily Capacity>
```

ค่าของฐานข้อมูลปัจจุบัน, ขั้นตอนสร้าง Internal Integration และคำสั่งตั้ง Secret อยู่ใน [NOTION_SETUP.md](./NOTION_SETUP.md) ส่วนค่าที่ไม่ลับถูกเตรียมไว้ใน `wrangler.toml` แล้ว

ข้อกำหนด:

- แชร์ฐานข้อมูล Ticket ให้ Integration เดียวกับ `NOTION_TOKEN`
- แชร์ฐานข้อมูล `Iprint Order Items`, `Iprint Materials` และ `Iprint Service` ให้ Integration เดียวกัน
- `Iprint Order Items` ต้องมี Relation ชื่อ `Order Ticket`, `Material` และ `Services`
- `Iprint Order Items` ใช้ `Workflow Status` เป็นสถานะหลักของ API และมี `Workflow Phase`, `Proof Status`, `Production Status`, `Brief Deadline`, `Delivery Deadline`, `Updated At`
- `Iprint Jobs` ต้องมี `Order Key`, `Order Total`, `Item Count` และ Relation ย้อนกลับชื่อ `Order Items`
- ฐาน `Iprint Service` ใช้ `Category` หรือชื่อเดิม `Catagory`; ระบบจะแยกบริการการเคลือบและการตัดเป็น Radio group ให้อัตโนมัติ
- Preview วัสดุพิเศษรองรับ property แบบ Select ชื่อ `Preview Renderer` (`css`/`webgl`), `Preview Effect`, `Shader Preset` และ property URL ชื่อ `Texture URL` ใน `Iprint Materials` หรือ `Iprint Service` โดยทุกช่องเป็น optional
- ฐาน `Iprint Jobs` ใช้ Relation ชื่อ `วัสดุที่ใช้` ไปยัง `Iprint Materials`
  และ `บริการที่ใช้` ไปยัง `Iprint Service`
- Worker จะบันทึก Relation จาก Page ID ของรายการที่ผู้ใช้เลือก พร้อมตั้งค่าเริ่มต้น
  `Workflow Status = NEW`, `มอบหมาย = GRAPHIC` และ `งานประเภท = Design`
- Worker รองรับทั้ง Data Source ID และ Database ID โดยจะเลือก Data Source แรกในฐานข้อมูลให้อัตโนมัติ
- ฐานข้อมูลต้องมี property ประเภท **Title** อย่างน้อยหนึ่งช่อง (ชื่อ property ใดก็ได้)
- คงค่า `NOTION_TOKEN` และ `WRITE_API_KEY` เดิมไว้

Worker จะสร้างหน้า Ticket, ใส่รายละเอียดการผลิต/รายการวัสดุและบริการ/คำอธิบายสำหรับกราฟิก และแนบ Preview ตามภาพที่ลูกค้าใส่ไว้ โดยรองรับสูงสุด 3 ภาพต่อรายการ: Preview รายแผ่น, Preview รายชิ้นด้านหน้า และ Preview รายชิ้นด้านหลัง หากไม่มีภาพ Preview ระบบจะไม่สร้างภาพเปล่า แต่จะแจ้งให้ทีมตรวจรายละเอียดจากลิงก์ไฟล์ต้นฉบับใน Drive

สำหรับออเดอร์หลายรายการ Worker จะใช้ `Order Key` และ `Item Key` ป้องกันข้อมูลซ้ำ, แนบเฉพาะภาพใบเสนอราคาไว้ใน Ticket หลัก และเชื่อม Material/Services ที่ Order Item แต่ละรายการ ข้อมูล Gap, Bleed, ต้นทุนต่อแผ่น และเปอร์เซ็นต์กำไรจะไม่ถูกส่งเข้า Ticket หรือ Order Item

ลำดับสถานะ Order Item ที่ระบบรองรับ:

```
NEW → GRAPHIC_ACCEPTED → FILE_CHECK
FILE_CHECK → NEEDS_INFO → FILE_CHECK
FILE_CHECK → DESIGNING → PROOF_READY
PROOF_READY → REVISION_REQUESTED → DESIGNING
PROOF_READY → APPROVED → PRODUCTION_QUEUED → IN_PRODUCTION → QC
QC → REWORK → IN_PRODUCTION
QC → READY → DELIVERED
```

หาก `Status` ใน Notion เป็นชนิด Status ให้สร้างตัวเลือกตามรายการด้านบนก่อน deploy Worker ส่วน property เสริมสามารถทยอยเพิ่มได้ Worker จะเขียนเฉพาะช่องที่มีและชนิดตรงกัน

ภาพงานด้านหน้า/ด้านหลังและ Ref สำหรับกราฟิก (สูงสุด 3 ภาพ) เป็นข้อมูลชั่วคราวในเบราว์เซอร์ ระบบนำภาพทั้งสองด้านไปประกอบใน PNG สรุปบรีฟ เก็บไว้ในเครื่องระหว่างจัดตะกร้า และล้างทั้งหมดหลังสร้างออเดอร์สำเร็จ โดยไม่อัปโหลดไฟล์ต้นฉบับเหล่านี้เข้า Notion; Ticket เก็บบรีฟ ลิงก์ไฟล์ต้นฉบับ และสถานะ Artwork ของแต่ละด้าน

ทดสอบ flow ของ Worker แบบไม่เรียก Notion จริงได้ด้วย:

```
node worker/ticket-smoke-test.mjs
node worker/order-smoke-test.mjs
node worker/order-domain-test.mjs
node worker/public-order-security-test.mjs
node worker/capacity-domain-test.mjs
node worker/capacity-repository-test.mjs
node worker/capacity-worker-test.mjs
node worker/workflow-smoke-test.mjs
node worker/queue-domain-test.mjs
node worker/queue-repository-test.mjs
node worker/scheduling-domain-test.mjs
node worker/order-queue-smoke-test.mjs
```

## Capacity Point และคิวรายวัน

Domain ใน `worker/domain/capacity.js` คำนวณแต้มงานจากแต้มพื้นฐาน วัสดุ และบริการ โดยบริการเลือกฐานการคิดได้เป็น `job`, `sheet` หรือ `piece` พร้อม `capacityStep` สำหรับคิดเป็นช่วง เช่น ไดคัท 1 แต้มต่อทุก 100 ชิ้น

ตัวจัดสรรคิวรองรับเวลาตัดรอบ วันทำงาน วันหยุด วันปิดเฉพาะกิจ Capacity รายวันที่ปรับเพิ่ม/ลดได้ แต้มที่ถูกจองแล้ว และการกระจายงานใหญ่ต่อเนื่องหลายวัน

หน้า Staff Catalog รองรับ `Capacity Points`, `Capacity Basis` และ `Capacity Step` ของบริการแล้ว ใน Test Mode ค่าจะอยู่เฉพาะ Mock data ส่วน Production จะเขียนเฉพาะคอลัมน์ Capacity ที่มีอยู่จริงใน `Iprint Service`

หน้า Staff Daily Capacity ใช้ `GET /staff/capacity` และ `PUT /staff/capacity/:date` เพื่ออ่านและบันทึกกำลังผลิตลง `Iprint Daily Capacity` โดยต้องยืนยันตัวตนด้วย Staff API key เช่นเดียวกับหน้า Catalog การบันทึกใช้ค่า `Updated At` ตรวจการแก้ไขชนกัน เพื่อไม่ให้พนักงานสองคนเขียนทับข้อมูลล่าสุดโดยไม่รู้ตัว ส่วน Test Mode ใช้ Mock data ในเบราว์เซอร์และไม่แก้ Notion

## เปิดรับออเดอร์จากลูกค้าโดยไม่ Login

หน้าเว็บลูกค้าใช้ `POST /public/orders` ซึ่งไม่รับ `WRITE_API_KEY` จากเบราว์เซอร์ แต่บังคับตรวจ Cloudflare Turnstile ที่ Worker ทุกครั้ง ระบบปิดไว้โดยค่าเริ่มต้น

1. สร้าง Turnstile widget สำหรับ hostname `iprint.tchl.online`
2. ใส่ Site Key (เป็นข้อมูลสาธารณะ) ใน `js/config.js` ที่ `turnstileSiteKey` และตั้ง `publicOrdersEnabled: true`
3. เก็บ Secret Key เฉพาะใน Worker ด้วย `npx wrangler secret put TURNSTILE_SECRET_KEY --config worker/wrangler.toml`
4. เปลี่ยน `PUBLIC_ORDER_ENABLED` ใน `worker/wrangler.toml` เป็น `"true"` แล้ว deploy Worker

อย่าใส่ Turnstile Secret หรือ `WRITE_API_KEY` ใน `config.js` หรือไฟล์หน้าเว็บ
