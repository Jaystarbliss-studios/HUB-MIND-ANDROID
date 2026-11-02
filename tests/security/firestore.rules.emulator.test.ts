import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!hasEmulator) {
  test('firestore rules emulator tests (skipped: no FIRESTORE_EMULATOR_HOST)', { skip: 'FIRESTORE_EMULATOR_HOST not set' }, () => {});
} else {
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const env = await initializeTestEnvironment({ projectId: 'hubmind-rules-test', firestore: { rules } });

  async function seed() {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection('users').doc('owner').set({ id: 'owner', email: 'owner@example.com', role: 'staff', status: 'active' });
      await db.collection('users').doc('reader').set({ id: 'reader', email: 'reader@example.com', role: 'staff', status: 'active' });
      await db.collection('users').doc('writer').set({ id: 'writer', email: 'writer@example.com', role: 'staff', status: 'active' });
      await db.collection('users').doc('suspended').set({ id: 'suspended', email: 'suspended@example.com', role: 'staff', status: 'suspended' });
      await db.collection('documents').doc('doc1').set({ ownerId: 'owner', visibility: 'shared', sharedWith: { reader: 'read', writer: 'write' }, title: 'Shared' });
      await db.collection('connections').doc('reader-connection').set({ requesterId: 'reader', recipientId: 'owner', status: 'accepted' });
      await db.collection('connections').doc('unrelated-connection').set({ requesterId: 'writer', recipientId: 'owner', status: 'accepted' });
      await db.collection('shares').doc('reader-share').set({ ownerId: 'owner', recipientUserId: 'reader', resourceId: 'doc1', status: 'active' });
      await db.collection('shares').doc('unrelated-share').set({ ownerId: 'writer', recipientUserId: 'suspended', resourceId: 'doc2', status: 'active' });
      await db.collection('inbox').doc('reader-inbox').set({ createdBy: 'reader', status: 'unprocessed', text: 'Reader capture' });
      await db.collection('inbox').doc('unrelated-inbox').set({ createdBy: 'writer', status: 'unprocessed', text: 'Writer capture' });
      await db.collection('payments').doc('reader-payment').set({ ownerId: 'reader', status: 'pending', amount: 100 });
      await db.collection('payments').doc('unrelated-payment').set({ ownerId: 'writer', status: 'pending', amount: 200 });
      await db.collection('resourceShares').doc('reader-resource-share').set({ ownerId: 'owner', recipientUserId: 'reader' });
      await db.collection('resourceShares').doc('unrelated-resource-share').set({ ownerId: 'writer', recipientUserId: 'suspended' });
      await db.collection('sharedRecords').doc('reader-record').set({ createdBy: 'reader', title: 'Reader report' });
      await db.collection('sharedRecords').doc('unrelated-record').set({ createdBy: 'writer', title: 'Writer report' });
    });
  }

  test.before(async () => { await seed(); });
  test.after(async () => { await env.cleanup(); });
  test('owner can read private/shared resource', async () => {
    const db = env.authenticatedContext('owner', { email: 'owner@example.com' }).firestore();
    await assertSucceeds(db.collection('documents').doc('doc1').get());
  });
  test('shared reader can read but cannot write', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('documents').doc('doc1').get());
    await assertFails(db.collection('documents').doc('doc1').update({ title: 'nope' }));
  });
  test('shared writer can update', async () => {
    const db = env.authenticatedContext('writer', { email: 'writer@example.com' }).firestore();
    await assertSucceeds(db.collection('documents').doc('doc1').update({ title: 'updated' }));
  });
  test('suspended users cannot read resources', async () => {
    const db = env.authenticatedContext('suspended', { email: 'suspended@example.com' }).firestore();
    await assertFails(db.collection('documents').doc('doc1').get());
  });
  test('an authenticated existing account can create its own Hub-Mind profile', async () => {
    const db = env.authenticatedContext('existing-auth-user', { email: 'existing@example.com' }).firestore();
    await assertSucceeds(db.collection('users').doc('existing-auth-user').set({
      id: 'existing-auth-user',
      email: 'existing@example.com',
      role: 'staff',
      status: 'active',
      registrationSource: 'existing-auth',
      username: 'existing_auth_user',
    }));
  });

  test('a self-created profile without the existing-auth marker is rejected', async () => {
    const db = env.authenticatedContext('unregistered-user', { email: 'unregistered@example.com' }).firestore();
    await assertFails(db.collection('users').doc('unregistered-user').set({
      id: 'unregistered-user',
      email: 'unregistered@example.com',
      role: 'staff',
      status: 'active',
      username: 'unregistered',
    }));
  });

  test('a member can list only connections where they are a participant', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('connections').where('requesterId', '==', 'reader').get());
    await assertSucceeds(db.collection('connections').where('recipientId', '==', 'reader').get());
    await assertFails(db.collection('connections').get());
  });

  test('a member can list only shares they own or receive', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('shares').where('recipientUserId', '==', 'reader').where('status', '==', 'active').get());
    await assertSucceeds(db.collection('shares').where('ownerId', '==', 'reader').where('status', '==', 'active').get());
    await assertFails(db.collection('shares').get());
  });

  test('a member can list only their own inbox items or workspace-visible items', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('inbox').where('createdBy', '==', 'reader').where('status', '==', 'unprocessed').get());
    await assertFails(db.collection('inbox').get());
  });

  test('payment records are scoped to the user and cannot be self-marked as paid', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('payments').where('ownerId', '==', 'reader').get());
    await assertFails(db.collection('payments').get());
    await assertSucceeds(db.collection('payments').doc('reader-new-payment').set({ ownerId: 'reader', status: 'pending', amount: 250 }));
    await assertFails(db.collection('payments').doc('fake-payment').set({ ownerId: 'owner', status: 'pending', amount: 999 }));
    await assertFails(db.collection('payments').doc('self-approved-payment').set({ ownerId: 'reader', status: 'paid', amount: 250 }));
    await assertFails(db.collection('payments').doc('reader-payment').update({ status: 'paid' }));
  });

  test('activity log entries cannot be forged as another member', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('activityLogs').add({ userId: 'reader', action: 'created', createdAt: new Date().toISOString() }));
    await assertFails(db.collection('activityLogs').add({ userId: 'owner', action: 'approved', createdAt: new Date().toISOString() }));
  });

  test('shared reports and legacy resource shares require creator or owner identity', async () => {
    const db = env.authenticatedContext('reader', { email: 'reader@example.com' }).firestore();
    await assertSucceeds(db.collection('sharedRecords').doc('reader-new-report').set({ createdBy: 'reader', title: 'My report' }));
    await assertFails(db.collection('sharedRecords').doc('fake-report').set({ createdBy: 'owner', title: 'Not mine' }));
    await assertSucceeds(db.collection('resourceShares').doc('reader-new-share').set({ ownerId: 'reader', recipientUserId: 'owner' }));
    await assertFails(db.collection('resourceShares').doc('fake-share').set({ ownerId: 'owner', recipientUserId: 'writer' }));
  });

  test('unauthenticated users cannot read resources', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.collection('documents').doc('doc1').get());
  });
}
