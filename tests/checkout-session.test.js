'use strict';

const assert=require('node:assert/strict');
const handler=require('../api/checkout-session.js');

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

/* Mirrors the shape the create endpoint actually produces: paid bottles at the
   deal unit price, bonus bottles as zero-amount lines, GST from Automatic Tax. */
function stripeSession(overrides){
  return Object.assign({
    id:'cs_test_a1b2c3d4e5f6g7h8',
    created:1755000000,
    currency:'aud',
    payment_status:'paid',
    amount_subtotal:17994,
    amount_total:19793,
    total_details:{amount_discount:0,amount_shipping:0,amount_tax:1799},
    customer_details:{name:'Harold Lewis',email:'harold@pharmacy.test'},
    custom_fields:[
      {key:'purchase_order',text:{value:'PO-8891'}},
      {key:'order_notes',text:{value:'Leave at dispensary'}}
    ],
    collected_information:{shipping_details:{
      name:'Harold Lewis',
      address:{line1:'226 Lygon Street',line2:'',city:'Brunswick East',state:'VIC',postal_code:'3057',country:'AU'}
    }},
    metadata:{paid_bottles:'6',bonus_bottles:'1'},
    line_items:{data:[
      {description:'ORA-Plus®',quantity:6,amount_total:17994,
       price:{product:{name:'ORA-Plus®',metadata:{sku:'plus',promotional_bonus:'false'}}}},
      {description:'Bonus: ORA-Sweet®',quantity:1,amount_total:0,
       price:{product:{name:'Bonus: ORA-Sweet®',metadata:{sku:'sweet',promotional_bonus:'true'}}}}
    ]}
  },overrides||{});
}

async function run(){
  const originalSecret=process.env.STRIPE_SECRET_KEY;
  const originalFetch=global.fetch;
  let requested;

  process.env.STRIPE_SECRET_KEY='sk_test_session_contract';

  try{
    global.fetch=async function(url){
      requested=url;
      return {ok:true,status:200,json:async function(){ return stripeSession(); }};
    };

    const res=response();
    await handler({method:'GET',headers:{},query:{session_id:'cs_test_a1b2c3d4e5f6g7h8'}},res);

    assert.equal(res.statusCode,200);
    assert.match(requested,/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/cs_test_a1b2c3d4e5f6g7h8\?/);
    assert.match(requested,/expand\[\]=line_items/);
    assert.equal(res.headers['Cache-Control'],'no-store');

    const order=res.body.order;
    assert.equal(order.customer.firstName,'Harold');
    assert.equal(order.customer.email,'harold@pharmacy.test');
    assert.equal(order.bottles.paid,6);
    assert.equal(order.bottles.bonus,1);
    assert.equal(order.bottles.shipped,7);

    // The seven shipped bottles are shown at list price, the saving is the
    // discount line, and the column must reconcile to what Stripe settled.
    assert.equal(order.totals.subtotalCents,23093);
    assert.equal(order.totals.discountCents,5099);
    assert.equal(order.totals.shippingCents,0);
    assert.equal(order.totals.gstCents,1799);
    assert.equal(order.totals.totalCents,19793);
    assert.equal(
      order.totals.subtotalCents-order.totals.discountCents+order.totals.shippingCents+order.totals.gstCents,
      order.totals.totalCents
    );

    // Items carry their sku and drop the "Bonus:" prefix, so the page can pair
    // each line with its bottle photograph and label it in its own words.
    assert.equal(order.items.length,2);
    assert.equal(order.items[0].sku,'plus');
    assert.equal(order.items[0].bonus,false);
    assert.equal(order.items[1].name,'ORA-Sweet®');
    assert.equal(order.items[1].sku,'sweet');
    assert.equal(order.items[1].bonus,true);
    assert.equal(order.items[1].amountCents,0);

    assert.equal(order.orderNumber,'MFS-E5F6-G7H8');
    assert.equal(order.shipping.city,'Brunswick East');
    assert.equal(order.purchaseOrder,'PO-8891');
    assert.equal(order.orderNotes,'Leave at dispensary');

    // An unpaid session must never render as a confirmation.
    global.fetch=async function(){
      return {ok:true,status:200,json:async function(){ return stripeSession({payment_status:'unpaid'}); }};
    };
    const unpaidRes=response();
    await handler({method:'GET',headers:{},query:{session_id:'cs_test_a1b2c3d4e5f6g7h8'}},unpaidRes);
    assert.equal(unpaidRes.statusCode,409);
    assert.equal(unpaidRes.body.code,'unpaid');

    // Malformed ids are rejected before any call to Stripe leaves the box.
    let called=false;
    global.fetch=async function(){ called=true; throw new Error('should not be called'); };
    const badRes=response();
    await handler({method:'GET',headers:{},query:{session_id:'../secrets'}},badRes);
    assert.equal(badRes.statusCode,400);
    assert.equal(badRes.body.code,'bad_session_id');
    assert.equal(called,false);

    const methodRes=response();
    await handler({method:'POST',headers:{},query:{}},methodRes);
    assert.equal(methodRes.statusCode,405);

    // Sessions predating the bonus metadata still resolve from line items alone.
    global.fetch=async function(){
      return {ok:true,status:200,json:async function(){ return stripeSession({metadata:{}}); }};
    };
    const legacyRes=response();
    await handler({method:'GET',headers:{},query:{session_id:'cs_test_a1b2c3d4e5f6g7h8'}},legacyRes);
    assert.equal(legacyRes.body.order.bottles.shipped,7);

    delete process.env.STRIPE_SECRET_KEY;
    const offRes=response();
    await handler({method:'GET',headers:{},query:{session_id:'cs_test_a1b2c3d4e5f6g7h8'}},offRes);
    assert.equal(offRes.statusCode,503);
    assert.equal(offRes.body.code,'stripe_not_configured');
  }finally{
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    global.fetch=originalFetch;
  }

  console.log('checkout session tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
