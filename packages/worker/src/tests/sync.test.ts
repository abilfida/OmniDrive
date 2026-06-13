import { test, expect } from 'vitest';
import { activeSyncs } from '../services/sync';

test('activeSyncs lock exists', () => {
  expect(activeSyncs).toBeInstanceOf(Set);
});
