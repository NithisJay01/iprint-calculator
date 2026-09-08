import { spawnSync } from 'node:child_process';

const tests = [
  'tests/deployment-config-test.mjs',
  'tests/ui-logic-node-test.mjs',
  'worker/catalog-contract-test.mjs',
  'worker/order-domain-test.mjs',
  'worker/order-smoke-test.mjs',
  'worker/public-order-security-test.mjs',
  'worker/ticket-smoke-test.mjs',
  'worker/workflow-smoke-test.mjs',
  'worker/capacity-domain-test.mjs',
  'worker/capacity-repository-test.mjs',
  'worker/capacity-worker-test.mjs',
  'worker/queue-domain-test.mjs',
  'worker/queue-repository-test.mjs',
  'worker/queue-worker-test.mjs',
  'worker/scheduling-domain-test.mjs',
  'worker/order-queue-smoke-test.mjs',
  'worker/system-check-test.mjs'
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
