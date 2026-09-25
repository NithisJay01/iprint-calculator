# Business-card showroom and print requests

Implemented 2026-09-22.

## Customer flow

Catalog → `/business-card/` → idle 3D hero → fullscreen showroom → exit →
“ลองใส่ดีไซน์ของคุณ” → `/material-preview/?from=business-card` →
upload artwork / configure materials → “สั่งพิมพ์นามบัตร” → quantity and contact
details → confirm → Notion ticket with a summary brief and the exported Artwork PDF.

The hero has no material selectors or upload tools. The fullscreen dialog supports
dragging and a mobile sensor permission button. It attempts native fullscreen and
landscape orientation lock; unsupported browsers use the viewport-sized dialog
and ask the visitor to rotate their phone. Closing disables the sensor and restores
focus to the expand button. A reduced-motion preference disables the idle sweep.

## Exactly what goes to Notion

`POST /public/print-requests` receives multipart `request`, `artworkPdf`, and
`turnstileToken`. It creates a NEW ticket in `NOTION_TICKETS_DATA_SOURCE_ID`:

- Brief: customer name, telephone, optional LINE ID, quantity, actual card bounds,
  cut shape / corner radius / bleed, paper, coating, finish and confirmation status.
- File attachment: the PDF produced by `material-preview/exportFiles.js`, using
  the current Artwork, Dieline and finish layers and the selected export settings.
  The customer can download this same PDF before submission. Original SVG/PNG
  files and screenshots are not uploaded by this endpoint.

This is a print/quote **request**, not a paid order or capacity reservation. The
staff must confirm material compatibility, final price, production date and preflight.
No customer-supplied numeric price is recorded as an approved price.

The UI shows an explicitly labelled reference price using a published catalog set
and the existing pricing engine. Preview papers are visual categories, not Notion
material IDs: they cannot yet be priced as an exact production specification.
Unsupported package quantities and missing pricing show “รอประเมินราคา”; special
finishes never silently become a zero-cost option.

## Deployment

1. Deploy the Worker from `iprint-plus-cost-calculator/worker/` with the new route
   **before** publishing the frontend. Use the existing Worker account and secrets.
2. Existing configuration required: `PUBLIC_ORDER_ENABLED=true`, `NOTION_TOKEN`,
   `NOTION_TICKETS_DATA_SOURCE_ID`, `TURNSTILE_SECRET_KEY`, expected hostname and
   allowed origins. The ticket data source needs the existing `Order Key` rich-text
   property; the new public route fails closed if it is missing. No D1 migration is needed.
3. Build the Hostinger frontend with `scripts/build-hostinger-package.ps1` and
   publish the generated folder contents. A frontend ZIP alone does not update the Worker.
4. Verify on HTTPS: submit one approved test brief, open its Notion ticket, download
   the PDF attachment and verify the artwork / finish / dimensions with prepress.

The request body is bounded at 10 MB + form overhead, the PDF at 10 MB. Origin and
Turnstile hostname/action are checked. Notion errors and private links are not exposed.
An unchanged retry reuses the same request key; a previously created ticket is
returned without uploading another PDF. This uses the existing Notion lookup pattern,
not a distributed lock: simultaneous requests from separate clients are not guaranteed
to deduplicate atomically.

## LINE (pending shop details)

The shop has not supplied its LINE OA link. `LINE_OA_ID` in `shared/print-request.js`
is deliberately empty. There is no active LINE link or automatic message send.
When the verified OA ID is available, the success screen can open the shop chat with
the ticket ID and summary prefilled; the customer sends the message in LINE.

## Verification

`node tests/run-all.mjs` from `iprint-plus-cost-calculator/` includes the existing
PDF/export tests, the new UI-controller tests (PDF snapshot, retry, closed-dialog
race), and Worker tests (validation, bot protection, exact PDF attachment, upstream
failure and retry). Tests use doubles for Notion and do not create real tickets.

