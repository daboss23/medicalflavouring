'use strict';

/* Shared shaping for the two endpoints that read a finished order back out of
   Stripe — one for orders paid on hosted Checkout, one for orders paid on the
   embedded checkout page. Both hand the thank-you page the same JSON, so the
   receipt does not care which way the customer paid. */

const Catalog=require('../catalog.js');
const Pricing=require('../pricing.js');
const Stock=require('./_short-dated-stock.js');

const PRODUCT_NAMES=Catalog.names();
const ALL_SKUS=Catalog.SKUS.concat(Catalog.SHORT_DATED);

const SKU_IMAGES=ALL_SKUS.reduce((result,sku)=>{
  result[sku.key]=sku.img;
  return result;
},{});

const SKU_TINTS=ALL_SKUS.reduce((result,sku)=>{
  result[sku.key]=sku.hex;
  return result;
},{});

const FALLBACK_TINT='#123a6b';

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(payload));
}

/* A short, human-quotable reference. Stripe has no order numbers of its own, so
   this is derived from the PaymentIntent (stable for the life of the order) and
   is what a customer reads out when they call about their delivery. */
function orderReference(id){
  const source=String(id||'').replace(/^(cs|pi)_(live|test)_/,'');
  return 'ORA-'+source.slice(-8).toUpperCase();
}

function cardLabel(method){
  if(!method||typeof method!=='object') return '';
  if(method.type==='card'&&method.card){
    const brand=String(method.card.brand||'card').replace(/(^|\s)\w/g,c=>c.toUpperCase());
    return method.card.last4?`${brand} •••• ${method.card.last4}`:brand;
  }
  return String(method.type||'').replace(/_/g,' ');
}

function itemView(sku,name,quantity,amountTotal,bonus){
  return {
    name:name,
    sku:sku,
    tint:SKU_TINTS[sku]||FALLBACK_TINT,
    image:SKU_IMAGES[sku]||'',
    quantity:quantity,
    amountTotal:amountTotal,
    bonus:bonus
  };
}

/* The basket both payment endpoints accept, read and priced the same way.

   An order is one offer or the other, never both: the offer named in the
   request picks the product keys and the pricing engine, and a bottle from the
   other offer anywhere in the basket — paid or free — rejects the whole order.
   That is what keeps the clearance price off standard stock, and standard
   prices off clearance stock, whatever a hand-edited request says. Short-dated
   orders are also checked against what is left on the shelf. */
async function readBasket(body){
  const offer=body&&body.offer==='short-dated'?'short-dated':'standard';
  const pricing=Pricing.forOffer(offer);
  const keys=Catalog.keys(offer);
  const raw=body&&body.quantities&&typeof body.quantities==='object'?body.quantities:{};

  const stray=Object.keys(raw).some(key=>{
    const owner=Catalog.offerOf(key);
    return owner&&owner!==offer&&pricing.cleanQuantity(raw[key])>0;
  });
  if(stray){
    return {error:{field:'cart',error:'Short-dated and standard ORA® have to be ordered separately. Please check out one, then the other.'}};
  }

  const quantities=pricing.normalizeQuantities(raw,keys);
  const quote=pricing.quote(quantities);
  if(quote.paidCount<1) return {error:{field:'cart',error:'Add at least one bottle'}};

  const bonuses=Array.isArray(body.bonusChoices)?body.bonusChoices:[];
  if(bonuses.length!==quote.bonusCount||bonuses.some(key=>keys.indexOf(key)===-1)){
    return {error:{field:'bonus',error:'Choose each free bottle'}};
  }

  if(offer==='short-dated'){
    const shipped=Object.assign({},quantities);
    bonuses.forEach(key=>{ shipped[key]+=1; });
    const left=await Stock.remaining({fresh:true});
    const short=Stock.shortfall(left,shipped);
    if(short){
      const name=Catalog.get(short.key).name;
      return {error:{
        field:'cart',
        code:'stock',
        error:short.remaining>0
          ?`Only ${short.remaining} short-dated ${name} ${short.remaining===1?'bottle is':'bottles are'} left, free bottles included. Please reduce your ${name} and try again.`
          :`Short-dated ${name} has sold out. Please remove it and try again.`
      }};
    }
  }

  return {offer,pricing,keys,quantities,quote,bonuses};
}

/* Where an order came from — `?src=email&e=3` on the campaign links, `/sd` on
   the faxes — kept to short, plain tokens before it is written to Stripe. */
function readTracking(body){
  const source=body&&body.tracking&&typeof body.tracking==='object'?body.tracking:{};
  const clean=value=>String(value==null?'':value).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
  return {source:clean(source.src),email:clean(source.e)};
}

module.exports={
  readBasket,
  readTracking,
  PRODUCT_NAMES,
  SKU_IMAGES,
  SKU_TINTS,
  FALLBACK_TINT,
  send,
  orderReference,
  cardLabel,
  itemView
};
