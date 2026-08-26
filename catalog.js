(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MFSCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  /* The ORA® range, in the order it is sold. This is the single source the
     sales page, the checkout page and the Stripe endpoints all read, so a
     product name or photograph is changed in exactly one place. */

  var SKUS = [
    { key:'plus', hex:'#d8291b', tint:'var(--sku-plus)', name:'ORA-Plus®', sub:'Suspending vehicle', img:'assets/ora-plus-1.png',
      short:'Buffered, bland, unsweetened suspending vehicle for oral, non-soluble aqueous dosage forms.',
      desc:'A unique aqueous suspending vehicle that simplifies extemporaneous compounding. Medicated powder can be incorporated to form elegant, uniform and physically stable oral suspensions.',
      specs:['White, viscous liquid','4.0 – 4.5','No sweeteners','Very bland'], pdf:'assets/product-info/ora-plus.pdf',
      contains:'Purified water, microcrystalline cellulose, carboxymethylcellulose sodium, xanthan gum, carrageenan, calcium sulfate, trisodium phosphate, citric acid and sodium phosphate as buffers, and dimethicone antifoam emulsion. Preserved with methylparaben and potassium sorbate.' },
    { key:'sweet', hex:'#e0842a', tint:'var(--sku-sweet)', name:'ORA-Sweet®', sub:'Syrup vehicle', img:'assets/ora-sweet-1.png',
      short:'Sucrose-sweetened citrus-berry syrup vehicle, the modern version of simple syrup.',
      desc:'A syrup vehicle that simplifies flavouring and sweetening extemporaneous oral preparations. It is a modern version of simple syrup with a highly palatable citrus-berry flavour.',
      specs:['Translucent yellow syrup','4.0 – 4.5','Sucrose','Sweet citrus-berry'], pdf:'assets/product-info/ora-sweet.pdf',
      contains:'Purified water, sucrose, glycerin, sorbitol and berry citrus flavour. Buffered with citric acid and sodium phosphate. Preserved with methylparaben and potassium sorbate.' },
    { key:'sweetsf', hex:'#e0842a', tint:'var(--sku-sweet)', name:'ORA-Sweet® SF', sub:'Sugar-free syrup vehicle', img:'assets/ora-sweet-sf-1.png',
      short:'Sugar-free, alcohol-free syrup vehicle for sweetening sugar-free oral preparations.',
      desc:'A sugar-free, alcohol-free syrup vehicle that simplifies flavouring and sweetening extemporaneous sugar-free oral preparations, with a highly palatable citrus-berry flavour.',
      specs:['Clear, syrupy liquid','4.0 – 4.4','Sodium saccharin','Sweet citrus-berry'], pdf:'assets/product-info/ora-sweet-sf.pdf',
      contains:'Purified water, glycerin, sorbitol, sodium saccharin, xanthan gum and berry citrus flavour. Buffered with citric acid and sodium citrate. Preserved with methylparaben (0.03%), propylparaben (0.008%) and potassium sorbate (0.1%).' },
    { key:'blend', hex:'#1683be', tint:'var(--sku-blend)', name:'ORA-Blend®', sub:'Flavoured suspending vehicle', img:'assets/ora-blend-1.png',
      short:'Ready-blended suspending and flavouring vehicle, ORA-Plus® and ORA-Sweet® in one bottle.',
      desc:'A flavoured oral suspending vehicle combining the suspending properties of ORA-Plus® with the flavouring agents of ORA-Sweet®. Medicated powder can be incorporated to form elegant, uniform and physically stable suspensions.',
      specs:['Cloudy liquid','4.0 – 4.5','Sucrose','Sweet citrus-berry'], pdf:'assets/product-info/ora-blend.pdf',
      contains:'Purified water, sucrose, glycerin, sorbitol, berry citrus flavour, microcrystalline cellulose, carboxymethylcellulose sodium, xanthan gum, carrageenan, calcium sulfate, trisodium phosphate, citric acid and sodium phosphate as buffers, dimethicone antifoam emulsion. Preserved with methylparaben and potassium sorbate.' },
    { key:'blendsf', hex:'#1683be', tint:'var(--sku-blend)', name:'ORA-Blend® SF', sub:'Sugar-free suspending vehicle', img:'assets/ora-blend-sf-1.png',
      short:'Buffered, sweetened, sugar-free suspending vehicle with antifoam agent and preservatives.',
      desc:'A flavoured sugar-free oral suspending vehicle that combines ORA-Plus® suspending properties with ORA-Sweet® SF flavouring agents. It forms elegant, uniform and physically stable suspensions.',
      specs:['Cloudy liquid','4.0 – 4.5','Sodium saccharin','Sweet citrus-berry'], pdf:'assets/product-info/ora-blend-sf.pdf',
      contains:'Purified water, sorbitol, glycerin, berry citrus flavour, microcrystalline cellulose, carboxymethylcellulose sodium, xanthan gum, carrageenan, calcium sulfate, trisodium phosphate and sodium saccharin, sodium phosphate, citric acid and sodium citrate as buffers, and dimethicone antifoam emulsion. Preserved with methylparaben, propylparaben and potassium sorbate.' }
  ];

  var EXTRA = {
    plus:{ alt:null,
      applications:'Ideal for paediatric suspensions, geriatric suspensions and nasogastric preparations. It retains its suspending properties when diluted up to 50% with water, flavouring agents, syrups or alcohol.',
      properties:'Its suspending agents form a structured, gel-like matrix that holds particles with little settling. It is buffered to a slightly acidic pH to help reduce oxidation-related degradation, while an antifoam agent permits vigorous shaking with minimal foam.',
      usage:'Use with any flavouring syrup, or combine with ORA-Sweet® or ORA-Sweet® SF in a 50/50 ratio. Triturate the powder with a small amount of ORA-Plus® to form a smooth paste, add the remaining ORA-Plus® by geometric dilution, then bring to final volume with the selected ORA-Sweet® vehicle.',
      metrics:'Viscosity: thixotropic, 400–6700 cps at 25°C (Brookfield). Osmolality: approximately 157 mOsm/kg.',
      examples:'The product sheet includes baclofen, captopril, diltiazem hydrochloride, dipyridamole, enalapril maleate and flecainide acetate examples, with formulation-specific expiry and storage directions.',
      contraindications:'Contraindicated in persons who have shown hypersensitivity to any listed ingredient.' },
    sweet:{ alt:'sweetsf',
      applications:'Flavouring and sweetening of paediatric and geriatric suspensions. Retains its flavouring properties when diluted up to 50% with water or suspending agents.',
      properties:'Sucrose provides sweetness, while small amounts of glycerin and sorbitol help prevent the “cap lock” problem common to syrups. The vehicle is buffered to a slightly acidic pH to help diminish oxidation-related degradation.',
      usage:'May be used alone or with other agents. For an elegant suspension, combine ORA-Sweet® with ORA-Plus® in a 50/50 ratio after the powder has been triturated and geometrically diluted in ORA-Plus®.',
      metrics:'Osmolality: 4109 mOsm/kg.',
      examples:'The product sheet includes chloroquine phosphate, ketoconazole, metolazone, metronidazole, procainamide hydrochloride and spironolactone examples, with formulation-specific expiry and storage directions.',
      contraindications:'Contraindicated in persons who have shown hypersensitivity to any listed ingredient.' },
    sweetsf:{ alt:'sweet',
      applications:'Flavouring and sweetening of sugar-free paediatric and geriatric suspensions. Retains its flavouring properties when diluted up to 50% with water or suspending agents.',
      properties:'Contains no sugar or alcohol. Sodium saccharin provides sweetness, while xanthan gum, glycerin and sorbitol contribute texture and flow. It is buffered to a slightly acidic pH to help diminish oxidation-related degradation.',
      usage:'May be used alone or with other agents. For an elegant sugar-free suspension, combine ORA-Sweet® SF with ORA-Plus® in a 50/50 ratio after the powder has been triturated and geometrically diluted in ORA-Plus®.',
      metrics:'Osmolality: approximately 1979 mOsm/kg.',
      examples:'The product sheet includes alprazolam, hydralazine hydrochloride, labetalol hydrochloride, metoprolol tartrate, spironolactone with hydrochlorothiazide and verapamil hydrochloride examples.',
      contraindications:'Contraindicated in persons who have shown hypersensitivity to any listed ingredient.' },
    blend:{ alt:'blendsf',
      applications:'Paediatric and geriatric oral suspensions where a single ready-blended vehicle is preferred. Medicated powder can be incorporated directly to form elegant, uniform and physically stable suspensions.',
      properties:'Combines ORA-Plus® suspending properties with ORA-Sweet® flavouring agents. A structured, gel-like matrix suspends particles with little settling; slightly acidic buffering helps reduce oxidation-related degradation, and antifoam permits vigorous shaking with minimal foam.',
      usage:'Triturate the powder with a small amount of ORA-Blend® to form a thick, smooth paste, then add the remainder by geometric dilution and mix until uniform. Dispense in a tight, light-resistant amber bottle with formulation-appropriate labelling.',
      metrics:'Viscosity: approximately 700 cps at 25°C (Brookfield). Osmolality: 1665 mOsm/kg.',
      examples:'The product sheet includes Adderall®, tiagabine, terbinafine hydrochloride and valganciclovir examples, with formulation-specific expiry and storage directions.',
      contraindications:'Contraindicated in persons who have shown hypersensitivity to any listed ingredient.' },
    blendsf:{ alt:'blend',
      applications:'Sugar-free paediatric and geriatric oral suspensions where a single ready-blended vehicle is preferred.',
      properties:'Combines ORA-Plus® suspending properties with ORA-Sweet® SF flavouring agents. A structured, gel-like matrix suspends particles with little settling; slightly acidic buffering helps reduce oxidation-related degradation, and antifoam permits vigorous shaking with minimal foam.',
      usage:'Triturate the powder with a small amount of ORA-Blend® SF to form a thick, smooth paste, then add the remainder by geometric dilution and mix until uniform. Dispense in a tight, light-resistant amber bottle with formulation-appropriate labelling.',
      metrics:'Viscosity: approximately 1000 cps at 25°C (Brookfield). Osmolality: 1027 mOsm/kg.',
      examples:'The product sheet includes lamotrigine, spironolactone with hydrochlorothiazide, rifampin and verapamil hydrochloride examples, with formulation-specific expiry and storage directions.',
      contraindications:'Contraindicated in persons who have shown hypersensitivity to any listed ingredient.' }
  };

  var BY_KEY=SKUS.reduce(function(result,sku){ result[sku.key]=sku; return result; },{});

  function keys(){ return SKUS.map(function(sku){ return sku.key; }); }
  function get(key){ return BY_KEY[key]||null; }
  /* Product names for anything that only needs the label — Stripe line items,
     the order metadata, the receipt. */
  /* `tint` is a CSS custom property, which only resolves inside a page that
     defines it. `hex` is the same colour for anywhere that cannot — JSON sent
     to the receipt, an email, a Stripe metadata field. */
  function names(){
    return SKUS.reduce(function(result,sku){ result[sku.key]=sku.name; return result; },{});
  }

  return Object.freeze({
    SKUS:SKUS,
    EXTRA:EXTRA,
    keys:keys,
    get:get,
    names:names
  });
});
