// Run and Gun 2 Online - page behaviour: language (Korean default, English), the nav's background, reveal on scroll,
// the download button (its address is set when the zip is published)
(() => {
  const DOWNLOAD_URL = 'https://github.com/TheGuyV/rg2/releases/latest/download/RG2Online.zip';   // the newest release's zip (no ROMs)
  const root = document.documentElement;

  // ---- language: every element with data-en keeps its Korean in data-ko
  const els = [...document.querySelectorAll('[data-en]')];
  els.forEach(e => { e.dataset.ko = e.innerHTML; });
  const btn = document.getElementById('lang');
  function setLang(l) {
    els.forEach(e => { e.innerHTML = l === 'en' ? e.dataset.en : e.dataset.ko; });
    root.lang = l;
    btn.textContent = l === 'en' ? '한국어' : 'EN';
    document.title = l === 'en' ? 'Run and Gun 2 Online' : '런앤건2 온라인 · Run and Gun 2 Online';
    try { localStorage.setItem('rg2-lang', l); } catch (e) { }
  }
  let saved = null;
  try { saved = localStorage.getItem('rg2-lang'); } catch (e) { }
  const first = saved || ((navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');
  if (first === 'en') setLang('en');
  btn.addEventListener('click', () => setLang(root.lang === 'en' ? 'ko' : 'en'));

  // ---- nav gets a background once the page scrolls
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---- reveal on scroll (the CSS hides .rv only while html has .js)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  document.querySelectorAll('.rv').forEach(e => io ? io.observe(e) : e.classList.add('in'));

  // ---- download
  const dl = document.getElementById('dlbtn'), note = document.getElementById('dlnote');
  if (DOWNLOAD_URL) dl.href = DOWNLOAD_URL;
  else dl.addEventListener('click', ev => { ev.preventDefault(); note.hidden = false; });
})();
