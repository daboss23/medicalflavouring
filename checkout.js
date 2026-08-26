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

function quantities(){
  if(!state.upgraded) return Object.assign({},state.base);
  var additions=upgrade().additions;
  return KEYS.reduce(function(result,key){
    result[key]=state.base[key]+(additions[key]||0);
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

  var upgraded=KEYS.reduce(function(result,key){
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

function renderBonusPicker(){
  var wanted=state.bonusChoices.length;
  var wrap=$('bonusPicker');
  wrap.hidden=wanted===0;
  if(!wanted){ $('bonusFields').innerHTML=''; return; }

  $('bonusPickerTitle').textContent=wanted===1
    ?'Choose your free bottle'
    :'Choose your '+wanted+' free bottles';

  $('bonusFields').innerHTML=state.bonusChoices.map(function(choice,index){
    var options=CATALOG.SKUS.map(function(sku){
      return '<option value="'+sku.key+'"'+(sku.key===choice?' selected':'')+'>'+sku.name+'</option>';
    }).join('');
    return ''+
      '<div class="co-field">'+
        '<label for="bonus'+index+'">Free bottle '+(index+1)+'</label>'+
        '<select id="bonus'+index+'" data-bonus="'+index+'">'+options+'</select>'+
      '</div>';
  }).join('');
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

function renderOptions(){
  var up=upgrade();
  var base=PRICING.quote(state.base);
  var rows=[];

  rows.push(optionRow({
    id:'optBase',
    on:!state.upgraded,
    title:bundleTitle(base.paidCount,base.bonusCount),
    sub:money(base.unitCents)+' each ex GST · '+base.shippedCount+' bottles shipped',
    was:base.savingsCents>0?money(listPriceTotal(base.shippedCount)):'',
    now:money(base.totalIncGstCents),
    add:false
  }));

  if(up){
    rows.push(optionRow({
      id:'optUpgrade',
      on:state.upgraded,
      title:bundleTitle(up.target,up.after.bonusCount),
      sub:money(up.after.unitCents)+' each ex GST · '+up.after.shippedCount+' shipped · '+
        plural(up.extraFree,'more bottle')+' free, worth '+money(up.valueCents),
      was:'',
      now:'Add '+money(up.extraCents),
      add:true
    }));
  }

  $('optionList').innerHTML=rows.join('');
  $('offerNote').textContent=up?'Upgrade available':'Best price locked';
}

function optionRow(row){
  return ''+
    '<label class="co-option'+(row.on?' is-on':'')+'" for="'+row.id+'">'+
      '<input type="radio" name="priceOption" id="'+row.id+'" value="'+(row.add?'upgrade':'base')+'"'+(row.on?' checked':'')+'>'+
      '<span class="t">'+row.title+'</span>'+
      '<span class="s">'+row.sub+'</span>'+
      '<span class="p">'+
        (row.was?'<span class="was">'+row.was+'</span>':'')+
        '<span class="now'+(row.add?' is-add':'')+'">'+row.now+'</span>'+
      '</span>'+
    '</label>';
}

function renderBump(){
  var up=upgrade();
  var bump=$('bump');
  bump.hidden=!up;
  if(!up) return;

  bump.classList.toggle('is-on',state.upgraded);
  $('bumpToggle').checked=state.upgraded;
  $('bumpTitle').innerHTML='YES! Upgrade my order to '+up.target+' paid bottles and send '+
    plural(up.extraFree,'more bottle')+' free <em>('+money(up.valueCents)+' value)</em>';

  $('bumpPoints').innerHTML=[
    '<b>'+up.after.shippedCount+' bottles shipped</b> — '+up.target+' paid, '+up.after.bonusCount+' free',
    'Every bottle locked at <b>'+money(up.after.unitCents)+' ex GST</b>',
    'Effective <b>'+money(up.after.effectiveUnitCents)+' a bottle</b> across the whole order',
    'One flat freight charge, however many bottles ship'
  ].map(function(point){
    return '<li><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg><span>'+point+'</span></li>';
  }).join('');

  $('bumpFoot').textContent='Adds '+money(up.extraCents)+' to this order.';
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
  $('gettingCount').textContent=plural(t.shippedCount,'bottle');
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
  renderOptions();
  renderBonusPicker();
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

function showStatus(message,ok){
  var status=$('status');
  status.textContent=message||'';
  status.classList.toggle('is-ok',Boolean(ok));
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
    shipping:shipping,
    billing:billing,
    billingSameAsShipping:same,
    intentId:state.intentId
  };
}

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
   through, on Stripe's own hosted page. Never a dead card field. */
function useHostedCheckout(note){
  state.hosted=true;
  document.body.classList.add('is-hosted');
  $('paymentLoading').hidden=true;
  if(note) $('hostedNote').textContent=note;
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
  if(!config.ok||!config.body.embedded||!config.body.paymentsConfigured){
    return useHostedCheckout();
  }
  try{
    await loadStripeJs();
  }catch(error){
    return useHostedCheckout();
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
  payment.on('loaderror',function(){ useHostedCheckout(); });
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
  window.location.href=result.body.url;
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

  if(target.name==='priceOption'){
    state.upgraded=target.value==='upgrade';
    render();
    return;
  }
  if(target.id==='bumpToggle'){
    state.upgraded=target.checked;
    render();
    return;
  }
  if(target.hasAttribute&&target.hasAttribute('data-bonus')){
    state.bonusChoices[Number(target.getAttribute('data-bonus'))]=target.value;
    render();
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
  mountStripe().catch(function(){ useHostedCheckout(); });
})();

window.MFSCheckoutPage={
  quantities:quantities,
  quote:quote,
  upgrade:upgrade,
  state:state
};
})();
