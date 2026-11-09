import { describe,it,expect } from 'vitest';
import { parseDocument } from 'yaml';
import { applyFields,inspectNote,FieldValues } from '../src/ocr/write';
const values:FieldValues={brand:'rhode',shade:'Piggy',price:'38.00',currency:'CAD',purchase_channel:'Sephora',purchase_date:'2026-05-08',open_date:'2026-05-08'};
const note='---\nbrand: Existing\nshade: ""\nprice:\nphoto: "[[Photos/old.webp]]"\n# Keep this comment\nrating: 4\npurpose: [lips, face]\n---\n# My product\n\n## 使用记录\nMy actual review\n';
describe('reviewed OCR writes',()=>{
  it('writes only explicitly selected fields and preserves unrelated properties and body',()=>{
    const updated=applyFields(note,inspectNote(note),values,['shade','price'],'Pocket Blush',false);
    const yaml=parseDocument(updated.split('---')[1]!).toJS();
    expect(yaml).toEqual({brand:'Existing',shade:'Piggy',price:38,photo:'[[Photos/old.webp]]',rating:4,purpose:['lips','face']});
    expect(updated).toContain('# Keep this comment');expect(updated).toContain('# My product');expect(updated).toContain('My actual review');
  });
  it('merges a review edited after OCR began',()=>{
    const updated=applyFields(note.replace('My actual review','New review'),inspectNote(note),values,['shade'],'',false);
    expect(updated).toContain('New review');
  });
  it('refuses a selected property changed since the form opened',()=>{
    expect(()=>applyFields(note.replace('shade: ""','shade: Omega'),inspectNote(note),values,['shade'],'',false)).toThrow('changed');
  });
  it('does not erase a field with a blank or malformed OCR value',()=>{
    for(const price of ['', '-5','abc','1.234'])expect(()=>applyFields(note,inspectNote(note),{...values,price},['price'],'',false)).toThrow();
    expect(()=>applyFields(note,inspectNote(note),{...values,open_date:'2999-01-01'},['open_date'],'',false)).toThrow('future');
    expect(()=>applyFields(note,inspectNote(note),{...values,purchase_date:'2026-02-30'},['purchase_date'],'',false)).toThrow('valid date');
  });
  it('does not replace complex property structures',()=>{
    const text=note.replace('shade: ""','shade: [one, two]');expect(()=>applyFields(text,inspectNote(text),values,['shade'],'',false)).toThrow('complex');
  });
  it('only changes the note heading when explicitly selected and ignores code examples',()=>{
    const text=note+'\n```md\n# Example heading\n```\n';
    const updated=applyFields(text,inspectNote(text),values,[],'Pocket Blush',true);
    expect(updated).toContain('# Pocket Blush');expect(updated).toContain('# Example heading');expect(updated).not.toContain('# My product');
  });
  it('rejects ambiguous headings and an empty selection',()=>{
    expect(()=>applyFields(note+'\n# Other product\n',inspectNote(note+'\n# Other product\n'),values,[],'Pocket Blush',true)).toThrow('More than one');
    expect(()=>applyFields(note,inspectNote(note),values,[],'',false)).toThrow('Select at least');
  });
});

it('recognizes empty YAML properties as existing template fields',()=>{
 const note=inspectNote('---\nprice:\nopen_date:\n---\nBody');
 expect(note.present).toEqual(['price','open_date']);expect(note.values.price).toBeNull();
});
