import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { addButton, applyPhoto, DEFAULTS, filenameStem, inScope, photoValue, safePath, snapshot } from '../src/core';
const settings = {...DEFAULTS};
const note = `---
brand: COVERGIRL
open_date: 2026-05-12
rating: 4
purpose: [lips, tint]
# Keep my comment
photo: "[[Photos/old.webp]]"
---
# My product

## 产品照片

![[Photos/old.webp|320]]

\`\`\`product-photo
\`\`\`

## 使用记录
My actual review.
![[Photos/old.webp]]
`;
const update = (text = note) => applyPhoto(text,settings,'Photos/new.webp',snapshot(note,settings));
describe('note updates',() => {
  it('updates only the intended image, preserving reviews, metadata types and comments',() => {
    const result=update();
    expect(result).toContain('My actual review.\n![[Photos/old.webp]]');
    expect(result).toContain('# Keep my comment');
    const data=parseDocument(result.split('---')[1]!).toJS();
    expect(data).toEqual({brand:'COVERGIRL',open_date:'2026-05-12',rating:4,purpose:['lips','tint'],photo:'[[Photos/new.webp]]'});
    expect(result.match(/!\[\[Photos\/new.webp/g)).toHaveLength(1);
  });
  it('merges unrelated review edits made while encoding',() => {
    expect(update(note.replace('My actual review.','New review typed during import.'))).toContain('New review typed during import.');
  });
  it('rejects a concurrently changed photo or photo section',() => {
    expect(()=>update(note.replace('photo: "[[Photos/old.webp]]"','photo: "[[Photos/other.webp]]"'))).toThrow('changed');
    expect(()=>update(note.replace('## 产品照片\n','## 产品照片\nNew text\n'))).toThrow('changed');
    expect(()=>update(note.replace('## 产品照片','## Removed'))).toThrow('removed');
  });
  it('adds frontmatter and replaces only the exact template placeholder',() => {
    const text=addButton('# Product\n\n## 产品照片\n将照片拖入此处。\n\n## 使用记录\nKeep this',settings);
    const result=applyPhoto(text,settings,'Photos/a.webp',snapshot(text,settings));
    expect(photoValue(result,'photo')).toBe('[[Photos/a.webp]]');
    expect(result).not.toContain('将照片拖入此处。'); expect(result).toContain('Keep this');
  });
  it('preserves CRLF newlines',() => { const text=note.replace(/\n/g,'\r\n'); expect(applyPhoto(text,settings,'Photos/new.webp',snapshot(text,settings)).replace(/\r\n/g,'')).not.toContain('\n'); });
  it('rejects list properties, duplicate YAML keys and duplicate photo references',() => {
    expect(()=>snapshot(note.replace('photo: "[[Photos/old.webp]]"','photo: [one, two]'),settings)).toThrow('must be text');
    expect(()=>snapshot(note.replace('brand: COVERGIRL','brand: A\nbrand: B'),settings)).toThrow('YAML');
    const duplicate=note.replace('![[Photos/old.webp|320]]','![[Photos/old.webp|320]]\n![[Photos/old.webp]]');
    expect(()=>applyPhoto(duplicate,settings,'Photos/new.webp',snapshot(duplicate,settings))).toThrow('Multiple');
  });
  it('resolves short wikilinks to the old target',() => {
    const text=note.replace('![[Photos/old.webp|320]]','![[old.webp|320]]');
    const result=applyPhoto(text,settings,'Photos/new.webp',snapshot(text,settings),p => p === 'old.webp' ? 'Photos/old.webp' : p);
    expect(result).not.toContain('![[old.webp|320]]');
  });
  it('ignores headings and embeds inside code samples',() => {
    const example='\n````markdown\n## 产品照片\n![[Photos/old.webp]]\n````\n';
    expect(update(note+example)).toContain(example);
  });
});
describe('button insertion and paths',() => {
  it('is idempotent and does not mistake a fenced example for a section',() => {
    const text='---\nbrand: A\n---\n# Test\n\n````markdown\n## 产品照片\n````\n';
    const once=addButton(text,settings);
    expect(addButton(once,settings)).toBe(once);
    expect(once).toContain('## 产品照片\n\n```product-photo\n```');
  });
  it('rejects duplicate sections and buttons',() => {
    expect(()=>addButton(note+'\n## 产品照片\n',settings)).toThrow('More than one');
    expect(()=>snapshot(note.replace('## 使用记录','```product-photo\n```\n## 使用记录'),settings)).toThrow('exactly one');
  });
  it('matches folder boundaries and blocks escapes or unsafe wikilink paths',() => {
    expect(inScope('Products/A.md','Products')).toBe(true);
    expect(inScope('Products-old/A.md','Products')).toBe(false);
    for (const path of ['../Photos','/tmp/images','Photos/../Other','C:\\Pictures','Photos//Other','Photos/[a]']) expect(()=>safePath(path)).toThrow();
    expect(filenameStem('A / B: shade #600?')).toBe('A - B- shade -600-');
  });
});
