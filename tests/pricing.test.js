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
  (({unitCents,subtotalCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents})=>({unitCents,subtotalCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents}))(quote(6)),
  {unitCents:2999,subtotalCents:17994,bonusCount:1,shippedCount:7,effectiveUnitCents:2570,gstCents:1799,totalIncGstCents:19793}
);

assert.deepEqual(
  (({unitCents,subtotalCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents})=>({unitCents,subtotalCents,bonusCount,shippedCount,effectiveUnitCents,gstCents,totalIncGstCents}))(quote(12)),
  {unitCents:2999,subtotalCents:35988,bonusCount:3,shippedCount:15,effectiveUnitCents:2399,gstCents:3599,totalIncGstCents:39587}
);

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
