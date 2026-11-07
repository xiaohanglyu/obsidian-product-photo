import { isMap, parseDocument } from 'yaml';

export interface Settings {
  scope: string;
  imageFolder: string;
  property: string;
  heading: string;
  trimWhite: boolean;
}
export const DEFAULTS: Settings = { scope: '', imageFolder: 'Photos', property: 'photo', heading: '产品照片', trimWhite: false };
export class PhotoError extends Error {}
export const MARKER = '```product-photo\n```';

export function safePath(value: string, allowEmpty = false): string {
  const path = value.trim().replace(/\\/g, '/').replace(/\/$/, '');
  if ((!path && !allowEmpty) || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || /[\u0000-\u001f\[\]#|:*?"<>]/.test(path) || path.split('/').some(p => p === '.' || p === '..' || (!p && path))) {
    throw new PhotoError('Use a vault-relative folder path without .. or special link characters.');
  }
  return path;
}
export function validateSettings(input: Settings): Settings {
  if (!/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(input.property) || ['__proto__', 'constructor', 'prototype'].includes(input.property)) throw new PhotoError('Use a simple property name, for example photo.');
  const heading = input.heading.trim();
  if (!heading || /[\r\n]/.test(heading) || heading.startsWith('#')) throw new PhotoError('Enter a section title without # or newlines.');
  return { ...input, scope: safePath(input.scope, true), imageFolder: safePath(input.imageFolder), heading };
}
export function inScope(path: string, scope: string): boolean {
  return path.toLowerCase().endsWith('.md') && (!scope || path.startsWith(scope + '/'));
}
export function filenameStem(name: string): string {
  return name.replace(/[\u0000-\u001f/\\:*?"<>|\[\]#^]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 120) || 'product';
}

function splitNote(text: string) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const match = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    if (/^\uFEFF?---\r?\n/.test(text)) throw new PhotoError('The note has unclosed YAML frontmatter.');
    return { yaml: '', body: text.replace(/^\uFEFF/, ''), bom: text.startsWith('\uFEFF') ? '\uFEFF' : '', newline, hasFrontmatter: false };
  }
  return { yaml: match[2]!, body: text.slice(match[0].length), bom: match[1]!, newline, hasFrontmatter: true };
}
function frontmatter(text: string, property: string) {
  const parts = splitNote(text);
  const doc = parseDocument(parts.yaml, { uniqueKeys: true });
  if (doc.errors.length || (doc.contents !== null && !isMap(doc.contents))) throw new PhotoError('Fix invalid or non-mapping YAML frontmatter before importing.');
  const value: unknown = doc.get(property);
  if (value !== undefined && value !== null && typeof value !== 'string') throw new PhotoError(`The ${property} property must be text, not a list or another value type.`);
  return { parts, doc, old: typeof value === 'string' ? value : '' };
}
export function photoValue(text: string, property: string): string { return frontmatter(text, property).old; }
export function linkTarget(value: string): string {
  const match = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(value.trim());
  return (match?.[1] ?? value.trim()).replace(/\\/g, '/');
}

interface Span { start: number; end: number }
interface Section extends Span { markers: Span[] }
function structure(body: string) {
  const headings: { start: number; end: number; level: number; title: string }[] = [];
  const markers: Span[] = [];
  let fence: { character: string; length: number; start: number; photo: boolean } | null = null;
  let offset = 0;
  for (const line of body.match(/[^\n]*(?:\n|$)/g) ?? []) {
    const clean = line.replace(/\r?\n$/, '');
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(clean);
    if (delimiter) {
      const chars = delimiter[1]!;
      if (!fence) fence = { character: chars[0]!, length: chars.length, start: offset, photo: delimiter[2]!.trim() === 'product-photo' };
      else if (chars[0] === fence.character && chars.length >= fence.length && !delimiter[2]!.trim()) {
        if (fence.photo) markers.push({ start: fence.start, end: offset + line.length });
        fence = null;
      }
    } else if (!fence) {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(clean);
      if (heading) headings.push({ start: offset, end: offset + line.length, level: heading[1]!.length, title: heading[2]!.replace(/[ \t]+#+$/, '').trim() });
    }
    offset += line.length;
  }
  return { headings, markers };
}
function section(body: string, title: string): Section | null {
  const { headings, markers } = structure(body);
  const matches = headings.filter(h => h.title === title);
  if (matches.length > 1) throw new PhotoError('More than one photo section exists. Keep one unambiguous section.');
  const heading = matches[0];
  if (!heading) return null;
  const end = headings.find(h => h.start > heading.start && h.level <= heading.level)?.start ?? body.length;
  return { start: heading.end, end, markers: markers.filter(m => m.start >= heading.end && m.end <= end) };
}
function getSection(body: string, title: string): Section {
  const result = section(body, title);
  if (!result) throw new PhotoError('The photo section was removed. Add the import button again.');
  if (result.markers.length !== 1) throw new PhotoError('Keep exactly one product-photo button in the photo section.');
  return result;
}
export function addButton(text: string, settings: Settings): string {
  const { body, newline } = splitNote(text);
  const prefix = text.slice(0, text.length - body.length);
  const found = section(body, settings.heading);
  const marker = MARKER.replace(/\n/g, newline);
  if (!found) return text + (text.endsWith(newline) ? newline : newline + newline) + `## ${settings.heading}${newline}${newline}${marker}${newline}`;
  if (found.markers.length > 1) throw new PhotoError('The photo section contains duplicate buttons.');
  if (found.markers.length === 1) return text;
  return prefix + body.slice(0, found.end).trimEnd() + newline + newline + marker + newline + newline + body.slice(found.end);
}
export interface Snapshot { oldPhoto: string; section: string }
export function snapshot(text: string, settings: Settings): Snapshot {
  const { parts, old } = frontmatter(text, settings.property);
  const found = getSection(parts.body, settings.heading);
  return { oldPhoto: old, section: parts.body.slice(found.start, found.end) };
}
export function applyPhoto(text: string, settings: Settings, newPath: string, expected: Snapshot, resolve: (path: string) => string = x => x): string {
  const { parts, doc, old } = frontmatter(text, settings.property);
  const found = getSection(parts.body, settings.heading);
  let region = parts.body.slice(found.start, found.end);
  // Merge unrelated edits but reject changes in the photo property or photo section.
  if (old !== expected.oldPhoto || region !== expected.section) throw new PhotoError('The photo section changed during import. Nothing was replaced; please retry.');
  const embed = `![[${newPath}|320]]`;
  const target = old ? resolve(linkTarget(old)) : '';
  const matches: { start: number; end: number }[] = [];
  // Ignore fenced code samples and inline code; only update actual standalone image embeds.
  let offset = 0;
  let inFence = false;
  for (const line of region.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    else if (!inFence && target) {
      const m = /^\s*(!\[\[([^\]|]+)(?:\|[^\]]*)?\]\])\s*$/.exec(line);
      if (m && resolve(m[2]!) === target) matches.push({ start: offset + line.indexOf(m[1]!), end: offset + line.indexOf(m[1]!) + m[1]!.length });
    }
    offset += line.length;
  }
  if (matches.length > 1) throw new PhotoError('Multiple old-photo embeds exist in the photo section. Keep one before replacing.');
  if (matches[0]) region = region.slice(0, matches[0].start) + embed + region.slice(matches[0].end);
  else {
    const placeholder = /^将照片拖入此处。[ \t]*\r?$/m;
    if (placeholder.test(region)) region = region.replace(placeholder, embed);
    else {
      const markerOffset = found.markers[0]!.start - found.start;
      region = region.slice(0, markerOffset) + embed + parts.newline + parts.newline + region.slice(markerOffset);
    }
  }
  doc.set(settings.property, `[[${newPath}]]`);
  const yaml = doc.toString({ lineWidth: 0 }).replace(/\r?\n/g, parts.newline).trimEnd();
  return parts.bom + '---' + parts.newline + yaml + parts.newline + '---' + parts.newline + parts.body.slice(0, found.start) + region + parts.body.slice(found.end);
}
