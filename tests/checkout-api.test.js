'use strict';

const assert=require('node:assert/strict');
const handler=require('../api/create-checkout-session.js');

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
  process.env.STRIPE_PRODUCT_PLUS='prod_test_plus';
  global.fetch=async function(url,options){
    request={url:url,options:options};
    return {
      ok:true,
      status:200,
      json:async function(){ return {url:'https://checkout.stripe.test/session'}; }
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
    assert.equal(res.body.url,'https://checkout.stripe.test/session');
    assert.equal(res.body.quote.paidCount,6);
    assert.equal(res.body.quote.bonusCount,1);
    assert.equal(res.body.quote.subtotalCents,17994);
    assert.equal(request.url,'https://api.stripe.com/v1/checkout/sessions');

    const params=new URLSearchParams(request.options.body);
    assert.equal(params.get('automatic_tax[enabled]'),'true');
    assert.equal(params.get('billing_address_collection'),'required');
    assert.equal(params.get('shipping_address_collection[allowed_countries][0]'),'AU');
    assert.equal(params.get('phone_number_collection[enabled]'),'true');
    assert.equal(params.get('name_collection[individual][enabled]'),'true');
    assert.equal(params.get('name_collection[business][enabled]'),'true');
    assert.equal(params.get('custom_fields[0][key]'),'purchase_order');
    assert.equal(params.get('custom_fields[0][optional]'),'true');
    assert.equal(params.get('custom_fields[1][key]'),'order_notes');
    assert.equal(params.get('metadata[unit_price_cents]'),'2999');
    assert.equal(params.get('metadata[subtotal_ex_gst_cents]'),'17994');
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),'2999');
    assert.equal(params.get('line_items[4][price_data][unit_amount]'),'0');
    assert.equal(params.get('line_items[4][quantity]'),'1');

    // plus has a configured product id -> reference it, drop inline product_data
    assert.equal(params.get('line_items[0][price_data][product]'),'prod_test_plus');
    assert.equal(params.get('line_items[0][price_data][product_data][name]'),null);
    // sweet has no configured id -> inline product_data still present
    assert.equal(params.get('line_items[1][price_data][product]'),null);
    assert.equal(params.get('line_items[1][price_data][product_data][name]'),'ORA-Sweet®');

    const invalidRes=response();
    await handler({...req,body:{...req.body,bonusChoices:[]}},invalidRes);
    assert.equal(invalidRes.statusCode,400);
    assert.match(invalidRes.body.error,/bonus bottle/i);
  }finally{
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    global.fetch=originalFetch;
    delete process.env.STRIPE_PRODUCT_PLUS;
  }

  console.log('checkout API tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
