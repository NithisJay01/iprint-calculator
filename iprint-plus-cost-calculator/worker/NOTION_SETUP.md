# เตรียม Notion Integration สำหรับ iPrint Flow

เอกสารนี้อ้างอิง Workspace `พื้นที่ของ iprint.garphic1` และฐานข้อมูลที่มีอยู่แล้ว ณ วันที่ 1 กันยายน 2026 ระบบไม่จำเป็นต้องสร้างฐานข้อมูลซ้ำ

Backend ใช้ Cloudflare Worker แยกชื่อ `iprint-flow-api` เพื่อไม่เขียนทับ Worker แบบ Static Assets ที่ใช้เผยแพร่หน้าเว็บ

## ฐานข้อมูลที่เชื่อมกับ Worker

| ตัวแปร Worker | ฐานข้อมูล | Data Source ID |
| --- | --- | --- |
| `NOTION_DATA_SOURCE_ID` | Iprint Paper Calculator Size Presets | `3c81a0ce-e8bd-800d-b31f-000b0deb3ee3` |
| `NOTION_MATERIALS_DATA_SOURCE_ID` | Iprint Materials | `d251a0ce-e8bd-8314-bc43-074b0f9cedb7` |
| `NOTION_SERVICES_DATA_SOURCE_ID` | Iprint Service | `3d71a0ce-e8bd-8342-b818-078d7bf8818e` |
| `NOTION_CUSTOMERS_DATA_SOURCE_ID` | Customer Database | `3ca1a0ce-e8bd-805d-a279-000b9b7152c1` |
| `NOTION_QUOTES_DATA_SOURCE_ID` | iPrint Quotes | `3ca1a0ce-e8bd-80c5-8f5b-000bfb368895` |
| `NOTION_TICKETS_DATA_SOURCE_ID` | Iprint Jobs | `4001a0ce-e8bd-8312-a136-07db4162080f` |
| `NOTION_ORDER_ITEMS_DATA_SOURCE_ID` | Iprint Order Items | `3cc1a0ce-e8bd-8068-acd1-000bcaea0f4a` |
| `NOTION_CAPACITY_DATA_SOURCE_ID` | Iprint Daily Capacity | `1038efe9-a49d-4561-9345-76c8ec0810cd` |
| `NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID` | Iprint Production Allocations | สร้างฐานตาม Schema ด้านล่างแล้วนำ Data Source ID มาใส่ |

Data Source ID ไม่ใช่ Secret จึงเก็บใน `wrangler.toml` ได้ ส่วน Token และ API key ต้องเก็บเป็น Secret เท่านั้น

## Schema ที่เตรียมเพิ่มแล้ว

`Iprint Jobs`

- `Workflow Status`: `NEW`, `IN_PROGRESS`, `PRODUCTION`, `READY`, `COMPLETED`
- ใช้คอลัมน์นี้แยกจาก `สถานะ` ภาษาไทยเดิม เพื่อไม่กระทบมุมมองและข้อมูลเดิม
- ฟิลด์ Order Foundation ที่เพิ่มใน Development Notion แล้วเมื่อ 4 กันยายน 2026:
  - `Payment Status` (Select): `WAITING_PAYMENT`, `VERIFYING`, `PAID`, `REFUNDED`, `CANCELLED`
  - `Production Status` (Select): `WAITING`, `QUEUED`, `IN_PRODUCTION`, `QC`, `REWORK`, `READY`, `COMPLETED`, `ON_HOLD`
  - `Customer Status` (Select): `ORDER_RECEIVED`, `WAITING_PAYMENT`, `PREPARING`, `IN_PRODUCTION`, `READY`, `COMPLETED`, `NEEDS_INFO`, `CANCELLED`
  - `VAT` และ `Grand Total` (Number)
  - `Currency` (Select โดยมีค่า `THB`)
  - `Order Created At` (Date)
  - `Customer Phone` (Phone) และ `Customer Email` (Email)

Worker จะตรวจว่าเลขออเดอร์และรายการถูกต้อง จำนวนมากกว่า 0 รหัสรายการไม่ซ้ำ และยอดรวมตรงกับผลรวมของรายการก่อนเขียนข้อมูลลง Notion

`Iprint Order Items`

- `Workflow Status`: สถานะตั้งแต่ `NEW` ถึง `DELIVERED`
- `Workflow Phase`, `Proof Status`, `Production Status`
- `Brief Deadline`, `Delivery Deadline`, `Updated At`
- คง `Status` เดิมไว้สำหรับข้อมูลเก่า

`Iprint Materials` และ `Iprint Service`

- `Preview Renderer`: `css` หรือ `webgl`
- `Preview Effect`: `none`, `gloss`, `matte`, `hologram`, `foil`, `texture`
- `Shader Preset`: `hologram`, `foil`, `texture`
- `Texture URL`
- ตั้งค่า `เคลือบด้าน` เป็น `css` + `matte` และ `เคลือบเงา` เป็น `css` + `gloss` แล้ว จึงใช้แสงสะท้อนระดับแผ่นโดยไม่เปิด WebGL

`Iprint Service` สำหรับระบบ Capacity

- `Capacity Points` (Number): แต้มที่ใช้ต่อหนึ่งช่วง; ใช้ `0` หากยังไม่ต้องการนำบริการนั้นมาคิดคิว
- `Capacity Basis` (Select): `job`, `sheet` หรือ `piece`
- `Capacity Step` (Number): จำนวนต่อหนึ่งช่วง เช่น `100` ร่วมกับ `piece` หมายถึงคิดแต้มทุก 100 ชิ้น
- เพิ่มสามคอลัมน์นี้ใน Development Notion แล้วเมื่อ 4 กันยายน 2026; ค่าที่แก้จากหน้า Staff พร้อมบันทึกลง Notion หลัง deploy Worker รุ่นปัจจุบัน

