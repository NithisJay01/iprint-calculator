# Material Preview — ดูตัวอย่างวัสดุ 3 มิติ

หน้าแยก (`/material-preview/`) ให้ลูกค้าเห็นนามบัตรเป็น 3 มิติ เอียงแล้วเห็นแสงวิ่งผ่านผิวกระดาษ / ฟอยล์ / Spot UV / Emboss
ก่อนสั่งพิมพ์ — ไฟล์พรีวิวประมวลผลในเบราว์เซอร์ จนกว่าลูกค้าจะยืนยันส่งคำขอ จากนั้นส่งบรีฟสรุปและ PDF Artwork ไป Notion ผ่าน `/public/print-requests` (ยังไม่จองคิวผลิต)

Three.js r186 (MIT) อยู่ใน `vendor/three/` ไม่พึ่ง CDN · เริ่มต้นจากต้นแบบ `iprint-material-preview-v2`

## ลูกค้าใช้อย่างไร (แผงมี 4 ขั้น อัปโหลดทีละชั้น เห็นผลทันที)

| ขั้น | ทำอะไร | ไฟล์ที่รับ |
|---|---|---|
| 0 รูปร่างและขนาด | สี่เหลี่ยม / มุมมน / วงกลม-วงรี / ไดคัทจากไฟล์, กว้าง×สูง (20–150 mm), Bleed ของไฟล์งาน | ไดคัท: SVG หรือ PNG (โปร่งใส) |
| 1 Layer 1 | เลือก Material (กระดาษ) + อัปโหลดไฟล์งานพิมพ์ (พื้นหลัง ข้อความ รูป ในไฟล์เดียว) | SVG, PNG, JPG, WebP |
| 2 Layer 2 | เคลือบ: ไม่เคลือบ / ด้าน / เงา (ทั้งใบ ไม่ต้องมีไฟล์) | – |
| 3 Layer 3 | เทคนิคพิเศษทีละแบบ: Spot UV, Gold / Silver Foil, Emboss, Deboss + ไฟล์รูปทรง | SVG หรือ PNG |
| 4 ส่งออก | ดาวน์โหลดไฟล์ผลิต **PDF** และ **SVG** แยกเลเยอร์ (ดูหัวข้อ "ส่งออกไฟล์ผลิต") | – |

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
│  ── ส่งออกไฟล์ผลิต (โหลดเมื่อเปิดขั้นที่ 4 เท่านั้น) ──
├─ productionSpec.js  แผนงานผลิต: หน้ากระดาษ Trim/Bleed, ไดไลน์เส้นโค้งจริง, Crop marks, รายการตรวจ, หน้าสรุปสเปก (บริสุทธิ์ ทดสอบใน node)
├─ svgPath.js      SVG path / รูปทรง → เส้นโค้ง Bézier (บริสุทธิ์)
├─ pdf.js          ตัวเขียน PDF (ไม่พึ่งไลบรารี) + ตัวอ่านย้อนกลับตรวจ offset/ความยาว stream
├─ pdfBuild.js     งานผลิต → PDF: Trim/Bleed Box, เลเยอร์ (OCG), สีพิเศษ Separation, overprint
├─ svgBuild.js     งานผลิต → SVG แยกเลเยอร์ ขนาดจริงเป็น mm
├─ svgConvert.js   SVG ของลูกค้า → เวกเตอร์ (ใช้ getComputedStyle/getCTM ของเบราว์เซอร์, รันใน Shadow DOM)
└─ exportFiles.js  ประกอบทุก Layer เป็นไฟล์ + ดาวน์โหลด (ฝังรูป, สกัดเส้นจาก PNG, fallback เป็นภาพ)
├─ rasterArtwork.js PNG/JPG/WebP: ตรวจ header ก่อนถอดรหัส, วาดแบบ contain
├─ card.js         ประกอบตัวบัตร: ตัวบัตรจากเส้นขอบ + หมึก + เคลือบ + Finish
├─ artwork.js      Canvas ของงานพิมพ์ / รูปทรง + การ์ดเดโม
├─ procedural.js   สร้างพื้นผิวกระดาษ (height → normal / roughness / albedo)
├─ studio.js       กล้อง, ไฟ, Environment, เงา (เงาตามเส้นขอบ)
├─ input.js        เมาส์ / สัมผัส / Pinch / DeviceOrientation
├─ vendor/three/   three.module.min.js, three.core.js, LICENSE
└─ assets/samples/ ไฟล์ตัวอย่างสำหรับลูกค้าโหลดไปทดลอง
```

## ส่งออกไฟล์ผลิต (PDF / SVG)

ขั้นที่ 4 สร้างไฟล์ส่งโรงพิมพ์จากสิ่งที่เห็นในพรีวิว ในเบราว์เซอร์ล้วน (ไม่อัปโหลดอะไร) ต้องมีไฟล์ Layer 1 ก่อน ปุ่มจึงใช้ได้

| | PDF | SVG |
|---|---|---|
| หน้ากระดาษ | MediaBox = กรอบงาน (+ 10 mm ถ้าใส่ Crop marks), **BleedBox** = กรอบงาน, **TrimBox** = ตัวบัตร | ขนาดจริง `width="…mm"` |
| เลเยอร์ | Artwork · Dieline · เทคนิคพิเศษ · Marks (Optional Content) | `<g id=… inkscape:groupmode="layer">` + Guides (ซ่อน) |
| ไดไลน์ | สีพิเศษ `Dieline` (Separation) overprint — สี่เหลี่ยม/มุมมน/วงรีเป็นเส้นโค้งจริง, ไดคัทจากไฟล์เป็นเส้นหลายจุด (< 0.05 mm) | สีจอของสีพิเศษ ชื่อ Layer บอกความหมาย |
| เทคนิคพิเศษ | สีพิเศษ 100% ตามชนิด (`Foil_Gold`, `Foil_Silver`, `Spot_UV`, `Emboss`, `Deboss`) overprint เวกเตอร์ (PNG → สกัดเส้นเป็นเวกเตอร์) | เหมือนกัน |
| งานพิมพ์ | SVG → เวกเตอร์ · JPEG ส่งผ่านไฟล์เดิม · PNG/อื่นๆ ฝังที่ความละเอียดเดิม (สูงสุด 25 ล้านพิกเซล) | SVG → ฝังไฟล์เดิมทั้งไฟล์ (Text/Gradient ยังแก้ได้) · รูป → ฝังไฟล์เดิม |
| สี | RGB (ค่าเริ่มต้น ให้ฝ่ายผลิตแปลง) หรือ CMYK แบบง่าย (ไม่มี ICC) | RGB |
| เพิ่มเติม | หน้า 2 = สรุปสเปก (กระดาษ เคลือบ Finish ชื่อไฟล์ สีพิเศษ) · ข้อมูลเอกสาร | – |

- **ไฟล์ .ai** ไม่มีให้ดาวน์โหลดตรง (รูปแบบปิดของ Adobe) ให้เปิด PDF ใน Illustrator แล้วบันทึกเป็น .ai — **ยังไม่ได้ทดสอบกับ Illustrator จริง**
- SVG ของลูกค้าที่ใช้ Text (ยังไม่ Outline), Gradient / Pattern, clip-path, mask, filter, `<use>` หรือเส้นขอบที่ถูกยืดไม่เท่ากันสองแกน PDF เก็บเป็นเวกเตอร์ไม่ได้ → ทั้ง Layer จะถูกวาดเป็นภาพ 600 dpi พร้อมบอกเหตุผลในรายงาน (SVG ที่ส่งออกยังฝังไฟล์เดิมไว้ทั้งหมด)
- รายการตรวจก่อนส่งออกแจ้ง: ไม่มี Bleed / Bleed น้อยกว่า 3 mm, ความละเอียดต่ำกว่า 300 dpi, ไดไลน์ที่มาจากภาพ PNG (ใช้อ้างอิงเท่านั้น), Finish ที่ยังไม่มีรูปทรง, โหมดสี
- **ยังไม่ใช่ PDF/X** และไม่มี output intent / ICC — เป็น PDF สำหรับงานพิมพ์ที่ฝ่ายผลิตต้องตรวจก่อน (ฟอนต์ของหน้าสรุปสเปกเป็น Helvetica มาตรฐาน ไม่ฝัง)
- **ค่าเริ่มต้นที่ต้องยืนยันกับฝ่ายผลิต** อยู่ที่ `EXPORT` ใน `materials.js`: ชื่อสีพิเศษ/ชื่อเลเยอร์ (ตอนนี้เป็นค่ากลางๆ ไม่ใช่สเปกจริงของ iPrint), Bleed ขั้นต่ำ, dpi ขั้นต่ำ, ขนาด Crop marks
- ชนิด Emboss / Deboss ส่งออกเฉพาะ "รูปทรง" — ความลึกและแม่พิมพ์ฝ่ายผลิตกำหนดเอง (ค่าไมครอนในพรีวิวไม่ถูกส่งออก)
- ทดสอบ: `node tests/material-preview-export-test.mjs` (ตัวแปลง path, ตัวเขียน/อ่านย้อน PDF, แผนงาน, JPEG header) — ส่วนภาพตรวจใน browser ด้วยการจำลองการวาดเนื้อหา PDF แล้วเทียบพิกเซลกับที่เบราว์เซอร์วาดไฟล์ต้นฉบับ (ต่างเฉลี่ย < 0.1/255)

## เพิ่มวัสดุ / เคลือบ / Finish

เพิ่ม Entry ใน `materials.js` — ปุ่มขึ้นเอง ไม่ต้องแก้โค้ดอื่น

- **กระดาษใหม่** (`paperMaterials`): copy Entry เดิม เปลี่ยน key/ตัวเลข ลวดลายแบบ `procedural` ต้องจูนด้วยตา หรือชี้ `maps` ไปที่ภาพสแกนกระดาษจริง (`assets/textures/…`, `tileMm` = ภาพหนึ่งใบครอบคลุมกี่ mm)
  - ถ้าใช้ภาพสแกน Emboss/Deboss จะไม่มีเม็ดกระดาษในช่วงที่เปิด Emboss (ไม่มีข้อมูลความสูงของกระดาษให้รวม) — แก้ภายหลังได้ด้วย shader
- **เคลือบ** (`coatings`): `roughness`, `clearcoat`, `clearcoatRoughness`, `normalMul` (เม็ดกระดาษทะลุฟิล์มแค่ไหน) — ค่าปัจจุบันจูนด้วยตา ควรเทียบกับตัวอย่างจริงของ iPrint
- **Finish** (`finishes` + `FINISH_ORDER`): `type` เป็น `foil` (ฟอยล์), `gloss` (Spot UV) หรือ `emboss` (`heightUm` บวก = นูน ลบ = จม) Holographic = เพิ่ม `iridescence` ใน `createFinishMaterial` (card.js)
- ระบบแสดงได้ทุกคู่ผสม กฎว่าคู่ไหนผลิตไม่ได้ (เช่น ฟอยล์บนเคลือบบางชนิด) ยังไม่ได้ใส่ — ให้ iPrint กำหนด

## ปุ่มทางเข้า (3 จุด)

| หน้า | ตำแหน่งปุ่ม | ลิงก์ |
| --- | --- | --- |
| หน้าแรก `index.html` | รายการทางเข้าบนหน้าเริ่มต้น ต่อจาก "บรีฟงานแบบเฉพาะเจาะจง" | `material-preview/?from=home` |
| Catalog `catalog/` | การ์ด Business Cards ใต้ปุ่ม "ดูแพ็กเกจและราคา" | `../material-preview/?from=catalog` |
| นามบัตร `business-card/` | Hero: "ลองใส่ดีไซน์ของคุณ" | `../material-preview/?from=business-card` |

`?from=` ทำให้ปุ่ม "‹ กลับ" ในหน้านี้พาไปหน้าที่ลูกค้าเข้ามา (ไม่ใส่หรือค่าอื่น = กลับ Catalog) เพิ่มทางเข้าใหม่: ใส่ปุ่มในหน้านั้น + เพิ่มคีย์ใน `BACK` ของ `app.js` (`tests/material-preview-test.mjs` ตรวจว่าปุ่มทุกอันชี้หน้าจริงและ `app.js` รู้จักคีย์) หน้านี้ยังตั้ง `noindex` อยู่

## Deploy

- `scripts/build-hostinger-package.ps1` คัดลอกโฟลเดอร์นี้ไปกับ Package แล้ว (GitHub Pages ส่งทั้ง `iprint-plus-cost-calculator/` อยู่แล้ว)
- **ห้ามใช้ import map และ inline script** — `.htaccess` ตั้ง `script-src 'self'` (ทดสอบแล้วว่า import map แบบ inline ถูกบล็อก) three.js จึง import ด้วย path แบบ relative
- **ห้ามตั้งชื่อไฟล์ `.mjs`** — `.htaccess` ปฏิเสธ (`Require all denied`)
- `.htaccess` ตั้ง `Cache-Control: no-cache` ให้ `.js` ทุกไฟล์ รวม three.js (~790 KB, gzip ~190 KB) ซึ่งจะถูกถามเซิร์ฟเวอร์ทุกครั้ง (ได้ 304) ถ้าจะให้ `vendor/` cache ยาวต้องเพิ่มกฎแยก **และคงบล็อกที่ `tests/deployment-config-test.mjs` ตรวจอยู่** — ต้องทดสอบบน Hostinger จริง
- ทดสอบ: `node tests/material-preview-test.mjs` (ตรรกะเรขาคณิต, Config, หน้าต้องผ่าน CSP) · เปิดดูด้วย `node scripts/dev-server.mjs` แล้วไปที่ `http://127.0.0.1:4173/material-preview/` (เพิ่ม `?debug` ดู FPS / ขนาด texture, `?tilt=1` แสดงปุ่ม Tilt บน Desktop)
- Tilt ต้อง HTTPS และผู้ใช้กดปุ่มเอง (iOS ขอสิทธิ์เซนเซอร์)

