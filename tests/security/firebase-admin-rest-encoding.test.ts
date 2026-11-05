import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFirestoreFields, encodeFirestoreFields } from '../../src/server/firebaseAdminRest.ts';

test('Firestore REST encoder round-trips nested Android command payloads', () => {
  const payload = {
    status: 'CREATED',
    targetDeviceId: 'android-12345678',
    parameters: {
      x: 120,
      y: 480,
      text: 'Open the requested app',
      flags: [true, false],
      nested: { source: 'desktop', retry: 0 },
    },
    createdAt: 1730000000000,
    optional: undefined,
  };

  const encoded = encodeFirestoreFields(payload);
  assert.equal(encoded.status.stringValue, 'CREATED');
  assert.equal(encoded.parameters.mapValue.fields.x.integerValue, '120');
  assert.equal(encoded.parameters.mapValue.fields.flags.arrayValue.values[0].booleanValue, true);
  assert.equal(encoded.optional, undefined);
  assert.deepEqual(decodeFirestoreFields(encoded), {
    status: 'CREATED',
    targetDeviceId: 'android-12345678',
    parameters: {
      x: 120,
      y: 480,
      text: 'Open the requested app',
      flags: [true, false],
      nested: { source: 'desktop', retry: 0 },
    },
    createdAt: 1730000000000,
  });
});
