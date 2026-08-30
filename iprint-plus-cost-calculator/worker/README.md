# iPrint Worker: Order, Ticket และ Brief

ระบบรองรับ 2 flow:

- ส่งบรีฟชิ้นงานเดียวผ่าน `POST /tickets`
- สร้างออเดอร์หลายชิ้นงานผ่าน `POST /orders` โดยสร้าง Ticket หลัก 1 หน้าใน `Iprint Jobs` และสร้าง Order Item แยกตามจำนวนรายการใน `Iprint Order Items`

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
- `Iprint Jobs` ต้องมี `Order Key`, `Order Total`, `Item Count` และ Relation ย้อนกลับชื่อ `Order Items`
- ฐาน `Iprint Jobs` ใช้ Relation ชื่อ `วัสดุที่ใช้` ไปยัง `Iprint Materials`
  และ `บริการที่ใช้` ไปยัง `Iprint Service`
- Worker จะบันทึก Relation จาก Page ID ของรายการที่ผู้ใช้เลือก พร้อมตั้งค่าเริ่มต้น
  `สถานะ = NEW`, `มอบหมาย = GRAPHIC` และ `งานประเภท = Design`
- Worker รองรับทั้ง Data Source ID และ Database ID โดยจะเลือก Data Source แรกในฐานข้อมูลให้อัตโนมัติ
- ฐานข้อมูลต้องมี property ประเภท **Title** อย่างน้อยหนึ่งช่อง (ชื่อ property ใดก็ได้)
- คงค่า `NOTION_TOKEN` และ `WRITE_API_KEY` เดิมไว้

Worker จะสร้างหน้า Ticket, ใส่รายละเอียดการผลิต/รายการวัสดุและบริการ/คำอธิบายสำหรับกราฟิก, และแนบภาพสรุป PNG ให้โดยอัตโนมัติ

สำหรับออเดอร์หลายรายการ Worker จะใช้ `Order Key` และ `Item Key` ป้องกันข้อมูลซ้ำ, แนบภาพใบเสนอราคาและภาพบรีฟของแต่ละรายการไว้ใน Ticket หลัก และเชื่อม Material/Services ที่ Order Item แต่ละรายการ ข้อมูล Gap, Bleed, ต้นทุนต่อแผ่น และเปอร์เซ็นต์กำไรจะไม่ถูกส่งเข้า Ticket หรือ Order Item

ภาพงานใน Preview และ Ref สำหรับกราฟิก (สูงสุด 3 ภาพ) เป็นข้อมูลชั่วคราวในเบราว์เซอร์ ระบบรวมภาพเหล่านี้ไว้ใน PNG สรุปบรีฟหนึ่งไฟล์ เก็บเฉพาะไฟล์นั้นใน Ticket และล้างภาพชั่วคราวทั้งหมดหลังส่งบรีฟแล้ว

ทดสอบ flow ของ Worker แบบไม่เรียก Notion จริงได้ด้วย:

```
node worker/ticket-smoke-test.mjs
node worker/order-smoke-test.mjs
```
