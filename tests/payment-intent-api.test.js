'use strict';

/* The embedded checkout page's two endpoints: the one that opens a payment and
   the one that reads the finished order back for the receipt. */

const assert=require('node:assert/strict');
const create=require('../api/create-payment-intent.js');
const read=require('../api/payment-intent.js');
const config=require('../api/checkout-config.js');
const Pricing=require('../pricing.js');

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

function order(overrides){
  return Object.assign({
    quantities:{plus:2,sweet:1,sweetsf:1,blend:2,blendsf:0},
    bonusChoices:['plus'],
    customer:{firstName:'Harold',lastName:'Lewis',email:'harold@northcoterx.com.au',phone:'(03) 9387 0427',business:'Northcote Compounding'},
    shipping:{line1:'12 Separation St',line2:'Level 2',city:'Northcote',state:'vic',postcode:'3070'},
    billingSameAsShipping:true,
    // Deliberately false client values: the API must ignore these.
    amount:1,
    totalIncGstCents:1
  },overrides||{});
}

async function run(){
  const originalSecret=process.env.STRIPE_SECRET_KEY;
  const originalPublishable=process.env.STRIPE_PUBLISHABLE_KEY;
  const originalFetch=global.fetch;
  process.env.STRIPE_SECRET_KEY='sk_test_payment_intent_contract';

  try{
    // --- opening a payment prices the order server-side ---------------------
    let request;
    global.fetch=async function(url,options){
      request={url:url,options:options};
      return {ok:true,status:200,json:async function(){
        return {id:'pi_test_9z8y7x6w5v4u3t2s',client_secret:'pi_test_9z8y7x6w5v4u3t2s_secret_abcd1234'};
      }};
    };

    let res=response();
    await create({method:'POST',headers:{},body:order()},res);

    assert.equal(res.statusCode,200);
    assert.equal(res.body.clientSecret,'pi_test_9z8y7x6w5v4u3t2s_secret_abcd1234');
    assert.equal(res.body.intentId,'pi_test_9z8y7x6w5v4u3t2s');
    assert.equal(request.url,'https://api.stripe.com/v1/payment_intents');

    const params=new URLSearchParams(request.options.body);
    const quote=Pricing.quote({plus:2,sweet:1,sweetsf:1,blend:2,blendsf:0});
    /* The charge is the shared pricing engine's total, never the browser's. */
    assert.equal(params.get('amount'),String(quote.totalIncGstCents));
    assert.notEqual(params.get('amount'),'1');
    assert.equal(params.get('currency'),'aud');
    assert.equal(params.get('automatic_payment_methods[enabled]'),'true');
    assert.equal(params.get('receipt_email'),'harold@northcoterx.com.au');
    assert.equal(params.get('shipping[address][line1]'),'12 Separation St');
    assert.equal(params.get('shipping[address][state]'),'VIC','a lower-case state is normalised');
    assert.equal(params.get('shipping[address][country]'),'AU');
    /* A PaymentIntent has no line items, so what was bought rides in metadata. */
    assert.equal(params.get('metadata[items]'),'plus:2,sweet:1,sweetsf:1,blend:2');
    assert.equal(params.get('metadata[bonus_items]'),'plus');
    assert.equal(params.get('metadata[gst_cents]'),String(quote.gstCents));
    assert.equal(params.get('metadata[freight_ex_gst_cents]'),String(quote.freightCents));
    assert.equal(params.get('metadata[total_inc_gst_cents]'),String(quote.totalIncGstCents));
    assert.equal(params.get('metadata[checkout]'),'embedded');

    // --- a second attempt updates the same intent, never opens a new one ----
    res=response();
    await create({method:'POST',headers:{},body:order({intentId:'pi_test_9z8y7x6w5v4u3t2s'})},res);
    assert.equal(request.url,'https://api.stripe.com/v1/payment_intents/pi_test_9z8y7x6w5v4u3t2s');
    assert.equal(new URLSearchParams(request.options.body).get('automatic_payment_methods[enabled]'),null);

    // --- bad details come back tagged with the field that caused it ---------
    const rejections=[
      [{customer:{firstName:'',lastName:'Lewis',email:'a@b.co',phone:'0393870427'}},'firstName'],
      [{customer:{firstName:'Harold',lastName:'Lewis',email:'not-an-email',phone:'0393870427'}},'email'],
      [{customer:{firstName:'Harold',lastName:'Lewis',email:'a@b.co',phone:'123'}},'phone'],
      [{shipping:{line1:'',city:'Northcote',state:'VIC',postcode:'3070'}},'shippingLine1'],
      [{shipping:{line1:'12 Separation St',city:'Northcote',state:'ZZZ',postcode:'3070'}},'shippingState'],
      [{shipping:{line1:'12 Separation St',city:'Northcote',state:'VIC',postcode:'307'}},'shippingPostcode'],
      [{quantities:{}},'cart'],
      [{bonusChoices:[]},'bonus']
    ];
    for(const [patch,field] of rejections){
      res=response();
      await create({method:'POST',headers:{},body:order(patch)},res);
      assert.equal(res.statusCode,400,'rejected: '+field);
      assert.equal(res.body.field,field);
      assert.ok(res.body.error,'every rejection explains itself');
    }

    // --- a separate billing address is validated too ------------------------
    res=response();
    await create({method:'POST',headers:{},body:order({
      billingSameAsShipping:false,
      billing:{line1:'P.O. Box 270',city:'Brunswick East',state:'VIC',postcode:'3057'}
    })},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.billing.line1,'P.O. Box 270');
    assert.equal(new URLSearchParams(request.options.body).get('metadata[billing_same_as_shipping]'),'false');

    // --- reading the order back for the receipt -----------------------------
    const paidIntent={
      id:'pi_test_9z8y7x6w5v4u3t2s',
      status:'succeeded',
      currency:'aud',
      created:1756100732,
      amount:quote.totalIncGstCents,
      client_secret:'pi_test_9z8y7x6w5v4u3t2s_secret_abcd1234',
      receipt_email:'harold@northcoterx.com.au',
      payment_method:{type:'card',card:{brand:'visa',last4:'4242'}},
      shipping:{name:'Harold Lewis'},
      metadata:{
        items:'plus:2,blend:2',
        bonus_items:'plus',
        unit_price_cents:String(quote.unitCents),
        subtotal_ex_gst_cents:String(quote.subtotalCents),
        freight_ex_gst_cents:String(quote.freightCents),
        gst_cents:String(quote.gstCents),
        customer_name:'Harold Lewis',
        customer_email:'harold@northcoterx.com.au'
      }
    };
    global.fetch=async function(){
      return {ok:true,status:200,json:async function(){ return paidIntent; }};
    };

    const paidUrl='/api/payment-intent?payment_intent=pi_test_9z8y7x6w5v4u3t2s'+
      '&payment_intent_client_secret=pi_test_9z8y7x6w5v4u3t2s_secret_abcd1234';
    res=response();
    await read({method:'GET',url:paidUrl},res);

    assert.equal(res.body.status,'paid');
    assert.equal(res.body.orderNumber,'ORA-5V4U3T2S');
    assert.equal(res.body.customerName,'Harold Lewis');
    assert.equal(res.body.payment,'Visa •••• 4242');
    assert.equal(res.body.amountTotal,quote.totalIncGstCents);
    assert.equal(res.body.amountTax,quote.gstCents);
    assert.equal(res.body.amountShipping,quote.freightCents);
    /* Same shape the hosted-checkout endpoint returns, free bottle included. */
    assert.equal(res.body.items.length,3);
    assert.equal(res.body.items[0].name,'ORA-Plus®');
    assert.equal(res.body.items[0].quantity,2);
    assert.equal(res.body.items[0].amountTotal,quote.unitCents*2);
    assert.equal(res.body.items[0].image,'assets/ora-plus-1.png');
    assert.equal(res.body.items[2].bonus,true);
    assert.equal(res.body.items[2].amountTotal,0);

    // --- the client secret is what proves this browser paid ------------------
    res=response();
    await read({method:'GET',url:'/api/payment-intent?payment_intent=pi_test_9z8y7x6w5v4u3t2s'+
      '&payment_intent_client_secret=pi_test_9z8y7x6w5v4u3t2s_secret_wrongsecret'},res);
    assert.equal(res.statusCode,403,'someone else with the id alone reads nothing');

    res=response();
    await read({method:'GET',url:'/api/payment-intent?payment_intent=nonsense'},res);
    assert.equal(res.statusCode,400);

    // --- an unpaid intent is not a receipt ----------------------------------
    global.fetch=async function(){
      return {ok:true,status:200,json:async function(){
        return Object.assign({},paidIntent,{status:'requires_payment_method'});
      }};
    };
    res=response();
    await read({method:'GET',url:paidUrl},res);
    assert.equal(res.body.status,'pending');
    assert.equal(res.body.orderNumber,undefined);

    // --- the page only mounts card fields when a publishable key exists -----
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    res=response();
    await config({method:'GET',url:'/api/checkout-config'},res);
    assert.equal(res.body.embedded,false);
    assert.equal(res.body.publishableKey,'');

    process.env.STRIPE_PUBLISHABLE_KEY='pk_test_abc123';
    res=response();
    await config({method:'GET',url:'/api/checkout-config'},res);
    assert.equal(res.body.embedded,true);
    assert.equal(res.body.publishableKey,'pk_test_abc123');
    assert.equal(res.body.livemode,false);
    /* The secret key must never leave the server. */
    assert.equal(JSON.stringify(res.body).includes('sk_test'),false);

    // --- no Stripe key at all: a clear 503, not a crash ---------------------
    delete process.env.STRIPE_SECRET_KEY;
    res=response();
    await create({method:'POST',headers:{},body:order()},res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.code,'stripe_not_configured');

    console.log('payment intent API tests passed');
  }finally{
    global.fetch=originalFetch;
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    if(originalPublishable===undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY=originalPublishable;
  }
}

run().catch(function(error){
  console.error(error);
  process.exit(1);
});
