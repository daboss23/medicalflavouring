'use strict';

/* Reads one completed Checkout Session back from Stripe so the thank-you page
   can show the real order. The session id is only ever known to the buyer (Stripe
   puts it in the return URL), but it still reaches us from the browser, so this
   endpoint validates its shape, talks to Stripe with the secret key server-side,
   and returns a small whitelist of fields — never the raw session. */

const SESSION_ID=/^cs_[A-Za-z0-9_]{16,255}$/;

const SKU_IMAGES={
  plus:'assets/ora-plus-1.png',
  sweet:'assets/ora-sweet-1.png',
  sweetsf:'assets/ora-sweet-sf-1.png',
  blend:'assets/ora-blend-1.png',
  blendsf:'assets/ora-blend-sf-1.png'
};

const SKU_TINTS={
  plus:'#d8291b',
  sweet:'#e0842a',
  sweetsf:'#e0842a',
  blend:'#1683be',
  blendsf:'#1683be'
};

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(payload));
}

function sessionIdFrom(req){
  const raw=req.query&&req.query.session_id
    ?req.query.session_id
    :new URL(req.url,'https://placeholder.invalid').searchParams.get('session_id');
  return typeof raw==='string'?raw.trim():'';
}

/* A short, human-quotable reference. Stripe has no order numbers of its own, so
   this is derived from the PaymentIntent (stable for the life of the order) and
   is what a customer reads out when they call about their delivery. */
function orderNumber(session){
  const intent=session.payment_intent;
  const source=(intent&&intent.id?intent.id:session.id).replace(/^(cs|pi)_(live|test)_/,'');
  return 'ORA-'+source.slice(-8).toUpperCase();
}

function paymentLabel(session){
  const intent=session.payment_intent;
  const method=intent&&intent.payment_method;
  if(!method||typeof method!=='object') return '';
  if(method.type==='card'&&method.card){
    const brand=String(method.card.brand||'card').replace(/(^|\s)\w/g,c=>c.toUpperCase());
    return method.card.last4?`${brand} •••• ${method.card.last4}`:brand;
  }
  return String(method.type||'').replace(/_/g,' ');
}

function lineItems(session){
  const data=session.line_items&&Array.isArray(session.line_items.data)?session.line_items.data:[];
  return data.map(function(item){
    const product=item.price&&item.price.product;
    const metadata=product&&typeof product==='object'&&product.metadata?product.metadata:{};
    const sku=typeof metadata.sku==='string'?metadata.sku:'';
    const bonus=metadata.promotional_bonus==='true'||item.amount_total===0;
    const name=String(item.description||(product&&product.name)||'').replace(/^Bonus:\s*/,'');
    return {
      name:name,
      sku:sku,
      tint:SKU_TINTS[sku]||'#123a6b',
      image:SKU_IMAGES[sku]||'',
      quantity:item.quantity||0,
      amountTotal:item.amount_total||0,
      bonus:bonus
    };
  });
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }
  if(!process.env.STRIPE_SECRET_KEY){
    return send(res,503,{error:'Stripe is not connected yet',code:'stripe_not_configured'});
  }

  const sessionId=sessionIdFrom(req);
  if(!SESSION_ID.test(sessionId)){
    return send(res,400,{error:'Invalid checkout session reference'});
  }

  try{
    const url=new URL('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(sessionId));
    url.searchParams.append('expand[]','line_items.data.price.product');
    url.searchParams.append('expand[]','payment_intent.payment_method');

    const stripeResponse=await fetch(url.toString(),{
      headers:{
        Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Stripe-Version':'2026-02-25.clover'
      }
    });
    const session=await stripeResponse.json();
    if(!stripeResponse.ok){
      const status=stripeResponse.status===404?404:502;
      return send(res,status,{error:'That order could not be found'});
    }

    /* An abandoned or still-processing session must not read as a receipt. */
    if(session.payment_status!=='paid'&&session.payment_status!=='no_payment_required'){
      return send(res,200,{status:'pending',paymentStatus:session.payment_status||'unpaid'});
    }

    const details=session.customer_details||{};
    const collected=session.collected_information||{};
    const shipping=collected.shipping_details||{};
    /* Greet the person, never the pharmacy. `customer_details.name` can carry
       the business name when one was given, so take the individual name first
       and fall back to whoever the parcel is addressed to. */
    const buyerName=details.individual_name||collected.individual_name||shipping.name||details.name||'';

    return send(res,200,{
      status:'paid',
      orderNumber:orderNumber(session),
      customerName:buyerName,
      email:details.email||'',
      payment:paymentLabel(session),
      currency:(session.currency||'aud').toUpperCase(),
      amountSubtotal:session.amount_subtotal||0,
      amountTax:session.total_details&&session.total_details.amount_tax||0,
      amountTotal:session.amount_total||0,
      placedAt:session.created?new Date(session.created*1000).toISOString():'',
      items:lineItems(session)
    });
  }catch(error){
    return send(res,502,{error:'Unable to load that order right now'});
  }
};
