'use strict';

const assert=require('node:assert/strict');
const Pricing=require('../pricing.js');

function quote(total){
  return Pricing.quote({plus:total,sweet:0,sweetsf:0,blend:0,blendsf:0});
}

for(let paid=1;paid<=5;paid+=1){
  const result=quote(paid);
  assert.equal(result.unitCents,3299);
  assert.equal(result.bonusCount,0);
  assert.equal(result.subtotalCents,paid*3299);
}

assert.deepEqual(
  (({unitCents,subtotalCents,freightCents,freightGstCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents})=>({unitCents,subtotalCents,freightCents,freightGstCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents}))(quote(6)),
  {unitCents:2999,subtotalCents:17994,freightCents:3000,freightGstCents:300,bonusCount:1,shippedCount:7,effectiveUnitCents:2570,gstCents:2099,totalIncGstCents:23093}
);

assert.deepEqual(
  (({unitCents,subtotalCents,freightCents,freightGstCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents})=>({unitCents,subtotalCents,freightCents,freightGstCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents}))(quote(12)),
  {unitCents:2999,subtotalCents:35988,freightCents:3000,freightGstCents:300,bonusCount:3,shippedCount:15,effectiveUnitCents:2399,gstCents:3899,totalIncGstCents:42887}
);

/* Freight is flat: one charge per order, none on an empty builder, and never
   scaled by how many bottles ship. */
assert.equal(quote(0).freightCents,0);
assert.equal(quote(0).totalIncGstCents,0);
assert.equal(quote(1).freightCents,Pricing.RULES.freightCents);
assert.equal(quote(48).freightCents,Pricing.RULES.freightCents);
/* Freight is quoted ex GST: GST is added on top of the flat fee, and the
   single GST figure covers the bottles and the freight together. */
assert.equal(quote(3).totalIncGstCents,3*3299+3000+Math.round((3*3299+3000)*0.1));
assert.equal(quote(3).freightGstCents,300);
assert.equal(quote(3).gstCents,Math.round(3*3299*0.1)+300);

/* GST is rounded line by line, the way Stripe rounds the tax on each line item
   it is sent, so the total quoted on the page is the total the card is charged.
   Six of one product and six split across three are both $179.94 of bottles,
   but their GST differs by a cent — and each matches its own Stripe basket. */
const split=Pricing.quote({plus:2,sweet:2,sweetsf:0,blend:2,blendsf:0});
assert.equal(split.subtotalCents,17994);
assert.equal(split.gstCents,3*Math.round(2*2999*0.1)+300);
assert.equal(split.gstCents,2100);
assert.equal(split.totalIncGstCents,split.subtotalCents+split.gstCents+split.freightCents);
assert.equal(quote(6).gstCents,2099);

/* Whatever the mix, the parts always add up to the total that is charged. */
for(const basket of [{plus:1,sweet:1},{plus:5,blend:2},{plus:3,sweet:3,blend:3,blendsf:3},{sweetsf:7}]){
  const result=Pricing.quote(basket);
  const perLine=Object.keys(basket).reduce((total,key)=>total+Math.round(basket[key]*result.unitCents*0.1),0);
  assert.equal(result.gstCents,perLine+result.freightGstCents);
  assert.equal(result.totalIncGstCents,result.subtotalCents+result.gstCents+result.freightCents);
}

assert.equal(quote(18).bonusCount,4);
assert.equal(quote(24).bonusCount,6);
assert.equal(Pricing.quote({plus:2,sweet:2,blend:2}).subtotalCents,17994);
assert.equal(Pricing.normalizeQuantities({plus:'6',unknown:99},['plus','sweet']).plus,6);
assert.equal(Pricing.normalizeQuantities({plus:-1},['plus']).plus,0);

assert.deepEqual(
  Pricing.boostAdditions({plus:2,sweet:1,sweetsf:1,blend:2,blendsf:0},['plus','sweet','sweetsf','blend','blendsf']),
  {plus:2,sweet:1,sweetsf:1,blend:2,blendsf:0}
);
assert.deepEqual(
  Pricing.boostAdditions({plus:4,sweet:3,sweetsf:0,blend:0,blendsf:0},['plus','sweet','sweetsf','blend','blendsf']),
  {plus:3,sweet:2,sweetsf:0,blend:0,blendsf:0}
);
assert.deepEqual(
  Pricing.boostAdditions({plus:12,sweet:0},['plus','sweet']),
  {plus:0,sweet:0}
);

console.log('pricing tests passed');
