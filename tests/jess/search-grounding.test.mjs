import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldGroundWithSearch } from '../../netlify/functions/chat.ts';

test('search grounding is enabled for current and explicitly researched questions', () => {
  assert.equal(shouldGroundWithSearch('What is the latest stable Node.js version?'), true);
  assert.equal(shouldGroundWithSearch('Please research the official Scratch release notes'), true);
  assert.equal(shouldGroundWithSearch('Fact-check these current admission requirements'), true);
  assert.equal(shouldGroundWithSearch('Can you look online for the official website?'), true);
  assert.equal(shouldGroundWithSearch('Open and read https://example.com/about'), true);
});

test('search grounding stays off for ordinary writing and conversation', () => {
  assert.equal(shouldGroundWithSearch('Rewrite this message to sound warmer'), false);
  assert.equal(shouldGroundWithSearch('Give me three names for a fictional company'), false);
  assert.equal(shouldGroundWithSearch('Hello Jess'), false);
});
