(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MFSPricing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  var RULES=Object.freeze({
    version:'ora-offer-2026-08-v3',
    currency:'aud',
    listUnitCents:3299,
    dealUnitCents:2999,
    dealThreshold:6,
    boostedThreshold:12,
    gstRate:0.10,
    /* Flat freight, charged once per order regardless of how many bottles ship.
       Quoted ex GST like the bottle prices: $30.00 for delivery plus GST, so
       the summary's single "GST (10%)" line covers bottles and freight alike.
       Stripe is sent the same number as an exclusive-tax shipping rate. */
    freightCents:3000
  });

  function cleanQuantity(value){
    var number=Number(value);
    if(!Number.isFinite(number)||number<0||Math.floor(number)!==number) return 0;
    return Math.min(number,999);
  }

  function normalizeQuantities(input,allowedKeys){
    var source=input&&typeof input==='object'?input:{};
    return allowedKeys.reduce(function(result,key){
      result[key]=cleanQuantity(source[key]);
      return result;
    },{});
  }

  function paidCount(quantities){
    return Object.keys(quantities||{}).reduce(function(total,key){
      return total+cleanQuantity(quantities[key]);
    },0);
  }

  /* The 12-bottle boost repeats cleanly for larger trade orders:
     every complete 12 earns 3 bonus bottles; a remaining block of 6 earns 1. */
  function bonusCount(paid){
    paid=cleanQuantity(paid);
    var blocksOfTwelve=Math.floor(paid/RULES.boostedThreshold);
    var remainder=paid%RULES.boostedThreshold;
    return blocksOfTwelve*3+(remainder>=RULES.dealThreshold?1:0);
  }

  function nextThreshold(paid){
    paid=cleanQuantity(paid);
    if(paid<RULES.dealThreshold) return RULES.dealThreshold;
    var remainder=paid%RULES.boostedThreshold;
    if(remainder===0) return paid+RULES.dealThreshold;
    if(remainder<RULES.dealThreshold) return paid+(RULES.dealThreshold-remainder);
    return paid+(RULES.boostedThreshold-remainder);
  }

  /* Bottles to add to reach `target` paid bottles, spread across what is
     already in the basket in the same proportions — someone who picked four
     ORA-Plus® and two ORA-Sweet® is topped up with more of both, not with a
     product they did not choose. Whole bottles only, with the leftovers going
     to the largest fractions first so the total lands exactly on target. */
  function additionsTo(input,allowedKeys,target){
    var keys=Array.isArray(allowedKeys)?allowedKeys:Object.keys(input||{});
    var quantities=normalizeQuantities(input,keys);
    var paid=paidCount(quantities);
    var additions=keys.reduce(function(result,key){ result[key]=0; return result; },{});
    var needed=cleanQuantity(target)-paid;
    if(paid<1||needed<1) return additions;

    var allocated=0;
    var remainders=keys.map(function(key,index){
      var exact=(quantities[key]/paid)*needed;
      var whole=Math.floor(exact);
      additions[key]=whole;
      allocated+=whole;
      return {key:key,fraction:exact-whole,index:index};
    }).sort(function(a,b){ return b.fraction-a.fraction||a.index-b.index; });
    for(var count=allocated;count<needed;count+=1) additions[remainders[count-allocated].key]+=1;
    return additions;
  }

  function boostAdditions(input,allowedKeys){
    var keys=Array.isArray(allowedKeys)?allowedKeys:Object.keys(input||{});
    var quantities=normalizeQuantities(input,keys);
    var paid=paidCount(quantities);
    if(paid<RULES.dealThreshold||paid>=RULES.boostedThreshold){
      return keys.reduce(function(result,key){ result[key]=0; return result; },{});
    }
    return additionsTo(quantities,keys,RULES.boostedThreshold);
  }

  /* GST on the bottles, worked out line by line rather than as ten per cent of
     the subtotal in one go. Stripe rounds the tax on each line item it is sent,
     so a basket split across products lands a cent or two away from a single
     rounded 10% of the whole — the page would quote $230.93 and the card would
     be charged $230.94. Rounding here the way Stripe rounds there keeps the
     quoted total and the charged total the same number. */
  function bottleGstCents(quantities,unitCents){
    return Object.keys(quantities||{}).reduce(function(total,key){
      var count=cleanQuantity(quantities[key]);
      return total+(count?Math.round(count*unitCents*RULES.gstRate):0);
    },0);
  }

  function quote(quantities){
    var paid=paidCount(quantities);
    var dealUnlocked=paid>=RULES.dealThreshold;
    var unitCents=dealUnlocked?RULES.dealUnitCents:RULES.listUnitCents;
    var bonus=bonusCount(paid);
    var shipped=paid+bonus;
    var subtotalCents=paid*unitCents;
    /* No bottles, no delivery: an empty builder must not show a freight charge. */
    var freightCents=paid>0?RULES.freightCents:0;
    /* Freight is quoted ex GST, so its GST is added on top of the $30. */
    var freightGstCents=Math.round(freightCents*RULES.gstRate);
    /* `gstCents` is the GST on everything charged — bottles and freight — which
       is what the summary's "GST (10%)" line sits beneath. */
    var gstCents=bottleGstCents(quantities,unitCents)+freightGstCents;
    var totalIncGstCents=subtotalCents+gstCents+freightCents;
    var effectiveUnitCents=shipped?Math.floor(subtotalCents/shipped):0;
    var listValueCents=shipped*RULES.listUnitCents;
    var savingsCents=Math.max(0,listValueCents-subtotalCents);
    var target=nextThreshold(paid);

    return Object.freeze({
      pricingVersion:RULES.version,
      currency:RULES.currency,
      paidCount:paid,
      bonusCount:bonus,
      shippedCount:shipped,
      unitCents:unitCents,
      subtotalCents:subtotalCents,
      freightCents:freightCents,
      freightGstCents:freightGstCents,
      gstCents:gstCents,
      totalIncGstCents:totalIncGstCents,
      effectiveUnitCents:effectiveUnitCents,
      savingsCents:savingsCents,
      dealUnlocked:dealUnlocked,
      boostedDealUnlocked:paid>=RULES.boostedThreshold,
      nextThreshold:target,
      toNextThreshold:Math.max(0,target-paid)
    });
  }

  return Object.freeze({
    RULES:RULES,
    cleanQuantity:cleanQuantity,
    normalizeQuantities:normalizeQuantities,
    paidCount:paidCount,
    bonusCount:bonusCount,
    nextThreshold:nextThreshold,
    additionsTo:additionsTo,
    boostAdditions:boostAdditions,
    quote:quote
  });
});
