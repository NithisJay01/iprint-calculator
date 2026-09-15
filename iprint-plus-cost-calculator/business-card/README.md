# iPrint Business Card MVP

Product-first flow for business-card customers. The experience reuses the existing
catalog, pricing conventions, capacity API, public order endpoint, Ticket, and Order
Item workflow.

## Customer flow

1. Learn about the product and choose Essential, Corporate, or Signature.
2. Confirm quantity, material, print sides, and lamination with a live catalog price.
3. Upload front/back artwork, up to three reference images, and optional Drive link.
4. Pick a real production date. Boost dates use the configured 0.5x per business day.
5. Review customer details, VAT, total, and manual-payment mode.
6. Pass Turnstile and create the Ticket and Order Item through `POST /public/orders`.
7. Save the Ticket ID and track the sanitized status through `GET /public/orders/:id`.

The MVP intentionally uses manual payment confirmation. Connecting a payment gateway
is a separate production milestone because it requires provider credentials, webhook
verification, and reconciliation rules.

Open `index.html` through a local HTTP server. Production uses the same origin as the
main iPrint site and the Cloudflare Worker configured in `app.js`. Local preview uses
fixtures for catalog/capacity because the production Worker only allows the real site
origin; order submission and Turnstile remain production-only.
