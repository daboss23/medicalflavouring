'use strict';

/* The short-dated clearance, end to end below the browser: the brief's
   acceptance table, the rule that clearance prices never touch standard stock,
   the stock caps, and what each Stripe request carries. */

const assert=require('node:assert/strict');
const Pricing=require('../pricing.js');
const Catalog=require('../catalog.js');
const Cart=require('../cart.js');
const Stock=require('../api/_short-dated-stock.js');
const createIntent=require('../api/create-payment-intent.js');
const createSession=require('../api/create-checkout-session.js');
const stockStatus=require('../api/short-dated-stock.js');

const SD=Pricing.shortDated;
const KEYS=Catalog.keys('short-dated');

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

// --- the brief's acceptance table, to the cent ------------------------------
const TABLE=[
  // paid, shipped, bottles ex GST, freight ex GST, total inc GST (one product)
  [1,1,1799,1800,3959],
  [5,5,8995,1800,11875],
  [6,7,10794,1800,13853],
  [8,9,14392,1800,17811],
  [12,15,21588,3000,27047],
  [18,22,32382,3000,38920],
  [24,30,43176,3000,50794]
];
for(const [paid,shipped,bottles,freight,total] of TABLE){
  const q=SD.quote({'plus-sd':paid});
  assert.equal(q.shippedCount,shipped,`${paid} paid should ship ${shipped}`);
  assert.equal(q.subtotalCents,bottles,`${paid} paid bottles ex GST`);
  assert.equal(q.freightCents,freight,`${paid} paid freight`);
  assert.equal(q.totalIncGstCents,total,`${paid} paid total`);
  assert.equal(q.unitCents,1799,'one price at every quantity');
  assert.equal(q.totalIncGstCents,q.subtotalCents+q.freightCents+q.gstCents);
}
// The brief's two named totals and effective prices.
assert.equal(SD.quote({'plus-sd':6}).totalIncGstCents,13853);
assert.equal(SD.quote({'plus-sd':6}).effectiveUnitCents,1542);
assert.equal(SD.quote({'plus-sd':12}).totalIncGstCents,27047);
assert.equal(SD.quote({'plus-sd':12}).effectiveUnitCents,1439);
// Savings against the usual $32.99, as printed on the flyer.
assert.equal(SD.quote({'plus-sd':6}).savingsCents,12299);
assert.equal(SD.quote({'plus-sd':12}).savingsCents,27897);
// The mockup's split basket of 8: GST is per line, $16.20, total $178.12.
const mock=SD.quote({'plus-sd':4,'sweet-sd':2,'blend-sd':2});
assert.equal(mock.gstCents,1620);
assert.equal(mock.totalIncGstCents,17812);

// The order bump tops up 6–11 in the customer's own mix.
assert.deepEqual(SD.boostAdditions({'plus-sd':4,'sweet-sd':2,'blend-sd':2},KEYS),{'plus-sd':2,'sweet-sd':1,'blend-sd':1});
assert.deepEqual(SD.boostAdditions({'plus-sd':6},KEYS),{'plus-sd':6,'sweet-sd':0,'blend-sd':0});
assert.deepEqual(SD.boostAdditions({'plus-sd':5},KEYS),{'plus-sd':0,'sweet-sd':0,'blend-sd':0});

// The clearance rules never leak into the main offer, nor into an unknown name.
assert.equal(Pricing.quote({plus:6}).unitCents,2999);
assert.equal(Pricing.quote({plus:5}).unitCents,3299);
assert.equal(Pricing.forOffer('short-dated'),SD);
assert.equal(Pricing.forOffer('shortdated').RULES.offer,'standard');
assert.equal(Pricing.forOffer(undefined).RULES.offer,'standard');

// --- catalogue: three products, no sugar-free -------------------------------
assert.deepEqual(KEYS,['plus-sd','sweet-sd','blend-sd']);
assert.equal(Catalog.offerOf('sweetsf'),'standard');
assert.equal(Catalog.offerOf('sweetsf-sd'),null,'no short-dated sugar-free key exists');
assert.equal(Catalog.names()['plus-sd'],'ORA-Plus® SHORT-DATED (exp 04/2027)');
assert.equal(Catalog.names()['sweet-sd'],'ORA-Sweet® SHORT-DATED (exp 01/2027)');
assert.equal(Catalog.names()['blend-sd'],'ORA-Blend® SHORT-DATED (exp 01/2027)');
assert.equal(Catalog.names().plus,'ORA-Plus®','standard names are unchanged');

