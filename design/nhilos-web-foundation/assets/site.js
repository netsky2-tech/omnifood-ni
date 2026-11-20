/* NHILOS POS - comportamiento compartido del sitio.
   Reveal al scroll, progreso del hilo, navegacion y foco.
   Extraido del artboard 05-home-geo.html el 2026-11-18, contenido identico. */

    // ==========================================================================
    // NHILOS motion orchestration (v2, elevated)
    // Coreografía por fases: carga -> hero secuenciado -> media arranca ->
    // scroll -> reveals en cascada + hilo que se dibuja + progreso de lectura.
    // Toda animación se apaga con prefers-reduced-motion (CSS + guard aquí).
    // ==========================================================================
    (function () {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var docEl = document.documentElement;

      /* ---- Stagger index: cascada determinista por orden de DOM ---- */
      function assignStagger(scope) {
        var parents = scope.querySelectorAll('.stagger');
        for (var p = 0; p < parents.length; p++) {
          var kids = parents[p].children;
          for (var i = 0; i < kids.length; i++) {
            kids[i].style.setProperty('--stagger-i', Math.min(i, 7));
          }
        }
        var steps = scope.querySelectorAll('.hilo-step');
        for (var s = 0; s < steps.length; s++) {
          steps[s].style.setProperty('--stagger-i', s);
        }
      }
      assignStagger(document);

      /* ---- Hero: entrada secuenciada (badge -> h1 -> lead -> ctas -> bezel -> chips) ---- */
      var heroVideo = document.querySelector('.hero video');
      function armHeroVideo() {
        // La media arranca cuando su contenedor terminó de entrar: nunca compite con la coreografía.
        setTimeout(function () {
          if (heroVideo && heroVideo.paused) {
            var p = heroVideo.play();
            if (p && p.catch) p.catch(function () {});
          }
        }, 1150);
      }
      if (reduced || !('IntersectionObserver' in window)) {
        docEl.classList.add('hero-ready');
        // Con preferencia de movimiento reducido la media queda quieta en su primer frame.
        if (heroVideo && !reduced && heroVideo.paused) { var pv = heroVideo.play(); if (pv && pv.catch) pv.catch(function () {}); }
        if (heroVideo && reduced) heroVideo.pause();
      } else {
        // Doble rAF: garantiza que el estado inicial pintado sea el pre-animación (sin flash).
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            docEl.classList.add('hero-ready');
            armHeroVideo();
          });
        });
      }

      /* ---- Scroll reveals: reveal, stagger y el hilo que se dibuja ---- */
      var revealables = document.querySelectorAll('.reveal, .stagger, .hilo');
      if (reduced || !('IntersectionObserver' in window)) {
        revealables.forEach(function (el) { el.classList.add('is-visible', 'is-drawn'); });
      } else {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible', 'is-drawn');
            io.unobserve(entry.target); // una sola vez: sin re-entradas que cansan
          });
        }, { threshold: 0, rootMargin: '0px 0px -8% 0px' }); // threshold 0: un ratio fijo nunca se alcanza en elementos más altos que el viewport (p. ej. el FAQ en móvil); revela al entrar, una sola vez
        revealables.forEach(function (el) { io.observe(el); });
      }

      /* ---- Videos: máximo uno activo en toda la página ---- */
      var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
      if (videos.length && 'IntersectionObserver' in window && !reduced) {
        var vio = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var v = entry.target;
            if (entry.intersectionRatio >= 0.12) {
              videos.forEach(function (other) { if (other !== v && !other.paused) other.pause(); });
              if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
            } else if (!v.paused) {
              v.pause();
            }
          });
        }, { threshold: [0, 0.12, 0.5] });
        videos.forEach(function (v) { vio.observe(v); });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) videos.forEach(function (v) { v.pause(); });
        });
      }

      /* ---- El Hilo: progreso de lectura + elevación del header (rAF-throttled) ---- */
      var bar = document.getElementById('hiloProgress');
      var header = document.querySelector('.site-header');
      var ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var max = docEl.scrollHeight - window.innerHeight;
          var t = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
          if (bar) bar.style.transform = 'scaleX(' + t.toFixed(4) + ')';
          if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
          ticking = false;
        });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      /* ---- Menú móvil accesible ---- */
      var menuBtn = document.querySelector('.mobile-menu-btn');
      var nav = document.getElementById('siteNav');
      if (menuBtn && nav) {
        function setMenu(open) {
          nav.classList.toggle('is-open', open);
          menuBtn.setAttribute('aria-expanded', String(open));
          menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        }
        menuBtn.addEventListener('click', function () {
          setMenu(!nav.classList.contains('is-open'));
        });
        nav.addEventListener('click', function (e) {
          if (e.target.closest('a')) setMenu(false);
        });
        document.addEventListener('click', function (e) {
          if (nav.classList.contains('is-open') && !e.target.closest('.site-header')) setMenu(false);
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
        });
        window.addEventListener('resize', function () {
          if (window.innerWidth > 900 && nav.classList.contains('is-open')) setMenu(false);
        });
      }
    })();

    /* ---- Spine: índice tipo libro (ubicación + navegación) ---- */
    (function () {
      var spine = document.getElementById('spineNav');
      var progress = document.getElementById('spineProgress');
      var links = Array.prototype.slice.call(spine.querySelectorAll('a[data-target]'));
      var sections = links.map(function (a) { return document.getElementById(a.getAttribute('data-target')); }).filter(Boolean);

      // Visibilidad: aparece al pasar el hero, se oculta al volver arriba
      var spineShown = false;
      function updateSpineVisibility() {
        var should = window.scrollY > window.innerHeight * 0.55;
        if (should !== spineShown) {
          spineShown = should;
          spine.classList.toggle('is-visible', should);
        }
      }

      function setCurrent(id) {
        links.forEach(function (a) {
          a.classList.toggle('is-current', a.getAttribute('data-target') === id);
        });
      }

      if ('IntersectionObserver' in window) {
        var sio = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) setCurrent(entry.target.id);
          });
        }, { rootMargin: '-38% 0px -46% 0px' });
        sections.forEach(function (s) { sio.observe(s); });
      }

      // Progress dentro del track (según sección visible relativa a la lista)
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var viewportMid = window.scrollY + window.innerHeight * 0.45;
          var idx = 0;
          for (var i = 0; i < sections.length; i++) {
            if (sections[i].offsetTop <= viewportMid) idx = i;
          }
          if (progress) progress.style.transform = 'scaleY(' + ((idx + 1) / sections.length).toFixed(3) + ')';
          updateSpineVisibility();
          ticking = false;
        });
      }, { passive: true });
      updateSpineVisibility();

      // Volver arriba desde el spine
      var topLink = spine.querySelector('.spine-top');
      if (topLink) topLink.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    })();

    /* ---- Back to top flotante ---- */
    (function () {
      var btn = document.getElementById('backTop');
      var shown = false;
      function update() {
        var should = window.scrollY > window.innerHeight * 0.9;
        if (should !== shown) {
          shown = should;
          btn.classList.toggle('is-visible', should);
        }
      }
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { update(); ticking = false; });
      }, { passive: true });
      update();
      btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    })();

    /* ---- Formulario de demo: validación accesible + WhatsApp handoff ---- */
    (function () {
      var form = document.getElementById('nhilosDemoForm');
      if (!form) return;

      function showError(input, show) {
        if (!input) return;
        var err = form.querySelector('[data-error-for="' + input.id + '"]');
        if (err) err.hidden = !show;
        input.classList.toggle('is-invalid', show);
        input.setAttribute('aria-invalid', show ? 'true' : 'false');
      }

      function groupOk(name, errKey) {
        var any = form.querySelector('input[name="' + name + '"]');
        if (!any) return true;
        var chosen = form.querySelector('input[name="' + name + '"]:checked');
        var err = form.querySelector('[data-error-for="' + errKey + '"]');
        if (err) err.hidden = !!chosen;
        return !!chosen;
      }

      var BASE_VALIDATED = { contactName: true, businessName: true, contactPhone: true, contactEmail: true };
      var BASE_MSG_KEYS = {
        businessName: true,
        businessType: true,
        terminalCount: true,
        demoPriority: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true
      };

      function getExtraRequiredInputs() {
        var reqs = Array.prototype.slice.call(form.querySelectorAll('[required]'));
        return reqs.filter(function (el) {
          return el.type !== 'radio' && !BASE_VALIDATED[el.name];
        });
      }

      function validate() {
        var ok = true;
        var btOk = groupOk('businessType', 'businessType'); ok = ok && btOk;
        var prOk = groupOk('demoPriority', 'demoPriority'); ok = ok && prOk;
        var name = form.contactName, biz = form.businessName, phone = form.contactPhone, email = form.contactEmail;
        if (name) {
          var nameOk = name.value.trim().length >= 2;
          showError(name, !nameOk); ok = ok && nameOk;
        }
        if (biz) {
          var bizOk = biz.value.trim().length >= 2;
          showError(biz, !bizOk); ok = ok && bizOk;
        }
        if (phone) {
          var digits = phone.value.replace(/\D/g, '');
          var phoneOk = digits.length >= 8;
          showError(phone, !phoneOk); ok = ok && phoneOk;
        }
        if (email) {
          var emailOk = !email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
          showError(email, !emailOk); ok = ok && emailOk;
        }
        getExtraRequiredInputs().forEach(function (input) {
          var valid = input.value.trim().length >= 2;
          showError(input, !valid);
          ok = ok && valid;
        });
        return ok;
      }

      ['contactName', 'businessName', 'contactPhone', 'contactEmail'].forEach(function (id) {
        var input = form[id];
        if (!input) return;
        input.addEventListener('input', function () {
          if (input.classList.contains('is-invalid')) validate();
        });
      });
      getExtraRequiredInputs().forEach(function (input) {
        input.addEventListener('input', function () {
          if (input.classList.contains('is-invalid')) validate();
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validate()) {
          var firstBad = form.querySelector('.is-invalid') || form.querySelector('input[name="businessType"]');
          if (firstBad) firstBad.focus();
          return;
        }
        var data = new FormData(form);
        var msg = 'Hola NHILOS, quiero solicitar una demo.\n' +
          'Negocio: ' + data.get('businessName') + ' (' + data.get('businessType') + ')\n' +
          'Terminales: ' + (data.get('terminalCount') || '1 terminal') + '\n' +
          'Prioridad: ' + data.get('demoPriority') + '\n' +
          'Nombre: ' + data.get('contactName') + '\n' +
          'Teléfono: ' + data.get('contactPhone') +
          (data.get('contactEmail') ? '\nCorreo: ' + data.get('contactEmail') : '');
        data.forEach(function (value, key) {
          if (BASE_MSG_KEYS[key]) return;
          var clean = String(value == null ? '' : value).trim();
          if (!clean) return;
          var el = form[key] || form.querySelector('[name="' + key + '"]');
          var label = (el && el.getAttribute && el.getAttribute('data-msg-label')) || key;
          msg += '\n' + label + ': ' + clean;
        });
        window.open('https://wa.me/50581948526?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      });
    })();
  
