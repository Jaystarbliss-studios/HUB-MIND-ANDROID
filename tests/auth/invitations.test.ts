import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInvitationAcceptance } from '../../src/lib/invitations';

const base:any={id:'i1',username:'john',displayName:'John',email:'john@example.com',role:'staff',status:'invited',invitedBy:'admin',createdAt:'2026-10-01T00:00:00.000Z',expiresAt:'2026-10-10T00:00:00.000Z'};
test('invitation accepts the invited email while active',()=>{ assert.doesNotThrow(()=>validateInvitationAcceptance(base,'uid','JOHN@example.com',Date.parse('2026-10-02T00:00:00.000Z'))); });
test('wrong email is rejected',()=>{ assert.throws(()=>validateInvitationAcceptance(base,'uid','other@example.com',Date.parse('2026-10-02T00:00:00.000Z')),/invited/); });
test('expired invitation is rejected',()=>{ assert.throws(()=>validateInvitationAcceptance(base,'uid','john@example.com',Date.parse('2026-10-11T00:00:00.000Z')),/expired/); });
test('already claimed invitation is rejected',()=>{ assert.throws(()=>validateInvitationAcceptance({...base,status:'accepted'},'uid','john@example.com',Date.parse('2026-10-02T00:00:00.000Z')),/no longer active/); });