// --- cart: own basket, offer and tracking survive the hop -------------------
assert.notEqual(Cart.storageKey('short-dated'),Cart.storageKey('standard'));
assert.equal(Cart.storageKey(),'mfs.cart.v1','the standard basket keeps its original key');
const link=Cart.encode({offer:'short-dated',quantities:{'plus-sd':4,'blend-sd':2},bonusChoices:['plus-sd'],tracking:{src:'email',e:'4'}},KEYS);
assert.equal(link,'offer=short-dated&q=plus-sd%3A4%2Cblend-sd%3A2&b=plus-sd&src=email&e=4');
const back=Cart.decode(link,KEYS);
assert.equal(back.quantities['plus-sd'],4);
assert.deepEqual(back.tracking,{src:'email',e:'4'});
assert.deepEqual(Cart.trackingFrom('?src=<script>&e=4"'),{src:'script',e:'4'},'tracking is reduced to plain tokens');
// A short-dated link read with standard keys yields nothing to buy.
assert.equal(Cart.isEmpty(Cart.decode(link,Catalog.keys())),true);

// --- server ---------------------------------------------------------------
function order(overrides){
  return Object.assign({
    offer:'short-dated',
    quantities:{'plus-sd':4,'sweet-sd':2,'blend-sd':2},
    bonusChoices:['plus-sd'],
    tracking:{src:'email',e:'4'},
    customer:{firstName:'Harold',lastName:'Lewis',email:'harold@northcoterx.com.au',phone:'(03) 9387 0427',business:'Northcote Compounding'},
    shipping:{line1:'12 Separation St',city:'Northcote',state:'VIC',postcode:'3070'},
    billingSameAsShipping:true,
    amount:1
  },overrides||{});
}

/* A fake Stripe: payment search answers with `sold` (the paid short-dated
   orders on record), anything else is the create call being tested. */
function fakeStripe(sold,calls){
  return async function(url,options){
    calls.push({url:url,options:options||{}});
    if(String(url).indexOf('/payment_intents/search')!==-1){
      return {ok:true,status:200,json:async()=>({data:sold,has_more:false})};
    }
    if(String(url).indexOf('/checkout/sessions')!==-1){
      return {ok:true,status:200,json:async()=>({url:'https://checkout.stripe.test/session'})};
    }
    return {ok:true,status:200,json:async()=>({id:'pi_test_sd12345678',client_secret:'pi_test_sd12345678_secret_abcd1234'})};
  };
}

