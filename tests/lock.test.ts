import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { acquireLock } from '../src/lock';
it('excludes a concurrent window and releases for the next import',async () => {
  const vault='test-'+randomUUID();const release=await acquireLock(vault,'Products/A.md');
  try { await expect(acquireLock(vault,'products/a.md')).rejects.toThrow('already running'); }
  finally { await release(); }
  const again=await acquireLock(vault,'Products/A.md');await again();
});