`Iprint Daily Capacity`

- `Date` (Date): วันที่ทำงาน โดยมีหนึ่งรายการต่อหนึ่งวัน
- `Daily Capacity` และ `Reserved Points` (Number): กำลังผลิตสูงสุดและแต้มที่จองแล้ว
- `Closed` (Checkbox): ปิดรับงานเฉพาะวัน
- `Cutoff Time` (Text): เวลาตัดรอบรูปแบบ `HH:mm`
- `Note` (Text): หมายเหตุภายในสำหรับทีมงาน
- `Status` (Select): `OPEN`, `FULL`, `CLOSED`; Worker คำนวณใหม่ทุกครั้งที่บันทึก
- สร้างฐานข้อมูล Development แล้วเมื่อ 4 กันยายน 2026 และหน้า Staff ใช้ Flow ลิสต์วัน > เลือกวัน > แก้ไข > บันทึก

`Iprint Production Allocations`

- Title: `Name`
- `Allocation Key`, `Order Key`, `Quote No`, `Item Key`, `Customer`, `Brief`, `Specs` (Text)
- `Production Date`, `Delivery Deadline` (Date)
- `Allocated Points`, `Total Points`, `Allocation Index`, `Allocation Count` (Number)
- `Order Ticket` (Relation ไป `Iprint Jobs`)
- `Order Item` (Relation ไป `Iprint Order Items`)
- `Ticket URL` (URL)
- `Status` (Status หรือ Select): `QUEUED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED`
- `Priority` (Select): `NORMAL`, `URGENT`

เพิ่มใน `Iprint Order Items` เพื่อให้ทีมเห็นแผนผลิตจากรายการโดยตรง:

- `Capacity Points` (Number)
- `Scheduled Start`, `Estimated Completion` (Date)
- `Queue Status` (Select): `QUEUED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED`

Worker จะไม่เปิดระบบจองคิวจนกว่าจะตั้ง `NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID` จึง deploy โค้ดก่อนสร้างฐานได้โดยไม่กระทบการรับออเดอร์เดิม

## ขั้นตอนที่เจ้าของ Workspace ต้องทำหนึ่งครั้ง

1. เปิด Notion Developer Portal แล้วสร้าง Internal Integration ชื่อ `iPrint Flow Worker` ใน Workspace `พื้นที่ของ iprint.garphic1`.
2. ให้สิทธิ์อ่าน เพิ่ม และแก้ไขเนื้อหา จากนั้นเพิ่มฐานข้อมูลทั้งหมดด้านบนใน Content access ของ Integration หรือใช้เมนู Add connections ของแต่ละฐานข้อมูล.
3. คัดลอก Internal Integration Secret ไปเก็บใน Cloudflare Worker Secret ชื่อ `NOTION_TOKEN` ห้ามวาง Secret ในไฟล์หรือส่งเข้า Git.
4. สร้างค่าสุ่มยาวสำหรับ `WRITE_API_KEY` และเก็บเป็น Cloudflare Worker Secret เช่นกัน.
5. ก่อนเปิดให้ลูกค้าสั่งซื้อโดยไม่ Login ให้สร้าง Cloudflare Turnstile widget สำหรับ `iprint.tchl.online` แล้วเก็บ `TURNSTILE_SECRET_KEY` เป็น Worker Secret จากนั้นจึงตั้ง `PUBLIC_ORDER_ENABLED = "true"`. ค่าเริ่มต้นเป็น `false` เพื่อไม่เปิด endpoint สาธารณะโดยไม่ตั้งใจ

จากโฟลเดอร์รากของโปรเจกต์ ใช้คำสั่งต่อไปนี้และกรอกค่าผ่าน prompt:

```powershell
npx wrangler deploy --config worker/wrangler.toml
npx wrangler secret put NOTION_TOKEN --config worker/wrangler.toml
npx wrangler secret put WRITE_API_KEY --config worker/wrangler.toml
```

สำหรับทดสอบในเครื่อง ให้คัดลอก `worker/.dev.vars.example` เป็น `worker/.dev.vars` แล้วใส่ Secret จริงเฉพาะในไฟล์ที่ถูก ignore:

```powershell
Copy-Item worker/.dev.vars.example worker/.dev.vars
npx wrangler dev --config worker/wrangler.toml
```

## ตรวจสอบก่อน Deploy

- Integration เปิดฐานข้อมูลทั้งหมด รวม `Iprint Production Allocations` ได้
- `NOTION_TOKEN` และ `WRITE_API_KEY` อยู่ใน Worker Secrets
- ทดสอบ Worker แบบ mock ทุกไฟล์ผ่าน
- ทดสอบ `GET /presets`, `GET /materials`, `GET /services` กับ Notion จริง
- สร้างออเดอร์ทดสอบหนึ่งรายการ แล้วตรวจ Relation ระหว่าง `Iprint Jobs` กับ `Iprint Order Items`
- ทดสอบเปลี่ยน `Workflow Status` หนึ่งขั้นและตรวจหน้า Tracking
- ตรวจว่าออเดอร์สร้าง Allocation, เพิ่ม `Reserved Points` และแสดงในปฏิทิน Staff
