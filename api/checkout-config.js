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

  const raw=process.env.STRIPE_PUBLISHABLE_KEY;
  const key=String(raw||'').trim();
  const embedded=/^pk_(test|live)_[A-Za-z0-9]+$/.test(key);

  /* An empty publishableKey has two very different causes — the variable is
     missing from this environment, or it is set to something this rejects
     (quotes pasted around it, a newline, the secret key by mistake). They need
     opposite fixes, so say which. None of this reveals the key: it reports
     only whether one arrived and what shape it is. A publishable key is public
     anyway, but the same endpoint must never grow a habit of echoing secrets. */
  const diagnosis=embedded?'ok'
    :raw===undefined?'STRIPE_PUBLISHABLE_KEY is not set in this environment'
    :key===''?'STRIPE_PUBLISHABLE_KEY is set but empty'
    :key.startsWith('sk_')?'STRIPE_PUBLISHABLE_KEY holds a secret key (sk_…) — it needs the pk_… one'
    :'STRIPE_PUBLISHABLE_KEY is set but malformed — expected pk_test_… or pk_live_…, '+
     'got '+key.length+' characters starting "'+key.slice(0,8)+'" (check for quotes or spaces around the value)';

  return send(res,200,{
    embedded:embedded,
    publishableKey:embedded?key:'',
    livemode:key.startsWith('pk_live_'),
    /* The page shows the hosted-checkout fallback when this is false. */
    paymentsConfigured:Boolean(process.env.STRIPE_SECRET_KEY),
    diagnosis:diagnosis
  });
};
