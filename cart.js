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
    var parts=allowedKeys
      .filter(function(key){ return cleanQuantity(quantities[key])>0; })
      .map(function(key){ return key+':'+cleanQuantity(quantities[key]); });
    var params=new URLSearchParams();
    if(parts.length) params.set('q',parts.join(','));
    bonuses=bonuses.filter(function(key){ return allowedKeys.indexOf(key)!==-1; });
    if(bonuses.length) params.set('b',bonuses.join(','));
    return params.toString();
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
    return {quantities:quantities,bonusChoices:bonusChoices};
  }

  function isEmpty(cart){
    var quantities=(cart&&cart.quantities)||{};
    return !Object.keys(quantities).some(function(key){ return cleanQuantity(quantities[key])>0; });
  }

  /* Storage is a convenience, never a requirement: private windows and locked
     down browsers throw on access, and the cart still works from the URL. */
  function save(cart,allowedKeys){
    try{
      sessionStorage.setItem(STORAGE_KEY,encode(cart,allowedKeys));
    }catch(error){ /* no session storage — the URL carries the cart */ }
  }

  function load(allowedKeys){
    try{
      var stored=sessionStorage.getItem(STORAGE_KEY);
      return stored?decode(stored,allowedKeys):null;
    }catch(error){ return null; }
  }

  function clear(){
    try{ sessionStorage.removeItem(STORAGE_KEY); }catch(error){ /* nothing to clear */ }
  }

  /* The checkout page's opening state: the URL wins, then whatever this
     browser was last building, then nothing. */
  function restore(search,allowedKeys){
    var fromUrl=decode(search,allowedKeys);
    if(!isEmpty(fromUrl)) return fromUrl;
    var stored=load(allowedKeys);
    if(stored&&!isEmpty(stored)) return stored;
    return fromUrl;
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
    restore:restore
  });
});
