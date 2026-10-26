'use strict';

/* Live stock status for the short-dated page: Available, Low or Sold out per
   product, and nothing more. The counts themselves stay on the server — the
   brief is to show status, not numbers. Cached for a minute at the edge so a
   campaign send does not turn into one Stripe search per visitor. */

const Stock=require('./_short-dated-stock.js');
const {send}=require('./order-fields.js');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:'Method not allowed'});
  }
  try{
    const left=await Stock.remaining();
    const products=Object.keys(left).reduce((result,key)=>{
      result[key]=Stock.status(left[key]);
      return result;
    },{});
    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=120');
    res.end(JSON.stringify({products:products}));
  }catch(error){
    return send(res,502,{error:'Stock status is unavailable right now'});
  }
};
