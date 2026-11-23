window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;
gtag('js', new Date());

// send_page_view: false zabrání duplicitnímu prvnímu page_view (SPA router v App.tsx posílá page_view s přesným názvem stránky)
gtag('config', 'G-5Y9V7DHPXW', {
  send_page_view: false,
  cookie_flags: 'SameSite=Lax;Secure',
});
