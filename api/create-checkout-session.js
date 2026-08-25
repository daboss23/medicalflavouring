'use strict';

const Pricing=require('../pricing.js');

const PRODUCTS={
  plus:'ORA-Plus®',
  sweet:'ORA-Sweet®',
  sweetsf:'ORA-Sweet® SF',
  blend:'ORA-Blend®',
  blendsf:'ORA-Blend® SF'
};

/* Optional Stripe Product IDs, one per SKU. When set (e.g. STRIPE_PRODUCT_PLUS),
   line items reference the catalog product so every order rolls up to the same
   five products instead of minting a duplicate product on each checkout. When a
   SKU has no ID configured, the line falls back to inline product data. */
function productIdFor(sku){
  return process.env['STRIPE_PRODUCT_'+sku.toUpperCase()];
}

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requestOrigin(req){
  if(process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/,'');
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=req.headers['x-forwarded-host']||req.headers.host;
  return `${proto}://${host}`;
}

function addLineItem(params,index,name,unitCents,quantity,sku,bonus){
  const base=`line_items[${index}]`;
  params.set(`${base}[price_data][currency]`,Pricing.RULES.currency);
  params.set(`${base}[price_data][unit_amount]`,String(unitCents));
  params.set(`${base}[price_data][tax_behavior]`,'exclusive');
  const productId=productIdFor(sku);
  // Bonus lines keep inline data so they always read "Bonus: <name>" on the
  // order and invoice; only paid lines reference the catalog product.
  if(productId&&!bonus){
    params.set(`${base}[price_data][product]`,productId);
  }else{
    params.set(`${base}[price_data][product_data][name]`,bonus?`Bonus: ${name}`:name);
    params.set(`${base}[price_data][product_data][description]`,bonus?'Promotional bonus bottle · 473 mL':'ORA® compounding vehicle · 473 mL');
    params.set(`${base}[price_data][product_data][metadata][sku]`,sku);
    params.set(`${base}[price_data][product_data][metadata][promotional_bonus]`,bonus?'true':'false');
  }
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
    const productKeys=Object.keys(PRODUCTS);
    const quantities=Pricing.normalizeQuantities(body.quantities,productKeys);
    const quote=Pricing.quote(quantities);
    if(quote.paidCount<1) return send(res,400,{error:'Add at least one bottle'});

    const bonuses=Array.isArray(body.bonusChoices)?body.bonusChoices:[];
    if(bonuses.length!==quote.bonusCount||bonuses.some(key=>!PRODUCTS[key])){
      return send(res,400,{error:'Choose each promotional bonus bottle'});
    }

    const params=new URLSearchParams();
    const origin=requestOrigin(req);
    params.set('mode','payment');
    params.set('success_url',`${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url',`${origin}/#builder`);
    params.set('billing_address_collection','required');
    params.set('shipping_address_collection[allowed_countries][0]','AU');
    params.set('phone_number_collection[enabled]','true');
    params.set('name_collection[individual][enabled]','true');
    params.set('name_collection[individual][optional]','false');
    params.set('name_collection[business][enabled]','true');
    params.set('name_collection[business][optional]','false');
    params.set('custom_fields[0][key]','purchase_order');
    params.set('custom_fields[0][label][type]','custom');
    params.set('custom_fields[0][label][custom]','Purchase order number');
    params.set('custom_fields[0][type]','text');
    params.set('custom_fields[0][optional]','true');
    params.set('custom_fields[0][text][maximum_length]','100');
    params.set('custom_fields[1][key]','order_notes');
    params.set('custom_fields[1][label][type]','custom');
    params.set('custom_fields[1][label][custom]','Order notes or delivery instructions');
    params.set('custom_fields[1][type]','text');
    params.set('custom_fields[1][optional]','true');
    params.set('custom_fields[1][text][maximum_length]','200');
    params.set('custom_text[shipping_address][message]','Enter the Australian delivery address for this ORA® order.');
    params.set('automatic_tax[enabled]','true');
    params.set('customer_creation','always');

    let index=0;
    productKeys.forEach(key=>{
      if(quantities[key]>0){
        addLineItem(params,index++,PRODUCTS[key],quote.unitCents,quantities[key],key,false);
      }
    });
    const bonusBySku=bonuses.reduce((result,key)=>{
      result[key]=(result[key]||0)+1;
      return result;
    },{});
    Object.keys(bonusBySku).forEach(key=>{
      addLineItem(params,index++,PRODUCTS[key],0,bonusBySku[key],key,true);
    });

    const metadata={
      pricing_version:quote.pricingVersion,
      paid_bottles:String(quote.paidCount),
      bonus_bottles:String(quote.bonusCount),
      unit_price_cents:String(quote.unitCents),
      subtotal_ex_gst_cents:String(quote.subtotalCents)
    };
    Object.keys(metadata).forEach(key=>params.set(`metadata[${key}]`,metadata[key]));

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
