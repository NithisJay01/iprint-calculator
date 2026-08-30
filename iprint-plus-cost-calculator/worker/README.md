# iPrint Worker: Ticket from Brief

เมื่อกด **ดาวน์โหลดภาพสรุปบรีฟงาน** หน้าเว็บจะดาวน์โหลด PNG และสร้าง Ticket ใน Notion พร้อมแนบภาพเดียวกัน หากตั้งค่า Worker ครบถ้วน

เพิ่ม Environment Variable ใน Cloudflare Worker:

```
NOTION_TICKETS_DATA_SOURCE_ID=<Data source ID หรือ Database ID ของฐานข้อมูล Ticket>
```

ข้อกำหนด:

- แชร์ฐานข้อมูล Ticket ให้ Integration เดียวกับ `NOTION_TOKEN`
- ฐาน `Iprint Jobs` ใช้ Relation ชื่อ `วัสดุที่ใช้` ไปยัง `Iprint Materials`
  และ `บริการที่ใช้` ไปยัง `Iprint Service`
- Worker จะบันทึก Relation จาก Page ID ของรายการที่ผู้ใช้เลือก พร้อมตั้งค่าเริ่มต้น
  `สถานะ = NEW`, `มอบหมาย = GRAPHIC` และ `งานประเภท = Design`
- Worker รองรับทั้ง Data Source ID และ Database ID โดยจะเลือก Data Source แรกในฐานข้อมูลให้อัตโนมัติ
- ฐานข้อมูลต้องมี property ประเภท **Title** อย่างน้อยหนึ่งช่อง (ชื่อ property ใดก็ได้)
- คงค่า `NOTION_TOKEN` และ `WRITE_API_KEY` เดิมไว้

Worker จะสร้างหน้า Ticket, ใส่รายละเอียดการผลิต/รายการวัสดุและบริการ/คำอธิบายสำหรับกราฟิก, และแนบภาพสรุป PNG ให้โดยอัตโนมัติ

ภาพงานใน Preview และ Ref สำหรับกราฟิก (สูงสุด 3 ภาพ) เป็นข้อมูลชั่วคราวในเบราว์เซอร์ ระบบรวมภาพเหล่านี้ไว้ใน PNG สรุปบรีฟหนึ่งไฟล์ เก็บเฉพาะไฟล์นั้นใน Ticket และล้างภาพชั่วคราวทั้งหมดหลังส่งบรีฟแล้ว

ทดสอบ flow ของ Worker แบบไม่เรียก Notion จริงได้ด้วย:

```
node worker/ticket-smoke-test.mjs
```
