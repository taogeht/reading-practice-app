import assert from 'node:assert/strict';
import test from 'node:test';
import {
  followClassPromotion,
  type ClassPromotionNode,
} from './follow-promotion';

function lookup(nodes: ClassPromotionNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return async (id: string) => byId.get(id) ?? null;
}

test('returns an active class without forwarding', async () => {
  const result = await followClassPromotion('current', lookup([
    { id: 'current', active: true, promotedToClassId: null },
  ]));

  assert.deepEqual(result, { id: 'current', forwarded: false });
});

test('follows multiple promotions to the current active class', async () => {
  const result = await followClassPromotion('term-1', lookup([
    { id: 'term-1', active: false, promotedToClassId: 'term-2' },
    { id: 'term-2', active: false, promotedToClassId: 'term-3' },
    { id: 'term-3', active: true, promotedToClassId: null },
  ]));

  assert.deepEqual(result, { id: 'term-3', forwarded: true });
});

test('a promotion successor wins if a historical class is reactivated', async () => {
  const result = await followClassPromotion('term-1', lookup([
    { id: 'term-1', active: true, promotedToClassId: 'term-2' },
    { id: 'term-2', active: true, promotedToClassId: null },
  ]));

  assert.deepEqual(result, { id: 'term-2', forwarded: true });
});

test('does not revive a manually archived class', async () => {
  const result = await followClassPromotion('archived', lookup([
    { id: 'archived', active: false, promotedToClassId: null },
  ]));

  assert.equal(result, null);
});

test('rejects malformed promotion cycles', async () => {
  const result = await followClassPromotion('one', lookup([
    { id: 'one', active: false, promotedToClassId: 'two' },
    { id: 'two', active: false, promotedToClassId: 'one' },
  ]));

  assert.equal(result, null);
});
