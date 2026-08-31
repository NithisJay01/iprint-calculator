# iPrint Worker: Order, Ticket และ Brief

ระบบรองรับ 2 flow:

- ส่งบรีฟชิ้นงานเดียวผ่าน `POST /tickets`
- สร้างออเดอร์หลายชิ้นงานผ่าน `POST /orders` โดยสร้าง Ticket หลัก 1 หน้าใน `Iprint Jobs` และสร้าง Order Item แยกตามจำนวนรายการใน `Iprint Order Items`
- อ่านสถานะ Ticket และรายการผ่าน `GET /orders/:ticketId`
- เปลี่ยนสถานะรายการผ่าน `PATCH /order-items/:itemId/status` พร้อมบันทึกประวัติและรวมสถานะกลับไปยัง Ticket

เมื่อกด **ดาวน์โหลดภาพสรุปบรีฟงาน** หน้าเว็บจะดาวน์โหลด PNG และสร้าง Ticket ใน Notion พร้อมแนบภาพเดียวกัน หากตั้งค่า Worker ครบถ้วน

เพิ่ม Environment Variable ใน Cloudflare Worker:

```
NOTION_TICKETS_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Ticket>
NOTION_ORDER_ITEMS_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Iprint Order Items>
```

ข้อกำหนด:

- แชร์ฐานข้อมูล Ticket ให้ Integration เดียวกับ `NOTION_TOKEN`
- แชร์ฐานข้อมูล `Iprint Order Items`, `Iprint Materials` และ `Iprint Service` ให้ Integration เดียวกัน
- `Iprint Order Items` ต้องมี Relation ชื่อ `Order Ticket`, `Material` และ `Services`
- `Iprint Order Items` ต้องมี `Status` (Select, Status หรือ Rich text) และควรเพิ่ม `Workflow Phase`, `Proof Status`, `Production Status`, `Brief Deadline`, `Delivery Deadline`, `Updated At`
- `Iprint Jobs` ต้องมี `Order Key`, `Order Total`, `Item Count` และ Relation ย้อนกลับชื่อ `Order Items`
- ฐาน `Iprint Service` ใช้ `Category` หรือชื่อเดิม `Catagory`; ระบบจะแยกบริการการเคลือบและการตัดเป็น Radio group ให้อัตโนมัติ
- Preview วัสดุพิเศษรองรับ property แบบ Select ชื่อ `Preview Renderer` (`css`/`webgl`), `Preview Effect`, `Shader Preset` และ property URL ชื่อ `Texture URL` ใน `Iprint Materials` หรือ `Iprint Service` โดยทุกช่องเป็น optional
- ฐาน `Iprint Jobs` ใช้ Relation ชื่อ `วัสดุที่ใช้` ไปยัง `Iprint Materials`
  และ `บริการที่ใช้` ไปยัง `Iprint Service`
- Worker จะบันทึก Relation จาก Page ID ของรายการที่ผู้ใช้เลือก พร้อมตั้งค่าเริ่มต้น
  `สถานะ = NEW`, `มอบหมาย = GRAPHIC` และ `งานประเภท = Design`
- Worker รองรับทั้ง Data Source ID และ Database ID โดยจะเลือก Data Source แรกในฐานข้อมูลให้อัตโนมัติ
- ฐานข้อมูลต้องมี property ประเภท **Title** อย่างน้อยหนึ่งช่อง (ชื่อ property ใดก็ได้)
- คงค่า `NOTION_TOKEN` และ `WRITE_API_KEY` เดิมไว้

Worker จะสร้างหน้า Ticket, ใส่รายละเอียดการผลิต/รายการวัสดุและบริการ/คำอธิบายสำหรับกราฟิก, และแนบภาพสรุป PNG ให้โดยอัตโนมัติ

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
node worker/workflow-smoke-test.mjs
```
