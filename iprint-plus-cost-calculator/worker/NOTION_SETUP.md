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

Data Source ID ไม่ใช่ Secret จึงเก็บใน `wrangler.toml` ได้ ส่วน Token และ API key ต้องเก็บเป็น Secret เท่านั้น

## Schema ที่เตรียมเพิ่มแล้ว

`Iprint Jobs`

- `Workflow Status`: `NEW`, `IN_PROGRESS`, `PRODUCTION`, `READY`, `COMPLETED`
- ใช้คอลัมน์นี้แยกจาก `สถานะ` ภาษาไทยเดิม เพื่อไม่กระทบมุมมองและข้อมูลเดิม

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

## ขั้นตอนที่เจ้าของ Workspace ต้องทำหนึ่งครั้ง

1. เปิด Notion Developer Portal แล้วสร้าง Internal Integration ชื่อ `iPrint Flow Worker` ใน Workspace `พื้นที่ของ iprint.garphic1`.
2. ให้สิทธิ์อ่าน เพิ่ม และแก้ไขเนื้อหา จากนั้นเพิ่มฐานข้อมูลทั้ง 7 รายการด้านบนใน Content access ของ Integration หรือใช้เมนู Add connections ของแต่ละฐานข้อมูล.
3. คัดลอก Internal Integration Secret ไปเก็บใน Cloudflare Worker Secret ชื่อ `NOTION_TOKEN` ห้ามวาง Secret ในไฟล์หรือส่งเข้า Git.
4. สร้างค่าสุ่มยาวสำหรับ `WRITE_API_KEY` และเก็บเป็น Cloudflare Worker Secret เช่นกัน.

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

- Integration เปิดฐานข้อมูลทั้ง 7 รายการได้
- `NOTION_TOKEN` และ `WRITE_API_KEY` อยู่ใน Worker Secrets
- ทดสอบ Worker แบบ mock ผ่านครบทั้ง 3 ไฟล์
- ทดสอบ `GET /presets`, `GET /materials`, `GET /services` กับ Notion จริง
- สร้างออเดอร์ทดสอบหนึ่งรายการ แล้วตรวจ Relation ระหว่าง `Iprint Jobs` กับ `Iprint Order Items`
- ทดสอบเปลี่ยน `Workflow Status` หนึ่งขั้นและตรวจหน้า Tracking
