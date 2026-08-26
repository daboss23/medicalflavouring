'use strict';

/* Reads one order paid on the embedded checkout page back out of Stripe, in the
   same shape `api/checkout-session.js` returns for a hosted Checkout order, so
   the thank-you page renders either without knowing the difference.

   Stripe returns the buyer to the thank-you page with both the intent id and
   its client secret. Only the person who paid has that secret, so this endpoint
   requires it and checks it against the intent before returning anything —
   knowing a `pi_…` id alone is not enough to read someone else's order. */

const {PRODUCT_NAMES:PRODUCTS,send,orderReference,cardLabel,itemView}=require('./order-fields.js');

const INTENT_ID=/^pi_[A-Za-z0-9_]{8,255}$/;
const CLIENT_SECRET=/^pi_[A-Za-z0-9_]{8,255}_secret_[A-Za-z0-9_-]{8,255}$/;

function queryValue(req,name){
  const raw=req.query&&req.query[name]
    ?req.query[name]
    :new URL(req.url,'https://placeholder.invalid').searchParams.get(name);
  return typeof raw==='string'?raw.trim():'';
}

/* `plus:2,blend:4` — written by `api/create-payment-intent.js`, because a
   PaymentIntent carries no line items of its own. */
function paidItems(metadata,unitCents){
  return String(metadata.items||'').split(',').reduce(function(items,pair){
    const bits=pair.split(':');
    const sku=bits[0];
    const quantity=Number(bits[1]);
    if(!PRODUCTS[sku]||!Number.isFinite(quantity)||quantity<1) return items;
    items.push(itemView(sku,PRODUCTS[sku],quantity,unitCents*quantity,false));
    return items;
  },[]);
}

function bonusItems(metadata){
  const counts=String(metadata.bonus_items||'').split(',').reduce(function(result,sku){
    if(PRODUCTS[sku]) result[sku]=(result[sku]||0)+1;
    return result;
  },{});
  return Object.keys(counts).map(function(sku){
    return itemView(sku,PRODUCTS[sku],counts[sku],0,true);
  });
}

function cents(value){
  const number=Number(value);
  return Number.isFinite(number)?number:0;
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }
  if(!process.env.STRIPE_SECRET_KEY){
    return send(res,503,{error:'Stripe is not connected yet',code:'stripe_not_configured'});
  }

  const intentId=queryValue(req,'payment_intent');
  const clientSecret=queryValue(req,'payment_intent_client_secret');
  if(!INTENT_ID.test(intentId)||!CLIENT_SECRET.test(clientSecret)){
    return send(res,400,{error:'Invalid payment reference'});
  }

  try{
    const url=new URL('https://api.stripe.com/v1/payment_intents/'+encodeURIComponent(intentId));
    url.searchParams.append('expand[]','payment_method');

    const stripeResponse=await fetch(url.toString(),{
      headers:{
        Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Stripe-Version':'2026-02-25.clover'
      }
    });
    const intent=await stripeResponse.json();
    if(!stripeResponse.ok){
      const status=stripeResponse.status===404?404:502;
      return send(res,status,{error:'That order could not be found'});
    }
    /* The secret proves this browser is the one that paid. */
    if(intent.client_secret!==clientSecret){
      return send(res,403,{error:'That order could not be found'});
    }
    if(intent.status!=='succeeded'){
      return send(res,200,{status:'pending',paymentStatus:intent.status||'unpaid'});
    }

    const metadata=intent.metadata||{};
    const unitCents=cents(metadata.unit_price_cents);
    const shipping=intent.shipping||{};

    return send(res,200,{
      status:'paid',
      orderNumber:orderReference(intent.id),
      customerName:metadata.customer_name||shipping.name||'',
      email:metadata.customer_email||intent.receipt_email||'',
      payment:cardLabel(intent.payment_method),
      currency:(intent.currency||'aud').toUpperCase(),
      amountSubtotal:cents(metadata.subtotal_ex_gst_cents),
      amountTax:cents(metadata.gst_cents),
      amountShipping:cents(metadata.freight_ex_gst_cents),
      amountTotal:cents(intent.amount),
      placedAt:intent.created?new Date(intent.created*1000).toISOString():'',
      items:paidItems(metadata,unitCents).concat(bonusItems(metadata))
    });
  }catch(error){
    return send(res,502,{error:'Unable to load that order right now'});
  }
};
