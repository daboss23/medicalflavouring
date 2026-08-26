'use strict';

/* What the embedded checkout page needs before it can mount a card field: the
   publishable key. It is designed to be public — it can only create payment
   attempts, never read or move money — but it still belongs in an environment
   variable rather than hard-coded in the page, so the test and live keys follow
   whichever environment the page is deployed into.

   When no publishable key is set, the page falls back to hosted Stripe Checkout
   rather than showing a dead card field. */

const {send}=require('./order-fields.js');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }

  const key=String(process.env.STRIPE_PUBLISHABLE_KEY||'').trim();
  const embedded=/^pk_(test|live)_[A-Za-z0-9]+$/.test(key);

  return send(res,200,{
    embedded:embedded,
    publishableKey:embedded?key:'',
    livemode:key.startsWith('pk_live_'),
    /* The page shows the hosted-checkout fallback when this is false. */
    paymentsConfigured:Boolean(process.env.STRIPE_SECRET_KEY)
  });
};
