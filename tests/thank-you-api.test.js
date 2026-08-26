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

function paidSession(){
  return {
    id:'cs_test_a1b2c3d4e5f6g7h8',
    payment_status:'paid',
    currency:'aud',
    created:1756100732,
    amount_subtotal:17994,
    amount_total:19793,
    total_details:{amount_tax:1799},
    customer_details:{name:'Harold Lewis',email:'harold@northcoterx.com.au'},
    custom_fields:[
    ],
    payment_intent:{
      id:'pi_test_9z8y7x6w5v4u3t2s',
      payment_method:{type:'card',card:{brand:'visa',last4:'4242'}}
    },
    line_items:{data:[
      {description:'ORA-Plus®',quantity:2,amount_total:5998,
       price:{product:{name:'ORA-Plus®',metadata:{sku:'plus',promotional_bonus:'false'}}}},
      {description:'Bonus: ORA-Blend®',quantity:1,amount_total:0,
       price:{product:{name:'ORA-Blend®',metadata:{sku:'blend',promotional_bonus:'true'}}}}
    ]}
  };
}

async function run(){
  const originalSecret=process.env.STRIPE_SECRET_KEY;
  const originalFetch=global.fetch;
  process.env.STRIPE_SECRET_KEY='sk_test_thank_you_contract';

  try{
    // --- a paid session renders the whole order -----------------------------
    let requested;
    global.fetch=async function(url){
      requested=url;
      return {ok:true,status:200,json:async function(){ return paidSession(); }};
    };

    let res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);

    assert.equal(res.statusCode,200);
    assert.equal(res.body.status,'paid');
    assert.equal(res.body.orderNumber,'ORA-5V4U3T2S');
    assert.equal(res.body.customerName,'Harold Lewis');
    assert.equal(res.body.email,'harold@northcoterx.com.au');
    assert.equal(res.body.payment,'Visa •••• 4242');
    assert.equal(res.body.amountTotal,19793);
    assert.equal(res.body.amountTax,1799);
    assert.equal(res.body.items.length,2);
    assert.equal(res.body.items[0].name,'ORA-Plus®');
    assert.equal(res.body.items[0].image,'assets/ora-plus-1.png');
    assert.equal(res.body.items[0].bonus,false);
    // the "Bonus: " prefix is a Stripe line-item label, not the product name
    assert.equal(res.body.items[1].name,'ORA-Blend®');
    assert.equal(res.body.items[1].bonus,true);
    assert.match(requested,/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/cs_test_a1b2c3d4e5f6g7h8\?/);
    assert.match(requested,/expand%5B%5D=line_items\.data\.price\.product/);
    assert.equal(res.headers['Cache-Control'],'no-store');

    // --- an unpaid session must never read as a receipt ---------------------
    global.fetch=async function(){
      const session=paidSession();
      session.payment_status='unpaid';
      return {ok:true,status:200,json:async function(){ return session; }};
    };
    res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.body.status,'pending');
    assert.equal(res.body.orderNumber,undefined);
    assert.equal(res.body.email,undefined);

    // --- a malformed reference never reaches Stripe -------------------------
    let called=false;
    global.fetch=async function(){ called=true; throw new Error('should not be called'); };
    for(const bad of ['','notasession','cs_','../../secrets','cs_test_short']){
      res=response();
      await handler({method:'GET',url:'/api/checkout-session?session_id='+encodeURIComponent(bad)},res);
      assert.equal(res.statusCode,400,'rejected: '+bad);
    }
    assert.equal(called,false);

    // --- a Stripe miss is a 404, not a crash --------------------------------
    global.fetch=async function(){
      return {ok:false,status:404,json:async function(){ return {error:{message:'No such session'}}; }};
    };
    res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.statusCode,404);

    // --- wrong verb ---------------------------------------------------------
    res=response();
    await handler({method:'POST',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.statusCode,405);

    // --- the greeting uses the person, not the pharmacy ---------------------
    global.fetch=async function(){
      const session=paidSession();
      session.customer_details={
        name:'Floral Pharmacy',
        business_name:'Floral Pharmacy',
        individual_name:'Joshua James',
        email:'joshua@floralpharmacy.com.au'
      };
      return {ok:true,status:200,json:async function(){ return session; }};
    };
    res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.body.customerName,'Joshua James');

    // --- falling back to the shipping name when no individual name is given --
    global.fetch=async function(){
      const session=paidSession();
      session.customer_details={name:'Floral Pharmacy',business_name:'Floral Pharmacy',email:'j@x.com'};
      session.collected_information={shipping_details:{name:'Joshua James'}};
      return {ok:true,status:200,json:async function(){ return session; }};
    };
    res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.body.customerName,'Joshua James');

    // --- no key configured --------------------------------------------------
    delete process.env.STRIPE_SECRET_KEY;
    res=response();
    await handler({method:'GET',url:'/api/checkout-session?session_id=cs_test_a1b2c3d4e5f6g7h8'},res);
    assert.equal(res.statusCode,503);
  }finally{
    if(originalSecret===undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY=originalSecret;
    global.fetch=originalFetch;
  }

  console.log('thank-you API tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
