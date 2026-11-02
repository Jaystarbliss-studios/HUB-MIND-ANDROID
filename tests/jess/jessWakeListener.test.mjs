import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJessWakeCommand } from '../../src/services/jessWakeListener.ts';

test('recognizes direct Jess wake phrases and rejects trailing mentions', () => {
  assert.equal(extractJessWakeCommand('Hey Jess'), '');
  assert.equal(extractJessWakeCommand('Hi Jess, what is on my schedule?'), 'what is on my schedule?');
  assert.equal(extractJessWakeCommand('Jess, open my documents'), 'open my documents');
  assert.equal(extractJessWakeCommand('Jess Jess'), '');
  assert.equal(extractJessWakeCommand('What do you think, Jess?'), null);
  assert.equal(extractJessWakeCommand("What's up Jess"), '');
  assert.equal(extractJessWakeCommand('Hello Jess, open my calendar'), 'open my calendar');
  assert.equal(extractJessWakeCommand('Jess, please open my documents'), 'please open my documents');
});

test('does not wake on words containing jess', () => {
  assert.equal(extractJessWakeCommand('Jessica, open the door'), null);
  assert.equal(extractJessWakeCommand('just checking something'), null);
});