The local browser verified the hero, open/close fullscreen, navigation to the editor,
portrait layout at 390×844 and landscape fullscreen at 844×390. The in-app browser
file chooser did not reliably stay on the editor, so uploading through that picker
was not verified end to end. Real iOS/Android sensor permission and orientation lock,
live Hostinger/Worker submission and Notion/print-production acceptance remain to verify.

## Worker deployment — 2026-09-23

- Deployed `iprint-flow-api` with `--keep-vars`.
- Version: `bf5901ee-bca3-4408-8414-14d60c36c5a8`.
- Previous version: `f9a5e904-0ba3-4b66-8ea3-4141d2673ff0`.
- URL: https://iprint-flow-api.iprint-garphic1.workers.dev
- All 42 test files passed before deployment.
- Live checks passed: root 200 lists the new endpoint; permitted preflight 204;
  missing Turnstile token rejected with 400; untrusted origin rejected with 403.
- No test Ticket was created. Live Notion PDF attachment acceptance still needs
  a customer-approved test through the deployed frontend. Frontend not deployed in this step.

## Hero material cycle — 2026-09-23

The showroom rotates through six paper/coating/finish presets every eight seconds of visible time, including fullscreen. Offscreen and hidden-tab time is paused. Texture updates are serialized and a complete preset renders before the next eight-second interval begins. The editor selections are independent.

Hero-only appearance rule: Kraft is excluded from Gold Foil and Silver Foil pairs. Kraft uses Emboss; Silver Foil is shown on Cotton. The editor still permits these combinations. The eight-second interval is unchanged.


## Duplex artwork, file naming and carousel — 2026-09-23

- Editor accepts an optional independent back SVG/PNG/JPG/WebP. Front/back view buttons rotate the actual card. Back ink is UV-corrected, and an asymmetric die-cut is mirrored in the back export. Front finish masks/emboss do not apply to the back.
- Both direct export and the print-request dialog prepare named PDF/SVG files for each uploaded side. A duplex request includes four attachments. Empty backs are not exported. Metadata fields are customer/company, job name, desired production material and quantity; dimensions come from the card in cm. The material remains subject to production confirmation.
- Example: `(Bdms)Essential-Pack-(9x5.4cm)Art300g-(100piece)-front.pdf`, with `.svg` and `-back` variants. Reserved filesystem characters are removed and filename components capped to keep Notion filenames below 900 bytes.
- Request protocol v2 requires the two front files and, if hasBack is true, the two back files. Each file is limited to 10 MiB; the complete body is bounded at 40 MiB plus multipart overhead. The Worker derives filenames from validated metadata rather than trusting multipart filenames. Legacy v1 PDF-only requests remain accepted during rollout.
- Notion receives a short Thai brief and a divider followed by all file blocks, in the same page creation. Attachment failures prevent creating an incomplete ticket. Sequential retry deduplicates as before. No real customer test ticket was created.
- Notion upload API supports `image/svg+xml` and `file` blocks: https://developers.notion.com/guides/data-apis/working-with-files-and-media . Workspace-specific file limits still apply (5 MiB on free workspaces).
- Order page uses an image-only carousel combining the set cover and configured sample images without duplicates. It supports native touch scrolling, arrows, dots, keyboard arrows and the existing enlarged image dialog. The placeholder change-image button and separate sample strip are removed. Single images hide navigation; failed images are dropped, with the bundled cover as fallback.
- Browser verified actual front/back SVG uploads, non-mirrored back preview, Emboss shader without console errors, generation of four files, filenames matching the example, and a three-image carousel advancing to slide two. Notion attachment flow is covered by mocked Worker tests, not a live ticket write.


Deployment for this update: Worker version `ffb1f2ae-5b31-4605-b093-9fc4e8a389a9` deployed with `--keep-vars`. Live checks passed: health 200, allowed-origin preflight 204, v2 missing SVG rejected 400, all four files with missing Turnstile rejected 400. No ticket was created. All 43 test files passed; carousel contract test passed after the final dialog/slide synchronization adjustment.
Frontend ZIP: `deploy/hostinger-iprint-duplex-svg-carousel-2026-09-23.zip` (144 files). ZIP integrity and changed-file byte equality checked. Hostinger frontend upload is still pending.
