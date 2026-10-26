(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MFSPricing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  /* Freight, charged once per order and quoted ex GST like the bottle prices,
     so the summary's single "GST (10%)" line covers bottles and freight alike.
     Tiered on PAID bottles (free ones ride along): $18 under twelve, $30 from
     twelve up. Per bottle shipped the bigger order still pays less freight —
     $18 over 7 bottles is $2.57 each, $30 over 15 is $2.00. Stripe is sent the
     same number as an exclusive-tax shipping rate. Shared by both offers. */
  var FREIGHT_TIERS=Object.freeze([
    Object.freeze({minPaid:12,cents:3000}),
    Object.freeze({minPaid:1,cents:1800})
  ]);

  var RULES=Object.freeze({
    offer:'standard',
    version:'ora-offer-2026-10-v4',
    currency:'aud',
    listUnitCents:3299,
    /* 1–5 bottles pay list; six or more drop to the deal price. */
    baseUnitCents:3299,
    dealUnitCents:2999,
    dealThreshold:6,
    boostedThreshold:12,
    gstRate:0.10,
    freightTiers:FREIGHT_TIERS
  });

  /* The short-dated clearance: one price at any quantity, the same bonus
     ladder as the main offer. `listUnitCents` stays the standard list price,
     because that is what "usual price" and every saving is measured against.
     A separate rule set rather than a flag on the main one, so nothing here can
     move the main site's prices. */
  var SHORT_DATED_RULES=Object.freeze({
    offer:'short-dated',
    version:'ora-short-dated-2026-10-v1',
    currency:'aud',
    listUnitCents:3299,
    baseUnitCents:1799,
    dealUnitCents:1799,
    dealThreshold:6,
    boostedThreshold:12,
    gstRate:0.10,
    freightTiers:FREIGHT_TIERS
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

  /* Everything that depends on the rules, built once per rule set. */
  function engine(rules){
    function freightFor(paid){
      paid=cleanQuantity(paid);
      if(paid<1) return 0;
      for(var index=0;index<rules.freightTiers.length;index+=1){
        if(paid>=rules.freightTiers[index].minPaid) return rules.freightTiers[index].cents;
      }
      return 0;
    }

    /* The 12-bottle boost repeats cleanly for larger trade orders:
       every complete 12 earns 3 bonus bottles; a remaining block of 6 earns 1. */
    function bonusCount(paid){
      paid=cleanQuantity(paid);
      var blocksOfTwelve=Math.floor(paid/rules.boostedThreshold);
      var remainder=paid%rules.boostedThreshold;
      return blocksOfTwelve*3+(remainder>=rules.dealThreshold?1:0);
    }

    function nextThreshold(paid){
      paid=cleanQuantity(paid);
      if(paid<rules.dealThreshold) return rules.dealThreshold;
      var remainder=paid%rules.boostedThreshold;
      if(remainder===0) return paid+rules.dealThreshold;
      if(remainder<rules.dealThreshold) return paid+(rules.dealThreshold-remainder);
      return paid+(rules.boostedThreshold-remainder);
    }

    function boostAdditions(input,allowedKeys){
      var keys=Array.isArray(allowedKeys)?allowedKeys:Object.keys(input||{});
      var quantities=normalizeQuantities(input,keys);
      var paid=paidCount(quantities);
      if(paid<rules.dealThreshold||paid>=rules.boostedThreshold){
        return keys.reduce(function(result,key){ result[key]=0; return result; },{});
      }
      return additionsTo(quantities,keys,rules.boostedThreshold);
    }

    /* GST on the bottles, worked out line by line rather than as ten per cent
       of the subtotal in one go. Stripe rounds the tax on each line item it is
       sent, so a basket split across products lands a cent or two away from a
       single rounded 10% of the whole — the page would quote $230.93 and the
       card would be charged $230.94. Rounding here the way Stripe rounds there
       keeps the quoted total and the charged total the same number. */
    function bottleGstCents(quantities,unitCents){
      return Object.keys(quantities||{}).reduce(function(total,key){
        var count=cleanQuantity(quantities[key]);
        return total+(count?Math.round(count*unitCents*rules.gstRate):0);
      },0);
    }

    function quote(quantities){
      var paid=paidCount(quantities);
      var dealUnlocked=paid>=rules.dealThreshold;
      var unitCents=dealUnlocked?rules.dealUnitCents:rules.baseUnitCents;
      var bonus=bonusCount(paid);
      var shipped=paid+bonus;
      var subtotalCents=paid*unitCents;
      /* No bottles, no delivery: an empty builder must not show a freight charge. */
      var freightCents=freightFor(paid);
      /* Freight is quoted ex GST, so its GST is added on top. */
      var freightGstCents=Math.round(freightCents*rules.gstRate);
      /* `gstCents` is the GST on everything charged — bottles and freight —
         which is what the summary's "GST (10%)" line sits beneath. */
      var gstCents=bottleGstCents(quantities,unitCents)+freightGstCents;
      var totalIncGstCents=subtotalCents+gstCents+freightCents;
      var effectiveUnitCents=shipped?Math.floor(subtotalCents/shipped):0;
      var listValueCents=shipped*rules.listUnitCents;
      var savingsCents=Math.max(0,listValueCents-subtotalCents);
      var target=nextThreshold(paid);

      return Object.freeze({
        offer:rules.offer,
        pricingVersion:rules.version,
        currency:rules.currency,
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
        boostedDealUnlocked:paid>=rules.boostedThreshold,
        nextThreshold:target,
        toNextThreshold:Math.max(0,target-paid)
      });
    }

    return Object.freeze({
      RULES:rules,
      cleanQuantity:cleanQuantity,
      normalizeQuantities:normalizeQuantities,
      paidCount:paidCount,
      freightFor:freightFor,
      bonusCount:bonusCount,
      nextThreshold:nextThreshold,
      additionsTo:additionsTo,
      boostAdditions:boostAdditions,
      quote:quote
    });
  }

  var standard=engine(RULES);
  var shortDated=engine(SHORT_DATED_RULES);
  var OFFERS=Object.freeze({'standard':standard,'short-dated':shortDated});

  /* Unknown names get the standard engine: a typo can never price an order at
     the clearance rate. */
  function forOffer(name){
    return Object.prototype.hasOwnProperty.call(OFFERS,name)?OFFERS[name]:standard;
  }

  /* The top level stays the standard offer, so every existing caller reads
     exactly what it always did. */
  return Object.freeze(Object.assign({},standard,{
    FREIGHT_TIERS:FREIGHT_TIERS,
    SHORT_DATED_RULES:SHORT_DATED_RULES,
    shortDated:shortDated,
    forOffer:forOffer
  }));
});
