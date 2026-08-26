'use strict';

/* Shared shaping for the two endpoints that read a finished order back out of
   Stripe — one for orders paid on hosted Checkout, one for orders paid on the
   embedded checkout page. Both hand the thank-you page the same JSON, so the
   receipt does not care which way the customer paid. */

const Catalog=require('../catalog.js');

const PRODUCT_NAMES=Catalog.names();

const SKU_IMAGES=Catalog.SKUS.reduce((result,sku)=>{
  result[sku.key]=sku.img;
  return result;
},{});

const SKU_TINTS=Catalog.SKUS.reduce((result,sku)=>{
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

module.exports={
  PRODUCT_NAMES,
  SKU_IMAGES,
  SKU_TINTS,
  FALLBACK_TINT,
  send,
  orderReference,
  cardLabel,
  itemView
};
