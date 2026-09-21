# Material Preview — ดูตัวอย่างวัสดุ 3 มิติ

หน้าแยก (`/material-preview/`) ให้ลูกค้าเห็นนามบัตรเป็น 3 มิติ เอียงแล้วเห็นแสงวิ่งผ่านผิวกระดาษ / ฟอยล์ / Spot UV / Emboss
ก่อนสั่งพิมพ์ — ไม่มี Backend ไม่ผูกกับราคา ตะกร้า หรือออเดอร์ ไฟล์ที่อัปโหลดประมวลผลในเบราว์เซอร์เท่านั้น

Three.js r186 (MIT) อยู่ใน `vendor/three/` ไม่พึ่ง CDN · เริ่มต้นจากต้นแบบ `iprint-material-preview-v2`

## ลูกค้าใช้อย่างไร (แผงมี 4 ขั้น อัปโหลดทีละชั้น เห็นผลทันที)

| ขั้น | ทำอะไร | ไฟล์ที่รับ |
|---|---|---|
| 0 รูปร่างและขนาด | สี่เหลี่ยม / มุมมน / วงกลม-วงรี / ไดคัทจากไฟล์, กว้าง×สูง (20–150 mm), Bleed ของไฟล์งาน | ไดคัท: SVG หรือ PNG (โปร่งใส) |
| 1 Layer 1 | เลือก Material (กระดาษ) + อัปโหลดไฟล์งานพิมพ์ (พื้นหลัง ข้อความ รูป ในไฟล์เดียว) | SVG, PNG, JPG, WebP |
| 2 Layer 2 | เคลือบ: ไม่เคลือบ / ด้าน / เงา (ทั้งใบ ไม่ต้องมีไฟล์) | – |
| 3 Layer 3 | เทคนิคพิเศษทีละแบบ: Spot UV, Gold / Silver Foil, Emboss, Deboss + ไฟล์รูปทรง | SVG หรือ PNG |

- **Layer 3 คือ "รูปทรง" ไม่ใช่งานที่เห็น** — สีอะไรก็ได้ ระบบใช้แค่รูปทรง (เหมือนไฟล์ foil layer ที่โรงพิมพ์ขอ) PNG ที่ไม่โปร่งใส (ดำบนขาว) ใช้ส่วนที่เข้มเป็นรูปทรง มีปุ่มกลับด้าน
- **ทุก Layer ลงกรอบเดียวกัน** ไม่ยืดภาพ วางกลางกรอบ ถ้าสัดส่วนไฟล์ไม่ตรงกรอบจะมีข้อความเตือน (และแนะนำ Bleed ให้ถ้าไฟล์ดูเหมือนมี Bleed 3 mm)
- กรอบงาน = ขนาดบัตร + Bleed ที่ตั้งไว้ · ไดคัทจากไฟล์: กรอบ = กรอบ (Artboard) ของไฟล์ไดคัท ดังนั้นไฟล์งาน/ไฟล์ Layer 3 ที่ใช้ Artboard เดียวกันจะตรงกันเอง (ตัวอย่าง 3 ไฟล์ใน `assets/samples/` ใช้ Artboard 96×60 mm)
- ไดคัท: ใช้ชิ้นที่ใหญ่ที่สุดในไฟล์, วงที่อยู่ข้างในเป็นรูเจาะ; SVG อ่านเส้นจาก path ตรงๆ (ควรตั้งชื่อ Layer `dieline`), PNG สกัดเส้นจากภาพ (ขอบหยาบกว่า SVG); ลูกค้าใส่ความกว้างจริงเป็น mm ความสูงคำนวณจากรูปทรง

## ไฟล์

```
material-preview/
├─ index.html      หน้า (ไม่มี importmap / inline script — CSP ของไซต์คือ script-src 'self')
├─ style.css       Mobile-first, Desktop ≥ 880px แยกคอลัมน์
├─ app.js          ตัวประสาน: renderer, render loop, Tilt sensor, ซูม
├─ panel.js        แผง 4 ขั้น + ลากวางไฟล์ (ไปที่ขั้นที่เปิดอยู่)
├─ layers.js       สถานะรูปร่าง / Layer 1 / Layer 3 · เปลี่ยนทีละรอบ "คำสั่งล่าสุดชนะ"
├─ materials.js    ★ Config ทั้งหมด: กระดาษ, เคลือบ, Finish, ขนาดมาตรฐาน, งบพื้นผิว
├─ shape.js        เรขาคณิตล้วน (ไม่มี DOM): รูปทรงสำเร็จรูป, กรอบ, สกัดเส้นขอบ, ตรวจไฟล์ภาพ — ทดสอบใน node ได้
├─ shapeFile.js    ไฟล์ไดคัท SVG/PNG → เส้นขอบ
├─ svgArtwork.js   อ่าน/วาด SVG เป็นชั้นเดียว (ตัด script/ลิงก์ภายนอก, ซ่อนเส้นไกด์ dieline/bleed/guide)
├─ rasterArtwork.js PNG/JPG/WebP: ตรวจ header ก่อนถอดรหัส, วาดแบบ contain
├─ card.js         ประกอบตัวบัตร: ตัวบัตรจากเส้นขอบ + หมึก + เคลือบ + Finish
├─ artwork.js      Canvas ของงานพิมพ์ / รูปทรง + การ์ดเดโม
├─ procedural.js   สร้างพื้นผิวกระดาษ (height → normal / roughness / albedo)
├─ studio.js       กล้อง, ไฟ, Environment, เงา (เงาตามเส้นขอบ)
├─ input.js        เมาส์ / สัมผัส / Pinch / DeviceOrientation
├─ vendor/three/   three.module.min.js, three.core.js, LICENSE
└─ assets/samples/ ไฟล์ตัวอย่างสำหรับลูกค้าโหลดไปทดลอง
```

