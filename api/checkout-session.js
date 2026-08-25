'use strict';

/* Reads a completed Checkout Session back out of Stripe so the thank-you page
   can show the real order. The session id is a capability token handed to the
   buyer in the success redirect, so it is the only credential required — but it
   is still validated, and nothing is returned until Stripe reports the payment
   as paid. */

const Pricing=require('../pricing.js');

const SESSION_ID=/^cs_[A-Za-z0-9_]{8,255}$/;

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(payload));
}

/* A Stripe session id is long, opaque and unreadable over the phone. The order
   number is derived from it so it stays stable across refreshes without needing
   anywhere to persist it. */
function orderNumber(sessionId){
  const tail=String(sessionId).replace(/^cs_(test_|live_)?/,'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  const block=tail.slice(-8).padStart(8,'0');
  return 'MFS-'+block.slice(0,4)+'-'+block.slice(4);
}

function firstName(fullName){
  const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
  return parts.length?parts[0]:'';
}

function centsOf(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.round(number):0;
}

/* Bonus bottles are sent to Stripe as zero-amount line items, so the shipped
   and paid counts can be read straight back off the session rather than trusting
   metadata that older sessions may not carry. */
function readBottles(session){
  const rows=session&&session.line_items&&Array.isArray(session.line_items.data)?session.line_items.data:[];
  const bottles=rows.reduce(function(result,row){
    const quantity=centsOf(row.quantity);
    const paidLine=centsOf(row.amount_total)>0;
    const productData=row.price&&row.price.product&&typeof row.price.product==='object'?row.price.product:null;
    const bonusFlag=productData&&productData.metadata&&productData.metadata.promotional_bonus==='true';
    const bonus=bonusFlag||!paidLine;
    result.shipped+=quantity;
    if(bonus) result.bonus+=quantity;
    else result.paid+=quantity;
    result.items.push({
      name:String(row.description||(productData&&productData.name)||'ORA®').replace(/^Bonus:\s*/,''),
      sku:String((productData&&productData.metadata&&productData.metadata.sku)||''),
      quantity:quantity,
      bonus:bonus,
      amountCents:centsOf(row.amount_total)
    });
    return result;
  },{paid:0,bonus:0,shipped:0,items:[]});

  if(bottles.shipped>0) return bottles;

  const metadata=(session&&session.metadata)||{};
  const paid=centsOf(metadata.paid_bottles);
  const bonus=centsOf(metadata.bonus_bottles);
  return {paid:paid,bonus:bonus,shipped:paid+bonus,items:bottles.items};
}

function shippingAddress(session){
  const collected=session&&session.collected_information&&session.collected_information.shipping_details
    ?session.collected_information.shipping_details
    :(session&&session.shipping_details)||null;
  const address=collected&&collected.address?collected.address:null;
  if(!address) return null;
  return {
    name:String(collected.name||''),
    line1:String(address.line1||''),
    line2:String(address.line2||''),
    city:String(address.city||''),
    state:String(address.state||''),
    postalCode:String(address.postal_code||''),
    country:String(address.country||'')
  };
}

function customFieldValue(session,key){
  const fields=session&&Array.isArray(session.custom_fields)?session.custom_fields:[];
  const match=fields.filter(function(field){ return field&&field.key===key; })[0];
  if(!match||!match.text) return '';
  return String(match.text.value||'');
}

function buildOrder(session){
  const details=session.total_details||{};
  const bottles=readBottles(session);

  /* Stripe's subtotal is what was actually charged before tax. The page shows
     the range at list price and the saving underneath it, so the discount line
     is the difference between the two — which keeps the column adding up to the
     exact amount Stripe settled. */
  const chargedSubtotalCents=centsOf(session.amount_subtotal);
  const listSubtotalCents=bottles.shipped*Pricing.RULES.listUnitCents;
  const stripeDiscountCents=centsOf(details.amount_discount);
  const discountCents=Math.max(0,listSubtotalCents-chargedSubtotalCents)+stripeDiscountCents;
  const customer=session.customer_details||{};

  return {
    orderNumber:orderNumber(session.id),
    placedAt:session.created?new Date(session.created*1000).toISOString():null,
    currency:String(session.currency||Pricing.RULES.currency).toUpperCase(),
    customer:{
      firstName:firstName(customer.name),
      name:String(customer.name||''),
      email:String(customer.email||'')
    },
    bottles:{paid:bottles.paid,bonus:bottles.bonus,shipped:bottles.shipped},
    items:bottles.items,
    totals:{
      subtotalCents:listSubtotalCents||chargedSubtotalCents,
      discountCents:discountCents,
      shippingCents:centsOf(details.amount_shipping),
      gstCents:centsOf(details.amount_tax),
      totalCents:centsOf(session.amount_total)
    },
    shipping:shippingAddress(session),
    purchaseOrder:customFieldValue(session,'purchase_order'),
    orderNotes:customFieldValue(session,'order_notes')
  };
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }
  if(!process.env.STRIPE_SECRET_KEY){
    return send(res,503,{error:'Stripe is not connected yet',code:'stripe_not_configured'});
  }

  const query=req.query||{};
  const sessionId=String(query.session_id||'');
  if(!SESSION_ID.test(sessionId)){
    return send(res,400,{error:'Missing or malformed session id',code:'bad_session_id'});
  }

  try{
    const url='https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(sessionId)
      +'?expand[]=line_items&expand[]=line_items.data.price.product';
    const stripeResponse=await fetch(url,{
      headers:{
        Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Stripe-Version':'2026-02-25.clover'
      }
    });
    const session=await stripeResponse.json();
    if(!stripeResponse.ok){
      const message=session&&session.error&&session.error.message?session.error.message:'Unable to load this order';
      return send(res,stripeResponse.status===404?404:stripeResponse.status,{error:message,code:'stripe_error'});
    }
    if(session.payment_status!=='paid'&&session.payment_status!=='no_payment_required'){
      return send(res,409,{error:'This order has not completed payment yet',code:'unpaid'});
    }
    return send(res,200,{order:buildOrder(session)});
  }catch(error){
    return send(res,502,{error:error&&error.message?error.message:'Unable to load this order',code:'unreachable'});
  }
};

module.exports.buildOrder=buildOrder;
module.exports.orderNumber=orderNumber;
