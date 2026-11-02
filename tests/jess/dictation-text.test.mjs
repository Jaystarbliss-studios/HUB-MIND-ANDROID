import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJessDictationTranscript } from '../../src/services/jessDictationText.ts';

test('spoken punctuation and line breaks become editable text, not commands', () => {
  assert.equal(
    normalizeJessDictationTranscript('Hello comma new line this is Hub Mind full stop'),
    'Hello,\nthis is Hub Mind.',
  );
  assert.equal(
    normalizeJessDictationTranscript('Are you ready question mark new paragraph Yes exclamation mark'),
    'Are you ready?\n\nYes!',
  );
  assert.equal(
    normalizeJessDictationTranscript('open quote Jess close quote colon hello'),
    '"Jess": hello',
  );
});

test('explicit literal dictation bypasses spoken punctuation substitutions', () => {
  assert.equal(
    normalizeJessDictationTranscript('literal dictation: write the words comma and new line'),
    'write the words comma and new line',
  );
  assert.equal(
    normalizeJessDictationTranscript('type literally comma period'),
    'comma period',
  );
});

test('empty and whitespace-only transcripts stay empty', () => {
  assert.equal(normalizeJessDictationTranscript(''), '');
  assert.equal(normalizeJessDictationTranscript('   '), '');
});
