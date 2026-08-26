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
       GST applies to freight on taxable goods, so it is quoted ex GST here and
       sent to Stripe as an exclusive-tax shipping rate. */
    freightCents:1995
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

  function boostAdditions(input,allowedKeys){
    var keys=Array.isArray(allowedKeys)?allowedKeys:Object.keys(input||{});
    var quantities=normalizeQuantities(input,keys);
    var paid=paidCount(quantities);
    var additions=keys.reduce(function(result,key){ result[key]=0; return result; },{});
    if(paid<RULES.dealThreshold||paid>=RULES.boostedThreshold) return additions;

    var needed=RULES.boostedThreshold-paid;
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

  function quote(quantities){
    var paid=paidCount(quantities);
    var dealUnlocked=paid>=RULES.dealThreshold;
    var unitCents=dealUnlocked?RULES.dealUnitCents:RULES.listUnitCents;
    var bonus=bonusCount(paid);
    var shipped=paid+bonus;
    var subtotalCents=paid*unitCents;
    /* No bottles, no delivery: an empty builder must not show a freight charge. */
    var freightCents=paid>0?RULES.freightCents:0;
    var gstCents=Math.round((subtotalCents+freightCents)*RULES.gstRate);
    var totalIncGstCents=subtotalCents+freightCents+gstCents;
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
    boostAdditions:boostAdditions,
    quote:quote
  });
});
