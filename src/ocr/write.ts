import { isMap, parseDocument } from 'yaml';
import { PhotoError } from '../core';
import { validDate } from './parser';
export const FIELD_KEYS=['brand','shade','price','currency','purchase_channel','purchase_date','open_date'] as const;
export type FieldKey=typeof FIELD_KEYS[number];
export type FieldValues=Record<FieldKey,string>;
export interface NoteFields { values:Partial<Record<FieldKey,unknown>>;present:FieldKey[];heading:string }
function noteParts(text:string){
  const match=/^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if(!match&&/^\uFEFF?---\r?\n/.test(text))throw new PhotoError('The note has invalid YAML frontmatter.');
  const yaml=match?.[2]??'';const doc=parseDocument(yaml,{uniqueKeys:true});
  if(doc.errors.length||(doc.contents!==null&&!isMap(doc.contents)))throw new PhotoError('Fix invalid YAML before filling product information.');
  const body=match?text.slice(match[0].length):text.replace(/^\uFEFF/,'');
  return {doc,body,bom:match?.[1]??(text.startsWith('\uFEFF')?'\uFEFF':''),newline:text.includes('\r\n')?'\r\n':'\n'};
}
function headings(body:string){
  const found:{start:number;end:number;text:string}[]=[];let offset=0;let fence:{char:string;length:number}|null=null;
  for(const line of body.match(/[^\n]*(?:\n|$)/g)??[]){
    const delim=/^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
    if(delim){if(!fence)fence={char:delim[1]![0]!,length:delim[1]!.length};else if(delim[1]![0]===fence.char&&delim[1]!.length>=fence.length&&!delim[2]!.trim())fence=null;}
    else if(!fence){const h=/^#\s+(.+?)[ \t]*\r?\n?$/.exec(line);if(h)found.push({start:offset,end:offset+line.length,text:h[1]!});}
    offset+=line.length;
  }
  return found;
}
export function inspectNote(text:string):NoteFields{
  const {doc,body}=noteParts(text);const values:NoteFields['values']={};const present:FieldKey[]=[];
  for(const key of FIELD_KEYS){const v=doc.get(key);if(doc.has(key)){present.push(key);values[key]=v===undefined||v===null?null:typeof v==='object'?{complex:true}:v;}}
  const hs=headings(body);return {values,present,heading:hs.length===1?hs[0]!.text:''};
}
export function fieldValue(key:FieldKey,value:string):string|number {
  const text=value.trim();if(!text)throw new PhotoError(`Enter a value for ${key}, or uncheck it.`);
  if(/\r|\n/.test(text))throw new PhotoError(`${key} must be a single line.`);
  if(key==='price'){const n=Number(text);if(!/^\d+(?:\.\d{1,2})?$/.test(text)||!Number.isFinite(n))throw new PhotoError('Price must be a non-negative number with at most two decimal places.');return n;}
  if(key==='currency'&&!/^[A-Z]{3}$/.test(text))throw new PhotoError('Currency must be a three-letter code such as CAD, USD, or CNY.');
  if((key==='purchase_date'||key==='open_date')&&!validDate(text))throw new PhotoError('Use a complete, valid date in YYYY-MM-DD format.');
  if(key==='open_date'){
    const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    if(text>today)throw new PhotoError('A future delivery date cannot be an actual opening date.');
  }
  return text;
}
export function applyFields(latest:string,before:NoteFields,values:FieldValues,selected:FieldKey[],name:string,updateHeading:boolean):string {
  const {doc,body,bom,newline}=noteParts(latest);const current=inspectNote(latest);
  for(const key of selected){
    if(JSON.stringify(before.values[key])!==JSON.stringify(current.values[key]))throw new PhotoError(`${key} changed while the review was open. Reopen OCR before saving.`);
    if(current.values[key]!==null&&typeof current.values[key]==='object')throw new PhotoError(`${key} has a complex value; it was not replaced.`);
    doc.set(key,fieldValue(key,values[key]));
  }
  let nextBody=body;
  if(updateHeading){
    if(!name.trim()||/[\r\n]/.test(name))throw new PhotoError('Enter a single-line product name.');
    const hs=headings(body);
    if(hs.length>1)throw new PhotoError('More than one top-level heading exists; the product name was not written.');
    if(current.heading!==before.heading)throw new PhotoError('The note heading changed while the review was open.');
    const title='# '+name.trim()+newline;
    nextBody=hs[0]?body.slice(0,hs[0].start)+title+body.slice(hs[0].end):title+newline+body;
  }
  if(!selected.length&&!updateHeading)throw new PhotoError('Select at least one field to save.');
  const yaml=doc.toString({lineWidth:0}).replace(/\r?\n/g,newline).trimEnd();
  return bom+'---'+newline+yaml+newline+'---'+newline+nextBody;
}
