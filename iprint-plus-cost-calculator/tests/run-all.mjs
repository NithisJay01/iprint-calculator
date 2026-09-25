import { spawnSync } from 'node:child_process';

const tests = [
  'tests/product-pricing-test.mjs',
  'tests/pricing-settings-test.mjs',
  'tests/set-studio-logic-test.mjs',
  'tests/catalog-page-test.mjs',
  'tests/deployment-config-test.mjs',
  'tests/material-preview-test.mjs',
  'tests/material-preview-export-test.mjs',
  'tests/preview-print-flow-test.mjs',
  'tests/showroom-cycle-test.mjs',
  'tests/business-card-mvp-test.mjs',
  'tests/business-card-breakdown-test.mjs',
  'tests/package-included-test.mjs',
  'tests/cart-test.mjs',
  'tests/cart-products-test.mjs',
  'tests/cart-order-test.mjs',
  'tests/staff-catalog-filter-test.mjs',
  'tests/set-options-test.mjs',
  'tests/ui-logic-node-test.mjs',
  'worker/catalog-contract-test.mjs',
  'worker/flow-settings-test.mjs',
  'worker/order-domain-test.mjs',
  'worker/order-smoke-test.mjs',
  'worker/public-order-security-test.mjs',
  'worker/customers-and-tracking-security-test.mjs',
  'worker/pricing-draft-test.mjs',
  'worker/authorization-matrix-test.mjs',
  'worker/ticket-smoke-test.mjs',
  'worker/workflow-smoke-test.mjs',
  'worker/capacity-domain-test.mjs',
  'worker/capacity-repository-test.mjs',
  'worker/capacity-worker-test.mjs',
  'worker/queue-domain-test.mjs',
  'worker/queue-repository-test.mjs',
  'worker/queue-worker-test.mjs',
  'worker/staff-orders-search-test.mjs',
  'worker/scheduling-domain-test.mjs',
  'worker/order-queue-smoke-test.mjs',
  'worker/order-cancellation-test.mjs',
  'worker/media-test.mjs',
  'worker/system-check-test.mjs',
  'worker/brief-domain-test.mjs',
  'worker/brief-worker-test.mjs',
  'worker/print-requests-test.mjs'
];

let passed = 0;
for (const test of tests) {
  process.stdout.write(`\n[${passed + 1}/${tests.length}] ${test}\n`);
  const result = spawnSync(process.execPath, [test], { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\nTest suite stopped at ${test}\n`);
    process.exit(result.status || 1);
  }
  passed += 1;
}

process.stdout.write(`\nAll ${passed} test files passed.\n`);
