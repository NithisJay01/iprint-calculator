# iPrint Architecture and Development Roadmap

**วันที่จัดทำ:** 2026-09-11  
**สถานะ:** Working baseline สำหรับวางแผนพัฒนาต่อ  
**ขอบเขต:** `iprint-plus-cost-calculator`, Cloudflare Worker API, Notion data sources และ Hostinger deployment

## 1. Executive Summary

iPrint ปัจจุบันเป็น Web Application แบบ Static Frontend ที่ deploy บน Hostinger และใช้ Cloudflare Worker เป็น API layer โดย Notion เป็น datastore หลักสำหรับ catalog, customer, quote, ticket, order item, capacity และ production queue

สถาปัตยกรรมนี้เหมาะกับ MVP และระบบที่มีปริมาณงานระดับควบคุมได้ แต่มีข้อจำกัดสำคัญเมื่อเปิดให้ผู้ใช้ภายนอกและทีมงานหลายคนใช้งานพร้อมกัน:

1. Staff authentication ยังใช้ shared `WRITE_API_KEY` แทน identity และ role
2. ยังไม่มี customer authentication และ ownership enforcement ที่สมบูรณ์
3. Public order ยังต้องมี rate limiting และ idempotency ที่ระดับ application
4. Notion ไม่เหมาะเป็น transactional datastore หลักเมื่อ order และ queue มีปริมาณมาก
5. Worker route และ application logic ยังรวมอยู่ใน `worker/index.js` ขนาดใหญ่

**ลำดับความสำคัญ:** แก้ identity/authorization ก่อน scaling, จากนั้นเพิ่ม resilience และ observability แล้วจึงค่อยย้าย transaction สำคัญออกจาก Notion

## 2. Current Architecture

```text
Customer / Staff Browser
          |
          | HTTPS / CORS
          v
Hostinger Static Frontend
          |
          | API requests
          v
Cloudflare Worker API
  - validation
  - authentication check
  - order workflow
  - capacity and queue rules
  - repository adapters
          |
          v
Notion API / Notion Data Sources
```

### Components

| Component | หน้าที่ | ข้อสังเกต |
|---|---|---|
| Hostinger | Serve frontend assets | เป็น single production origin |
| Vanilla JavaScript frontend | Calculator, cart, quote, brief และ staff UI | มี shared global state และ browser cache |
| Cloudflare Worker | API, validation, workflow และ integration | เป็น modular monolith ที่ยังรวม route หลายกลุ่มไว้ในไฟล์เดียว |
| Notion | Catalog, order, queue และ capacity storage | Query/concurrency/transaction จำกัด |
| Cloudflare Turnstile | ป้องกัน public order abuse เบื้องต้น | ยังไม่แทน rate limit หรือ idempotency |

แหล่งอ้างอิงหลัก:

- Public frontend configuration: `iprint-plus-cost-calculator/js/config.js`
- Shared browser key handling: `iprint-plus-cost-calculator/js/core.js`
- Worker routes and authorization: `iprint-plus-cost-calculator/worker/index.js`
- Domain/repository direction: `iprint-plus-cost-calculator/worker/README.md`
- Access model: `docs/STEP-1-DOMAIN-AND-ACCESS.md`

## 3. Baseline Verification

คำสั่งที่ใช้ตรวจ baseline:

```powershell
Push-Location iprint-plus-cost-calculator
node tests/run-all.mjs
Pop-Location
```

ผลลัพธ์ปัจจุบัน: **ผ่าน 19/19 test files**

ชุดทดสอบครอบคลุม domain, repository contract, order smoke flow, queue, capacity, workflow, deployment configuration และ public-order security เบื้องต้น แต่ยังไม่ครอบคลุม:

- concurrent load
- authorization matrix
- customer ownership isolation
- rate-limit behavior
- retry และ duplicate submission
- Notion timeout/rate-limit recovery
- browser XSS/security scanning

## 4. Risk Register