async function run(){
  const originalSecret=process.env.STRIPE_SECRET_KEY;
  const originalFetch=global.fetch;
  process.env.STRIPE_SECRET_KEY='sk_test_short_dated_contract';
  const quiet=console.warn;

  try{
    // --- embedded checkout prices the clearance server-side -----------------
    let calls=[];
    global.fetch=fakeStripe([],calls);
    Stock.resetCache();
    let res=response();
    await createIntent({method:'POST',headers:{},body:order()},res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    const create=calls.find(call=>call.url==='https://api.stripe.com/v1/payment_intents');
    const params=new URLSearchParams(create.options.body);
    assert.equal(params.get('amount'),'17812','the mockup basket charges exactly what the page quotes');
    assert.equal(params.get('metadata[offer]'),'short-dated');
    assert.equal(params.get('metadata[pricing_version]'),Pricing.SHORT_DATED_RULES.version);
    assert.equal(params.get('metadata[items]'),'plus-sd:4,sweet-sd:2,blend-sd:2');
    assert.equal(params.get('metadata[bonus_items]'),'plus-sd');
    assert.equal(params.get('metadata[unit_price_cents]'),'1799');
    assert.equal(params.get('metadata[freight_ex_gst_cents]'),'1800');
    assert.equal(params.get('metadata[source]'),'email');
    assert.equal(params.get('metadata[source_email]'),'4');
    assert.match(params.get('description'),/SHORT-DATED clearance order/);
    assert.match(params.get('description'),/ORA-Plus® SHORT-DATED \(exp 04\/2027\)/);

    // --- hosted Checkout fallback: names, tiered freight, intent metadata ---
    calls=[];
    global.fetch=fakeStripe([],calls);
    Stock.resetCache();
    res=response();
    await createSession({method:'POST',headers:{host:'example.test','x-forwarded-proto':'https'},
      body:{offer:'short-dated',quantities:{'plus-sd':12},bonusChoices:['plus-sd','plus-sd','plus-sd'],tracking:{src:'fax'}}},res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    const session=new URLSearchParams(calls.find(call=>call.url.indexOf('/checkout/sessions')!==-1).options.body);
    assert.equal(session.get('line_items[0][price_data][product_data][name]'),'ORA-Plus® SHORT-DATED (exp 04/2027)');
    assert.equal(session.get('line_items[0][price_data][unit_amount]'),'1799');
    assert.equal(session.get('line_items[0][quantity]'),'12');
    assert.equal(session.get('line_items[1][price_data][product_data][name]'),'Bonus: ORA-Plus® SHORT-DATED (exp 04/2027)');
    assert.equal(session.get('line_items[1][quantity]'),'3');
    assert.equal(session.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'3000');
    assert.equal(session.get('cancel_url'),'https://example.test/short-dated#builder');
    assert.equal(session.get('payment_intent_data[metadata][offer]'),'short-dated');
    assert.equal(session.get('payment_intent_data[metadata][items]'),'plus-sd:12');
    assert.equal(session.get('payment_intent_data[metadata][bonus_items]'),'plus-sd,plus-sd,plus-sd');
    assert.equal(session.get('metadata[source]'),'fax');

    // --- clearance prices never reach standard stock, and vice versa --------
    const refusals=[
      [{quantities:{'plus-sd':3,plus:3}},'mixed basket'],
      [{offer:'standard',quantities:{'plus-sd':6},bonusChoices:['plus-sd']},'short-dated key on a standard order'],
      [{quantities:{plus:6},bonusChoices:['plus']},'standard key on a short-dated order'],
      [{quantities:{'plus-sd':6},bonusChoices:['plus']},'standard free bottle on a short-dated order'],
      [{quantities:{'plus-sd':6},bonusChoices:['sweetsf']},'sugar-free free bottle']
    ];
    for(const [patch,label] of refusals){
      Stock.resetCache();
      res=response();
      await createIntent({method:'POST',headers:{},body:order(patch)},res);
      assert.equal(res.statusCode,400,label);
    }
    // An unknown or missing offer is priced as standard, never as clearance.
    calls=[];
    global.fetch=fakeStripe([],calls);
    res=response();
    await createIntent({method:'POST',headers:{},body:order({offer:'SHORT-DATED',quantities:{plus:6},bonusChoices:['plus']})},res);
    assert.equal(res.statusCode,200);
    assert.equal(new URLSearchParams(calls.pop().options.body).get('metadata[unit_price_cents]'),'2999');

    // --- stock caps: paid orders in Stripe draw the shelf down --------------
    const onHand=Stock.STOCK.onHand['blend-sd'];
    const sold=[{metadata:{items:`blend-sd:${onHand-5}`,bonus_items:''}}];
    calls=[];
    global.fetch=fakeStripe(sold,calls);
    Stock.resetCache();
    res=response();
    await createIntent({method:'POST',headers:{},body:order({quantities:{'blend-sd':6},bonusChoices:['blend-sd']})},res);
    assert.equal(res.statusCode,409,'7 shipped against 5 left is refused');
    assert.match(res.body.error,/Only 5 short-dated ORA-Blend® bottles are left/);
    assert.ok(!calls.some(call=>call.url==='https://api.stripe.com/v1/payment_intents'),'no payment is opened');
    const search=new URL(calls[0].url);
    assert.match(search.searchParams.get('query'),/metadata\['offer'\]:'short-dated'/);
    assert.match(search.searchParams.get('query'),/status:'succeeded'/);

    // Free bottles count against the shelf too: 5 paid ships 5, fits exactly.
    Stock.resetCache();
    res=response();
    await createIntent({method:'POST',headers:{},body:order({quantities:{'blend-sd':5},bonusChoices:[]})},res);
    assert.equal(res.statusCode,200);

    // Sold out entirely.
    global.fetch=fakeStripe([{metadata:{items:`blend-sd:${onHand}`}}],[]);
    Stock.resetCache();
    res=response();
    await createIntent({method:'POST',headers:{},body:order({quantities:{'blend-sd':1},bonusChoices:[]})},res);
    assert.equal(res.statusCode,409);
    assert.match(res.body.error,/has sold out/);

    // --- the page's status endpoint: words, never numbers -------------------
    global.fetch=fakeStripe([{metadata:{items:`blend-sd:${onHand}`,bonus_items:''}},{metadata:{items:`sweet-sd:${Stock.STOCK.onHand['sweet-sd']-10}`}}],[]);
    Stock.resetCache();
    res=response();
    await stockStatus({method:'GET',headers:{}},res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body,{products:{'plus-sd':'available','sweet-sd':'low','blend-sd':'sold-out'}});
    assert.doesNotMatch(JSON.stringify(res.body),/\d/,'no stock counts are sent to the browser');

    // If Stripe cannot be read, the last stocktake stands on its own.
    console.warn=function(){};
    global.fetch=async()=>({ok:false,status:500,json:async()=>({error:{message:'down'}})});
    Stock.resetCache();
    assert.deepEqual(await Stock.remaining({fresh:true}),Stock.STOCK.onHand);
  }finally{
    console.warn=quiet;
    Stock.resetCache();
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    global.fetch=originalFetch;
  }

  console.log('short-dated tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
