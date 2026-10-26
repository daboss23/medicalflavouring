(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MFSCart=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  /* The basket built on the sales page has to survive the hop to the checkout
     page, and has to survive a reload of the checkout page itself. It travels
     in the URL — shareable, and a quoted link still works after the tab is
     closed — with sessionStorage as the memory for a plain reload.

     Nothing here is trusted: the URL is user-editable, so these are product
     choices only. Every price is recalculated server-side from `pricing.js`. */

  var STORAGE_KEY='mfs.cart.v1';
  var MAX_PER_SKU=999;

  /* Each offer keeps its own basket. Someone with standard bottles in one tab
     and the short-dated page in another must never have one basket's bottles
     turn up in the other — the server refuses a mixed order, so the place to
     stop it is here. The standard basket keeps the original key, so a basket
     saved before the clearance existed still restores. */
  function storageKey(offer){
    return offer&&offer!=='standard'?STORAGE_KEY+'.'+offer:STORAGE_KEY;
  }

  /* Campaign tracking travels with the basket: `src` (email, fax) and `e`
     (which email) come in on the landing link and go out to Stripe with the
     order. Short plain tokens only — they end up in payment metadata. */
  function cleanToken(value){
    return String(value==null?'':value).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
  }

  function cleanQuantity(value){
    var number=Number(value);
    if(!Number.isFinite(number)||number<0||Math.floor(number)!==number) return 0;
    return Math.min(number,MAX_PER_SKU);
  }

  /* `q=plus:2,blend:4` reads as an order at a glance, which matters when
     someone pastes a checkout link into an email to their practice manager. */
  function encode(cart,allowedKeys){
    var quantities=(cart&&cart.quantities)||{};
    var bonuses=Array.isArray(cart&&cart.bonusChoices)?cart.bonusChoices:[];
    var tracking=(cart&&cart.tracking)||{};
    var parts=allowedKeys
      .filter(function(key){ return cleanQuantity(quantities[key])>0; })
      .map(function(key){ return key+':'+cleanQuantity(quantities[key]); });
    var params=new URLSearchParams();
    if(cart&&cart.offer&&cart.offer!=='standard') params.set('offer',cleanToken(cart.offer));
    if(parts.length) params.set('q',parts.join(','));
    bonuses=bonuses.filter(function(key){ return allowedKeys.indexOf(key)!==-1; });
    if(bonuses.length) params.set('b',bonuses.join(','));
    if(cleanToken(tracking.src)) params.set('src',cleanToken(tracking.src));
    if(cleanToken(tracking.e)) params.set('e',cleanToken(tracking.e));
    return params.toString();
  }

  /* Only the campaign fields, for a landing page reading its own URL. */
  function trackingFrom(search){
    var params=new URLSearchParams(search||'');
    var tracking={};
    if(cleanToken(params.get('src'))) tracking.src=cleanToken(params.get('src'));
    if(cleanToken(params.get('e'))) tracking.e=cleanToken(params.get('e'));
    return tracking;
  }

  function decode(search,allowedKeys){
    var params=new URLSearchParams(search||'');
    var quantities=allowedKeys.reduce(function(result,key){ result[key]=0; return result; },{});
    String(params.get('q')||'').split(',').forEach(function(pair){
      var bits=pair.split(':');
      var key=bits[0];
      if(allowedKeys.indexOf(key)===-1) return;
      quantities[key]=cleanQuantity(bits[1]);
    });
    var bonusChoices=String(params.get('b')||'').split(',').filter(function(key){
      return allowedKeys.indexOf(key)!==-1;
    });
    return {quantities:quantities,bonusChoices:bonusChoices,tracking:trackingFrom(search)};
  }

  function isEmpty(cart){
    var quantities=(cart&&cart.quantities)||{};
    return !Object.keys(quantities).some(function(key){ return cleanQuantity(quantities[key])>0; });
  }

  /* Storage is a convenience, never a requirement: private windows and locked
     down browsers throw on access, and the cart still works from the URL. */
  function save(cart,allowedKeys,offer){
    try{
      sessionStorage.setItem(storageKey(offer),encode(cart,allowedKeys));
    }catch(error){ /* no session storage — the URL carries the cart */ }
  }

  function load(allowedKeys,offer){
    try{
      var stored=sessionStorage.getItem(storageKey(offer));
      return stored?decode(stored,allowedKeys):null;
    }catch(error){ return null; }
  }

  function clear(offer){
    try{ sessionStorage.removeItem(storageKey(offer)); }catch(error){ /* nothing to clear */ }
  }

  /* The checkout page's opening state: the URL wins, then whatever this
     browser was last building, then nothing. Tracking follows the same order,
     field by field, so a reload of a bare URL keeps the campaign source. */
  function restore(search,allowedKeys,offer){
    var fromUrl=decode(search,allowedKeys);
    var stored=load(allowedKeys,offer);
    var result=!isEmpty(fromUrl)||!stored||isEmpty(stored)?fromUrl:stored;
    result.tracking=Object.assign({},stored&&stored.tracking,fromUrl.tracking);
    return result;
  }

  return Object.freeze({
    STORAGE_KEY:STORAGE_KEY,
    cleanQuantity:cleanQuantity,
    encode:encode,
    decode:decode,
    isEmpty:isEmpty,
    save:save,
    load:load,
    clear:clear,
    restore:restore,
    trackingFrom:trackingFrom,
    storageKey:storageKey
  });
});
