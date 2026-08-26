'use strict';

/* Hands the browser the one Stripe key it is allowed to hold. Embedded Checkout
   needs a publishable key to mount Stripe.js, and a static page cannot read the
   environment, so it is served from here rather than hard-coded into the HTML —
   the same build then works against test and live keys without an edit. */

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  /* Short-lived rather than immutable: rotating the key in the environment
     should take effect without waiting out a long cache. */
  res.setHeader('Cache-Control','public, max-age=300');
  res.end(JSON.stringify(payload));
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }

  const key=process.env.STRIPE_PUBLISHABLE_KEY||'';
  /* A secret key here would be a live credential leak, so refuse to serve
     anything that is not shaped like a publishable key. */
  if(!/^pk_(test|live)_[A-Za-z0-9]+$/.test(key)){
    return send(res,503,{error:'Stripe is not connected yet',code:'stripe_not_configured'});
  }
  return send(res,200,{publishableKey:key});
};