## เพิ่มวัสดุ / เคลือบ / Finish

เพิ่ม Entry ใน `materials.js` — ปุ่มขึ้นเอง ไม่ต้องแก้โค้ดอื่น

- **กระดาษใหม่** (`paperMaterials`): copy Entry เดิม เปลี่ยน key/ตัวเลข ลวดลายแบบ `procedural` ต้องจูนด้วยตา หรือชี้ `maps` ไปที่ภาพสแกนกระดาษจริง (`assets/textures/…`, `tileMm` = ภาพหนึ่งใบครอบคลุมกี่ mm)
  - ถ้าใช้ภาพสแกน Emboss/Deboss จะไม่มีเม็ดกระดาษในช่วงที่เปิด Emboss (ไม่มีข้อมูลความสูงของกระดาษให้รวม) — แก้ภายหลังได้ด้วย shader
- **เคลือบ** (`coatings`): `roughness`, `clearcoat`, `clearcoatRoughness`, `normalMul` (เม็ดกระดาษทะลุฟิล์มแค่ไหน) — ค่าปัจจุบันจูนด้วยตา ควรเทียบกับตัวอย่างจริงของ iPrint
- **Finish** (`finishes` + `FINISH_ORDER`): `type` เป็น `foil` (ฟอยล์), `gloss` (Spot UV) หรือ `emboss` (`heightUm` บวก = นูน ลบ = จม) Holographic = เพิ่ม `iridescence` ใน `createFinishMaterial` (card.js)
- ระบบแสดงได้ทุกคู่ผสม กฎว่าคู่ไหนผลิตไม่ได้ (เช่น ฟอยล์บนเคลือบบางชนิด) ยังไม่ได้ใส่ — ให้ iPrint กำหนด

## Deploy

- `scripts/build-hostinger-package.ps1` คัดลอกโฟลเดอร์นี้ไปกับ Package แล้ว (GitHub Pages ส่งทั้ง `iprint-plus-cost-calculator/` อยู่แล้ว)
- **ห้ามใช้ import map และ inline script** — `.htaccess` ตั้ง `script-src 'self'` (ทดสอบแล้วว่า import map แบบ inline ถูกบล็อก) three.js จึง import ด้วย path แบบ relative
- **ห้ามตั้งชื่อไฟล์ `.mjs`** — `.htaccess` ปฏิเสธ (`Require all denied`)
- `.htaccess` ตั้ง `Cache-Control: no-cache` ให้ `.js` ทุกไฟล์ รวม three.js (~790 KB, gzip ~190 KB) ซึ่งจะถูกถามเซิร์ฟเวอร์ทุกครั้ง (ได้ 304) ถ้าจะให้ `vendor/` cache ยาวต้องเพิ่มกฎแยก **และคงบล็อกที่ `tests/deployment-config-test.mjs` ตรวจอยู่** — ต้องทดสอบบน Hostinger จริง
- ทดสอบ: `node tests/material-preview-test.mjs` (ตรรกะเรขาคณิต, Config, หน้าต้องผ่าน CSP) · เปิดดูด้วย `node scripts/dev-server.mjs` แล้วไปที่ `http://127.0.0.1:4173/material-preview/` (เพิ่ม `?debug` ดู FPS / ขนาด texture, `?tilt=1` แสดงปุ่ม Tilt บน Desktop)
- Tilt ต้อง HTTPS และผู้ใช้กดปุ่มเอง (iOS ขอสิทธิ์เซนเซอร์)

## สถานะการทดสอบ (ตรงไปตรงมา)

ทดสอบแล้วใน Chromium (Windows) ทั้ง Desktop และจอมือถือ 375×812: ทุกขั้นตอน, ไฟล์ผิดปกติ (แจ้งเตือนและสถานะเดิมไม่พัง), การเปลี่ยนแปลงพร้อมกันรัวๆ (สุ่ม 30 คำสั่ง × 4 รอบ), การบูตและอัปโหลดภายใต้ CSP ของ `.htaccess`

**ยังไม่ได้ทดสอบ**: iPhone Safari / Android Chrome จริง (Permission เซนเซอร์, ทิศเอียง, FPS, หน่วยความจำ) · บน Hostinger จริง (Header / Cache / บีบอัด) · ด้านหลังบัตร (มีด้านหน้าอย่างเดียว) · สีบนจอเป็นค่าโดยประมาณ ไม่ใช่สีพิมพ์