## สถานะการทดสอบ (ตรงไปตรงมา)

ทดสอบแล้วใน Chromium (Windows) ทั้ง Desktop และจอมือถือ 375×812: ทุกขั้นตอน, ไฟล์ผิดปกติ (แจ้งเตือนและสถานะเดิมไม่พัง), การเปลี่ยนแปลงพร้อมกันรัวๆ (สุ่ม 30 คำสั่ง × 4 รอบ), การบูตและอัปโหลดภายใต้ CSP ของ `.htaccess`

ส่งออกไฟล์: อ่านไฟล์ PDF ที่ได้กลับมาตรวจเอง (offset, ความยาว stream, Trim/Bleed Box, เลเยอร์, สีพิเศษ) และจำลองวาดเนื้อหา PDF เทียบกับที่เบราว์เซอร์วาด SVG ต้นฉบับ (เส้นโค้ง, transform ซ้อน, เส้นประ, evenodd, opacity, `<svg>` ซ้อน), รูป JPEG (ส่งผ่าน / EXIF หมุน), PNG โปร่งใส, ไฟล์ที่ต้อง fallback, ภาพเกินเกณฑ์ 25 ล้านพิกเซล

**ยังไม่ได้ทดสอบ**: iPhone Safari / Android Chrome จริง (Permission เซนเซอร์, ทิศเอียง, FPS, หน่วยความจำ) · บน Hostinger จริง (Header / Cache / บีบอัด) · **ไฟล์ที่ส่งออกกับ Acrobat / Illustrator / RIP และ preflight ของ iPrint จริง** · ด้านหลังบัตร (มีด้านหน้าอย่างเดียว) · สีบนจอเป็นค่าโดยประมาณ ไม่ใช่สีพิมพ์

## Showroom และคำขอสั่งพิมพ์

ดูรายละเอียด flow, ข้อจำกัดราคา, สิ่งที่ส่งไป Notion และขั้นตอน deploy ที่ `../../docs/BUSINESS-CARD-3D-FLOW.md`
