'use strict';

const assert=require('node:assert/strict');
const handler=require('../api/create-checkout-session.js');
const Pricing=require('../pricing.js');

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

async function run(){
  const originalSecret=process.env.STRIPE_SECRET_KEY;
  const originalFetch=global.fetch;
  let request;

  process.env.STRIPE_SECRET_KEY='sk_test_checkout_contract';
  global.fetch=async function(url,options){
    request={url:url,options:options};
    return {
      ok:true,
      status:200,
      json:async function(){ return {client_secret:'cs_test_a1b2c3d4e5f6g7h8_secret_xyz'}; }
    };
  };

  try{
    const req={
      method:'POST',
      headers:{host:'example.test','x-forwarded-proto':'https'},
      body:{
        quantities:{plus:2,sweet:1,sweetsf:1,blend:2,blendsf:0},
        bonusChoices:['plus'],
        // Deliberately false client values: the API must ignore these.
        subtotalCents:1,
        unitCents:1
      }
    };
    const res=response();
    await handler(req,res);

    assert.equal(res.statusCode,200);
    assert.equal(res.body.clientSecret,'cs_test_a1b2c3d4e5f6g7h8_secret_xyz');
    /* Embedded Checkout replaces the hosted redirect, so no URL is handed back. */
    assert.equal(res.body.url,undefined);
    assert.equal(res.body.quote.paidCount,6);
    assert.equal(res.body.quote.bonusCount,1);
    assert.equal(res.body.quote.subtotalCents,17994);
    assert.equal(res.body.quote.freightCents,Pricing.RULES.freightCents);
    assert.equal(request.url,'https://api.stripe.com/v1/checkout/sessions');

    const params=new URLSearchParams(request.options.body);
    /* The form mounts on our own page, so the session is embedded and returns
       to the branded thank-you page rather than using success/cancel URLs. */
    assert.equal(params.get('ui_mode'),'embedded');
    assert.equal(params.get('return_url'),'https://example.test/thank-you.html?session_id={CHECKOUT_SESSION_ID}');
    assert.equal(params.get('success_url'),null);
    assert.equal(params.get('cancel_url'),null);
    assert.equal(params.get('automatic_tax[enabled]'),'true');
    assert.equal(params.get('billing_address_collection'),'required');
    assert.equal(params.get('shipping_address_collection[allowed_countries][0]'),'AU');
    assert.equal(params.get('phone_number_collection[enabled]'),'true');
    /* One name field only — the shipping address collects the buyer's name. */
    assert.equal(params.get('name_collection[individual][enabled]'),null);
    assert.equal(params.get('name_collection[business][enabled]'),'true');
    assert.equal(params.get('name_collection[business][optional]'),'true');
    assert.equal(params.get('custom_fields[0][key]'),null);
    assert.equal(params.get('metadata[unit_price_cents]'),'2999');
    assert.equal(params.get('metadata[subtotal_ex_gst_cents]'),'17994');
    assert.equal(params.get('metadata[freight_inc_gst_cents]'),String(Pricing.RULES.freightCents));
    /* Flat freight rides as a shipping rate, GST-inclusive, so the card is
       charged the flat fee exactly and Automatic Tax breaks the GST out of it
       rather than adding it on top. */
    assert.equal(params.get('shipping_options[0][shipping_rate_data][type]'),'fixed_amount');
    assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),String(Pricing.RULES.freightCents));
    assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][currency]'),'aud');
    assert.equal(params.get('shipping_options[0][shipping_rate_data][tax_behavior]'),'inclusive');
    assert.equal(params.get('shipping_options[0][shipping_rate_data][display_name]'),'Flat rate freight');
    /* One freight charge only, never one per bottle. */
    assert.equal(params.get('shipping_options[1][shipping_rate_data][type]'),null);
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),'2999');
    assert.equal(params.get('line_items[4][price_data][unit_amount]'),'0');
    assert.equal(params.get('line_items[4][quantity]'),'1');

    const invalidRes=response();
    await handler({...req,body:{...req.body,bonusChoices:[]}},invalidRes);
    assert.equal(invalidRes.statusCode,400);
    assert.match(invalidRes.body.error,/bonus bottle/i);
  }finally{
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    global.fetch=originalFetch;
  }

  console.log('checkout API tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
