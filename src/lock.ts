import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhotoError } from './core';

/** Exclusive local lock shared by desktop windows; never touches vault contents. */
export async function acquireLock(vault: string, path: string): Promise<() => Promise<void>> {
  const folder = join(tmpdir(),'obsidian-product-photo-locks');
  await mkdir(folder,{recursive:true});
  const key = createHash('sha256').update(vault+'\0'+path.toLocaleLowerCase()).digest('hex');
  const lock = join(folder,key+'.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(lock,'wx',0o600);
      try { await file.writeFile(JSON.stringify({pid:process.pid,token})); } finally { await file.close(); }
      return async () => {
        try { if (JSON.parse(await readFile(lock,'utf8')).token === token) await unlink(lock); } catch { /* A missing lock is already released. */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Recover a crashed process's lock, but do not expire a slow, still-running task.
      try {
        const existing = JSON.parse(await readFile(lock,'utf8')) as {pid:number};
        try { process.kill(existing.pid,0); }
        catch (probe) {
          if ((probe as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(lock); continue; }
        }
      } catch { /* A concurrent acquisition may still be writing its metadata. */ }
      throw new PhotoError('An import for this note is already running in another window.');
    }
  }
  throw new PhotoError('Could not acquire an import lock. Please retry.');
}