| ID | ความเสี่ยง | ระดับ | ผลกระทบ | ตัวชี้วัด/สัญญาณเตือน |
|---|---|---|---|---|
| R-01 | Shared `WRITE_API_KEY` ใช้แทน user identity และ role | สูง | พนักงานทุกคนมีสิทธิ์เท่ากันและตรวจ actor ไม่ได้ | ไม่มี `sub`, `role`, `permissions` ใน request |
| R-02 | API key เก็บใน browser storage | สูง | XSS หรือ browser compromise ขโมยสิทธิ์เขียนได้ | key อยู่ใน `localStorage`/`sessionStorage` |
| R-03 | Customer authentication/ownership ยังไม่สมบูรณ์ | สูง | ลูกค้าอาจเข้าถึง order ของผู้อื่นหาก route เชื่อข้อมูลจาก client | ไม่มี authenticated customer session |
| R-04 | Public order ไม่มี application rate limit | สูง | spam, ค่าใช้จ่าย และ Notion quota exhaustion | request ต่อ IP/customer สูงผิดปกติ |
| R-05 | Retry อาจทำให้สร้าง order ซ้ำ | สูง | เกิด ticket/order item ซ้ำจาก timeout หรือ double submit | order key ซ้ำหรือ Notion มี record ซ้ำ |
| R-06 | Staff queue ดึงข้อมูลทั้งหมดแล้ว filter ใน Worker | สูง | latency และ memory เพิ่มตามจำนวน queue | `GET /staff/orders` ช้าลงตามข้อมูลสะสม |
| R-07 | Notion เป็น transaction datastore หลัก | สูง | consistency, query และ concurrent write จำกัด | Notion timeout/429 หรือ write conflict เพิ่มขึ้น |
| R-08 | Catalog/config cache อาจ stale | กลาง | ใช้ราคา/บริการเก่าหลัง staff แก้ไข | client version ไม่ตรงกับ catalog version |
| R-09 | Internal upstream error อาจถูกส่งกลับ client | กลาง | เปิดเผย schema หรือรายละเอียดระบบ | response มี Notion detail โดยตรง |
| R-10 | Route และ orchestration รวมใน `index.js` | กลาง | แก้ไขยากและเพิ่ม regression risk | merge conflict หรือ test scope กว้างขึ้น |
| R-11 | Audit log ไม่รับรองว่าครบทุก mutation | กลาง | ตรวจสอบย้อนหลังและระบุผู้แก้ไขไม่ได้ | catalog/pricing/capacity ไม่มี actor audit |
| R-12 | ยังไม่มี load/security/recovery test | กลาง | production failure อาจไม่ถูกพบก่อน deploy | มีแต่ smoke/contract test ผ่าน |
| R-13 | Frontend และ API ใช้ production origin เดียว | ต่ำ/กลาง | staging isolation และ rollback ทำได้ยาก | ทดสอบต้องใช้ production-like resource |

## 5. Target Architecture

เป้าหมายระยะกลางควรเป็น **Modular Monolith บน Cloudflare Worker** ไม่ใช่ microservices ทันที

```text
Browser
  |
  +-- Customer session / Staff identity provider
  |
  v
Cloudflare Worker
  middleware: request-id, auth, role, rate-limit, error handling
  routes: public, customer, staff, admin
  application: use cases
  domain: order, catalog, queue, capacity
  repositories: Notion adapter / D1 adapter
  |
  +--> D1 or PostgreSQL: transactional data
  +--> R2/object storage: artwork and generated assets
  +--> Notion: back-office view/reporting/integration
  +--> KV/Durable Objects: idempotency, rate limit, short-lived cache
```

### หลักการสำคัญ

- API เป็น authority ของ authentication, authorization และ ownership
- Client ห้ามส่ง `customer_id` เพื่อกำหนดเจ้าของ resource
- ทุก mutation ต้องมี actor, timestamp, request ID, old value และ new value
- Domain rule ไม่ควรผูกกับ Notion property format
- Transaction สำคัญต้องอยู่ใน datastore ที่รองรับ atomicity และ indexing
- Notion ควรเป็น integration/back-office layer เมื่อระบบโตขึ้น

## 6. Development Roadmap

### Phase 0: Production Gate

**เป้าหมาย:** ป้องกันความเสี่ยงร้ายแรงก่อนเพิ่ม traffic

งาน:

- ปิด public ordering ไว้จนกว่า rate limit และ idempotency จะพร้อม
- ยืนยันว่า secret ไม่อยู่ใน frontend และ rotate key ที่เคยใช้จริงใน browser
- เพิ่ม request ID และ structured logging
- จำกัด request body, upload size, จำนวนไฟล์ และ MIME type
- เพิ่ม generic production error response
- เพิ่ม authorization test matrix

**Acceptance criteria:**

- ไม่มี secret ใน static assets
- ทุก protected endpoint มี test สำหรับ anonymous, staff และ admin
- public order มี 429 behavior ที่ทดสอบได้
- duplicate `Idempotency-Key` คืนผลเดิม

### Phase 1: Identity and Authorization

**เป้าหมาย:** เปลี่ยนจาก shared key เป็น identity-based access

งาน:

- Staff ใช้ Cloudflare Access หรือ Google Workspace/Microsoft identity
- Worker ตรวจ JWT signature, issuer, audience และ expiry
- กำหนด claims เช่น `sub`, `email`, `role`, `permissions`
- Customer ใช้ email OTP หรือ account session
- เพิ่ม ownership check ใน order, order item, artwork และ proof response
- แยก `staff` และ `admin` permissions

**Acceptance criteria:**

- Customer A อ่าน order ของ Customer B ไม่ได้
- Staff แก้ workflow ได้แต่แก้ pricing ไม่ได้หากไม่มี admin permission
- ทุก mutation เก็บ actor identity
- ไม่มี production flow ที่ต้องรับ `WRITE_API_KEY` จาก browser

### Phase 2: Resilience and Performance

**เป้าหมาย:** รองรับ traffic และ retry อย่างปลอดภัย

งาน:

- ใช้ KV หรือ Durable Objects สำหรับ idempotency
- ใช้ Cloudflare rate limiting แยกตาม endpoint/IP/account
- Cache active catalog และ flow settings ด้วย version/TTL
- Cache public capacity ตามช่วงเวลาสั้น ๆ
- เพิ่ม pagination และ server-side filtering ให้ staff orders/queue
- เพิ่ม retry policy แบบ bounded พร้อม backoff สำหรับ Notion
- เพิ่ม timeout และ circuit-breaker behavior ต่อ upstream

**Acceptance criteria:**

- request ซ้ำไม่สร้าง order ซ้ำ
- staff query ไม่โหลดข้อมูล queue ทั้งหมด
- catalog update purge/invalidate cache ได้
- Notion timeout คืน error ที่ควบคุมได้และไม่ทำให้ request ค้างไม่จำกัดเวลา

### Phase 3: Modular Refactoring

**เป้าหมาย:** ลดความซับซ้อนและเพิ่มความสามารถในการเปลี่ยน datastore

โครงสร้างเป้าหมาย:

```text
worker/
  index.js
  routes/
    public-orders.js
    customer-orders.js
    staff-orders.js
    catalog.js
    capacity.js
    queue.js
  application/
    create-order.js
    update-workflow.js
    schedule-order.js
  domain/
    order.js
    catalog.js
    capacity.js
    queue.js
  middleware/
    auth.js
    rate-limit.js
    request-id.js
    error-handler.js
  repositories/
    notion/
    d1/
  schemas/
```

ลำดับการแยก:

1. แยก middleware โดยไม่เปลี่ยน business behavior
2. แยก route handler ตาม bounded context
3. แยก use case จาก HTTP request/response
4. บังคับให้ use case เรียก repository contract
5. รักษา contract test เดิมเพื่อเปรียบเทียบ adapter

### Phase 4: Transactional Data Migration

ย้ายออกจาก Notion ตามลำดับความเสี่ยง:

1. idempotency records
2. session และ identity mapping
3. orders และ order items
4. production queue และ capacity
5. catalog และ pricing หาก query volume สูง

Notion ยังคงใช้สำหรับ staff view, manual operation และ reporting integration ได้

## 7. Performance Plan

### จุดที่ควร Cache

| ข้อมูล | กลไก | TTL/เงื่อนไข |
|---|---|---|
| Active materials/services/presets | KV หรือ Cache API | 1-5 นาที, purge เมื่อ update |
| Flow settings | KV | versioned และ purge เมื่อ save |
| Public capacity | HTTP/edge cache | สั้น เช่น 20-60 วินาที |
| Notion schema metadata | Worker memory/KV | TTL หลายนาที |
| Order detail | ไม่ควร cache แบบ public | cache ต้องผูกกับ identity |

