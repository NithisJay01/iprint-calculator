# iPrint Worker: Ticket from Brief

เมื่อกด **ดาวน์โหลดภาพสรุปบรีฟงาน** หน้าเว็บจะดาวน์โหลด PNG และสร้าง Ticket ใน Notion พร้อมแนบภาพเดียวกัน หากตั้งค่า Worker ครบถ้วน

เพิ่ม Environment Variable ใน Cloudflare Worker:

```
NOTION_TICKETS_DATA_SOURCE_ID=<Data source ID ของฐานข้อมูล Ticket>
```

ข้อกำหนด:

- แชร์ฐานข้อมูล Ticket ให้ Integration เดียวกับ `NOTION_TOKEN`
- ฐานข้อมูลต้องมี property ประเภท **Title** อย่างน้อยหนึ่งช่อง (ชื่อ property ใดก็ได้)
- คงค่า `NOTION_TOKEN` และ `WRITE_API_KEY` เดิมไว้

Worker จะสร้างหน้า Ticket, ใส่รายละเอียดการผลิต/รายการวัสดุและบริการ/คำอธิบายสำหรับกราฟิก, และแนบภาพสรุป PNG ให้โดยอัตโนมัติ

ภาพงานใน Preview และ Ref สำหรับกราฟิก (สูงสุด 3 ภาพ) เป็นข้อมูลชั่วคราวในเบราว์เซอร์ ระบบรวมภาพเหล่านี้ไว้ใน PNG สรุปบรีฟหนึ่งไฟล์ เก็บเฉพาะไฟล์นั้นใน Ticket และล้างภาพชั่วคราวทั้งหมดหลังส่งบรีฟแล้ว

ทดสอบ flow ของ Worker แบบไม่เรียก Notion จริงได้ด้วย:

```
node worker/ticket-smoke-test.mjs
```
