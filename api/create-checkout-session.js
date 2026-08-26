'use strict';

const Pricing=require('../pricing.js');

const PRODUCTS={
  plus:'ORA-Plus®',
  sweet:'ORA-Sweet®',
  sweetsf:'ORA-Sweet® SF',
  blend:'ORA-Blend®',
  blendsf:'ORA-Blend® SF'
};

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
    params.set('success_url',`${origin}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url',`${origin}/#builder`);
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
    /* Flat freight as a Stripe shipping rate rather than a line item: it shows
       under its own "Freight" heading at checkout, stays out of the bottle
       count, and lands in `total_details.amount_shipping` for the thank-you
       page. Quoted GST-inclusive with the shipping tax code, so Automatic Tax
       breaks the GST out of the $30 rather than adding it on top and the card
       is charged the flat fee exactly. Defined inline — no Dashboard object to
       keep in sync with `pricing.js`. */
    params.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');
    params.set('shipping_options[0][shipping_rate_data][display_name]','Flat rate freight');
    params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]',Pricing.RULES.currency);
    params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(Pricing.RULES.freightCents));
    params.set('shipping_options[0][shipping_rate_data][tax_behavior]','inclusive');
    params.set('shipping_options[0][shipping_rate_data][tax_code]','txcd_92010001');
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
      subtotal_ex_gst_cents:String(quote.subtotalCents),
      freight_inc_gst_cents:String(quote.freightCents)
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
