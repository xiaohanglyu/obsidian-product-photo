import { describe,it,expect } from 'vitest';
import { parseOrder } from '../src/ocr/parser';
import { OcrResult } from '../src/ocr/engine';
const result=(text:string):OcrResult=>({text,confidence:95,lines:[],width:1000,height:1500});
describe('order parser',()=>{
  it('groups products without treating order totals as unit prices',()=>{
    const products=parseOrder(result('Sephora\nCLINIQUE\nMini Take The Day Off Charcoal Cleansing Balm\nSize: 30 mL\nCAD $21.00 Qty: 1\nAdd to Basket\nThe Ordinary\nMatrixyl 10% + Hyaluronic Acid\nSize: 30 mL\nCAD $14.40 Qty: 1\nOrder Total CAD $100.00'),'sephora');
    expect(products).toHaveLength(2);expect(products[0]).toMatchObject({brand:'CLINIQUE',price:'21.00',currency:'CAD',quantity:'1'});
    expect(products[1]).toMatchObject({brand:'The Ordinary',price:'14.40'});expect(products[1]!.name).not.toContain('Order Total');
  });
  it('does not invent a year, currency or opening date',()=>{
    const p=parseOrder(result('Delivery By Fri, May 08\nrhode\nPocket Blush\nColor: Piggy\n$38.00 Qty: 1'))[0]!;
    expect(p).toMatchObject({shade:'Piggy',delivery_date:'',open_date:'',currency:''});expect(p.warnings.join(' ')).toContain('no year');
  });
  it('only takes a purchase date from an explicit purchase label, not a return cutoff',()=>{
    const p=parseOrder(result('Amazon.ca\nCOVERGIRL - Clean Fresh Tinted Lip Balm\nReturn window closed on June 11, 2026\n$6.97\nOrder placed May 11, 2026'),'amazon')[0]!;
    expect(p.purchase_date).toBe('2026-05-11');expect(p.open_date).toBe('');
  });
  it('recognizes Chinese shade labels and ignores the final order total',()=>{
    const p=parseOrder(result('天猫 hince旗舰店\nhince 高光棒\n色号: LT001 轻盈\n￥112.26\n数量: 1\n实付款 ￥233.15'),'tmall')[0]!;
    expect(p).toMatchObject({brand:'hince',shade:'LT001 轻盈',price:'112.26',currency:'CNY',quantity:'1'});
  });
  it('retains truncated names as uncertain rather than completing them',()=>{
    const p=parseOrder(result('COVERGIRL - Clean Fresh Tinted L...\n$6.97'))[0]!;
    expect(p.name).toContain('...');expect(p.warnings.join(' ')).toContain('truncated');
  });
  it('can use a brand already present in the local vault',()=>{
    const p=parseOrder(result('Example Local Brand\nTinted Balm\nCAD $12.00'),'auto',['Example Local Brand'])[0]!;
    expect(p.brand).toBe('Example Local Brand');
  });
});
