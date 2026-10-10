(() => {
  /* Numero WhatsApp Business (formato internazionale senza +, es. "393331234567").
     Finché è vuoto, i pulsanti WhatsApp restano nascosti. */
  const WHATSAPP = "";

  const FOUNDED = 1902;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  /* ---- ora di Monza ---- */
  const now = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", hourCycle: "h23"
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: days[p.weekday], mins: (+p.hour) * 60 + (+p.minute), year: +p.year };
  };
  const t = now();

  /* anni dalla fondazione e anno nel footer */
  const years = t.year - FOUNDED;
  document.querySelectorAll('[data-count="years"]').forEach(el => el.textContent = years);
  const yr = document.getElementById("yr"); if (yr) yr.textContent = t.year;

  /* ---- stato aperto/chiuso ---- */
  const H = { 0: [], 1: [[540, 780]], 2: [[540, 780], [930, 1170]], 3: [[540, 780], [930, 1170]], 4: [[540, 780], [930, 1170]], 5: [[540, 780], [930, 1170]], 6: [[540, 780], [930, 1170]] };
  const NAMES = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const hhmm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const status = () => {
    const { day, mins } = now();
    const open = H[day].find(([a, b]) => mins >= a && mins < b);
    if (open) return { open: true, html: `<b>Aperto ora</b> · chiude alle ${hhmm(open[1])}` };
    const later = H[day].find(([a]) => mins < a);
    if (later) return { open: false, html: `<b>Chiuso ora</b> · riapre alle ${hhmm(later[0])}` };
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      if (H[d].length) return { open: false, html: `<b>Chiuso ora</b> · riapre ${i === 1 ? "domani" : NAMES[d]} alle ${hhmm(H[d][0][0])}` };
    }
  };
  const paint = () => {
    const s = status();
    document.querySelectorAll("[data-status]").forEach(el => { el.dataset.open = s.open; el.querySelector("span").innerHTML = s.html; });
    document.querySelectorAll("#hoursTable tr").forEach(tr => tr.classList.toggle("today", +tr.dataset.day === now().day));
  };
  paint(); setInterval(paint, 60000);

  /* ---- WhatsApp ---- */
  if (WHATSAPP) {
    const msg = encodeURIComponent("Ciao! Vorrei informazioni su un cesto regalo.");
    document.querySelectorAll("[data-wa]").forEach(a => { a.href = `https://wa.me/${WHATSAPP}?text=${msg}`; a.target = "_blank"; a.rel = "noopener"; a.hidden = false; });
  }

  /* ---- copia numero ---- */
  const cb = document.getElementById("copyTel");
  cb?.addEventListener("click", () => {
    const done = () => { cb.textContent = "Copiato"; setTimeout(() => cb.textContent = "Copia numero", 1800); };
    navigator.clipboard?.writeText("039 324437").then(done).catch(() => {
      const r = document.createRange(); r.selectNodeContents(cb.previousElementSibling);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });

  /* ---- header e menu ---- */
  const head = document.querySelector(".site-head");
  const menuBtn = document.getElementById("menuBtn");
  menuBtn?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuBtn.setAttribute("aria-expanded", open);
    menuBtn.setAttribute("aria-label", open ? "Chiudi il menu" : "Apri il menu");
  });
  document.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", () => {
    document.body.classList.remove("menu-open"); menuBtn?.setAttribute("aria-expanded", false);
  }));

  /* ---- reveal allo scorrimento ---- */
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("motion");
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".rv").forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });
  }

  /* ---- contatore anni ---- */
  const counter = document.querySelector('[data-count="years"]');
  if (counter && !reduce && "IntersectionObserver" in window) {
    const co = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; co.disconnect();
      const t0 = performance.now(), dur = 1400;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
        counter.textContent = Math.round(years * ease);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: .6 });
    co.observe(counter);
  }

  /* ---- schede "Lo sai che" ---- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (t, focus) => {
    tabs.forEach(b => {
      const on = b === t;
      b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  /* ---- galleria del banco: frecce e trascinamento ---- */
  const strip = document.getElementById("strip");
  if (strip) {
    const stepW = () => (strip.querySelector("figure")?.offsetWidth || 300) + 16;
    document.getElementById("stripPrev")?.addEventListener("click", () => strip.scrollBy({ left: -stepW() * 2, behavior: reduce ? "auto" : "smooth" }));
    document.getElementById("stripNext")?.addEventListener("click", () => strip.scrollBy({ left: stepW() * 2, behavior: reduce ? "auto" : "smooth" }));
    let down = false, x0 = 0, s0 = 0, moved = false;
    strip.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") return; down = true; moved = false; x0 = e.clientX; s0 = strip.scrollLeft; });
    addEventListener("pointermove", e => { if (!down) return; const dx = e.clientX - x0; if (Math.abs(dx) > 4) { moved = true; strip.classList.add("dragging"); } strip.scrollLeft = s0 - dx; });
    addEventListener("pointerup", () => { if (!down) return; down = false; strip.classList.remove("dragging"); });
    strip.addEventListener("click", e => { if (moved) e.preventDefault(); }, true);
  }

  /* ---- storia: scorrimento orizzontale agganciato (solo desktop, solo in home) ---- */
  const pin = document.getElementById("storyPin");
  const track = document.getElementById("track");
  const bar = document.getElementById("bar");
  const mq = matchMedia("(min-width: 1021px) and (prefers-reduced-motion: no-preference)");
  let dist = 0, ticking = false;
  const update = () => {
    ticking = false;
    if (!pin || !root.classList.contains("pinned")) return;
    const top = pin.getBoundingClientRect().top;
    const p = Math.min(1, Math.max(0, -top / (dist || 1)));
    track.style.transform = `translate3d(${-p * dist}px,0,0)`;
    bar?.style.setProperty("--p", p);
  };
  const measure = () => {
    if (!pin || !track) return;
    if (!mq.matches) { root.classList.remove("pinned"); track.style.transform = ""; pin.style.removeProperty("--pin-h"); return; }
    root.classList.add("pinned");
    dist = Math.max(0, track.scrollWidth - innerWidth);
    pin.style.setProperty("--pin-h", `${dist + innerHeight}px`);
    update();
  };
  addEventListener("scroll", () => {
    head?.classList.toggle("is-scrolled", scrollY > 20);
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener("resize", measure);
  mq.addEventListener?.("change", measure);
  addEventListener("load", measure);
  measure();
  head?.classList.toggle("is-scrolled", scrollY > 20);

  /* ---- timeline verticale: linea che si riempie scorrendo ---- */
  const tl = document.getElementById("timeline");
  if (tl && !reduce) {
    const fill = () => {
      const r = tl.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.65 - r.top) / r.height));
      tl.style.setProperty("--tlp", p.toFixed(3));
    };
    addEventListener("scroll", () => requestAnimationFrame(fill), { passive: true });
    fill();
  } else if (tl) tl.style.setProperty("--tlp", 1);

  /* ---- catalogo formaggi: filtri e ricerca ---- */
  const cat = document.getElementById("catalogo");
  if (cat) {
    const cards = [...cat.querySelectorAll(".scheda-card")];
    const q = document.getElementById("cerca");
    const count = document.getElementById("conteggio");
    const empty = document.getElementById("vuoto");
    const state = { latte: "tutti", zona: "tutte" };
    const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const apply = () => {
      const term = norm(q?.value || "");
      let n = 0;
      cards.forEach(c => {
        const ok = (state.latte === "tutti" || c.dataset.latte.split(" ").includes(state.latte))
          && (state.zona === "tutte" || c.dataset.zona === state.zona)
          && (!term || norm(c.textContent).includes(term));
        c.hidden = !ok; if (ok) n++;
      });
      if (count) count.textContent = n === 1 ? "1 formaggio" : `${n} formaggi`;
      if (empty) empty.hidden = n !== 0;
    };
    document.querySelectorAll("[data-filter]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.filter;
      state[k] = b.dataset.value;
      document.querySelectorAll(`[data-filter="${k}"]`).forEach(x => x.setAttribute("aria-pressed", x === b));
      apply();
    }));
    q?.addEventListener("input", apply);
    apply();
  }
})();
