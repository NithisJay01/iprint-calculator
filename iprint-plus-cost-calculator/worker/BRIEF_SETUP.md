# Brief Button V1: สรุปแชท LINE เป็นใบงาน

เจ้าของร้านคุยกับลูกค้าใน LINE ตามปกติ แล้วเปิดหน้า `/brief/` กด **สร้างบรีฟ** ระบบจะอ่านข้อความล่าสุดของลูกค้า ให้ AI สรุปเป็น Draft Brief เจ้าของตรวจและแก้ไข แล้วกด **Create Ticket** เพื่อสร้างรายการใน Notion (`Iprint Jobs`)

AI ไม่ได้คุยกับลูกค้า และไม่มี Ticket ใดถูกสร้างจนกว่าเจ้าของจะกดยืนยันในหน้าจอตรวจบรีฟ

```
LINE → POST /line/webhook → D1 (เก็บข้อความลูกค้า)
เจ้าของกด "สร้างบรีฟ" → POST /staff/briefs/draft → Claude → Draft Brief
เจ้าของตรวจ/แก้ไข → POST /staff/briefs/ticket → Notion Ticket
```

## ทำไมต้องเก็บข้อความเอง

LINE ไม่มี API ให้ย้อนอ่านประวัติแชท มีแต่การส่งข้อความใหม่มาที่ Webhook ดังนั้น Worker จึงเก็บข้อความที่ลูกค้าส่งเข้ามาไว้ใน Cloudflare D1 แล้วอ่านกลับมาเมื่อกดสร้างบรีฟ

ข้อจำกัดของ V1:

- ระบบเห็นเฉพาะ **ข้อความที่ลูกค้าส่ง** ข้อความที่เจ้าของตอบผ่าน LINE Official Account Manager ไม่ถูกส่งมาที่ Webhook หากร้านตอบหรือตกลงอะไรไว้ ให้พิมพ์ใน “เพิ่มข้อความจากร้าน” ก่อนกดสร้างบรีฟ
- รองรับแชท 1:1 เท่านั้น ข้อความในกลุ่มและห้องแชทถูกข้าม
- ข้อความจะถูกลบอัตโนมัติหลัง 30 วัน (`LINE_RETENTION_DAYS`) และลบทันทีเมื่อลูกค้ากดยกเลิกการส่งข้อความ
- รูป ไฟล์ และสติกเกอร์เก็บเป็นป้ายบอก เช่น `[รูปภาพ]` ระบบไม่ดาวน์โหลดหรืออ่านไฟล์จริง

## กฎที่ระบบบังคับ (ไม่พึ่งแค่ Prompt)

- **ห้ามเดา** ฟิลด์ที่ไม่มีข้อมูลเป็น `Missing` และไม่มีค่าเสมอ
- `Confirmed` ต้องมีข้อความอ้างอิงที่ลูกค้าพิมพ์จริงและตรวจเจอในแชทตรงตัว ถ้าไม่เจอจะถูกลดเป็น `Need Confirmation`
- ลูกค้าพูดว่า “เหมือนเดิม / เหมือนรอบก่อน” ระบบยังไม่มีข้อมูลงานเดิม ฟิลด์นั้นจึงเป็น `Need Confirmation` เสมอ แม้ AI จะตอบว่า Confirmed
- `Create Ticket` ต้องส่ง `reviewed: true` จากหน้าจอตรวจบรีฟ และส่งบรีฟเดิมซ้ำจะไม่สร้าง Ticket ซ้อน (ใช้ `Order Key = BRIEF-<briefKey>`)
- Customer มาจากชื่อโปรไฟล์ LINE ไม่ได้มาจาก AI

## ตั้งค่าครั้งแรก

### 1. LINE Official Account

