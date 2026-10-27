import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialsSchema } from '../src/routes/hr.routes.js';

const credential = id => ({
  id,
  name: 'Sample Staff Member',
  stId: 'SAMPLE-001',
  inst: 'Sample University',
  level: "Bachelor's Degree",
  dept: 'Nursing',
  prog: 'Regular',
  campus: 'Hawassa',
  recType: 'Primary Staff',
  audit: 'Complete Core',
  missing: 0,
});

test('accepts credential records and supplies omitted optional fields', () => {
  const result = credentialsSchema.safeParse([credential(1)]);
  assert.equal(result.success, true);
  assert.equal(result.data[0].remarks, '');
  assert.equal(result.data[0].origName, '');
});

test('accepts numeric serial numbers and stores them as strings', () => {
  const result = credentialsSchema.safeParse([{ ...credential(1), sn: 12 }]);
  assert.equal(result.success, true);
  assert.equal(result.data[0].sn, '12');
});

test('rejects duplicate or invalid record IDs', () => {
  assert.equal(credentialsSchema.safeParse([credential(1), credential(1)]).success, false);
  assert.equal(credentialsSchema.safeParse([{ ...credential(0), id: 0 }]).success, false);
});

test('rejects unknown fields and oversized imports', () => {
  assert.equal(credentialsSchema.safeParse([{ ...credential(1), password: 'not allowed' }]).success, false);
  assert.equal(credentialsSchema.safeParse(Array.from({ length: 5001 }, (_, index) => credential(index + 1))).success, false);
});
