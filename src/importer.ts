import { applyPhoto, filenameStem, inScope, PhotoError, Settings, snapshot } from './core';

export interface NoteHandle { path: string; basename: string }
export interface Storage {
  read(note: NoteHandle): Promise<string>;
  process(note: NoteHandle, transform: (latest: string) => string): Promise<void>;
  createImage(folder: string, stem: string, data: ArrayBuffer): Promise<string>;
  cleanupImage(path: string): Promise<boolean>;
  resolve(link: string, note: NoteHandle): string;
}
export interface ImportResult { path: string }
export async function importPhoto(storage: Storage, note: NoteHandle, settings: Settings, getImage: () => Promise<ArrayBuffer>, active: () => boolean = () => true): Promise<ImportResult> {
  if (!inScope(note.path,settings.scope)) throw new PhotoError('This note is outside the configured folder scope.');
  const before = snapshot(await storage.read(note),settings);
  // Preflight ambiguous embeds and property types before encoding or writing an attachment.
  applyPhoto(await storage.read(note),settings,'Photos/preflight.webp',before,link => storage.resolve(link,note));
  const data = await getImage();
  if (!active()) throw new PhotoError('Import cancelled because the plugin was disabled.');
  let created: string | undefined;
  try {
    created = await storage.createImage(settings.imageFolder,filenameStem(note.basename),data);
    const path = created;
    await storage.process(note,latest => {
      if (!active()) throw new PhotoError('Import cancelled because the plugin was disabled.');
      return applyPhoto(latest,settings,path,before,link => storage.resolve(link,note));
    });
    return { path };
  } catch (error) {
    if (created) {
      let clean = false;
      try { clean = await storage.cleanupImage(created); } catch { /* Report the retained file below. */ }
      if (!clean) throw new PhotoError(`${error instanceof Error ? error.message : 'Import failed.'} An image may remain at ${created}; check references before removing it.`);
    }
    throw error;
  }
}
