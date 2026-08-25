'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const handler=require('../api/stripe-webhook.js');

const SECRET='whsec_test_secret';

function sign(rawBody,secret,timestamp){
  const signature=crypto.createHmac('sha256',secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function response(){
  return {
    statusCode:200,
    headers:{},
    setHeader:function(name,value){ this.headers[name]=value; },
    end:function(body){ this.body=JSON.parse(body); }
  };
}

function request(rawBody,header){
  const req=Readable.from([Buffer.from(rawBody,'utf8')]);
  req.method='POST';
  req.headers={'stripe-signature':header};
  return req;
}

function event(id,type,object){
  return JSON.stringify({id:id,type:type,data:{object:object}});
}

const paidSession={
  id:'cs_test_paid',
  payment_status:'paid',
  payment_intent:'pi_test_1',
  amount_total:19793,
  currency:'aud',
  customer_details:{email:'pharmacy@example.test'},
  metadata:{pricing_version:'ora-offer-2026-08-v2',paid_bottles:'6',bonus_bottles:'1'}
};

async function run(){
  const originalSecret=process.env.STRIPE_WEBHOOK_SECRET;
  const originalLog=console.log;
  const logged=[];
  console.log=function(...args){ logged.push(args.join(' ')); };

  try{
    // Unconfigured deployments must not pretend to accept events.
    delete process.env.STRIPE_WEBHOOK_SECRET;
    let res=response();
    await handler(request('{}','t=1,v1=x'),res);
    assert.equal(res.statusCode,503);

    process.env.STRIPE_WEBHOOK_SECRET=SECRET;

    // Wrong method.
    const badMethod=request('{}','');
    badMethod.method='GET';
    res=response();
    await handler(badMethod,res);
    assert.equal(res.statusCode,405);
    assert.equal(res.headers.Allow,'POST');

    // A correctly signed, paid session is accepted and fulfilled.
    const body=event('evt_paid','checkout.session.completed',paidSession);
    const now=Math.floor(Date.now()/1000);
    res=response();
    await handler(request(body,sign(body,SECRET,now)),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.received,true);
    assert.ok(logged.some(line=>line.includes('cs_test_paid')&&line.includes('ORA order paid')));

    // Stripe replays events; the same id must not fulfil twice.
    res=response();
    await handler(request(body,sign(body,SECRET,now)),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.duplicate,true);
    assert.equal(logged.filter(line=>line.includes('ORA order paid')).length,1);

    // A body signed with the wrong secret is rejected.
    const forged=event('evt_forged','checkout.session.completed',paidSession);
    res=response();
    await handler(request(forged,sign(forged,'whsec_wrong',now)),res);
    assert.equal(res.statusCode,400);

    // A tampered body no longer matches its signature.
    const original=event('evt_tamper','checkout.session.completed',paidSession);
    const header=sign(original,SECRET,now);
    res=response();
    await handler(request(original.replace('19793','1'),header),res);
    assert.equal(res.statusCode,400);

    // A captured request cannot be replayed later.
    const stale=event('evt_stale','checkout.session.completed',paidSession);
    res=response();
    await handler(request(stale,sign(stale,SECRET,now-3600)),res);
    assert.equal(res.statusCode,400);

    // A missing signature header is rejected rather than trusted.
    const unsigned=event('evt_unsigned','checkout.session.completed',paidSession);
    res=response();
    await handler(request(unsigned,''),res);
    assert.equal(res.statusCode,400);

    // Rotation: Stripe sends both secrets' signatures, one of which is ours.
    const rotating=event('evt_rotate','checkout.session.completed',{...paidSession,id:'cs_rotate'});
    const mine=sign(rotating,SECRET,now).split('v1=')[1];
    res=response();
    await handler(request(rotating,`t=${now},v1=deadbeef,v1=${mine}`),res);
    assert.equal(res.statusCode,200);

    // A completed session awaiting a delayed payment must not be fulfilled yet.
    const pending=event('evt_pending','checkout.session.completed',{...paidSession,id:'cs_pending',payment_status:'unpaid'});
    res=response();
    await handler(request(pending,sign(pending,SECRET,now)),res);
    assert.equal(res.statusCode,200);
    assert.ok(logged.some(line=>line.includes('payment pending')));
    assert.ok(!logged.some(line=>line.includes('cs_pending')&&line.includes('ORA order paid')));

    // ...and is fulfilled when the delayed payment later clears.
    const cleared=event('evt_cleared','checkout.session.async_payment_succeeded',{...paidSession,id:'cs_pending'});
    res=response();
    await handler(request(cleared,sign(cleared,SECRET,now)),res);
    assert.equal(res.statusCode,200);
    assert.ok(logged.some(line=>line.includes('cs_pending')&&line.includes('ORA order paid')));

    // Unknown event types are acknowledged so Stripe stops retrying them.
    const unknown=event('evt_unknown','invoice.paid',{id:'in_test'});
    res=response();
    await handler(request(unknown,sign(unknown,SECRET,now)),res);
    assert.equal(res.statusCode,200);

    console.log=originalLog;
    console.log('stripe webhook tests passed');
  }finally{
    console.log=originalLog;
    if(originalSecret===undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET=originalSecret;
  }
}

run().catch(error=>{
  console.error(error);
  process.exit(1);
});
