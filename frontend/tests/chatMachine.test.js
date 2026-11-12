import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_STATUS,
  chatReducer,
  chatSelectors,
  createChatState,
} from '../src/state/chatMachine.js';

const submit = (state, requestId = 1, text = 'Which companies grew fastest?') =>
  chatReducer(state, {
    type: 'submit',
    requestId,
    text,
    userMessageId: `u-${requestId}`,
  });

const succeed = (state, requestId = 1) =>
  chatReducer(state, {
    type: 'succeed',
    requestId,
    message: {
      id: `a-${requestId}`,
      role: 'assistant',
      content: 'Tirupati Forge leads growth.',
    },
  });

test('submit adds the user message and enters submitting', () => {
  const state = submit(createChatState());

  assert.equal(state.status, CHAT_STATUS.SUBMITTING);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].role, 'user');
  assert.equal(state.pending.requestId, 1);
  assert.equal(state.draft, '');
});

test('duplicate submissions while submitting are ignored', () => {
  const first = submit(createChatState());
  const second = submit(first, 2, 'Where is risk concentrated?');

  assert.equal(second, first);
  assert.equal(second.messages.length, 1);
});

test('only the active request can append an answer', () => {
  const pending = submit(createChatState());
  const late = succeed(pending, 99);
  assert.equal(late, pending);

  const ready = succeed(pending, 1);
  assert.equal(ready.status, CHAT_STATUS.READY);
  assert.equal(ready.messages.length, 2);
  assert.equal(ready.pending, null);
});

test('a failure preserves the question and exposes retry', () => {
  const pending = submit(createChatState());
  const failed = chatReducer(pending, {
    type: 'fail',
    requestId: 1,
    error: 'The service is busy',
  });

  assert.equal(failed.status, CHAT_STATUS.ERROR);
  assert.equal(failed.messages.length, 1);
  assert.equal(failed.failedText, 'Which companies grew fastest?');
  assert.equal(chatSelectors.canRetry(failed), true);
});

test('retry reuses the failed question without duplicating it', () => {
  const failed = chatReducer(submit(createChatState()), {
    type: 'fail',
    requestId: 1,
    error: 'The service is busy',
  });
  const retried = chatReducer(failed, { type: 'retry', requestId: 2 });

  assert.equal(retried.status, CHAT_STATUS.SUBMITTING);
  assert.equal(retried.messages.length, 1);
  assert.equal(retried.pending.text, failed.failedText);
  assert.equal(retried.failedText, null);
});

test('clearing during a request makes the late answer harmless', () => {
  const pending = submit(createChatState());
  const cleared = chatReducer(pending, { type: 'clear' });
  const late = succeed(cleared, 1);

  assert.equal(cleared.status, CHAT_STATUS.IDLE);
  assert.equal(cleared.messages.length, 0);
  assert.equal(late, cleared);
});

test('changing company scope resets the conversation', () => {
  const pending = submit(createChatState('hpl'));
  const switched = chatReducer(pending, { type: 'scope', scopeKey: 'macpower' });

  assert.equal(switched.scopeKey, 'macpower');
  assert.equal(switched.status, CHAT_STATUS.IDLE);
  assert.equal(switched.messages.length, 0);
  assert.equal(succeed(switched, 1), switched);
});

test('draft and submit eligibility stay in sync', () => {
  const state = chatReducer(createChatState(), {
    type: 'draft',
    value: 'Where is risk concentrated?',
  });

  assert.equal(chatSelectors.canSubmit(state), true);
  assert.equal(chatSelectors.isSubmitting(state), false);
});
