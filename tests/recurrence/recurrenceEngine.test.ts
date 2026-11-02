import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceKey, shouldGenerate } from '../../src/lib/recurrenceRules';

const date=new Date('2026-10-05T12:00:00.000Z'); // Monday
test('daily recurrence generates within date bounds',()=>{ assert.equal(shouldGenerate(date,{active:true,frequency:'daily'}),true); assert.equal(shouldGenerate(date,{active:true,frequency:'daily',startDate:'2026-10-06'}),false); });
test('weekly recurrence respects configured weekdays',()=>{ assert.equal(shouldGenerate(date,{active:true,frequency:'weekly',daysOfWeek:[1]}),true); assert.equal(shouldGenerate(date,{active:true,frequency:'weekly',daysOfWeek:[2]}),false); });
test('monthly recurrence uses day of month',()=>{ assert.equal(shouldGenerate(date,{active:true,frequency:'monthly',dayOfMonth:5}),true); assert.equal(shouldGenerate(date,{active:true,frequency:'monthly',dayOfMonth:6}),false); });
test('occurrence keys are deterministic per template and date',()=>{ assert.equal(occurrenceKey('template-1',date),'template-1_2026-10-05'); });