### Index เมื่อย้ายไป D1/PostgreSQL

```sql
CREATE INDEX idx_orders_customer_created
ON orders(customer_id, created_at DESC);

CREATE INDEX idx_order_items_workflow_deadline
ON order_items(workflow_status, delivery_deadline);

CREATE INDEX idx_queue_date_status
ON production_allocations(production_date, status);

CREATE UNIQUE INDEX idx_idempotency_key
ON idempotency_records(idempotency_key);
```

## 8. Security Checklist

- [ ] Staff authentication ใช้ identity provider ไม่ใช่ shared browser key
- [ ] Customer session มี ownership enforcement ฝั่ง API
- [ ] Role และ admin permission ตรวจใน Worker ทุกครั้ง
- [ ] มี rate limit สำหรับ public order, upload และ auth endpoint
- [ ] มี idempotency สำหรับ order creation
- [ ] มี body/file size limit และ MIME validation
- [ ] Upload ที่สำคัญมี malware scanning หรือ quarantine workflow
- [ ] Production error ไม่ส่ง Notion detail กลับ client
- [ ] CORS ใช้เพื่อ browser policy เท่านั้น ไม่ถือเป็น authorization
- [ ] Secrets อยู่ใน Worker secret store เท่านั้น
- [ ] มี audit trail สำหรับ pricing, catalog, order correction, queue และ workflow
- [ ] มี dependency และ secret scanning ใน CI

## 9. Testing Strategy

### Required test layers

1. **Unit test:** domain calculation, status transition, capacity allocation
2. **Contract test:** repository interface ของ Notion และ D1
3. **Authorization test:** role, ownership, expired token และ cross-customer access
4. **Integration test:** Worker กับ mocked upstream failure/timeout/429
5. **Idempotency test:** retry, concurrent duplicate และ partial failure
6. **Load test:** public order, catalog read, staff search และ capacity query
7. **Browser test:** upload, cart, workflow และ responsive critical path
8. **Security test:** XSS input, malicious upload, CORS abuse และ rate limit

### CI quality gates

- ทุก test ต้องผ่าน
- no secret scan finding
- no high severity dependency vulnerability
- authorization matrix ต้องผ่าน
- API p95 latency ต้องอยู่ใน target ที่กำหนด
- deployment config ต้องผ่านก่อน production deploy

## 10. Suggested Backlog Priority

| Priority | งาน | ผลลัพธ์ |
|---|---|---|
| P0 | Identity-based staff auth | ลดความเสี่ยงการยึด shared key |
| P0 | Customer login และ ownership check | ป้องกันข้อมูลข้าม customer |
| P0 | Rate limit + idempotency | ป้องกัน spam และ duplicate order |
| P1 | Request ID, logs, alerting | ตรวจ production incident ได้ |
| P1 | Upload limits และ generic errors | ลด attack surface |
| P1 | Pagination/server-side filtering | ลด Notion latency |
| P1 | Audit log ทุก mutation | ตรวจสอบย้อนหลังได้ |
| P2 | แยก route/use case/middleware | ลด technical debt |
| P2 | D1/PostgreSQL pilot | รองรับ transaction และ indexing |
| P3 | R2 และ Notion reporting sync | รองรับไฟล์และลด coupling |

## 11. Architecture Decision Summary

- คง Cloudflare Worker เป็น modular monolith ในระยะใกล้
- ไม่แนะนำ microservices จนกว่าจะมี domain/team/scale ที่บังคับให้แยก
- เปลี่ยน authentication ก่อน refactor ใหญ่
- เพิ่ม reliability controls ก่อนเปิด public traffic มากขึ้น
- คง repository contract เพื่อให้ย้ายจาก Notion ไป D1/PostgreSQL ได้ทีละส่วน
- ใช้ Notion เป็น back-office/integration layer เมื่อ transaction volume เพิ่ม

เอกสารนี้ควรทบทวนหลังจบแต่ละ phase โดยอัปเดต risk status, metric จริง, decision ใหม่ และ test coverage ที่เพิ่มขึ้น