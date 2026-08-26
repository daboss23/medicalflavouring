'use strict';

const assert=require('node:assert/strict');
const handler=require('../api/config.js');

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

async function run(){
  const original=process.env.STRIPE_PUBLISHABLE_KEY;

  try{
    process.env.STRIPE_PUBLISHABLE_KEY='pk_test_51abcDEF';
    let res=response();
    await handler({method:'GET'},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.publishableKey,'pk_test_51abcDEF');

    // --- a secret key must never be served to the browser -------------------
    for(const bad of ['sk_test_51abcDEF','sk_live_51abcDEF','rk_live_51abcDEF','','not-a-key']){
      process.env.STRIPE_PUBLISHABLE_KEY=bad;
      res=response();
      await handler({method:'GET'},res);
      assert.equal(res.statusCode,503,'refused: '+bad);
      assert.equal(res.body.publishableKey,undefined);
    }

    // --- wrong verb ---------------------------------------------------------
    process.env.STRIPE_PUBLISHABLE_KEY='pk_live_51abcDEF';
    res=response();
    await handler({method:'POST'},res);
    assert.equal(res.statusCode,405);
  }finally{
    if(original===undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY=original;
  }

  console.log('config API tests passed');
}

run().catch(function(error){
  console.error(error);
  process.exitCode=1;
});
