import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialsSchema, normalizeGroupedCredentials } from '../src/routes/hr.routes.js';

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

test('normalizes grouped employee reports into stable flat credential records', () => {
  const grouped = [
    {
      id: 7,
      serialNumber: 14,
      fullName: 'Sample Staff Member',
      credentials: [
        { id: 1, studentId: 'ST-1', institution: 'Sample University', level: 'Degree', documentLink: 'https://example.org/certificate' },
        { id: 1, studentId: 'ST-2', institution: 'Another University', level: 'Diploma' },
      ],
    },
    {
      id: 8,
      serialNumber: 15,
      name: 'Another Sample',
      credentials: [{ id: 1, institution: 'College', educationProgram: 'Regular' }],
    },
  ];

  const normalized = normalizeGroupedCredentials(grouped);
  const result = credentialsSchema.safeParse(normalized);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 3);
  assert.equal(new Set(result.data.map(row => row.id)).size, 3);
  assert.equal(result.data[0].sn, '14');
  assert.equal(result.data[0].name, 'Sample Staff Member');
  assert.equal(result.data[0].inst, 'Sample University');
  assert.equal(result.data[0].documentLink, 'https://example.org/certificate');
  assert.equal(result.data[1].id, result.data[0].id + 1);
});

test('preserves non-URL document references as text', () => {
  const result = credentialsSchema.safeParse([{ ...credential(1), documentLink: 'javascript:alert(1)' }]);
  assert.equal(result.success, true);
  assert.equal(result.data[0].documentLink, 'javascript:alert(1)');
});

test('rejects duplicate or invalid record IDs', () => {
  assert.equal(credentialsSchema.safeParse([credential(1), credential(1)]).success, false);
  assert.equal(credentialsSchema.safeParse([{ ...credential(0), id: 0 }]).success, false);
});

test('rejects unknown fields and oversized imports', () => {
  assert.equal(credentialsSchema.safeParse([{ ...credential(1), password: 'not allowed' }]).success, false);
  assert.equal(credentialsSchema.safeParse(Array.from({ length: 5001 }, (_, index) => credential(index + 1))).success, false);
});
