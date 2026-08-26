'use strict';

const assert=require('node:assert/strict');
const Cart=require('../cart.js');
const Catalog=require('../catalog.js');

const KEYS=Catalog.keys();

// --- a basket survives the trip to the checkout page ------------------------
const encoded=Cart.encode({quantities:{plus:4,blend:2},bonusChoices:['plus']},KEYS);
const decoded=Cart.decode(encoded,KEYS);
assert.equal(decoded.quantities.plus,4);
assert.equal(decoded.quantities.blend,2);
assert.equal(decoded.quantities.sweet,0);
assert.deepEqual(decoded.bonusChoices,['plus']);

// Round trips are stable, so a shared checkout link keeps working.
assert.equal(Cart.encode(decoded,KEYS),encoded);

// --- the URL is user-editable, so nothing in it is trusted ------------------
const hostile=Cart.decode('q=plus:-3,sweet:2.5,evil:9,blend:1e9&b=plus,evil',KEYS);
assert.equal(hostile.quantities.plus,0,'negative quantities are dropped');
assert.equal(hostile.quantities.sweet,0,'fractional quantities are dropped');
assert.equal(hostile.quantities.blend,999,'quantities are capped');
assert.equal(hostile.quantities.evil,undefined,'unknown products never appear');
assert.deepEqual(hostile.bonusChoices,['plus'],'unknown bonus choices are dropped');

// --- empty carts are recognised, so the page can offer a default ------------
assert.equal(Cart.isEmpty(Cart.decode('',KEYS)),true);
assert.equal(Cart.isEmpty(Cart.decode('q=plus:1',KEYS)),false);

// --- no sessionStorage (private windows, locked-down browsers) --------------
assert.doesNotThrow(function(){ Cart.save({quantities:{plus:1}},KEYS); });
assert.equal(Cart.load(KEYS),null);
assert.doesNotThrow(function(){ Cart.clear(); });

// The URL still wins when it carries a basket, and an empty URL falls through.
assert.equal(Cart.restore('q=blend:3',KEYS).quantities.blend,3);
assert.equal(Cart.isEmpty(Cart.restore('',KEYS)),true);

console.log('cart tests passed');
