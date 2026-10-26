'use strict';

/* Short-dated clearance stock.

   The site has no database, so stock is worked out rather than stored:

     on hand now = the count below − short-dated bottles paid online since `countedAt`

   Online orders are read back from Stripe (every short-dated payment carries
   `metadata.offer = short-dated` and its bottles in `metadata.items` and
   `metadata.bonus_items`), so web sales draw stock down by themselves. Fax,
   email and phone orders do not pass through Stripe: after a stocktake, or a
   batch of those orders, put the real shelf count in `onHand`, move
   `countedAt` to that moment, and redeploy.

   The `_` prefix keeps Vercel from serving this file as an endpoint, and it is
   not in the public site, so the counts are never sent to a browser. The page
   only ever sees Available / Low / Sold out. */

const STOCK={
  countedAt:'2026-10-26T15:30:00+11:00',
  /* Shelf counts supplied 26 Oct 2026. Web orders paid after `countedAt` are
     subtracted automatically; fax, email and phone orders are not. */
  onHand:{
    'plus-sd':430,
    'sweet-sd':380,
    'blend-sd':250
  },
  /* At or under this many bottles a product reads "Low stock". */
  lowAt:36
};

const SEARCH_URL='https://api.stripe.com/v1/payment_intents/search';
const CACHE_MS=60*1000;
const MAX_PAGES=20;

let cache=null;

function tally(target,list){
  String(list||'').split(',').forEach(part=>{
    const bits=part.split(':');
    const key=bits[0].trim();
    if(!Object.prototype.hasOwnProperty.call(target,key)) return;
    const count=bits.length>1?Number(bits[1]):1;
    if(Number.isFinite(count)&&count>0) target[key]+=Math.floor(count);
  });
}

/* Bottles shipped per product — paid and free alike, since both leave the
   shelf — across every successful short-dated payment since the count. */
async function soldSinceCount(secret,fetcher){
  const sold=Object.keys(STOCK.onHand).reduce((result,key)=>{ result[key]=0; return result; },{});
  const since=Math.floor(new Date(STOCK.countedAt).getTime()/1000);
  const query=`metadata['offer']:'short-dated' AND status:'succeeded' AND created>${since}`;
  let page='';
  for(let index=0;index<MAX_PAGES;index+=1){
    const params=new URLSearchParams({query:query,limit:'100'});
    if(page) params.set('page',page);
    const response=await fetcher(`${SEARCH_URL}?${params.toString()}`,{
      headers:{
        Authorization:`Bearer ${secret}`,
        'Stripe-Version':'2026-02-25.clover'
      }
    });
    const body=await response.json();
    if(!response.ok) throw new Error(body&&body.error&&body.error.message||'Stripe search failed');
    (body.data||[]).forEach(intent=>{
      const metadata=intent&&intent.metadata||{};
      tally(sold,metadata.items);
      tally(sold,metadata.bonus_items);
    });
    if(!body.has_more||!body.next_page) break;
    page=body.next_page;
  }
  return sold;
}

/* Bottles left per product. If Stripe cannot be read, the count above stands
   on its own: the page keeps selling against the last stocktake rather than
   going dark, and the miss is logged for whoever deploys the site. */
async function remaining(options){
  const opts=options||{};
  const now=Date.now();
  if(!opts.fresh&&cache&&now-cache.at<CACHE_MS) return Object.assign({},cache.remaining);

  let sold={};
  const secret=process.env.STRIPE_SECRET_KEY;
  if(secret){
    try{
      sold=await soldSinceCount(secret,opts.fetch||global.fetch);
    }catch(error){
      console.warn('[short-dated stock] Could not read sales from Stripe; using the stocktake alone:',error&&error.message);
      sold={};
    }
  }
  const left=Object.keys(STOCK.onHand).reduce((result,key)=>{
    result[key]=Math.max(0,STOCK.onHand[key]-(sold[key]||0));
    return result;
  },{});
  cache={at:now,remaining:left};
  return Object.assign({},left);
}

function status(count){
  if(count<=0) return 'sold-out';
  if(count<=STOCK.lowAt) return 'low';
  return 'available';
}

/* Each product's shipped bottles against what is left. Returns null when the
   order fits, or the first product it does not fit, with how many remain. */
function shortfall(left,shipped){
  const keys=Object.keys(shipped);
  for(let index=0;index<keys.length;index+=1){
    const key=keys[index];
    const have=Object.prototype.hasOwnProperty.call(left,key)?left[key]:0;
    if(shipped[key]>have) return {key:key,remaining:have,wanted:shipped[key]};
  }
  return null;
}

function resetCache(){ cache=null; }

module.exports={STOCK,remaining,status,shortfall,resetCache};
