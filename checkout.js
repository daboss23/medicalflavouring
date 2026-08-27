(function(){
'use strict';

/* ============================================================
   MFS · ORA® secure checkout

   The page holds no prices and no product copy of its own. The basket comes
   from the sales page, the products come from `catalog.js`, every figure comes
   from `pricing.js`, and the amount that is actually charged is recalculated
   again server-side before Stripe ever sees it.
   ============================================================ */

var PRICING=window.MFSPricing;
var CATALOG=window.MFSCatalog;
var CART=window.MFSCart;
if(!PRICING||!CATALOG||!CART) throw new Error('Checkout dependencies failed to load');

var RULES=PRICING.RULES;
var KEYS=CATALOG.keys();
var $=function(id){ return document.getElementById(id); };

var state={
  base:zeroed(),          // the basket as it arrived from the sales page
  upgraded:false,         // the price-option upgrade, mirrored by the order bump
  upgradeMix:null,        // the bottles chosen in the upgrade modal, when taken
  bonusChoices:[],
  stripe:null,
  elements:null,
  intentId:'',
  hosted:false,           // no publishable key: fall back to hosted Checkout
  busy:false
};

function zeroed(){
  return KEYS.reduce(function(result,key){ result[key]=0; return result; },{});
}

function money(cents){
  return '$'+(Math.round(cents)/100).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function plural(count,word){
  return count+' '+word+(count===1?'':'s');
}

/* ============================================================
   Basket
   ============================================================ */

/* A customer who lands here with no basket — a bookmarked link, a shared URL,
   an embed on another page — still gets something to buy: the offer everyone
   comes for, which they can re-mix on the sales page. */
function defaultCart(){
  var quantities=zeroed();
  quantities[KEYS[0]]=RULES.dealThreshold;
  return {quantities:quantities,bonusChoices:[]};
}

/* An accepted upgrade replaces the basket outright with what the customer
   built in the modal — they chose those bottles by hand, so nothing is spread
   across the old mix behind their back. */
function quantities(){
  if(state.upgraded&&state.upgradeMix) return Object.assign({},state.upgradeMix);
  return Object.assign({},state.base);
}

/* Where the modal opens from: the basket already has, topped up to the
   threshold the way the pricing rules would spread it. A sensible starting
   point that is already valid, so the customer can accept it as-is. */
function suggestedMix(offer){
  return KEYS.reduce(function(result,key){
    result[key]=state.base[key]+(offer.additions[key]||0);
    return result;
  },{});
}

function quote(){
  return PRICING.quote(quantities());
}

/* The single upgrade this order can take, worked out from the pricing rules
   rather than written down: the next bonus threshold above what is in the
   basket, what it costs to get there, and what the extra free stock is worth.
   Returned as null when the basket is empty or already at a threshold peak. */
function upgrade(){
  var basePaid=PRICING.paidCount(state.base);
  if(basePaid<1) return null;
  var target=PRICING.nextThreshold(basePaid);
  var additions=PRICING.additionsTo(state.base,KEYS,target);
  var added=KEYS.reduce(function(total,key){ return total+(additions[key]||0); },0);
  if(added<1) return null;

  var upgraded=state.upgradeMix||KEYS.reduce(function(result,key){
    result[key]=state.base[key]+additions[key];
    return result;
  },{});
  var before=PRICING.quote(state.base);
  var after=PRICING.quote(upgraded);
  var extraFree=after.bonusCount-before.bonusCount;
  if(extraFree<1) return null;

  return {
    target:target,
    additions:additions,
    added:added,
    extraFree:extraFree,
    before:before,
    after:after,
    extraCents:after.totalIncGstCents-before.totalIncGstCents,
    valueCents:extraFree*RULES.listUnitCents
  };
}

/* ============================================================
   Free bottle choices
   ============================================================ */
function defaultBonusKey(){
  var current=quantities();
  return KEYS.reduce(function(best,key){
    return current[key]>current[best]?key:best;
  },KEYS[0]);
}

function syncBonusChoices(){
  var wanted=quote().bonusCount;
  var fallback=defaultBonusKey();
  while(state.bonusChoices.length<wanted) state.bonusChoices.push(fallback);
  state.bonusChoices.length=wanted;
  state.bonusChoices=state.bonusChoices.map(function(key){
    return KEYS.indexOf(key)===-1?fallback:key;
  });
}


/* ============================================================
   Price options — the tier chooser, mirrored by the order bump
   ============================================================ */
function bundleTitle(paid,bonus){
  return bonus>0
    ? plural(paid,'bottle')+' + '+bonus+' free'
    : plural(paid,'bottle');
}

/* What this many bottles would cost with no offer at all: list price, the same
   freight, the same GST. It is the only honest thing to strike through next to
   the price actually being charged. */
function listPriceTotal(shipped){
  var subtotal=shipped*RULES.listUnitCents;
  var gst=Math.round(subtotal*RULES.gstRate)+Math.round(RULES.freightCents*RULES.gstRate);
  return subtotal+RULES.freightCents+gst;
}



function renderBump(){
  var up=upgrade();
  var bump=$('bump');
  bump.hidden=!up;
  if(!up) return;

  bump.classList.toggle('is-on',state.upgraded);
  $('bumpToggle').checked=state.upgraded;

  $('bumpLead').innerHTML='<span class="ot">One time offer — unlock '+
    plural(up.after.bonusCount,'free bottle')+':</span> Buy '+up.target+
    ' and receive <b>'+plural(up.extraFree,'extra free bottle')+'!</b> '+
    'Check YES above to choose your bottles and <b>save '+money(up.valueCents)+'</b>.';

  $('bumpPoints').innerHTML=[
    '<b>'+plural(up.after.bonusCount,'free bottle')+'</b> instead of the standard '+up.before.bonusCount,
    '<b>'+up.after.shippedCount+' bottles shipped</b> for the price of '+up.target,
    'Pick <b>any mix</b> of ORA® products across the order',
    'Locked at <b>'+money(up.after.unitCents)+'</b> per bottle, ex GST'
  ].map(function(point){
    return '<li><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg><span>'+point+'</span></li>';
  }).join('');

  $('bumpFoot').textContent=state.upgraded
    ? 'Added — '+plural(up.target,'bottle')+' plus '+plural(up.after.bonusCount,'free bottle')+
      '. Tick off to remove, or click here to change your selection.'
    : 'Tick YES to choose your '+up.target+' bottles and '+plural(up.after.bonusCount,'free bottle')+'.';
}

/* ============================================================
   Order summary
   ============================================================ */
function renderLines(){
  var current=quantities();
  var t=quote();
  var bonusCounts=state.bonusChoices.reduce(function(result,key){
    result[key]=(result[key]||0)+1;
    return result;
  },{});

  var paidRows=CATALOG.SKUS.filter(function(sku){ return current[sku.key]>0; }).map(function(sku){
    return lineRow(sku,current[sku.key],money(current[sku.key]*t.unitCents),false);
  });
  var freeRows=CATALOG.SKUS.filter(function(sku){ return bonusCounts[sku.key]>0; }).map(function(sku){
    return lineRow(sku,bonusCounts[sku.key],'FREE',true);
  });

  $('orderLines').innerHTML=paidRows.concat(freeRows).join('');
  $('subtotalLabel').textContent=plural(t.paidCount,'bottle')+' ex GST';
}

function lineRow(sku,count,value,free){
  return ''+
    '<li class="co-line'+(free?' is-free':'')+'" style="--tint:'+sku.hex+'">'+
      '<span class="thumb"><img src="'+sku.img+'" alt="" loading="lazy"></span>'+
      '<span>'+
        '<span class="n">'+sku.name+'</span><br>'+
        '<span class="m">'+sku.sub+' · 473 mL · ×'+count+'</span>'+
      '</span>'+
      '<span class="v'+(free?' free':'')+'">'+value+'</span>'+
    '</li>';
}

function renderSummary(){
  var t=quote();
  $('sumSubtotal').textContent=money(t.subtotalCents);
  $('sumFreight').textContent=money(t.freightCents);
  $('sumGst').textContent=money(t.gstCents);
  $('sumTotal').textContent=money(t.totalIncGstCents);
  $('payLabel').textContent=state.hosted
    ? 'Continue to secure payment · '+money(t.totalIncGstCents)
    : 'Complete my order · '+money(t.totalIncGstCents);

  var saving=$('saving');
  if(t.savingsCents>0){
    saving.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>'+
      '<span>You save '+money(t.savingsCents)+' against list value, bonus stock included.</span>';
  }else{
    saving.innerHTML='';
  }

  var headline=t.bonusCount>0
    ? 'Yes — send my '+t.shippedCount+' bottles, including '+plural(t.bonusCount,'free bottle')
    : 'Yes — send my '+plural(t.paidCount,'ORA® bottle');
  $('offerHeadline').textContent=headline;
  $('offerSubline').textContent=t.dealUnlocked
    ? 'Locked at '+money(t.unitCents)+' a bottle ex GST, dispatched in 24–48 hours from Brunswick East.'
    : 'Add '+plural(t.toNextThreshold,'more bottle')+' to unlock '+money(RULES.dealUnitCents)+' pricing and a free bottle.';

  $('editLink').href='index.html?'+CART.encode({quantities:quantities(),bonusChoices:state.bonusChoices},KEYS)+'#builder';
}

function render(){
  syncBonusChoices();
  renderBump();
  renderLines();
  renderSummary();
  updateStripeAmount();
  CART.save({quantities:quantities(),bonusChoices:state.bonusChoices},KEYS);
}

/* ============================================================
   Field errors
   ============================================================ */
function setFieldError(name,message){
  var field=document.querySelector('[data-field="'+name+'"]');
  var slot=$(name+'-err');
  if(slot) slot.textContent=message||'';
  if(field){
    field.classList.toggle('is-bad',Boolean(message));
    var input=field.querySelector('input,select');
    if(input){
      if(message) input.setAttribute('aria-invalid','true');
      else input.removeAttribute('aria-invalid');
    }
  }
}

function clearErrors(){
  document.querySelectorAll('.co-field.is-bad').forEach(function(field){
    setFieldError(field.getAttribute('data-field'),'');
  });
  setFieldError('payment','');
  showStatus('',false);
}

/* Status text is plain by default. `html` is opt-in and used only where this
   file builds the markup itself — never for anything Stripe or the customer
   typed. */
function showStatus(message,ok,html){
  var status=$('status');
  if(html) status.innerHTML=message||'';
  else status.textContent=message||'';
  status.classList.toggle('is-ok',Boolean(ok));
}

function escapeAttribute(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function failField(name,message){
  setFieldError(name,message);
  var input=document.querySelector('[data-field="'+name+'"] input,[data-field="'+name+'"] select');
  if(input){
    input.focus({preventScroll:true});
    input.scrollIntoView({behavior:'smooth',block:'center'});
  }
  return null;
}

/* ============================================================
   The payload — the same rules the API enforces, checked here first
   so a typo is caught before anyone waits on a network round trip
   ============================================================ */
var EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function value(id){
  var el=$(id);
  return el?el.value.trim():'';
}

function readAddress(prefix,label){
  var line1=value(prefix+'Line1');
  var city=value(prefix+'City');
  var stateCode=value(prefix+'State');
  var postcode=value(prefix+'Postcode');
  if(!line1) return failField(prefix+'Line1','Enter the '+label+' street address');
  if(!city) return failField(prefix+'City','Enter the '+label+' suburb or town');
  if(!stateCode) return failField(prefix+'State','Choose the '+label+' state');
  if(!/^\d{4}$/.test(postcode)) return failField(prefix+'Postcode','Enter a 4-digit postcode');
  return {
    line1:line1,
    line2:value(prefix+'Line2'),
    line3:value(prefix+'Line3'),
    city:city,
    state:stateCode,
    postcode:postcode,
    country:'AU'
  };
}

function readForm(){
  clearErrors();
  var firstName=value('firstName');
  var lastName=value('lastName');
  var email=value('email');
  var phone=value('phone');
  if(!firstName) return failField('firstName','Enter your first name');
  if(!lastName) return failField('lastName','Enter your last name');
  if(!EMAIL.test(email)) return failField('email','Enter a valid email address');
  if(phone.replace(/\D/g,'').length<8) return failField('phone','Enter a contact phone number');

  var shipping=readAddress('shipping','delivery');
  if(!shipping) return null;

  var same=$('billingSame').checked;
  var billing=shipping;
  if(!same){
    billing=readAddress('billing','billing');
    if(!billing) return null;
  }

  return {
    quantities:quantities(),
    bonusChoices:state.bonusChoices.slice(),
    customer:{
      firstName:firstName,
      lastName:lastName,
      email:email,
      phone:phone,
      business:value('business')
    },
    purchaseOrder:value('purchaseOrder'),
    deliveryNotes:value('deliveryNotes'),
    shipping:shipping,
    billing:billing,
    billingSameAsShipping:same,
    intentId:state.intentId
  };
}

/* ============================================================
   Offer-upgrade modal — build the bottles, then the free ones

   The upgrade is no longer a tickbox that silently multiplies the basket. The
   customer picks every bottle themselves across two steps, and only the ADD TO
   CART at the end commits any of it, so backing out changes nothing.
   ============================================================ */
var modal={
  open:false,
  step:1,
  mix:null,          // working copy — the real basket is untouched until ADD TO CART
  free:[],
  target:0,
  freeCount:0,
  lastFocus:null
};

function modalPaid(){
  return KEYS.reduce(function(total,key){ return total+(modal.mix[key]||0); },0);
}

function openUpgrade(){
  var offer=upgrade();
  if(!offer) return;

  modal.target=offer.target;
  modal.freeCount=offer.after.bonusCount;
  /* Re-opening after accepting should show what they chose, not start over. */
  modal.mix=Object.assign({},state.upgradeMix||suggestedMix(offer));
  modal.free=state.upgraded&&state.bonusChoices.length===modal.freeCount
    ? state.bonusChoices.slice()
    : [];
  modal.step=1;
  modal.open=true;
  modal.lastFocus=document.activeElement;

  $('ouTarget').textContent=String(modal.target);
  $('upgradeModal').hidden=false;
  document.body.style.overflow='hidden';
  renderModal();
  $('ouNext').focus({preventScroll:true});
}

function closeUpgrade(){
  if(!modal.open) return;
  modal.open=false;
  $('upgradeModal').hidden=true;
  document.body.style.overflow='';
  if(modal.lastFocus&&modal.lastFocus.focus) modal.lastFocus.focus({preventScroll:true});
  /* The panel's tick only ever reflects a committed upgrade. */
  $('bumpToggle').checked=state.upgraded;
}

function renderModalSkus(){
  var paid=modalPaid();
  $('ouSkus').innerHTML=CATALOG.SKUS.map(function(sku){
    var count=modal.mix[sku.key]||0;
    return ''+
      '<div class="ou-sku'+(count>0?' is-on':'')+'" style="--tint:'+sku.hex+'">'+
        '<img src="'+sku.img+'" alt="" loading="lazy">'+
        '<div><div class="n">'+sku.name+'</div><div class="s">'+sku.sub+'</div></div>'+
        '<div class="ou-step-ctl">'+
          '<button type="button" data-mix-down="'+sku.key+'"'+(count<1?' disabled':'')+
            ' aria-label="One less '+sku.name+'">&minus;</button>'+
          '<span class="q" aria-live="polite">'+count+'</span>'+
          '<button type="button" data-mix-up="'+sku.key+'"'+(paid>=modal.target?' disabled':'')+
            ' aria-label="One more '+sku.name+'">+</button>'+
        '</div>'+
      '</div>';
  }).join('');
}

function renderModalFree(){
  var fallback=KEYS.reduce(function(best,key){
    return (modal.mix[key]||0)>(modal.mix[best]||0)?key:best;
  },KEYS[0]);
  while(modal.free.length<modal.freeCount) modal.free.push(fallback);
  modal.free.length=modal.freeCount;

  $('ouFree').innerHTML=modal.free.map(function(choice,index){
    var options=CATALOG.SKUS.map(function(sku){
      return '<option value="'+sku.key+'"'+(sku.key===choice?' selected':'')+'>'+sku.name+'</option>';
    }).join('');
    return ''+
      '<div class="ou-free-row">'+
        '<span class="lbl">'+(index+1)+'</span>'+
        '<select data-free="'+index+'" aria-label="Free bottle '+(index+1)+'">'+options+'</select>'+
      '</div>';
  }).join('');

  $('ouFreeNote').textContent='These '+modal.freeCount+' bottles ship free with your '+
    modal.target+' paid bottles — '+(modal.target+modal.freeCount)+' in the box.';
}

function renderModal(){
  var paid=modalPaid();
  var ready=paid===modal.target;
  var onStep2=modal.step===2;

  $('ouRail').classList.toggle('at-2',onStep2);
  document.querySelectorAll('[data-step-dot]').forEach(function(dot){
    dot.classList.toggle('is-on',Number(dot.getAttribute('data-step-dot'))===modal.step);
  });
  $('ouSub').textContent=onStep2
    ? 'Pick any products you like — mix and match across the range.'
    : 'Mix any ORA\u00ae products you like \u2014 every bottle at the deal price.';

  if(onStep2) renderModalFree();
  else renderModalSkus();

  var remaining=modal.target-paid;
  $('ouTally').innerHTML=onStep2
    ? '<span class="c is-ready">'+plural(modal.freeCount,'free bottle')+' chosen</span>'+
      '<span class="m">'+plural(modal.target,'paid bottle')+' \u00b7 '+
      money(upgrade().after.totalIncGstCents)+' inc GST</span>'
    : '<span class="c'+(ready?' is-ready':'')+'">'+paid+' of '+modal.target+' chosen</span>'+
      '<span class="m">'+(ready?'Ready to continue':
        remaining>0?plural(remaining,'bottle')+' to go':
        Math.abs(remaining)+' too many)')+'</span>';

  $('ouBack').hidden=!onStep2;
  $('ouNext').disabled=!onStep2&&!ready;
  $('ouNextLabel').textContent=onStep2?'Add to cart':'Choose my free bottles';
}

/* Committing: the working mix becomes the basket, and the free choices become
   the order's bonus bottles. This is the only place the modal writes anything. */
function acceptUpgrade(){
  state.upgradeMix=Object.assign({},modal.mix);
  state.bonusChoices=modal.free.slice();
  state.upgraded=true;
  closeUpgrade();
  render();
  updateStripeAmount();
  $('bump').scrollIntoView({behavior:'smooth',block:'center'});
}

function dropUpgrade(){
  state.upgraded=false;
  state.upgradeMix=null;
  render();
  updateStripeAmount();
}

$('upgradeModal').addEventListener('click',function(event){
  if(event.target.closest('[data-ou-close]')) closeUpgrade();
});

$('upgradeModal').addEventListener('change',function(event){
  var free=event.target.getAttribute&&event.target.getAttribute('data-free');
  if(free===null||free===undefined) return;
  modal.free[Number(free)]=event.target.value;
});

$('ouSkus').addEventListener('click',function(event){
  var up=event.target.closest('[data-mix-up]');
  var down=event.target.closest('[data-mix-down]');
  if(!up&&!down) return;
  var key=(up||down).getAttribute(up?'data-mix-up':'data-mix-down');
  var next=(modal.mix[key]||0)+(up?1:-1);
  if(next<0||(up&&modalPaid()>=modal.target)) return;
  modal.mix[key]=next;
  renderModal();
});

/* Once taken, the panel's footer is the way back in to change the selection. */
$('bumpFoot').addEventListener('click',function(){ if(state.upgraded) openUpgrade(); });

$('ouBack').addEventListener('click',function(){ modal.step=1; renderModal(); });

$('ouNext').addEventListener('click',function(){
  if(modal.step===1){
    if(modalPaid()!==modal.target) return;
    modal.step=2;
    renderModal();
    return;
  }
  acceptUpgrade();
});

document.addEventListener('keydown',function(event){
  if(event.key==='Escape'&&modal.open) closeUpgrade();
});

/* ============================================================
   Stripe
   ============================================================ */
function appearance(){
  var css=getComputedStyle(document.documentElement);
  var read=function(name,fallback){ return (css.getPropertyValue(name)||fallback).trim(); };
  return {
    theme:'stripe',
    variables:{
      colorPrimary:read('--flame','#ee3c13'),
      colorText:read('--ink','#0e1420'),
      colorTextSecondary:read('--ink-3','#626c7d'),
      colorDanger:read('--bad','#c0261a'),
      colorBackground:'#ffffff',
      fontFamily:"'Geist','Plus Jakarta Sans',system-ui,sans-serif",
      fontSizeBase:'15.5px',
      borderRadius:'10px',
      spacingUnit:'4.4px'
    },
    rules:{
      '.Input':{border:'1.5px solid rgba(14,20,32,.16)',boxShadow:'none',padding:'12px 13px'},
      '.Input:focus':{border:'1.5px solid '+read('--flame','#ee3c13'),boxShadow:'0 0 0 3.5px rgba(238,60,19,.14)'},
      '.Label':{fontWeight:'600',fontSize:'13px',color:read('--ink-2','#39414f')},
      '.Tab':{border:'1.5px solid rgba(14,20,32,.16)',boxShadow:'none'},
      '.Tab--selected':{borderColor:read('--flame','#ee3c13'),boxShadow:'0 0 0 3px rgba(238,60,19,.12)'}
    }
  };
}

function loadStripeJs(){
  return new Promise(function(resolve,reject){
    if(window.Stripe) return resolve();
    var script=document.createElement('script');
    script.src='https://js.stripe.com/v3/';
    script.async=true;
    var timer=setTimeout(function(){ reject(new Error('Stripe.js timed out')); },12000);
    script.onload=function(){ clearTimeout(timer); window.Stripe?resolve():reject(new Error('Stripe.js unavailable')); };
    script.onerror=function(){ clearTimeout(timer); reject(new Error('Stripe.js blocked')); };
    document.head.appendChild(script);
  });
}

/* No publishable key, or Stripe.js could not load: the order still goes
   through, on Stripe's own hosted page. Never a dead card field.

   The customer is told nothing beyond where they will type their card — but
   whoever is deploying the site needs to know the branded card field was
   skipped and why, or a missing environment variable looks like a design
   choice. */
function useHostedCheckout(reason,note){
  state.hosted=true;
  document.body.classList.add('is-hosted');
  $('paymentLoading').hidden=true;
  if(note) $('hostedNote').textContent=note;
  if(reason&&window.console&&console.warn){
    console.warn('[MFS checkout] Embedded card field unavailable — falling back to hosted Stripe Checkout: '+reason);
  }
  renderSummary();
}

function updateStripeAmount(){
  if(!state.elements) return;
  state.elements.update({amount:quote().totalIncGstCents});
}

async function fetchJson(url,options){
  var response=await fetch(url,options);
  var body=null;
  try{ body=await response.json(); }catch(error){ body=null; }
  return {ok:response.ok,status:response.status,body:body||{}};
}

async function mountStripe(){
  var config=await fetchJson('/api/checkout-config',{headers:{Accept:'application/json'}});
  if(!config.ok){
    return useHostedCheckout('/api/checkout-config returned '+config.status);
  }
  if(!config.body.paymentsConfigured){
    return useHostedCheckout('STRIPE_SECRET_KEY is not set in this environment');
  }
  if(!config.body.embedded){
    return useHostedCheckout('STRIPE_PUBLISHABLE_KEY is not set in this environment (add the pk_test_… / pk_live_… key and redeploy)');
  }
  try{
    await loadStripeJs();
  }catch(error){
    return useHostedCheckout(error&&error.message||'Stripe.js did not load');
  }

  state.stripe=window.Stripe(config.body.publishableKey);
  state.elements=state.stripe.elements({
    mode:'payment',
    currency:RULES.currency,
    amount:quote().totalIncGstCents,
    captureMethod:'automatic',
    appearance:appearance(),
    fonts:[{cssSrc:'https://fonts.googleapis.com/css2?family=Geist:wght@300..900&display=swap'}]
  });

  var payment=state.elements.create('payment',{
    layout:{type:'tabs',defaultCollapsed:false},
    /* Name, email, phone and address are collected in our own fields above and
       sent with the confirmation, so the card block stays a card block. */
    fields:{billingDetails:{name:'never',email:'never',phone:'never',address:'never'}}
  });
  payment.on('ready',function(){ $('paymentLoading').hidden=true; });
  payment.on('change',function(event){
    setFieldError('payment',event.error?event.error.message:'');
  });
  payment.on('loaderror',function(event){
    useHostedCheckout((event&&event.error&&event.error.message)||'the Payment Element failed to load');
  });
  payment.mount('#paymentElement');
}

/* ============================================================
   Paying
   ============================================================ */
function busy(on,label){
  state.busy=on;
  var button=$('payButton');
  button.disabled=on;
  button.classList.toggle('is-busy',on);
  if(label) $('payLabel').textContent=label;
  else renderSummary();
}

function returnUrl(){
  return window.location.origin+'/thank-you.html';
}

async function payHosted(){
  busy(true,'Opening secure checkout…');
  var result=await fetchJson('/api/create-checkout-session',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      pricingVersion:RULES.version,
      quantities:quantities(),
      bonusChoices:state.bonusChoices.slice()
    })
  });
  if(!result.ok||!result.body.url){
    busy(false);
    showStatus(result.body.error||'Secure checkout is not available right now. Call the order desk on (03) 9387 0427 and we will take the order for you.',false);
    return;
  }
  showStatus('Taking you to Stripe’s secure payment page…',true);

  /* If the browser has not left this page shortly after the redirect, it is not
     going to — a blocked navigation, an extension, a preview deployment behind
     an auth wall. Give the button back and hand over a link they can click
     themselves rather than leaving them watching a dead spinner. */
  var url=result.body.url;
  setTimeout(function(){
    if(!state.busy) return;
    busy(false);
    showStatus('Stripe’s payment page did not open by itself. <a href="'+escapeAttribute(url)+'">Open it here</a>, or call (03) 9387 0427 and we will take the order for you.',false,true);
  },6000);
  window.location.href=url;
}

async function payEmbedded(){
  var payload=readForm();
  if(!payload) return;

  busy(true,'Checking your card…');

  /* Stripe validates the card fields before we create anything, so a mistyped
     number never opens a PaymentIntent. */
  var submitted=await state.elements.submit();
  if(submitted.error){
    busy(false);
    setFieldError('payment',submitted.error.message||'Check your card details');
    return;
  }

  busy(true,'Securing your order…');
  var intent=await fetchJson('/api/create-payment-intent',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!intent.ok||!intent.body.clientSecret){
    busy(false);
    if(intent.body.field) return failField(intent.body.field,intent.body.error);
    showStatus(intent.body.error||'We could not start this payment. Please try again, or call (03) 9387 0427.',false);
    return;
  }
  state.intentId=intent.body.intentId||'';

  busy(true,'Taking payment…');
  var confirmed=await state.stripe.confirmPayment({
    elements:state.elements,
    clientSecret:intent.body.clientSecret,
    confirmParams:{
      return_url:returnUrl(),
      payment_method_data:{
        billing_details:{
          name:payload.customer.firstName+' '+payload.customer.lastName,
          email:payload.customer.email,
          phone:payload.customer.phone,
          address:{
            line1:payload.billing.line1,
            line2:payload.billing.line2||null,
            city:payload.billing.city,
            state:payload.billing.state,
            postal_code:payload.billing.postcode,
            country:'AU'
          }
        }
      }
    },
    /* Most cards clear without leaving the page; 3D Secure still redirects. */
    redirect:'if_required'
  });

  if(confirmed.error){
    busy(false);
    var message=confirmed.error.message||'That payment could not be completed.';
    if(confirmed.error.type==='card_error'||confirmed.error.type==='validation_error'){
      setFieldError('payment',message);
    }
    showStatus(message,false);
    return;
  }

  var paid=confirmed.paymentIntent;
  if(paid&&(paid.status==='succeeded'||paid.status==='processing')){
    CART.clear();
    showStatus('Payment accepted. Taking you to your receipt…',true);
    window.location.href=returnUrl()+
      '?payment_intent='+encodeURIComponent(paid.id)+
      '&payment_intent_client_secret='+encodeURIComponent(paid.client_secret)+
      '&redirect_status='+encodeURIComponent(paid.status);
    return;
  }

  busy(false);
  showStatus('That payment needs another step. Follow the prompts from your bank, or try a different card.',false);
}

/* ============================================================
   Wiring
   ============================================================ */
document.addEventListener('change',function(event){
  var target=event.target;

  if(target.id==='bumpToggle'){
    /* Ticking is a request to build the order, not the order itself: the box
       stays clear until the modal is completed. Unticking drops the upgrade. */
    if(target.checked){
      target.checked=false;
      openUpgrade();
    }else{
      dropUpgrade();
    }
    return;
  }
  if(target.id==='billingSame'){
    $('billingFields').hidden=target.checked;
    return;
  }
});

/* Clear a field's error as soon as the customer starts fixing it. */
document.addEventListener('input',function(event){
  var field=event.target.closest?event.target.closest('.co-field.is-bad'):null;
  if(field) setFieldError(field.getAttribute('data-field'),'');
});

$('checkoutForm').addEventListener('submit',function(event){
  event.preventDefault();
  if(state.busy) return;
  showStatus('',false);
  if(state.hosted) payHosted();
  else payEmbedded();
});

/* ============================================================
   Start
   ============================================================ */
(function start(){
  var restored=CART.restore(window.location.search,KEYS);
  if(CART.isEmpty(restored)) restored=defaultCart();
  state.base=restored.quantities;
  state.bonusChoices=restored.bonusChoices.slice();

  $('year').textContent=String(new Date().getFullYear());
  if(window.matchMedia('(min-width:941px)').matches) $('offerFold').open=true;

  render();
  mountStripe().catch(function(error){ useHostedCheckout(error&&error.message||'Stripe setup threw'); });
})();

window.MFSCheckoutPage={
  quantities:quantities,
  quote:quote,
  upgrade:upgrade,
  state:state
};
})();
