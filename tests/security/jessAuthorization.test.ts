import test from 'node:test';
import assert from 'node:assert/strict';
import { canPerformAction, canReadResource, canWriteResource } from '../../src/lib/rbac';

test('staff cannot perform admin-only actions',()=>{ assert.equal(canPerformAction('staff','view_users'),false); assert.equal(canPerformAction('staff','create_task'),true); });
test('unknown runtime roles are denied by default',()=>{ assert.equal(canPerformAction('teacher','create_task'),false); });
test('resource read follows owner/workspace/shared-read semantics',()=>{ assert.equal(canReadResource('u1','u1','private'),true); assert.equal(canReadResource('u2','u1','private'),false); assert.equal(canReadResource('u2','u1','workspace'),true); assert.equal(canReadResource('u2','u1','shared',{u1:'read'}),true); });
test('resource write requires ownership or shared write permission',()=>{ assert.equal(canWriteResource('u1','u1','private'),true); assert.equal(canWriteResource('u2','u1','shared',{u1:'read'}),false); assert.equal(canWriteResource('u2','u1','shared',{u1:'write'}),true); });