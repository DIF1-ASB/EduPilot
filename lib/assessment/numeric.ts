const LIMIT=BigInt('1000000000000000000'),ZERO=BigInt(0),ONE=BigInt(1);
const abs=(n:bigint)=>n<ZERO?-n:n;
export function normalizeNumeric(raw:string):{numerator:bigint,denominator:bigint}|null{
 if(raw.length>100)return null;const value=raw.trim().replace(',','.');let numerator:bigint,denominator:bigint;
 const fraction=/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value),decimal=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
 if(fraction){numerator=BigInt(fraction[1]);denominator=BigInt(fraction[2]);}
 else if(decimal){const digits=decimal[3]??'';if(digits.length>18)return null;denominator=BigInt('1'+'0'.repeat(digits.length));numerator=BigInt((decimal[1]==='-'?'-':'')+decimal[2]+digits);}
 else return null;
 if(denominator===ZERO||abs(numerator)>LIMIT||abs(denominator)>LIMIT)return null;
 if(denominator<ZERO){denominator=-denominator;numerator=-numerator;}
 let a=abs(numerator),b=denominator;while(b!==ZERO){const r=a%b;a=b;b=r;}const divisor=a||ONE;
 return {numerator:numerator/divisor,denominator:denominator/divisor};
}
