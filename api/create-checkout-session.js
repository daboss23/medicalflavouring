'use strict';

const {PRODUCT_NAMES:PRODUCTS,send,readBasket,readTracking}=require('./order-fields.js');

function requestOrigin(req){
  if(process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/,'');
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=req.headers['x-forwarded-host']||req.headers.host;
  return `${proto}://${host}`;
}

function addLineItem(params,index,currency,name,unitCents,quantity,sku,bonus){
  const base=`line_items[${index}]`;
  params.set(`${base}[price_data][currency]`,currency);
  params.set(`${base}[price_data][unit_amount]`,String(unitCents));
  params.set(`${base}[price_data][tax_behavior]`,'exclusive');
  params.set(`${base}[price_data][product_data][name]`,bonus?`Bonus: ${name}`:name);
  params.set(`${base}[price_data][product_data][description]`,bonus?'Promotional bonus bottle · 473 mL':'ORA® compounding vehicle · 473 mL');
  params.set(`${base}[price_data][product_data][metadata][sku]`,sku);
  params.set(`${base}[price_data][product_data][metadata][promotional_bonus]`,bonus?'true':'false');
  params.set(`${base}[quantity]`,String(quantity));
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
    const basket=await readBasket(body);
    if(basket.error){
      const message=basket.error.field==='bonus'?'Choose each promotional bonus bottle':basket.error.error;
      return send(res,basket.error.code==='stock'?409:400,{error:message});
    }
    const {offer,quantities,quote,bonuses,keys:productKeys}=basket;
    const tracking=readTracking(body);
    const shortDated=offer==='short-dated';

    const params=new URLSearchParams();
    const origin=requestOrigin(req);
    params.set('mode','payment');
    params.set('success_url',`${origin}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url',shortDated?`${origin}/short-dated#builder`:`${origin}/#builder`);
    params.set('billing_address_collection','required');
    params.set('shipping_address_collection[allowed_countries][0]','AU');
    params.set('phone_number_collection[enabled]','true');
    /* The shipping address block already collects the buyer's name, so asking
       for it again under Contact details just made customers type it twice.
       The pharmacy name stays, but optional — plenty of orders are personal. */
    params.set('name_collection[business][enabled]','true');
    params.set('name_collection[business][optional]','true');
    params.set('custom_text[shipping_address][message]','Enter the Australian delivery address for this ORA® order.');
    params.set('automatic_tax[enabled]','true');
    /* Freight as a Stripe shipping rate rather than a line item: it shows
       under its own "Freight" heading at checkout, stays out of the bottle
       count, and lands in `total_details.amount_shipping` for the thank-you
       page. The amount is this order's tier from `pricing.js`, quoted ex GST
       with the shipping tax code, so Automatic Tax adds the GST on top
       alongside the GST on the bottles. Defined inline — no Dashboard object
       to keep in sync with `pricing.js`. */
    params.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');
    params.set('shipping_options[0][shipping_rate_data][display_name]','Freight');
    params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]',quote.currency);
    params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(quote.freightCents));
    params.set('shipping_options[0][shipping_rate_data][tax_behavior]','exclusive');
    params.set('shipping_options[0][shipping_rate_data][tax_code]','txcd_92010001');
    params.set('customer_creation','always');

    let index=0;
    productKeys.forEach(key=>{
      if(quantities[key]>0){
        addLineItem(params,index++,quote.currency,PRODUCTS[key],quote.unitCents,quantities[key],key,false);
      }
    });
    const bonusBySku=bonuses.reduce((result,key)=>{
      result[key]=(result[key]||0)+1;
      return result;
    },{});
    Object.keys(bonusBySku).forEach(key=>{
      addLineItem(params,index++,quote.currency,PRODUCTS[key],0,bonusBySku[key],key,true);
    });

    const metadata={
      pricing_version:quote.pricingVersion,
      offer:offer,
      paid_bottles:String(quote.paidCount),
      bonus_bottles:String(quote.bonusCount),
      unit_price_cents:String(quote.unitCents),
      subtotal_ex_gst_cents:String(quote.subtotalCents),
      freight_ex_gst_cents:String(quote.freightCents),
      source:tracking.source,
      source_email:tracking.email
    };
    Object.keys(metadata).forEach(key=>params.set(`metadata[${key}]`,metadata[key]));
    /* The session's metadata stays on the session; the PaymentIntent behind it
       needs its own copy, with the bottles, so the short-dated stock count —
       which searches payments — sees hosted orders as well as embedded ones. */
    const intentMetadata=Object.assign({},metadata,{
      items:productKeys.filter(key=>quantities[key]>0).map(key=>`${key}:${quantities[key]}`).join(','),
      bonus_items:bonuses.join(',')
    });
    Object.keys(intentMetadata).forEach(key=>params.set(`payment_intent_data[metadata][${key}]`,intentMetadata[key]));

    const stripeResponse=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type':'application/x-www-form-urlencoded',
        'Stripe-Version':'2026-02-25.clover'
      },
      body:params.toString()
    });
    const session=await stripeResponse.json();
    if(!stripeResponse.ok){
      return send(res,stripeResponse.status,{error:session.error&&session.error.message?session.error.message:'Unable to create checkout session'});
    }
    return send(res,200,{url:session.url,quote:quote});
  }catch(error){
    return send(res,400,{error:error&&error.message?error.message:'Invalid checkout request'});
  }
};
