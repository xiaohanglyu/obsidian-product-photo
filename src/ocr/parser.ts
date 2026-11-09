import { OcrResult, OcrLine } from './engine';
export type OrderFormat='auto'|'sephora'|'amazon'|'tmall';
export interface ProductDraft {
  name:string;brand:string;shade:string;size:string;quantity:string;price:string;currency:string;
  purchase_channel:string;purchase_date:string;delivery_date:string;open_date:string;warnings:string[];
}
const BRANDS=['The Ordinary','CLINIQUE','Supergoop!','Live Tinted','rhode','MAC Cosmetics','MILK MAKEUP','Haus Labs','NARS','Salt & Stone','Danessa Myricks Beauty','ILIA','SEPHORA COLLECTION','Charlotte Tilbury','hince','BOBBI BROWN','INTO YOU','COVERGIRL','QUO Beauty'];
const ui=/^(?:order details|your orders|order summary|shipment|item\b|add to basket|out of stock|notify me|view your item|buy it again|write a product review|sample$|home$|shop$|offers$|my store|ai beauty|delivery window|deliver to|need to return|returns are|return window|return faq|view tracking|fast delivery items|merchandise subtotal|discounts|shipping|estimated|order total|grand total|total before tax|payment method|ship to|订单信息|价格明细|实付款|交易成功|售后|联系客服|赠品|回头客|退货宝|加入购物车|闲鱼转卖|申请售后|追加评论|再次购买|服务保障|查看物流)/i;
const money=/(?:CAD\s*\$?\s*|CA\$\s*|C\$\s*|US\$\s*|USD\s*\$?\s*|\$\s*|[¥￥]\s*)(\d[\d,]*(?:\.\d{1,2})?)/i;
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function fullDate(text:string):string {
  const iso=text.match(/\b(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if(iso)return validDate(`${iso[1]}-${iso[2]!.padStart(2,'0')}-${iso[3]!.padStart(2,'0')}`);
  const en=text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if(!en)return '';const month=months.findIndex(m=>m.startsWith(en[1]!.toLowerCase()));
  return month<0?'':validDate(`${en[3]}-${String(month+1).padStart(2,'0')}-${en[2]!.padStart(2,'0')}`);
}
export function validDate(value:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}
export function parseOrder(result:OcrResult,format:OrderFormat='auto',knownBrands:string[]=[]):ProductDraft[]{
  const lines=(result.lines.length?result.lines.map(l=>({...l,text:l.text.trim()})):result.text.split(/\r?\n/).filter(Boolean).map((text,i)=>({text:text.trim(),confidence:0,bbox:{x0:result.width/2,x1:result.width,y0:i*20,y1:i*20+15}}))).filter(l=>l.text);
  const full=lines.map(l=>l.text).join('\n');
  const channel=format==='tmall'?'Tmall':format==='sephora'?'Sephora':format==='amazon'?'Amazon':/天猫|旗舰店/.test(full)?'Tmall':/Amazon(?:\.ca|\.com)?/i.test(full)?(/Amazon\.ca/i.test(full)?'Amazon.ca':'Amazon'):/(?:^sephora$|sephora\.(?:com|ca))/im.test(full)?'Sephora':'';
  const brands=[...new Set([...knownBrands,...BRANDS])].filter(b=>b.trim().length>1).sort((a,b)=>b.length-a.length);
  const detectBrand=(line:string)=>brands.find(b=>line.toLowerCase().replace(/\s/g,'').includes(b.toLowerCase().replace(/\s/g,'')))??'';
  const isStore=(line:string)=>/旗舰店|官方旗舰|sold by|^天猫/.test(line);
  let purchase='',delivery='';
  for(let i=0;i<lines.length;i++){
    const text=lines[i]!.text;const context=text+' '+(lines[i+1]?.text??'');
    if(/order placed|purchase date|下单时间|购买日期|订单创建时间/i.test(text))purchase=fullDate(context);
    if(/delivery by|delivery window|delivered|送达|签收/i.test(text)&&!/return|退货/i.test(text))delivery=fullDate(context);
  }
  const blocks:OcrLine[][]=[];let current:OcrLine[]=[];let currentBrand='';
  for(const line of lines){
    const brand=detectBrand(line.text);
    // Product labels are normally in the text column, not in the tiny packaging image.
    if(line.bbox.x1<result.width*0.28)continue;
    if(brand&&!isStore(line.text)&&!ui.test(line.text)&&!/^color\s*:/i.test(line.text)){
      if(current.length&&currentBrand&&(brand!==currentBrand||current.some(l=>money.test(l.text)))){blocks.push(current);current=[];}
      currentBrand=brand;
    }
    if(currentBrand)current.push(line);
  }
  if(current.length)blocks.push(current);
  if(!blocks.length)blocks.push(lines);
  return blocks.map(block=>{
    const draft:ProductDraft={name:'',brand:'',shade:'',size:'',quantity:'',price:'',currency:'',purchase_channel:channel,purchase_date:purchase,delivery_date:delivery,open_date:'',warnings:[]};
    const names:string[]=[];
    for(const line of block){
      const text=line.text.replace(/^.*?\b(Size\s*:)/i,'$1');const brand=detectBrand(text);
      if(!draft.brand&&brand&&!isStore(text))draft.brand=brand;
      if(/^(?:color|colour|shade|色\s*号|颜色)\s*[:：]/i.test(text)){draft.shade=text.replace(/^(?:color|colour|shade|色\s*号|颜色)\s*[:：]\s*/i,'');continue;}
      if(/^(?:size|规格|容量)\s*[:：]/i.test(text)){draft.size=text.replace(/^(?:size|规格|容量)\s*[:：]\s*/i,'');continue;}
      if(/(?:\bQty\b|数量)\s*[:：]?\s*(\d+)/i.test(text))draft.quantity=text.match(/(?:\bQty\b|数量)\s*[:：]?\s*(\d+)/i)![1]!;
      if(!draft.shade&&/^#?\s*(?:TP\d{3}|LT\d{3}|\d{2,3}\s*#?\s*[^\d\s])/i.test(text)&&!/\d{4,}/.test(text))draft.shade=text;
      if(/^x\s*\d+$/i.test(text))draft.quantity=text.replace(/\D/g,'');
      if(ui.test(text)||isStore(text)||/return|refund|退货|优惠|消费券|地址|收货人|订单号/i.test(text))continue;
      const amount=text.match(money);
      if(amount){
        if(!draft.price){draft.price=amount[1]!.replace(/,/g,'');draft.currency=/CAD|CA\$|C\$/i.test(amount[0])?'CAD':/USD|US\$/i.test(amount[0])?'USD':/[¥￥]/.test(amount[0])&&channel==='Tmall'?'CNY':'';}
        continue;
      }
      if(/^(?:delivery|order placed|订单|送达|签收)/i.test(text)||/^(?:\d+[.:]\d+|x\d+|\d{4,}|[A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i.test(text))continue;
      const withoutBrand=brand?text.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').trim():text;
      if(withoutBrand&&!/^(?:by |fri,|sun,|wed,|mon,|tue,|thu,|sat,|\d+:|\d+\s*mL)/i.test(withoutBrand)&&names.length<3)names.push(withoutBrand);
    }
    draft.name=names.join(' ').replace(/^[\s:–—-]+/,'').trim();
    if(!draft.brand)draft.warnings.push('Brand was not identified.');
    if(draft.price&&!draft.currency)draft.warnings.push('Currency is ambiguous; choose it yourself.');
    if(/delivery by|delivery window|delivered|送达|签收/i.test(full)&&!delivery)draft.warnings.push('Delivery date is incomplete; no year or day was guessed.');
    if(/\.\.\.|…/.test(draft.name))draft.warnings.push('Product name appears truncated in the screenshot.');
    if(result.confidence<70)draft.warnings.push('OCR confidence is low; check every field against the screenshot.');
    return draft;
  }).filter(d=>d.name||d.brand||d.price);
}
