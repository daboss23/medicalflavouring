'use strict';

/* Payment engine for the embedded checkout page.

   The page collects the customer's details in our own fields and takes the card
   in a Stripe Payment Element, so there is no hosted Checkout Session to hold
   the order — this endpoint builds the PaymentIntent instead. Two rules matter:

   1. The browser sends product choices, never prices. Every cent is recalculated
      here with the shared pricing engine, so an edited page or a hand-written
      request buys at the real price or not at all.
   2. One customer, one PaymentIntent. A declined card, a fixed typo or a
      changed quantity updates the intent it already has rather than leaving a
      trail of abandoned intents behind every order. */

const Pricing=require('../pricing.js');
const {PRODUCT_NAMES:PRODUCTS,send}=require('./order-fields.js');

const INTENT_ID=/^pi_[A-Za-z0-9_]{8,255}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE=/^\d{4}$/;
const STATES=['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];

function text(value,limit){
  return String(value==null?'':value).replace(/\s+/g,' ').trim().slice(0,limit||120);
}

/* Field-tagged so the page can put the message under the input that caused it
   rather than showing one generic "check your details" line at the bottom. */
function invalid(field,message){
  return {field:field,error:message};
}

function readCustomer(body){
  const source=body.customer&&typeof body.customer==='object'?body.customer:{};
  const customer={
    firstName:text(source.firstName,60),
    lastName:text(source.lastName,60),
    email:text(source.email,120),
    phone:text(source.phone,40),
    business:text(source.business,120)
  };
  if(!customer.firstName) return invalid('firstName','Enter your first name');
  if(!customer.lastName) return invalid('lastName','Enter your last name');
  if(!EMAIL.test(customer.email)) return invalid('email','Enter a valid email address');
  if(customer.phone.replace(/\D/g,'').length<8) return invalid('phone','Enter a contact phone number');
  return {customer:customer};
}

function readAddress(source,prefix,label){
  const address={
    line1:text(source&&source.line1,200),
    line2:text(source&&source.line2,200),
    city:text(source&&source.city,80),
    state:text(source&&source.state,20).toUpperCase(),
    postcode:text(source&&source.postcode,10),
    country:'AU'
  };
  if(!address.line1) return invalid(prefix+'Line1','Enter the '+label+' street address');
  if(!address.city) return invalid(prefix+'City','Enter the '+label+' suburb or town');
  if(STATES.indexOf(address.state)===-1) return invalid(prefix+'State','Choose the '+label+' state');
  if(!POSTCODE.test(address.postcode)) return invalid(prefix+'Postcode','Enter a 4-digit postcode');
  return {address:address};
}

function setAddress(params,base,address){
  params.set(`${base}[line1]`,address.line1);
  if(address.line2) params.set(`${base}[line2]`,address.line2);
  params.set(`${base}[city]`,address.city);
  params.set(`${base}[state]`,address.state);
  params.set(`${base}[postal_code]`,address.postcode);
  params.set(`${base}[country]`,address.country);
}

/* What was actually bought, written where a refund or a delivery query can read
   it: the Stripe dashboard, the webhook payload, and the receipt this order's
   thank-you page renders. A PaymentIntent has no line items of its own. */
function itemList(quantities,keys){
  return keys.filter(key=>quantities[key]>0).map(key=>`${key}:${quantities[key]}`).join(',');
}

function orderSummary(quote,quantities,keys,bonuses){
  const bottles=keys.filter(key=>quantities[key]>0)
    .map(key=>`${quantities[key]} × ${PRODUCTS[key]}`).join(', ');
  const free=bonuses.length?` + ${bonuses.length} free (${bonuses.map(key=>PRODUCTS[key]).join(', ')})`:'';
  return `ORA® order · ${bottles}${free}`.slice(0,350);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{error:'Method not allowed'});
  }
  if(!process.env.STRIPE_SECRET_KEY){
    return send(res,503,{error:'Stripe is not connected yet',code:'stripe_not_configured'});
  }

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const productKeys=Object.keys(PRODUCTS);
    const quantities=Pricing.normalizeQuantities(body.quantities,productKeys);
    const quote=Pricing.quote(quantities);
    if(quote.paidCount<1) return send(res,400,invalid('cart','Add at least one bottle'));

    const bonuses=Array.isArray(body.bonusChoices)?body.bonusChoices:[];
    if(bonuses.length!==quote.bonusCount||bonuses.some(key=>!PRODUCTS[key])){
      return send(res,400,invalid('bonus','Choose each free bottle'));
    }

    const customerResult=readCustomer(body);
    if(customerResult.error) return send(res,400,customerResult);
    const customer=customerResult.customer;

    const shippingResult=readAddress(body.shipping,'shipping','delivery');
    if(shippingResult.error) return send(res,400,shippingResult);
    const shipping=shippingResult.address;

    /* Most buyers ship where they are billed; the page only sends a second
       address when they say otherwise. */
    let billing=shipping;
    if(body.billingSameAsShipping===false){
      const billingResult=readAddress(body.billing,'billing','billing');
      if(billingResult.error) return send(res,400,billingResult);
      billing=billingResult.address;
    }

    const fullName=`${customer.firstName} ${customer.lastName}`.trim();
    const params=new URLSearchParams();
    params.set('amount',String(quote.totalIncGstCents));
    params.set('currency',Pricing.RULES.currency);
    params.set('description',orderSummary(quote,quantities,productKeys,bonuses));
    params.set('receipt_email',customer.email);
    params.set('shipping[name]',customer.business||fullName);
    params.set('shipping[phone]',customer.phone);
    setAddress(params,'shipping[address]',shipping);

    const metadata={
      pricing_version:quote.pricingVersion,
      checkout:'embedded',
      items:itemList(quantities,productKeys),
      bonus_items:bonuses.join(','),
      paid_bottles:String(quote.paidCount),
      bonus_bottles:String(quote.bonusCount),
      shipped_bottles:String(quote.shippedCount),
      unit_price_cents:String(quote.unitCents),
      subtotal_ex_gst_cents:String(quote.subtotalCents),
      freight_ex_gst_cents:String(quote.freightCents),
      gst_cents:String(quote.gstCents),
      total_inc_gst_cents:String(quote.totalIncGstCents),
      customer_name:fullName,
      customer_email:customer.email,
      customer_phone:customer.phone,
      business_name:customer.business,
      billing_same_as_shipping:billing===shipping?'true':'false'
    };
    Object.keys(metadata).forEach(key=>params.set(`metadata[${key}]`,metadata[key]));

    /* Reuse the intent this browser already opened, so a second attempt after a
       declined card is the same order in the dashboard rather than a new one. */
    const existing=text(body.intentId,255);
    const reuse=INTENT_ID.test(existing);
    if(!reuse){
      params.set('automatic_payment_methods[enabled]','true');
    }

    const url=reuse
      ?`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(existing)}`
      :'https://api.stripe.com/v1/payment_intents';

    const stripeResponse=await fetch(url,{
      method:'POST',
      headers:{
        Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type':'application/x-www-form-urlencoded',
        'Stripe-Version':'2026-02-25.clover'
      },
      body:params.toString()
    });
    /* A gateway or proxy in front of Stripe can answer with something that is
       not JSON at all. The customer gets a sentence they can act on, not a
       parser error. */
    let intent=null;
    try{
      intent=await stripeResponse.json();
    }catch(error){
      return send(res,502,{error:'The payment service could not be reached. Please try again in a moment.'});
    }
    if(!stripeResponse.ok||!intent||!intent.client_secret){
      const message=intent&&intent.error&&intent.error.message
        ?intent.error.message
        :'Unable to start this payment';
      return send(res,stripeResponse.ok?502:stripeResponse.status,{error:message});
    }

    return send(res,200,{
      clientSecret:intent.client_secret,
      intentId:intent.id,
      billing:billing,
      quote:quote
    });
  }catch(error){
    return send(res,400,{error:error&&error.message?error.message:'Invalid payment request'});
  }
};