1. เปิด LINE Developers Console ใช้ Messaging API channel ของร้าน
2. Webhook URL: `https://iprint-flow-api.iprint-garphic1.workers.dev/line/webhook` แล้วเปิด **Use webhook**
3. ที่ LINE Official Account Manager > การตอบกลับ เปิดทั้ง **แชท** และ **Webhook** ปิด **ข้อความตอบกลับอัตโนมัติ** ถ้าไม่ต้องการ (เจ้าของยังตอบลูกค้าเองจาก LINE OA ได้ตามเดิม)
4. คัดลอก **Channel secret** และออก **Channel access token (long-lived)** ไว้ใช้ในขั้นตอนที่ 3

### 2. ฐานข้อมูล D1

```bash
cd worker
npm install
npx wrangler d1 create iprint-brief
```

นำ `database_id` ที่ได้ไปใส่ในบล็อก `[[d1_databases]]` ท้ายไฟล์ `wrangler.toml` แล้วเอา `#` ออก จากนั้นสร้างตาราง

```bash
npx wrangler d1 migrations apply iprint-brief --remote
```

### 3. Secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

`LINE_CHANNEL_ACCESS_TOKEN` ใช้ดึงชื่อโปรไฟล์ลูกค้าเท่านั้น ถ้าไม่ตั้ง ระบบยังทำงานได้แต่ชื่อลูกค้าจะว่าง

### 4. Deploy และทดสอบ

```bash
npx wrangler deploy
```

กดปุ่ม **Verify** ที่ Webhook URL ใน LINE Developers Console ต้องได้ Success จากนั้นส่งข้อความหาร้านจากบัญชี LINE อื่น เปิด `https://iprint.tchl.online/brief/` ใส่ Staff API Key แล้วชื่อลูกค้าควรขึ้นในรายการ

ก่อนตั้งค่าครบ Endpoint จะตอบ `503 ... is not configured` และไม่กระทบระบบสั่งงานเดิม

## ตัวแปร

| ชื่อ | ชนิด | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Secret | จำเป็น | เรียก Claude สรุปบรีฟ |
| `LINE_CHANNEL_SECRET` | Secret | จำเป็น | ตรวจลายเซ็นของ Webhook |
| `LINE_CHANNEL_ACCESS_TOKEN` | Secret | ไม่บังคับ | ดึงชื่อโปรไฟล์ลูกค้า |
| `BRIEF_DB` | D1 binding | จำเป็น | เก็บข้อความ LINE |
| `BRIEF_AI_MODEL` | Variable | `claude-opus-5` | เปลี่ยนเป็นรุ่นที่เร็วหรือถูกกว่า เช่น `claude-haiku-4-5` |
| `LINE_RETENTION_DAYS` | Variable | `30` | จำนวนวันที่เก็บข้อความ (1-365) |
| `NOTION_TICKETS_DATA_SOURCE_ID` | Variable | ตั้งไว้แล้ว | ฐาน `Iprint Jobs` |

การเรียก Claude เปิด `fallbacks: "default"` ไว้ หากตัวตรวจความปลอดภัยปฏิเสธคำขอ API จะลองรุ่นสำรองให้เอง

## ข้อมูลที่เขียนลง Notion

ข้อมูลครบทั้งหมดอยู่ในเนื้อหาหน้า Ticket แบ่งเป็น Confirmed / Need Confirmation / Missing / Note (พร้อมข้อความที่ลูกค้าพิมพ์เป็นหลักฐาน) ส่วนคอลัมน์จะเขียนเฉพาะที่มีอยู่จริงและชนิดตรงกัน จึงไม่ต้องแก้ Schema ก่อนใช้งาน: ชื่องาน (Title), `Order Key`, `ขนาด`, `จำนวนรวม`, `อธิบายเพิ่ม`, `Workflow Status` (`NEW`), `Order Created At`

## Endpoint

| Method | Path | สิทธิ์ |
| --- | --- | --- |
| POST | `/line/webhook` | ลายเซ็น LINE (`X-Line-Signature`) |
| GET | `/staff/line/conversations` | Staff key |
| POST | `/staff/briefs/draft` | Staff key |
| POST | `/staff/briefs/ticket` | Staff key |

ทดสอบ: `node worker/brief-domain-test.mjs` และ `node worker/brief-worker-test.mjs` (รวมอยู่ใน `node tests/run-all.mjs`)
