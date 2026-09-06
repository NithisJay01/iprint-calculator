# Step 1 — Domain, audiences, and access model

Status: accepted as the initial production direction

## Hard scope boundary

`tchl.online` and `www.tchl.online` are the existing main website and are strictly out of scope. This project must not modify their files, document roots, DNS records, nameservers, SSL settings, redirects, CDN settings, or deployment workflow. Work is limited to the existing `iprint.tchl.online` subdomain and its Hostinger document root unless the owner explicitly expands the scope later.

## Product surfaces

| Hostname | Audience | Purpose |
| --- | --- | --- |
| `tchl.online` and `www.tchl.online` | Public | Existing main website; out of scope and must remain untouched |
| `iprint.tchl.online` | Customers | Create print orders and track only their own orders; hosted from Hostinger document root `/home/u981350798/domains/tchl.online/public_html/iPrint` |
| `iprint.tchl.online/staff/` | Staff | Proposed protected entry point for the full operational workspace without changing the main domain or adding DNS records |
| Existing `workers.dev` URL | Applications only | Existing Cloudflare Worker API; retained until a future API subdomain is separately authorized |

The same hostname layout should be retained if the brand moves to a `.com` domain. During migration, the `.online` domain should redirect to the corresponding `.com` hostname for at least 12 months.

## Roles

### Customer

Customers can:

- create and submit their own orders;
- upload artwork and production references for their own orders;
- view quotes intended for them;
- track the status and deadlines of their own order items;
- provide information or approve proofs when the workflow explicitly permits it.

Customers cannot:

- read other customers or their orders;
- read internal costs, margins, or pricing rules;
- create, edit, or delete products, materials, services, and price tables;
- assign staff or directly force production workflow states;
- access Notion identifiers or the shared Worker write key.

### Staff

Staff can:

- use every customer-facing feature;
- read and manage all orders and customers permitted by their job role;
- create, edit, activate, deactivate, and reorder products, materials, and services;
- update prices, cost values, margins, units, and calculation-related values;
- update workflow status, deadlines, assignments, proof status, and production status;
- correct order data with an audit record.

Destructive and pricing operations should be restricted further to an `admin` permission even though the first UI may present a single staff workspace.

## Authorization rules

1. The API is the authority for permissions. Hiding a button in the browser is not authorization.
2. Every request operates as an identified user; the browser must not contain a shared `WRITE_API_KEY`.
3. Customer resources are scoped by `customer_id` derived from the authenticated session, never trusted from a request body alone.
4. Staff endpoints require a staff role. Price/catalog mutation and delete operations require `admin`.
5. Order tracking uses an authenticated customer account. A random order reference may be an additional lookup factor, but is not the sole authorization mechanism.
6. Every price, catalog, order correction, and workflow mutation records actor, timestamp, old value, and new value.
7. Notion remains behind the Worker and is never called directly from customer or staff browsers.

## Initial route groups

### Customer API

- `POST /customer/orders`
- `GET /customer/orders`
- `GET /customer/orders/:orderId`
- `POST /customer/orders/:orderId/artwork`
- `POST /customer/order-items/:itemId/proof-response`

### Staff API

- `GET /staff/orders`
- `GET /staff/orders/:orderId`
- `PATCH /staff/order-items/:itemId/status`
- `GET|POST|PATCH /staff/products`
- `GET|POST|PATCH /staff/materials`
- `GET|POST|PATCH /staff/services`
- `PATCH /staff/pricing/:priceId`
- `GET /staff/audit-log`

The current API routes remain temporary compatibility routes until the authenticated replacements are ready.

## Hosting and DNS direction

- No hosting or DNS change is permitted for `tchl.online` or `www.tchl.online`.
- Hostinger remains the origin for the customer application at `iprint.tchl.online`, currently associated with server IP `194.164.64.178`.
- The Hostinger document root for `iprint.tchl.online` is `/home/u981350798/domains/tchl.online/public_html/iPrint`. Deployment must publish the contents of `iprint-plus-cost-calculator`, not the containing directory, into this document root so that `index.html`, `css/`, `js/`, and `image/` sit directly beneath it.
- The project must not change authoritative nameservers or the DNS records of the main website.
- The API retains the existing `workers.dev` address. A custom API subdomain is deferred and requires separate authorization.
- `iprint.tchl.online/staff/` should be protected by staff authentication and should have a separate application entry point from the customer view.
- The customer and staff applications may initially reuse shared JavaScript and CSS assets, but authorization must be enforced by the API and not by the hostname or hidden UI alone.
- Hostinger preview domain `orchid-ant-200423.hostingersite.com` is for deployment preview only and must not be used as a production identity, API origin, or link stored in orders.

## Decisions still required before implementation

- Final `.com` brand/domain name.
- Customer sign-in method: email one-time code is the recommended default.
- Staff identity provider: Google Workspace/Microsoft account through Cloudflare Access is preferred; email one-time code is the fallback.
- Whether customer pricing is instant/automatic or submitted for staff confirmation.
- Which staff members receive `admin` permission for prices and catalog deletion.

## Step 1 acceptance criteria

- Public, customer, staff, and API hostnames have distinct purposes.
- Customer and staff capabilities are documented.
- Sensitive pricing and catalog changes are explicitly staff/admin-only.
- API-side ownership checks and audit logging are required.
- The eventual `.com` migration does not require an application architecture change.
