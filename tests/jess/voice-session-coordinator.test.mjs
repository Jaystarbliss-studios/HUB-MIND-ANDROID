import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimJessAudio,
  releaseJessAudio,
  getJessAudioOwner,
  subscribeJessAudioOwner,
} from '../../src/services/jessVoiceSessionCoordinator.ts';

test('microphone ownership is exclusive, including re-entrant claims by the same owner', () => {
  releaseJessAudio(null);

  const liveLease = claimJessAudio('live-conversation');
  assert.ok(liveLease);
  assert.equal(getJessAudioOwner(), 'live-conversation');
  assert.equal(claimJessAudio('live-conversation'), null);
  assert.equal(claimJessAudio('dictation'), null);

  // A stale/incorrect lease cannot release the active session's microphone.
  releaseJessAudio({ owner: 'dictation', token: Symbol('stale') });
  assert.equal(getJessAudioOwner(), 'live-conversation');

  releaseJessAudio(liveLease);
  assert.equal(getJessAudioOwner(), null);
  const dictationLease = claimJessAudio('dictation');
  assert.ok(dictationLease);
  releaseJessAudio(dictationLease);
});

test('microphone ownership listeners observe handoff and can unsubscribe', () => {
  releaseJessAudio(null);
  const observed = [];
  const unsubscribe = subscribeJessAudioOwner(owner => observed.push(owner));
  const lease = claimJessAudio('dictation');
  assert.ok(lease);
  releaseJessAudio(lease);
  unsubscribe();
  assert.deepEqual(observed, [null, 'dictation', null]);
});
