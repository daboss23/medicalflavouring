/* MFS · mobile navigation drawer. Paired with mobile-nav.css.
   The sales page runs an inline copy of this same logic. */
(function(){
'use strict';
var $ = function(s,r){ return (r||document).querySelector(s); };
var navToggle = $('#navToggle'), mobileNav = $('#mobileNav');
if(navToggle && mobileNav){
  var navPanel = mobileNav.querySelector('.mobile-nav-panel');
  var navOpen = false;

  function setNav(open){
    navOpen = open;
    if(open) mobileNav.hidden = false;
    /* One frame between unhiding and animating, or the panel jumps in
       from its open position instead of sliding. */
    requestAnimationFrame(function(){
      mobileNav.classList.toggle('is-open', open);
    });
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('has-mobile-nav', open);
    if(open){ navPanel.querySelector('a,button').focus(); }
    else { navToggle.focus(); }
  }
  function closeNav(){
    if(!navOpen) return;
    setNav(false);
    window.setTimeout(function(){ if(!navOpen) mobileNav.hidden = true; }, 450);
  }

  navToggle.addEventListener('click', function(){ navOpen ? closeNav() : setNav(true); });
  $('#navClose').addEventListener('click', closeNav);
  $('#navScrim').addEventListener('click', closeNav);
  mobileNav.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeNav); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeNav(); });
  /* A drawer that outlives its breakpoint would strand the page with no
     visible nav and a locked body. Watch the button rather than a fixed
     width: each page hides its inline nav at a different size. */
  window.addEventListener('resize', function(){
    if(navOpen && !navToggle.offsetParent) closeNav();
  }, { passive:true });
}
})();
