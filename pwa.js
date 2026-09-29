/*
 * MSK Mechanics Atlas — PWA layer (service worker registration + install guidance).
 *
 * Kept outside the app bundle on purpose: it does not touch #root, React state,
 * or any existing DOM/CSS. Every step fails silently so the atlas keeps working
 * as a plain website when PWA features are unavailable.
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'msk-atlas-pwa-install-dismissed';
  var deferredPrompt = null;
  var card = null;

  // ---- Service worker -------------------------------------------------------
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      // No explicit scope: the browser limits it to this file's directory (e.g. /<repository>/ on GitHub Pages).
      // updateViaCache 'none' makes update checks bypass the HTTP cache so new deploys are picked up.
      navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(function (error) {
        console.warn('Service Worker registration failed:', error);
      });
    });
  }

  // ---- Install guidance -----------------------------------------------------
  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    // iPadOS 13+ reports itself as Macintosh; touch points tell it apart.
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  }

  function wasDismissed() {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function rememberDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) {
      /* storage unavailable: the card simply shows again next visit */
    }
  }

  function injectStyles() {
    if (document.getElementById('pwa-install-style')) return;
    var style = document.createElement('style');
    style.id = 'pwa-install-style';
    style.textContent =
      '.pwa-install{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
      'z-index:2147483000;width:min(380px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px;' +
      'background:#0d1b2c;color:#f2f6fb;border:1px solid rgba(255,255,255,.16);border-radius:14px;' +
      'box-shadow:0 12px 32px rgba(0,0,0,.45);font:14px/1.5 Inter,Pretendard,"Apple SD Gothic Neo",system-ui,sans-serif;word-break:keep-all}' +
      '.pwa-install__title{margin:0 0 4px;font-size:15px;font-weight:800}' +
      '.pwa-install__text{margin:0;color:#9aacbf}' +
      '.pwa-install__steps{margin:6px 0 0;padding-left:20px;color:#9aacbf}' +
      '.pwa-install__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
      '.pwa-install__btn{font:inherit;border-radius:10px;padding:8px 12px;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:transparent;color:#9aacbf}' +
      '.pwa-install__btn--primary{background:#55d6be;border-color:#55d6be;color:#06131c;font-weight:750}' +
      '.pwa-install__btn:focus-visible{outline:2px solid #55d6be;outline-offset:2px}';
    document.head.appendChild(style);
  }

  function hideCard() {
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
  }

  function dismiss() {
    rememberDismiss();
    hideCard();
  }

  function button(label, primary, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pwa-install__btn' + (primary ? ' pwa-install__btn--primary' : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function showCard(build) {
    if (card || isStandalone() || wasDismissed()) return;
    injectStyles();
    card = document.createElement('section');
    card.className = 'pwa-install';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'MSK Atlas 앱 설치 안내');
    var title = document.createElement('p');
    title.className = 'pwa-install__title';
    title.textContent = 'MSK Atlas 앱으로 설치';
    card.appendChild(title);
    build(card);
    document.body.appendChild(card);
  }

  // Android / desktop Chromium: native install prompt.
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    showCard(function (el) {
      var text = document.createElement('p');
      text.className = 'pwa-install__text';
      text.textContent = '홈 화면에서 바로 열고 오프라인에서도 사용할 수 있습니다.';
      var actions = document.createElement('div');
      actions.className = 'pwa-install__actions';
      actions.appendChild(
        button('앱 설치', true, function () {
          if (!deferredPrompt) return hideCard();
          var prompt = deferredPrompt;
          deferredPrompt = null;
          prompt.prompt();
          Promise.resolve(prompt.userChoice)
            .catch(function () {})
            .then(hideCard);
        }),
      );
      actions.appendChild(button('설치하지 않고 계속 사용', false, dismiss));
      el.appendChild(text);
      el.appendChild(actions);
    });
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideCard();
  });

  // iPhone / iPad Safari: no install prompt exists, show Add to Home Screen steps.
  function showIOSGuide() {
    if (!isIOS() || isStandalone()) return;
    showCard(function (el) {
      var steps = document.createElement('ol');
      steps.className = 'pwa-install__steps';
      [
        'Safari 하단(또는 상단)의 공유 버튼을 누릅니다.',
        '"홈 화면에 추가"를 선택합니다.',
        '"웹 앱으로 열기"가 켜져 있으면 유지한 뒤 "추가"를 누릅니다.',
        '홈 화면의 MSK Atlas 아이콘으로 실행합니다.',
      ].forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        steps.appendChild(li);
      });
      var actions = document.createElement('div');
      actions.className = 'pwa-install__actions';
      actions.appendChild(button('설치하지 않고 계속 사용', false, dismiss));
      el.appendChild(steps);
      el.appendChild(actions);
    });
  }

  document.addEventListener('keydown', function (event) {
    if (card && event.key === 'Escape' && card.contains(document.activeElement)) dismiss();
  });

  window.addEventListener('load', function () {
    // Let the atlas finish its intro before offering the guide.
    window.setTimeout(showIOSGuide, 2500);
  });
})();
