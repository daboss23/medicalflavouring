'use strict';

const crypto=require('node:crypto');

/* Stripe retries a webhook for up to three days, and replays are normal rather
   than exceptional, so anything past this point has to tolerate seeing the same
   event id twice. This in-memory ring only suppresses repeats within one warm
   instance; durable de-duplication belongs in whatever store fulfilment writes to. */
const SEEN_LIMIT=500;
const seenEvents=new Set();

/* Stripe's own tolerance. Rejecting older timestamps is what stops a captured
   request being replayed back at us later. */
const TOLERANCE_SECONDS=300;

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readRawBody(req){
  if(Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if(typeof req.body==='string') return Promise.resolve(Buffer.from(req.body,'utf8'));
  return new Promise((resolve,reject)=>{
    const chunks=[];
    let bytes=0;
    req.on('data',chunk=>{
      bytes+=chunk.length;
      /* Stripe events are small; refuse to buffer an unbounded stream. */
      if(bytes>1048576){ reject(new Error('Webhook payload too large')); return; }
      chunks.push(chunk);
    });
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}

function parseSignatureHeader(header){
  const result={timestamp:null,signatures:[]};
  String(header||'').split(',').forEach(part=>{
    const separator=part.indexOf('=');
    if(separator<1) return;
    const key=part.slice(0,separator).trim();
    const value=part.slice(separator+1).trim();
    if(key==='t') result.timestamp=value;
    /* Several v1 entries appear while a signing secret is being rotated. */
    else if(key==='v1') result.signatures.push(value);
  });
  return result;
}

function signaturesMatch(expected,candidates){
  const expectedBuffer=Buffer.from(expected,'utf8');
  return candidates.some(candidate=>{
    const candidateBuffer=Buffer.from(candidate,'utf8');
    if(candidateBuffer.length!==expectedBuffer.length) return false;
    return crypto.timingSafeEqual(candidateBuffer,expectedBuffer);
  });
}

/* Exported so the tests can exercise verification without an HTTP round trip. */
function verifySignature(rawBody,header,secret,nowSeconds){
  const {timestamp,signatures}=parseSignatureHeader(header);
  if(!timestamp||!signatures.length) throw new Error('Missing Stripe signature');

  const signedAt=Number(timestamp);
  if(!Number.isFinite(signedAt)) throw new Error('Missing Stripe signature');
  const now=Number.isFinite(nowSeconds)?nowSeconds:Math.floor(Date.now()/1000);
  if(Math.abs(now-signedAt)>TOLERANCE_SECONDS) throw new Error('Stripe signature timestamp outside tolerance');

  const expected=crypto.createHmac('sha256',secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  if(!signaturesMatch(expected,signatures)) throw new Error('Stripe signature mismatch');

  return JSON.parse(rawBody.toString('utf8'));
}

function remember(eventId){
  if(seenEvents.has(eventId)) return false;
  seenEvents.add(eventId);
  if(seenEvents.size>SEEN_LIMIT) seenEvents.delete(seenEvents.values().next().value);
  return true;
}

function describeOrder(session){
  const metadata=session.metadata||{};
  return {
    sessionId:session.id,
    paymentIntent:session.payment_intent,
    email:(session.customer_details&&session.customer_details.email)||null,
    amountTotalCents:session.amount_total,
    currency:session.currency,
    pricingVersion:metadata.pricing_version||null,
    paidBottles:metadata.paid_bottles||null,
    bonusBottles:metadata.bonus_bottles||null
  };
}

/* The single place to hook up order fulfilment — dispatch to the warehouse,
   write the order to a store, send the confirmation. It must stay idempotent:
   Stripe can and does deliver the same event more than once. */
async function fulfilOrder(order){
  console.log('ORA order paid',JSON.stringify(order));
}

async function handleEvent(event){
  switch(event.type){
    /* Payment can still be pending here for delayed methods, so only fulfil
       once Stripe confirms the money actually arrived. */
    case 'checkout.session.completed':{
      const session=event.data.object;
      if(session.payment_status==='paid') await fulfilOrder(describeOrder(session));
      else console.log('ORA checkout completed, payment pending',session.id);
      return;
    }
    case 'checkout.session.async_payment_succeeded':
      await fulfilOrder(describeOrder(event.data.object));
      return;
    case 'checkout.session.async_payment_failed':
      console.warn('ORA delayed payment failed',event.data.object.id);
      return;
    case 'checkout.session.expired':
      console.log('ORA checkout abandoned',event.data.object.id);
      return;
    default:
      /* Unhandled types still get a 200 so Stripe stops retrying them. */
      console.log('Unhandled Stripe event',event.type);
  }
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{error:'Method not allowed'});
  }
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret) return send(res,503,{error:'Webhook is not configured',code:'stripe_webhook_not_configured'});

  let event;
  try{
    const rawBody=await readRawBody(req);
    event=verifySignature(rawBody,req.headers['stripe-signature'],secret);
  }catch(error){
    /* An unverified body is not from Stripe; say so and read nothing out of it. */
    console.warn('Rejected Stripe webhook',error.message);
    return send(res,400,{error:'Signature verification failed'});
  }

  if(!remember(event.id)) return send(res,200,{received:true,duplicate:true});

  try{
    await handleEvent(event);
  }catch(error){
    /* Ask Stripe to retry: the event was genuine, our own processing broke. */
    console.error('Stripe webhook processing failed',event.id,error);
    return send(res,500,{error:'Webhook processing failed'});
  }
  return send(res,200,{received:true});
};

/* Stripe signs the exact bytes it sent, so this endpoint must see the raw body.
   Vercel's JSON body parser would reformat it and every signature would fail.
   This has to be assigned after the handler above replaces module.exports. */
module.exports.config={api:{bodyParser:false}};
module.exports.verifySignature=verifySignature;
module.exports.handleEvent=handleEvent;
