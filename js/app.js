/* ============================================================
   지연님 블로그 작업실 — 앱 로직
   - Gemini API 키: 브라우저 localStorage에만 저장 (코드/깃에 없음)
   - 원고 생성 → 미리보기/마크다운/HTML → 스마트에디터 복사
   - 이미지 프롬프트 생성 → 이미지 생성 → 다운로드
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var K_KEY = "bs.apiKey";
  var K_TEXT = "bs.textModel";
  var K_IMAGE = "bs.imageModel";
  var K_DRAFTS = "bs.drafts";
  var K_AUTO = "bs.autoModel";   // '0'이면 자동 모델 전환 끔 (기본은 켜짐)
  var K_WEBSEARCH = "bs.webSearch";  // '0'이면 구글 실시간 검색 끔 (기본은 켜짐 · v1.9.3)
  var K_GH = "bs.ghToken";           // GitHub 토큰 — 화제템 '지금 새로 수집'용 (v2.1.0 · 이 브라우저에만)
  var K_PERSONA = (BS.PERSONAS && BS.PERSONAS.storagePrefix) || "bs.persona.";  // 🎭 페르소나 — 블로그별 기억 (v2.2.0)
  var K_AFF = "bs.affPlatform";   // 🛍️ 블로그 모드 제휴 플랫폼 선택 (v2.2.1 — 쿠팡·쇼핑커넥트·브랜드커넥트)
  var K_MODEL_MIGRATED = (BS.MODEL_MIGRATION && BS.MODEL_MIGRATION.key) || "bs.modelMigrated.223";  // v2.2.3 — 옛 기본 모델 1회 전환

  var state = {
    blog: BS.BLOGS[0],
    docMode: "blog",            // 글 용도 (v1.8.0) — blog · cafe · product
    persona: "",               // 🎭 현재 페르소나 id (v2.2.0) — 블로근 고르면 추천·직접 고르면 그 선택
    productPlatform: "coupang", // 제휴 플랫폼 (product 모드)
    affiliatePlatform: "", // 🛍️ 블로그 모드 제휴 팁 플랫폼 (v2.2.1) — 빈 값이면 저장된 선택·쿠팡
    chips: [],
    kwSel: null,       // 오늘자 목록에서 고른 번호
    autoTopic: "",    // 앱이 주제칸에 자동으로 넣은 값 (사용자가 고친 값과 구분)
    internal: [],
    internalOff: [],   // 지연님이 이번 글에서 뺀 자동 내부링크 주소 (v1.9.9)
    dupOffTopic: "",   // 이 주제는 중복 경고를 접었다 (v2.0.0)
    guide: null,       // 🧭 길잡이 결과 (v2.0.0) — {main, branches, avoid, dupNote, source}
    multiuse: null,    // ⚡ 멀티유즈 결과 (v2.0.0) — {hook, firstComment, clip, hashtags}
    result: null,     // {md, sections, title, titles, blogId, topic, ts}
    autoSwitch: null, // {from, to} — 무료 한도로 모델이 자동 전환된 사실 (결과 배너)
    imgPrompts: [],   // {role, prompt}
    thumbs: [],       // 대표 썸네일 2종 {role, prompt}
    images: [],       // {dataUrl, mime, prompt}
    threads: null,    // 🧵 스레드 타래 (v1.9.0) {threads, comment, hashtags, memo}
    video: null,      // 🎬 영상 대본 (v1.9.0) {thumbs, hook, narration, captions, scenes, memo}
    videoFormat: "short",  // 영상 형식 — short(30~45초 숏폼) · long(유튜브 롱폼)
    threadAccount: "",     // 📮 업로드 계정 id (v1.9.1) — 빈 값이면 원고 블로그로 자동 선택
    threadWhen: "now",     // 업로드 희망 시간 칩 id — now · h1 · tonight · tomorrow8
    threadWhenCustom: "",  // 직접 입력한 시간 (있으면 칩보다 우선)
    busy: false,
    genTs: 0,         // 이번 생성의 타임스탬프 (2단계 재시도해도 임시저장이 겹치지 않게)
    reviewed: false,  // 이 원고가 2단계 검수를 거쳤는지
    lastDraft: null,  // {md, opts, model} — 2단계 재시도용 1단계 초안 보관
    grounding: { queries: [], sources: [] },  // 🔍 구글 실시간 검색이 돌려준 실제 출처 (v1.9.3)
    webSearchBusy: false,   // 지금 검색을 붙여 호출 중인지
    webSearchMode: "",      // '' | 'skip'(미지원 모델) | 'fallback'(오류로 일반 작성)
    webSearchModel: ""      // 마지막으로 검색을 붙인(또는 건너뛴) 모델
  };

  /* ---------------- 저장소 ---------------- */
  function getKey() { try { return localStorage.getItem(K_KEY) || ""; } catch (e) { return ""; } }
  function setKey(v) { try { localStorage.setItem(K_KEY, v); } catch (e) { toast("이 브라우저에 저장하지 못했습니다"); } }
  function clearKey() { try { localStorage.removeItem(K_KEY); } catch (e) {} }
  /* 🔑 GitHub 토큰 (v2.1.0) — 코드·깃허브에는 절대 넣지 않고 이 브라우저(localStorage)에만 둔다 */
  function getGhToken() { try { return localStorage.getItem(K_GH) || ""; } catch (e) { return ""; } }
  function setGhToken(v) {
    try { if (v) localStorage.setItem(K_GH, v); else localStorage.removeItem(K_GH); }
    catch (e) { toast("이 브라우저에 GitHub 토큰을 저장하지 못했습니다"); }
  }
  function getDrafts() {
    try { return JSON.parse(localStorage.getItem(K_DRAFTS) || "[]"); } catch (e) { return []; }
  }
  function setDrafts(list) {
    try { localStorage.setItem(K_DRAFTS, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }

  /* ---------------- 작은 도구들 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  var toastTimer = null;
  var dupTimer = null;   // 중복 경고 계산 디바운스 (v2.0.0)
  function toast(msg, ms) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  function setStatus(el, html, cls) {
    if (!el) return;
    if (!html) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.className = "gen-status" + (el.classList.contains("inline") ? " inline" : "") + (cls ? " " + cls : "");
    el.innerHTML = html;
  }

  /* 자동 모델 전환 배너 — 생성 중에도 결과 뒤에도 같은 자리에 남는다 */
  function paintAutoNote(html, cls) {
    var el = $("#autoModelNote");
    if (!el) return;
    if (!html) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.className = "gen-status auto-model" + (cls ? " " + cls : "");
    el.innerHTML = html;
  }
  function noteSwitch(from, to, reason) {
    state.autoSwitch = { from: from, to: to, reason: reason || "quota" };
    var why = reason === "busy" ? " 서버가 혼잡해" : " 한도에 닿아";
    paintAutoNote("🔀 " + esc(from) + why + " " + esc(to) + " 모델로 자동 전환해 이어서 작성합니다…", "warn");
  }
  function kdate(ts) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function charCount(text) {
    var noSpace = text.replace(/\s/g, "").length;
    return { noSpace: noSpace, withSpace: text.length };
  }

  /* ---------------- 1-0. 글 용도 3모드 (v1.8.0) ----------------
     ① 📝 블로그 10단계 ② ☕ 네이버 카페 글 ③ 🛒 상품·여행 제휴 리뷰.
     모드를 바꾸면 화면에 필요한 칸만 남기고, 생성·복사 규칙도 그 모드로 바뀐다. */
  function docMode() { return state.docMode || "blog"; }
  function modeLabel(id) { var m = BS.modeInfo(id || docMode()); return m.emoji + " " + m.label; }
  function platformInfo() { return BS.platform(state.productPlatform); }
  function resultMode(r) { return (r && r.docMode) || "blog"; }
  function isCafeResult(r) { return resultMode(r) === "cafe"; }
  function isProductResult(r) { return resultMode(r) === "product"; }
  function show(el, on) { if (el) el.hidden = !on; }

  function renderModes() {
    var box = $("#modeSwitch");
    if (!box) return;
    box.innerHTML = "";
    BS.MODES.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mode-btn" + (docMode() === m.id ? " sel" : "");
      b.setAttribute("data-mode", m.id);
      b.innerHTML = '<span class="mb-emoji">' + m.emoji + '</span>' +
        '<span class="mb-txt"><strong>' + esc(m.label) + '</strong><em>' + esc(m.sub) + '</em></span>';
      b.addEventListener("click", function () { setDocMode(m.id); });
      box.appendChild(b);
    });
    var hint = $("#modeHint");
    if (hint) hint.textContent = BS.modeInfo(docMode()).hint;
  }

  function paintModeNote() {
    var el = $("#modeNote");
    if (!el) return;
    if (docMode() === "cafe") {
      el.hidden = false;
      el.innerHTML = "☕ 카페 글은 <b>목차·FAQ·출처 섹션·3:1 허브 배너·쿠팡 제휴 팁</b>을 넣지 않습니다. 대신 <b>글 맨 끝에 부드러운 면책 한 줄</b>이 들어갑니다.";
    } else if (docMode() === "product") {
      el.hidden = false;
      el.innerHTML = "🛒 상품·여행 리뷰는 <b>기준·장단점·추천/패스</b>로 쓰고, <b>제휴 링크 카드</b>와 <b>공정위 대가성 문구</b>가 자동으로 들어갑니다.";
    } else {
      el.hidden = true;
      el.innerHTML = "";
    }
  }

  function renderProductPlatforms() {
    var sel = $("#productPlatform");
    if (!sel) return;
    sel.innerHTML = (BS.PRODUCT.platforms || []).map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === state.productPlatform ? " selected" : "") + ">" + esc(p.label) + "</option>";
    }).join("");
    if (!BS.platform(state.productPlatform)) state.productPlatform = "coupang";
  }

  /* ---------- 🛍️ 블로그 모드 제휴 플랫폼 선택 (v2.2.1 · 2026-11-19 크리 님 합의) ----------
     기존에는 쿠팡파트너스 하나뿐이었다. 네이버 쇼핑커넥트·크리에이터샵과 브랜드커넥트를
     같은 자리에서 고를 수 있게 하고, 링크 주소를 붙여넣으면 BS.platformFromUrl 로 자동 인식한다.
     대가성 문구는 고른 플랫폼의 확정 문구만 붙인다(조건부 표현 금지). */
  function affiliateChoices() {
    var ids = (BS.PRODUCT && BS.PRODUCT.affiliateChoices) || ["coupang"];
    var out = [];
    ids.forEach(function (id) {
      var pf = BS.platform(id);
      if (pf && pf.id && out.indexOf(pf) < 0) out.push(pf);
    });
    if (!out.length) out.push(BS.platform("coupang"));
    return out;
  }
  function savedAffiliate() {
    var list = affiliateChoices();
    var v = "";
    try { v = localStorage.getItem(K_AFF) || ""; } catch (e) {}
    for (var i = 0; i < list.length; i++) if (list[i].id === v) return v;
    return "coupang";
  }
  function affiliateInfo() { return BS.platform(state.affiliatePlatform || "coupang"); }
  function renderAffiliatePlatforms() {
    var sel = $("#affiliatePlatform");
    var list = affiliateChoices();
    var cur = state.affiliatePlatform || savedAffiliate();
    var ok = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === cur) ok = true;
    state.affiliatePlatform = ok ? cur : "coupang";
    if (sel) {
      sel.innerHTML = list.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === state.affiliatePlatform ? " selected" : "") + ">" + esc(p.label) + "</option>";
      }).join("");
    }
    paintAffiliateNote();
  }
  function paintAffiliateNote() {
    var pf = affiliateInfo();
    var link = $("#coupangLink");
    if (link) { link.setAttribute("placeholder", pf.linkHint || ""); link.placeholder = pf.linkHint || ""; }
    var label = $("#affLinkLabel");
    if (label) label.textContent = (pf.id === "coupang" ? "쿠팡파트너스" : pf.label) + " 링크";
    var hint = $("#affLinkHint");
    if (hint) {
      hint.textContent = pf.id === "coupang"
        ? "(비우면 '링크 붙여넣기' 자리로 나갑니다 · 코드 " + (BS.COUPANG_CODE || "") + ")"
        : "(비우면 " + (pf.short || "네이버") + " 검색 링크로 나갑니다 · " + pf.disclosure + ")";
    }
  }
  function setAffiliatePlatform(id, opts) {
    var pf = BS.platform(id);
    if (!pf || !pf.id) return false;
    var known = affiliateChoices().some(function (x) { return x.id === pf.id; });
    if (!known) return false;
    if (state.affiliatePlatform === pf.id) return false;
    state.affiliatePlatform = pf.id;
    try { localStorage.setItem(K_AFF, pf.id); } catch (e) {}
    var sel = $("#affiliatePlatform");
    if (sel) sel.value = pf.id;
    paintAffiliateNote();
    if (!(opts && opts.silent)) toast("제휴 플랫폼을 " + pf.label + "(으)로 바꿨습니다", 2600);
    return true;
  }
  /* 링크 주소 → 플랫폼 자동 인식 (수동 선택이 더 강하다 — 주소를 새로 넣을 때만 맞춘다) */
  function autoDetectAffiliate(url, mode) {
    var pid = BS.platformFromUrl(url);
    if (!pid) return false;
    var pf = BS.platform(pid);
    if (mode === "product") {
      if (state.productPlatform === pid) return false;
      state.productPlatform = pid;
      if ($("#productPlatform")) $("#productPlatform").value = pid;
      paintProductNote();
      toast("링크 주소로 제휴 플랫폼을 " + pf.label + "(으)로 맞췄습니다", 3000);
      return true;
    }
    return setAffiliatePlatform(pid, { silent: false });
  }

  /* ---------- 🗞 행동 가이드 안내 · 🛒 상품 역순 체크리스트 (v1.9.8 · 2026-11-18) ----------
     화면 문구는 전부 설정(BS.ARTICLE_REF.actionGuide · BS.PICK_FIRST)에서 가져온다.
     설정을 고치면 화면·프롬프트가 같이 바뀐다. */
  function pickFirstHtml() {
    var P = BS.PICK_FIRST || {};
    if (!P.steps || !P.steps.length) return "";
    var h = [];
    h.push('<div class="pf-head"><strong>' + esc(P.title || "🛒 상품 역순 전략") + '</strong>' +
      '<span class="pf-tag">' + esc(P.version || "") + '</span></div>');
    h.push('<p class="pf-lead">' + esc(P.lead || "") + '</p>');
    h.push('<ol class="pf-steps">');
    (P.steps || []).forEach(function (s) {
      h.push('<li><span class="pf-no">' + esc(s.no || "") + '</span>' +
        '<div class="pf-body"><b>' + esc(s.k || "") + '</b>' +
        '<span class="pf-q">' + esc(s.q || "") + '</span>' +
        '<span class="pf-hint">' + esc(s.hint || "") + '</span></div></li>');
    });
    h.push('</ol>');
    if (P.order) h.push('<p class="pf-order">' + esc(P.order) + '</p>');
    if (P.screenNote) h.push('<p class="pf-note">' + esc(P.screenNote) + '</p>');
    return h.join("");
  }

  function paintGuideNotes() {
    var G = (BS.ARTICLE_REF && BS.ARTICLE_REF.actionGuide) || {};
    var refN = $("#refGuideNote");
    if (refN) {
      if (G.note) { refN.textContent = G.note; refN.hidden = false; }
      else { refN.hidden = true; }
    }
    var html = pickFirstHtml();
    ["#videoPickFirst", "#productPickFirst"].forEach(function (sel) {
      var box = $(sel);
      if (box) { box.innerHTML = html; box.hidden = !html; }
    });
  }

  function paintProductNote() {
    var pf = platformInfo();
    var url = $("#productUrl");
    if (url) { url.setAttribute("placeholder", pf.linkHint || ""); url.placeholder = pf.linkHint || ""; }
    var note = $("#productNote");
    if (note) note.textContent = (BS.PRODUCT && BS.PRODUCT.corsNote) || "";
    var disc = $("#productDisclosure");
    if (disc) {
      disc.textContent = "공정위 문구: " + pf.disclosure +
        (pf.id === "travel" ? "\n" + (BS.PRODUCT.travelNote || "") : "");
    }
  }

  function setDocMode(id) {
    var changing = docMode() !== id;
    /* 구글 블로거 카드는 '블로그 원고' 전용이다 — 카페·제품 모드로 바꾸면 네이버 카드로 돌린다 (v2.0.0) */
    if (id !== "blog" && state.blog && state.blog.kind === "blogger") {
      var home = BS.BLOGS[0];
      state.blog = home;
      renderBlogs();
      renderChips();
      renderInternal();
      setBlogHint(home);
      if (typeof syncPersona === "function") syncPersona();   // 🎭 카드가 바뀌면 페르소나도 그 블로그 기준 (v2.2.0)
      toast("구글 블로거 카드는 블로그 원고 전용입니다 — " + home.name + " 카드로 돌렸습니다", 3800);
    }
    state.docMode = id;
    renderModes();
    var isCafe = id === "cafe";
    var isProduct = id === "product";
    show($("#productBox"), isProduct);
    show($("#kwPanel"), !isProduct);
    show($("#kwFallbackBox"), !isProduct);
    show($("#affiliateSwitchRow"), !isCafe && !isProduct);
    show($("#ctaReviewRow"), !isCafe && !isProduct);
    show($("#coupangField"), !isCafe && !isProduct);
    show($("#affiliatePlatformRow"), !isCafe && !isProduct);   // 🛍️ v2.2.1
    show($("#internalBox"), !isCafe && !isProduct);
    show($("#thumbBlock"), !isCafe);
    paintModeNote();
    var t = $("#topic");
    if (t) {
      if (isProduct) t.placeholder = "예: 무선 청소기 / 오사카 난바 호텔";
      else t.placeholder = "예: 창문 단열 / 급성 위염 초기증상 / 간병인 비용";
    }
    // 상품 리뷰로 바꾸면 자동으로 채워진 블로그 키워드는 지운다 (상품명을 넣어야 해서)
    if (isProduct && t && state.autoTopic && t.value.trim() === state.autoTopic) {
      t.value = "";
      state.autoTopic = "";
      state.kwSel = null;
    }
    if (isProduct) { renderProductPlatforms(); paintProductNote(); }
    if (changing && state.result) paintConvertButtons();
    if (changing) refreshBanner();
    if (!changing) return;
    if (isCafe) toast("카페 글 모드 — 목차·FAQ·출처·배너·제휴 없이, 글 끝에 부드러운 면책 한 줄이 들어갑니다");
    else if (isProduct) toast("상품·여행 리뷰 모드 — 상품 링크와 특징을 적으면 그 기준으로 씁니다");
  }

  /* ============================================================
     🎭 6대 페르소나 (v2.2.0 · 2026-11-18)
     블로그를 고르면 그 블로그에 어울리는 페르소나를 추천하고(BS.personaDefault),
     지연님이 직접 고른 페르소나는 그 블로그에서 계속 기억한다
     (localStorage 'bs.persona.<블로그 id>' — 블로그마다 따로).
     고른 페르소나는 currentOptions()로 원고 프롬프트에,
     currentPersona()로 스레드·클립 프롬프트에 함께 들어간다.
     ============================================================ */
  function personaPref(blogId) {
    try { return localStorage.getItem(K_PERSONA + String(blogId || "")) || ""; } catch (e) { return ""; }
  }

  function setPersonaPref(blogId, id) {
    try {
      var key = K_PERSONA + String(blogId || "");
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    } catch (e) {}
  }

  function currentPersona() {
    var p = BS.persona(state.persona);
    return p || BS.persona(BS.personaDefault((state.blog && state.blog.id) || ""))
      || (BS.PERSONAS && BS.PERSONAS.list && BS.PERSONAS.list[0]) || null;
  }

  /* 블로그가 바뀔 때·앱을 켬 때 — 그 블로그에 기억된 선택이 있으면 그것, 없으면 추천 */
  function syncPersona() {
    var blogId = (state.blog && state.blog.id) || "";
    state.persona = BS.personaForBlog(blogId, personaPref(blogId));
    paintPersonas();
  }

  function setPersona(id, opts) {
    if (!BS.persona(id)) return;
    var blogId = (state.blog && state.blog.id) || "";
    state.persona = id;
    setPersonaPref(blogId, id);
    paintPersonas();
    if (!(opts && opts.silent)) toast((BS.PERSONAS && BS.PERSONAS.pickToast) || "페르소나를 바꿨습니다");
  }

  /* '추천으로' — 직접 고른 기억을 지우고 그 블로그 기본 추천으로 */
  function resetPersona(opts) {
    var blogId = (state.blog && state.blog.id) || "";
    setPersonaPref(blogId, "");
    state.persona = BS.personaDefault(blogId);
    paintPersonas();
    if (!(opts && opts.silent)) toast((BS.PERSONAS && BS.PERSONAS.resetToast) || "추천 페르소나로 되돌렸습니다");
  }

  function personaIsManual() {
    var blogId = (state.blog && state.blog.id) || "";
    var pref = personaPref(blogId);
    return !!BS.persona(pref) && pref === state.persona;
  }

  function paintPersonas() {
    var box = $("#personaChips");
    if (!box) return;
    var P = BS.PERSONAS || {};
    var T = P.tags || {};
    var cur = currentPersona();
    if (!cur) return;
    state.persona = cur.id;
    box.innerHTML = (P.list || []).map(function (p) {
      var on = p.id === cur.id;
      return '<button type="button" class="ps-chip' + (on ? " on" : "") + '" data-persona="' + esc(p.id) + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(p.hint || p.label) + '">' +
        '<span class="ps-emoji">' + (p.emoji || "") + '</span>' +
        '<span class="ps-txt"><b>' + esc(p.label) + '</b><em>' + esc(p.owner) + '</em></span></button>';
    }).join("");
    var desc = $("#personaDesc");
    if (desc) {
      desc.innerHTML =
        '<span class="ps-line"><b>' + esc(T.character || "캐릭터") + '</b> ' + esc(cur.character || "") + '</span>' +
        '<span class="ps-line"><b>' + esc(T.tone || "말투") + '</b> ' + esc(cur.tone || "") + '</span>' +
        '<span class="ps-line"><b>' + esc(T.banned || "금지어") + '</b> ' + esc((cur.banned || []).join(" · ")) + '</span>' +
        '<span class="ps-line"><b>' + esc(T.closing || "첫 댓글·마무리") + '</b> ' + esc(cur.closing || "") + '</span>';
    }
    var note = $("#personaNote");
    if (note) note.textContent = personaIsManual() ? (P.manualNote || "") : (P.autoNote || "");
    var tag = $("#personaTag");
    if (tag) tag.textContent = (cur.emoji || "") + " " + (cur.label || "") + " — 원고·스레드·클립에 함께 적용";
  }

  /* ---------------- 1. 블로그 선택 ---------------- */
  function renderBlogs() {
    var g = $("#blogGrid");
    g.innerHTML = "";
    BS.BLOGS.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "blog-card" + (state.blog.id === b.id ? " sel" : "");
      btn.setAttribute("data-id", b.id);
      btn.innerHTML =
        '<span class="bc-top"><span class="bc-emoji">' + b.emoji + '</span>' +
        '<span><span class="bc-name">' + esc(b.name) + '</span>' +
        (b.kind === "blogger" ? '<span class="bc-kind' + (b.lang === "en" ? " en" : "") + '">' + (b.lang === "en" ? "EN · Blogger" : "Google") + '</span>' : '') +
        '<br>' +
        '<span class="bc-acc">' + esc(b.account) + "</span></span></span>" +
        '<span class="bc-cats">' + esc(b.cats) + "</span>" +
        '<span class="bc-desc">' + esc(b.desc) + "</span>";
      btn.addEventListener("click", function () {
        var changed = state.blog.id !== b.id;
        state.blog = b;
        if (b.kind === "blogger" && docMode() !== "blog") setDocMode("blog");
        state.internal = [];
        state.internalOff = [];
        state.kwSel = null;
        renderBlogs();
        renderChips();
        renderInternal();
        setBlogHint(b);
        syncPersona();   // 🎭 그 블로그에 기억된 페르소나(없으면 추천) — v2.2.0
        // 블로그를 바꾸면 그 블로그의 1번 키워드를 주제칸에 바로 채운다 (v1.5.0)
        var hadOwn = ($("#topic").value || "").trim() && changed;
        applyDefaultKeyword(true);
        rtFollowBlog(b.id);   // 오른쪽 실시간 패널도 그 불로그 맞춤으로
        renderDupWarn();      // 블로그를 바꾸면 '이 블로그' 표시가 달라진다 (v2.0.0)
        if (hadOwn) toast(b.name + " 1번 키워드로 주제칸을 채웠습니다");
      });
      g.appendChild(btn);
    });
    setBlogHint(state.blog);
  }

  function setBlogHint(b) {
    $("#blogHint").innerHTML = "주제 방향 · <b>" + esc(b.categoryHint) + "</b>" + (b.id === "jinjin2624" ? " — 기존 글 내부링크 2~3편이 기본입니다" : "");
  }

  /* ---------------- 2. 키워드 칩 ---------------- */
  function renderChips() {
    var box = $("#chips");
    box.innerHTML = "";
    var chips = state.blog.keywords || [];
    $("#chipSource").textContent = chips.length ? "· " + state.blog.name + " 맞춤" : "";
    chips.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (state.chips.indexOf(c.k) >= 0 ? " on" : "");
      b.innerHTML = esc(c.k) + (c.s ? "<small>" + esc(c.s) + "</small>" : "");
      b.addEventListener("click", function () {
        var t = $("#topic");
        var i = state.chips.indexOf(c.k);
        if (i >= 0) {
          state.chips.splice(i, 1);
          t.value = t.value.replace(c.k, "").replace(/\s{2,}/g, " ").trim();
        } else {
          state.chips.push(c.k);
          if (t.value.indexOf(c.k) < 0) {
            t.value = (t.value.trim() ? t.value.trim() + " " : "") + c.k;
          }
        }
        renderChips();
      });
      box.appendChild(b);
    });
  }

  /* ---------------- 1-1. 오늘자 80선 (data/keywords-today.json) ---------------- */
  /* 매일 06시 정기 작업이 data/keywords-today.json 을 새로 올린다.
     페이지를 열 때마다 캐시를 비켜 불러오고, 실패하면 BS.BLOGS 기본 키워드로 계속 쓴다. */
  var TODAY = { date: "", updatedAt: "", source: "", perBlog: 20, total: 0, blogs: null, loaded: false, error: "" };

  function todayItems(blogId) {
    if (TODAY.loaded && TODAY.blogs && Array.isArray(TODAY.blogs[blogId]) && TODAY.blogs[blogId].length) {
      return TODAY.blogs[blogId];
    }
    return null;
  }

  function fallbackItems(blog) {
    return (blog.keywords || []).map(function (c, i) {
      return { no: i + 1, keyword: c.k, title: "", sub: "", keywords: [c.k], titles: [], point: c.s || "", tag: "기본", fallback: true };
    });
  }

  function currentDayItems() {
    return todayItems(state.blog.id) || fallbackItems(state.blog);
  }

  function renderTodayBand() {
    var t = $("#todayText"), s = $("#todayState"), band = $("#todayBand");
    if (!t || !s) return;
    if (TODAY.loaded) {
      t.textContent = TODAY.date + " 기준 · 4대 블로그 " + TODAY.total + "선 · 블로그당 " + (TODAY.perBlog || 20) + "개";
      s.textContent = "자동 로드 완료";
      s.className = "tb-state ok";
    } else if (TODAY.error) {
      t.textContent = "오늘자 80선을 불러오지 못했습니다 — 블로그 기본 키워드로 계속 씁니다";
      s.textContent = "기본 목록";
      s.className = "tb-state warn";
    } else {
      t.textContent = "오늘자 80선 불러오는 중…";
      s.textContent = "";
      s.className = "tb-state";
    }
    if (band) band.title = TODAY.loaded
      ? (TODAY.source || "매일 06시 80선") + (TODAY.updatedAt ? " · 갱신 " + TODAY.updatedAt : "")
      : "data/keywords-today.json";
  }

  function renderKeywordList(selectFirst) {
    var box = $("#kwList");
    if (!box) return;
    var items = currentDayItems();
    var isToday = !!todayItems(state.blog.id);
    var meta = $("#kwPanelMeta");
    if (meta) {
      meta.textContent = isToday
        ? (TODAY.date + " 기준 · " + items.length + "개")
        : "기본 키워드 " + items.length + "개";
    }
    box.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "kw-empty";
      empty.textContent = "이 블로그의 키워드가 아직 없습니다.";
      box.appendChild(empty);
      renderKwDetail();
      return;
    }
    if (!state.kwSel && selectFirst) state.kwSel = items[0].no;
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "kw-item" + (state.kwSel === it.no ? " sel" : "");
      b.setAttribute("data-no", it.no);
      b.setAttribute("aria-label", it.no + "번 " + it.keyword + (it.title ? " · " + it.title : ""));
      if (it.title) b.title = it.title;
      b.innerHTML = '<span class="kw-num">' + it.no + '</span>' +
        '<span class="kw-text">' + esc(it.keyword) + '</span>' +
        (it.tag && it.tag.indexOf("빈집") === 0 ? '<span class="kw-vacant">빈집</span>' : "") +
        kwIntentBadge(it.keyword);
      b.addEventListener("click", function () { pickKeyword(it); });
      box.appendChild(b);
    });
    renderKwDetail();
  }

  function pickKeyword(it) {
    if (!it) return;
    state.kwSel = it.no;
    var t = $("#topic");
    t.value = it.keyword;
    state.autoTopic = it.keyword;
    renderKeywordList();
    renderTopicHint(it);
    t.focus();
  }

  function renderTopicHint(it) {
    var el = $("#kwHint");
    if (!el) return;
    if (!it || !it.title) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = '추천 제목 · <b>' + esc(it.title) + '</b>';
  }

  /* 고른 번호의 추천 제목·유입 포인트·제목 3선을 아래에 펼친다 */
  function renderKwDetail() {
    var box = $("#kwDetail");
    if (!box) return;
    var items = currentDayItems();
    var it = items.filter(function (x) { return x.no === state.kwSel; })[0];
    if (!it || (!it.title && !it.point)) { box.hidden = true; box.innerHTML = ""; return; }
    var h = [];
    h.push('<div class="kd-head"><span class="kd-no">' + it.no + '번</span>' +
      '<span class="kd-tag">' + esc(it.tag || "오늘자 80선") + '</span>' +
      kwIntentBadge(it.keyword, true) +
      '<span class="kd-kw">' + esc(it.keyword) + '</span></div>');
    if (it.title) h.push('<div class="kd-title">' + esc(it.title) + '</div>');
    if (it.keywords && it.keywords.length > 1) {
      h.push('<div class="kd-kws">키워드 조합 · ' + it.keywords.map(function (k) { return esc(k); }).join(" + ") + '</div>');
    }
    if (it.point) h.push('<p class="kd-point">' + esc(it.point) + '</p>');
    if (it.vacant) h.push('<div class="kd-vacant">빈집 점검 · ' + esc(it.vacant) + '</div>');
    if (it.titles && it.titles.length) {
      h.push('<ol class="kd-titles">' + it.titles.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ol>');
    }
    if (it.internal) h.push('<div class="kd-internal">' + esc(it.internal) + '</div>');
    h.push('<div class="kd-actions">' +
      '<button type="button" class="btn small primary" data-act="copy-title">추천 제목 복사</button>' +
      '<button type="button" class="btn small ghost" data-act="use-keyword">주제칸에 넣기</button>' +
      '<button type="button" class="btn small ghost" data-act="generate">이 키워드로 원고 생성</button>' +
      '</div>');
    box.hidden = false;
    box.innerHTML = h.join("");
    var copyBtn = box.querySelector('[data-act="copy-title"]');
    if (copyBtn) copyBtn.addEventListener("click", function () {
      copyPlain(it.title || it.keyword).then(function (ok) { toast(ok ? "추천 제목을 복사했습니다" : "복사 실패"); });
    });
    var useBtn = box.querySelector('[data-act="use-keyword"]');
    if (useBtn) useBtn.addEventListener("click", function () { pickKeyword(it); });
    var genBtn = box.querySelector('[data-act="generate"]');
    if (genBtn) genBtn.addEventListener("click", function () { pickKeyword(it); generate(); });
  }

  /* 블로그를 고르면 1번 키워드를 주제칸에 자동으로 넣는다.
     force=false 일 때는 사용자가 직접 쓴 주제를 건드리지 않는다. */
  function applyDefaultKeyword(force) {
    var items = currentDayItems();
    var t = $("#topic");
    if (!t) return;
    if (!items.length) { state.kwSel = null; renderKeywordList(false); renderTopicHint(null); return; }
    var cur = (t.value || "").trim();
    var wasAuto = !cur || cur === state.autoTopic;
    if (!force && !wasAuto) { renderKeywordList(false); return; }  // 직접 쓴 주제는 그대로 두고 목록만 새로 그리기
    var first = items[0];
    state.kwSel = first.no;
    t.value = first.keyword;
    state.autoTopic = first.keyword;
    renderKeywordList();
    renderTopicHint(first);
  }

  /* 받아온 오늘자 JSON을 화면에 반영한다 (테스트에서도 직접 부른다) */
  function applyTodayData(j) {
    if (!j || !j.blogs) throw new Error("형식 오류");
    var n = 0, ok = 0;
    BS.BLOGS.forEach(function (b) {
      var arr = j.blogs[b.id];
      if (Array.isArray(arr) && arr.length) { ok++; n += arr.length; }
    });
    if (!ok) throw new Error("블로그 데이터 없음");
    TODAY = {
      date: j.date || "",
      updatedAt: j.updatedAt || "",
      source: j.source || "",
      perBlog: j.perBlog || 20,
      total: j.total || n,
      blogs: j.blogs,
      loaded: true,
      error: ""
    };
    renderTodayBand();
    state.kwSel = null;
    applyDefaultKeyword(false);
    return true;
  }

  function applyTodayFailure(err) {
    TODAY.loaded = false;
    TODAY.blogs = null;
    TODAY.error = (err && err.message) ? err.message : String(err || "불러오기 실패");
    renderTodayBand();
    state.kwSel = null;
    renderKeywordList();
    applyDefaultKeyword(false);
    return false;
  }

  function loadToday() {
    renderTodayBand();
    var url = (BS.KEYWORDS_TODAY || "data/keywords-today.json") + "?t=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(applyTodayData)
      .catch(applyTodayFailure);
  }

  /* ---------------- 2-1. 내부링크 ---------------- */
  /* ---------- 🔗 기존 글 자동 내부링크 (v1.9.9 · 2026-11-18) ----------
     지연님 지시 — "mama2624·jiyn74·2sunshines 는 주제와 관련 있는 기존 글 최대 2~3개를
     본문 아래 '함께 보면 좋은 글'로. 긍정사랑(000jinjin000)은 자동으로 넣지 마."

     · 목록: tools/fetch_internal_links.py 가 공개 RSS 에서 모은 글(data/internal-links.json)
       을 realtime-trends.json 의 internalLinks 필드로 받아 BS.INTERNAL_DATA 에 둔다.
     · 매칭: 주제·키워드를 낱말로 쪼개 제목(3배)·태그(2배)·요약(1배)에 걸리는 만큼 점수를
       매기고, 낱말 2개 이상이 걸려 10점을 넘거나 네 글자 이상 낱말이 12점을 넘는 글만
       최대 3편 고른다. 걸리는 글이 없으면 빈 배열 — 억지로 넣지 않는다.
     · v2.3.1(2026-11-19 지연님 "나의 다른 블로그에 있는 내용도 내부링크 걸 수 있게 해 줘") —
       내 다른 블로그(행복한긍정씨·긍정예찬·부자닷컴·영문) 글도 같은 문턱으로 후보에 올리고,
       같은 블로그 글은 sameBoost 배 우선한다. 화면의 [내 다른 블로그 포함] 으로 끌 수 있다.
     · 긍정사랑은 BS.INTERNAL_LINKS.exclude 에 있어 여기서 바로 빈 배열이다. */
  var IL_STOP = {
    "방법": 1, "정보": 1, "확인": 1, "비교": 1, "추천": 1, "이유": 1,
    "경우": 1, "때문": 1, "우리": 1, "오늘": 1, "지금": 1, "최신": 1,
    "대한": 1, "관련": 1, "알아보기": 1, "총정리": 1, "꿀팁": 1, "노하우": 1,
    "모음": 1, "가이드": 1, "체크": 1, "포인트": 1, "이렇게": 1, "어떻게": 1,
    "무엇": 1, "하나": 1, "가지": 1, "위한": 1, "하는": 1, "대해": 1, "정도": 1,
    "정말": 1, "진짜": 1, "완전": 1
  };

  function ilTokens(s) {
    var out = [], seen = {};
    String(s || "").toLowerCase().split(/[^0-9a-z가-힣]+/).forEach(function (w) {
      if (w.length < 2 || IL_STOP[w] || seen[w]) return;
      seen[w] = 1;
      out.push(w);
    });
    return out;
  }

  /* 토큰 하나가 어디에 걸렸는지 — 제목 3점 · 태그 2점 · 요약 1점(낱말 길이만큼 가중) */
  function ilMatch(item, toks, flat) {
    var title = String(item.title || "").toLowerCase();
    var tags = (item.tags || []).join(" ").toLowerCase();
    var sum = String(item.summary || "").toLowerCase();
    var s = 0, hits = 0, longest = 0;
    toks.forEach(function (t) {
      var w = Math.min(t.length, 5), got = 0;
      if (title.indexOf(t) >= 0) got = w * 3;
      else if (tags.indexOf(t) >= 0) got = w * 2;
      else if (sum.indexOf(t) >= 0) got = w;
      if (got) {
        s += got;
        hits += 1;
        longest = Math.max(longest, t.length);
      }
    });
    if (flat && flat.length >= 4) {
      if (title.replace(/\s+/g, "").indexOf(flat) >= 0) s += 8;
      else if (tags.replace(/\s+/g, "").indexOf(flat) >= 0) s += 5;
    }
    return { score: s, hits: hits, longest: longest };
  }

  function ilScore(item, toks, flat) {
    return ilMatch(item, toks, flat).score;
  }

  function autoLinksFor(blog, topic, extra) {
    var C = BS.INTERNAL_LINKS || {};
    if (!blog || !blog.id) return [];
    if ((C.exclude || []).indexOf(blog.id) >= 0) return [];
    if ((C.targets || []).indexOf(blog.id) < 0) return [];
    var D = BS.INTERNAL_DATA || null;
    if (!D || !D.items || !D.items.length) return [];
    var toks = ilTokens(topic);
    ilTokens(extra).forEach(function (t) { if (toks.indexOf(t) < 0) toks.push(t); });
    if (!toks.length) return [];
    var flat = String(topic || "").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
    var scored = [];
    (D.items || []).forEach(function (item) {
      if (!item || item.blog !== blog.id || !item.url) return;
      var m = ilMatch(item, toks, flat);
      if (!m.score) return;
      /* 관련 있다고 보는 기준 — ① 낱말 2개 이상이 걸리고 10점 이상, 또는
         ② 한 낱말만 걸렸어도 네 글자 이상 낱말이고 12점 이상(제목·태그에서) */
      var ok = (m.hits >= 2 && m.score >= 10) || (m.hits === 1 && m.longest >= 4 && m.score >= 12);
      if (!ok) return;
      scored.push({ title: item.title, url: item.url, date: item.date || "", score: m.score });
    });
    if (!scored.length) return [];
    scored.sort(function (a, b) { return b.score - a.score || (b.date > a.date ? 1 : -1); });
    var best = scored[0].score;
    var min = Math.max(C.minScore || 10, Math.ceil(best * (C.ratio || 0.5)));
    return scored.filter(function (x) { return x.score >= min; }).slice(0, C.maxLinks || 3);
  }

  /* 🔗 내 다른 블로그 링크 (v2.3.1) — 같은 블로그 글만 고르던 v1.9.9 를 넓혔다.
     지연님 — "나의 다른 블로그에 있는 내용도 내부링크 걸 수 있게 해 줘"
     · 다른 블로그 글도 같은 관련도 문턱(minScore·낱말 2개)을 넘으면 후보에 올린다.
     · 어느 블로그 글인지 blogName 을 붙여 화면·프롬프트 목록에서 구분할 수 있게 한다.
     · 긍정사랑(000jinjin000)은 targets·exclude 에서 빠져 있어 후보에 들지 않는다. */
  function ilBlogName(id) {
    var D = BS.INTERNAL_DATA || {};
    var meta = (D.blogs || []).filter(function (b) { return b && b.id === id; })[0];
    if (meta && meta.name) return meta.name;
    var b = BS.blogById ? BS.blogById(id) : null;
    return (b && b.name) || id;
  }

  function otherBlogLinksFor(blog, topic, extra) {
    var C = BS.INTERNAL_LINKS || {};
    var O = C.otherBlogs || {};
    if (!blog || !blog.id) return [];
    if ((C.exclude || []).indexOf(blog.id) >= 0) return [];
    var D = BS.INTERNAL_DATA || null;
    if (!D || !D.items || !D.items.length) return [];
    var toks = ilTokens(topic);
    ilTokens(extra).forEach(function (t) { if (toks.indexOf(t) < 0) toks.push(t); });
    if (!toks.length) return [];
    var flat = String(topic || "").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
    var min = Math.max(12, O.minScore || 14);
    var scored = [];
    (D.items || []).forEach(function (item) {
      if (!item || !item.url) return;
      if (item.blog === blog.id) return;
      if ((C.targets || []).indexOf(item.blog) < 0) return;      // 긍정사랑 등 제외
      if ((C.exclude || []).indexOf(item.blog) >= 0) return;
      var m = ilMatch(item, toks, flat);
      if (!m.score) return;
      /* 다른 블로그 글은 같은 블로그보다 까다롭게 본다 — '11월'·'여행'처럼 흔한 낱말 두 개로
         엉뚱한 글이 올라오지 않게, 세 글자 이상 낱말이 걸리거나 세 낱말 이상 맞아야 한다. */
      var ok = (m.hits >= 2 && m.longest >= 3 && m.score >= min) ||
               (m.hits >= 3 && m.score >= min - 2) ||
               (m.hits === 1 && m.longest >= 4 && m.score >= min + 2);
      if (!ok) return;
      scored.push({ title: item.title, url: item.url, date: item.date || "", score: m.score,
                    other: true, blog: item.blog, blogName: ilBlogName(item.blog) });
    });
    if (!scored.length) return [];
    scored.sort(function (a, b) { return b.score - a.score || (b.date > a.date ? 1 : -1); });
    return scored;
  }

  /* 화면의 [내 다른 블로그 포함] 값 — 칸이 있으면 그 값, 없으면 설정 기본값(v2.3.1 켜짐) */
  function otherBlogsOn() {
    var O = (BS.INTERNAL_LINKS || {}).otherBlogs || {};
    var box = $("#internalOtherBlogs");
    if (box && typeof box.checked === "boolean") return !!box.checked;
    return !!O.enabled;
  }

  /* 같은 블로그 + 다른 블로그를 한 목록으로 (v2.3.1)
     · 같은 블로그 글은 항상 우선 — 비슷하면 sameBoost 배로 앞선다
     · 다른 블로그 최고점이 같은 블로그 최고점의 mustBeat(0.8) 이상이면 함께 올린다
       (같은 블로그 글 3편으로 자리가 다 차 있어도 한 자리를 내준다 — '막지 않는다')
     · 다른 블로그는 maxLinks(3)편까지만 */
  function mixedLinksFor(blog, topic, extra, cap) {
    var C = BS.INTERNAL_LINKS || {};
    var O = C.otherBlogs || {};
    cap = cap || C.maxLinks || 3;
    var same = autoLinksFor(blog, topic, extra);
    if (!otherBlogsOn()) return same.slice(0, cap);
    var others = otherBlogLinksFor(blog, topic, extra);
    if (!others.length) return same.slice(0, cap);
    var boost = O.sameBoost || 1.15;
    same.forEach(function (l) { l.rank = (l.score || 0) * boost; });
    others.forEach(function (l) { l.rank = l.score || 0; });
    var topOther = others[0];
    /* 같은 블로그 글이 아예 없으면 다른 블로그 글이 그대로 후보 — 큰 이슈·새 주제에서 유용.
       같은 블로그 글이 자리를 다 채웠어도 다른 블로그 글이 그 3등 점수의 mustBeat(0.7) 이상이면
       한 자리를 내준다 — '막지 않는다'. */
    var keepOther = false, sameRoom = same.length;
    if (!same.length) {
      keepOther = true;
      sameRoom = 0;
    } else if (same.length < cap) {
      keepOther = true;
    } else {
      var weakest = same[cap - 1].score || 0;
      keepOther = topOther.score >= weakest * (O.mustBeat || 0.7);
      if (keepOther) sameRoom = cap - 1;
    }
    var out = same.slice(0, sameRoom);
    if (keepOther) {
      var maxOther = O.maxLinks || 3, otherN = 0;
      for (var i = 0; i < others.length && out.length < cap && otherN < maxOther; i++) {
        out.push(others[i]);
        otherN += 1;
      }
    }
    out.sort(function (a, b) {
      return (b.rank - a.rank) || (b.score - a.score) || (b.date > a.date ? 1 : -1);
    });
    return out.slice(0, cap);
  }

  /* 화면·요청에 실제로 넘길 내부링크 — 직접 고른 것 + 같은 블로그 자동 + 내 다른 블로그 */
  function currentInternalLinks() {
    var C = BS.INTERNAL_LINKS || {};
    var cap = C.maxLinks || 3;
    var manual = state.internal.concat(parsePastedLinks());
    var off = state.internalOff || [];
    var topic = $("#topic") ? String($("#topic").value || "").trim() : "";
    var extra = $("#extraKw") ? String($("#extraKw").value || "").trim() : "";
    function unseen(l) {
      if (off.indexOf(l.url) >= 0) return false;
      return !manual.some(function (m) { return m.url === l.url; });
    }
    var mixed = mixedLinksFor(state.blog, topic, extra, cap).filter(unseen);
    return manual.concat(mixed).slice(0, cap);
  }

  function renderInternal(q) {
    var isJin = state.blog.id === "jinjin2624";
    var C = BS.INTERNAL_LINKS || {};
    var isTarget = (C.targets || []).indexOf(state.blog.id) >= 0;
    var manualUrls = state.internal.map(function (x) { return x.url; });
    var added = isTarget ? currentInternalLinks().filter(function (l) { return manualUrls.indexOf(l.url) < 0; }) : [];
    var auto = added.filter(function (l) { return !l.other; });
    var other = added.filter(function (l) { return !!l.other; });
    if (isJin) {
      $("#internalHint").textContent = "(긍정사랑은 기존 글 2~3편 필수 · " +
        (BS.INTERNAL_POSTS ? BS.INTERNAL_POSTS.length : 0) + "편 목록 · 자동 내부링크 없음)";
    } else if (isTarget && added.length) {
      var otherTotal = otherBlogsOn() ? ilOtherPoolSize(state.blog.id) : 0;
      $("#internalHint").textContent = "(이 블로그 " + ilPoolSize(state.blog.id) + "편" +
        (otherTotal ? " + 내 다른 블로그 " + otherTotal + "편" : "") + " 중 " + added.length + "편을 자동으로 넣습니다" +
        (other.length ? " — 내 다른 블로그 " + other.length + "편 포함" : "") + ")";
    } else if (isTarget) {
      var otherTotal2 = otherBlogsOn() ? ilOtherPoolSize(state.blog.id) : 0;
      $("#internalHint").textContent = "(이 블로그 " + ilPoolSize(state.blog.id) + "편" +
        (otherTotal2 ? " + 내 다른 블로그 " + otherTotal2 + "편" : "") +
        "을 모아 뒀습니다 — 주제가 겹치면 본문 아래 '함께 보면 좋은 글'로 자동으로 들어갑니다)";
    } else {
      $("#internalHint").textContent = "(선택 · 다른 글로 연결할 때)";
    }
    var res = $("#internalResults");
    var selected = state.internal.map(function (x) { return x.url; });
    var query = (q || "").trim();

    if (!isJin && !query) {
      res.innerHTML = '<div class="ir-empty">' + (isTarget
        ? (added.length
            ? "지금 주제로 " + added.length + "편이 자동 매칭됐습니다" + (other.length ? " (내 다른 블로그 " + other.length + "편 포함)" : "") +
              " — 아래 목록에서 ✕로 뺐거나, 제목을 검색해 직접 넣을 수 있습니다."
            : "주제와 겹치는 기존 글이 아직 없습니다 — 관련 글이 없으면 '함께 보면 좋은 글'은 넣지 않습니다.")
        : "긍정사랑을 고르면 기존 글 201편에서 바로 고를 수 있습니다.") + "</div>";
      renderSelected();
      return;
    }
    /* v2.3.1 — 검색은 내 다른 블로그 글까지 찾는다(칸에 그 글의 블로그 이름을 붙인다) */
    var pool = isJin
      ? (BS.INTERNAL_POSTS || []).map(function (p) { return { title: p[0], url: p[1], blog: "jinjin2624" }; })
      : ilSearchPool(state.blog.id);
    if (!query) {
      res.innerHTML = '<div class="ir-empty">제목을 검색해 넣을 글을 고르세요 (최대 3편)</div>';
      renderSelected();
      return;
    }
    var ql = query.toLowerCase();
    var hits = pool.filter(function (p) { return String(p.title || "").toLowerCase().indexOf(ql) >= 0; }).slice(0, 30);
    if (!hits.length) {
      res.innerHTML = '<div class="ir-empty">"' + esc(query) + '"가 들어간 기존 글이 없습니다.</div>';
      renderSelected();
      return;
    }
    res.innerHTML = "";
    hits.forEach(function (p) {
      var row = document.createElement("label");
      row.className = "ir-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.indexOf(p.url) >= 0;
      cb.addEventListener("change", function () {
        var idx = state.internal.findIndex(function (x) { return x.url === p.url; });
        if (cb.checked) {
          if (state.internal.length >= (C.maxLinks || 3)) { cb.checked = false; toast("내부링크는 " + (C.maxLinks || 3) + "편까지 넣습니다"); return; }
          if (idx < 0) state.internal.push({ title: p.title, url: p.url, blog: p.blog, blogName: ilBlogName(p.blog) });
        } else if (idx >= 0) {
          state.internal.splice(idx, 1);
        }
        renderSelected();
      });
      var sp = document.createElement("span");
      sp.textContent = p.title;
      if (p.blog && p.blog !== state.blog.id && (C.exclude || []).indexOf(p.blog) < 0) {
        var tag = document.createElement("i");
        tag.className = "ir-blog";
        tag.textContent = ilBlogName(p.blog);
        sp.appendChild(document.createTextNode(" "));
        sp.appendChild(tag);
      }
      row.appendChild(cb);
      row.appendChild(sp);
      res.appendChild(row);
    });
    renderSelected();
  }

  /* 검색용 목록 — 이 블로그 + (켜져 있으면) 내 다른 블로그 글. 긍정사랑은 빠진다 */
  function ilSearchPool(blogId) {
    var C = BS.INTERNAL_LINKS || {};
    var D = BS.INTERNAL_DATA || {};
    var withOther = otherBlogsOn();
    return (D.items || []).filter(function (it) {
      if (!it || !it.url || !it.title) return false;
      if ((C.exclude || []).indexOf(it.blog) >= 0) return false;
      if ((C.targets || []).indexOf(it.blog) < 0) return false;
      return it.blog === blogId || withOther;
    });
  }

  function ilPoolSize(blogId) {
    var D = BS.INTERNAL_DATA || {};
    return (D.items || []).filter(function (i) { return i && i.blog === blogId; }).length;
  }
  /* 내 다른 블로그 글 수 (v2.3.1) — 이 블로그·긍정사랑은 뺀 targets 글 */
  function ilOtherPoolSize(blogId) {
    var C = BS.INTERNAL_LINKS || {};
    var D = BS.INTERNAL_DATA || {};
    return (D.items || []).filter(function (i) {
      if (!i || !i.blog || i.blog === blogId) return false;
      if ((C.exclude || []).indexOf(i.blog) >= 0) return false;
      return (C.targets || []).indexOf(i.blog) >= 0;
    }).length;
  }

  function renderSelected() {
    var box = $("#internalSelected");
    box.innerHTML = "";
    var links = currentInternalLinks();
    links.forEach(function (l) {
      var manual = state.internal.some(function (m) { return m.url === l.url; });
      var manualOther = manual && l.blog && l.blog !== state.blog.id;
      var d = document.createElement("div");
      d.className = "sel-link" + (manual ? (manualOther ? " manual-other" : "") : (l.other ? " auto other" : " auto"));
      d.title = l.url + ((l.other || manualOther) && (l.blogName || l.blog) ? " · " + (l.blogName || ilBlogName(l.blog)) : "");
      var tag = "";
      if (manualOther) tag = '<i class="sel-auto">' + esc(l.blogName || ilBlogName(l.blog)) + "</i>";
      else if (!manual) tag = '<i class="sel-auto">' + (l.other ? esc(l.blogName || "다른 블로그") : "자동") + "</i>";
      d.innerHTML = tag + "<span>" + esc(l.title) + "</span>";
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.title = manual ? "빼기" : "이번 글에서 빼기";
      x.addEventListener("click", function () {
        if (manual) {
          var idx = state.internal.findIndex(function (m) { return m.url === l.url; });
          if (idx >= 0) state.internal.splice(idx, 1);
        } else {
          state.internalOff.push(l.url);   // 지연님이 뺀 자동 링크는 다시 넣지 않는다
        }
        renderSelected();
        renderInternal($("#internalSearch").value);
      });
      d.appendChild(x);
      box.appendChild(d);
    });
  }
  function parsePastedLinks() {
    var raw = $("#internalPaste").value || "";
    var out = [];
    raw.split(/\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var m = line.match(/^(.*?)\s*[|,\t]\s*(https?:\/\/\S+)$/);
      if (m) out.push({ title: m[1].trim(), url: m[2].trim() });
      else {
        var u = line.match(/(https?:\/\/\S+)/);
        if (u) out.push({ title: line.replace(u[1], "").replace(/[|,\t]/g, "").trim() || u[1], url: u[1] });
      }
    });
    return out;
  }

  /* ============================================================
     ⚠️ 기발행 주제 중복 경고 (v2.0.0 · 2026-11-18)

     공개 RSS(data/internal-links.json · realtime-trends.json 의 internalLinks)에
     모인 기존 글과 지금 넣은 글감이 겹치는지 본다. 막지 않고 알린다 —
     다른 각도·후속편으로 비틀면 같은 주제도 다른 글이 된다.
     긍정사랑은 수집 대상이 아니므로 자동으로 빠진다(BS.DUP.exclude).
     ============================================================ */
  var DUP_RE = null;

  function dupAssets() {
    var D = BS.INTERNAL_DATA || null;
    if (!D || !(D.items || []).length) return [];
    return D.items;
  }

  function dupBlogName(id) {
    var D = BS.INTERNAL_DATA || {};
    var meta = (D.blogs || []).filter(function (b) { return b && b.id === id; })[0];
    if (meta && meta.name) return meta.name;
    var b = BS.blogById(id);
    return b ? b.name : id;
  }

  /* 주제·추가 키워드로 기존 발행글과 겹치는 것 찾기 — 점수·비율은 BS.DUP */
  function dupList(topic, extra, blogId) {
    var cfg = BS.DUP || {};
    var items = dupAssets();
    var t = String(topic == null ? "" : topic).trim();
    if (!items.length || !t) return [];
    var toks = ilTokens(t);
    ilTokens(extra).forEach(function (x) { if (toks.indexOf(x) < 0) toks.push(x); });
    if (!toks.length) return [];
    var flat = t.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
    var scored = [];
    items.forEach(function (item) {
      if (!item || !item.url || !item.title) return;
      if ((cfg.exclude || []).indexOf(item.blog) >= 0) return;   // 긍정사랑 등 제외
      var m = ilMatch(item, toks, flat);
      if (!m.score) return;
      var ok = (m.hits >= (cfg.minHits || 2) && m.score >= (cfg.minScore || 12)) ||
               (m.hits === 1 && m.longest >= 4 && m.score >= (cfg.singleMinScore || 16));
      if (!ok) return;
      scored.push({
        blog: item.blog,
        blogName: dupBlogName(item.blog),
        same: !!blogId && item.blog === blogId,
        title: item.title,
        url: item.url,
        date: item.date || "",
        score: m.score,
        hits: m.hits
      });
    });
    if (!scored.length) return [];
    scored.sort(function (a, b) {
      if (a.same !== b.same) return a.same ? -1 : 1;          // 같은 블로그 글을 먼저 (중복 위험이 가장 크다)
      return b.score - a.score || (b.date > a.date ? 1 : -1);
    });
    var best = scored[0].score;
    var min = Math.max(cfg.minScore || 12, Math.ceil(best * (cfg.ratio || 0.6)));
    return scored.filter(function (x) { return x.score >= min; }).slice(0, cfg.maxShow || 3);
  }

  function renderDupWarn() {
    var box = $("#dupWarn");
    if (!box) return;
    var cfg = BS.DUP || {};
    var topic = $("#topic") ? String($("#topic").value || "").trim() : "";
    var extra = $("#extraKw") ? String($("#extraKw").value || "").trim() : "";
    if (!topic || topic.length < 2 || state.dupOffTopic === topic || !dupAssets().length) {
      show(box, false);
      box.className = "dup-warn";
      return;
    }
    var hits = dupList(topic, extra, state.blog.id);
    show(box, true);
    if (!hits.length) {
      box.className = "dup-warn clean";
      box.innerHTML = '<div class="dw-head">✅ ' + esc(cfg.noneNote || "기존 글과 겹치는 주제가 없습니다") + '</div>' +
        '<div class="dw-sub">' + esc(cfg.note || "") + '</div>';
      return;
    }
    box.className = "dup-warn";
    var anySame = hits.some(function (h) { return h.same; });
    var lines = hits.map(function (h) {
      return '<li><a href="' + esc(h.url) + '" target="_blank" rel="noopener">' + esc(h.title) + '</a>' +
        '<span class="dw-blog">' + esc(h.blogName) + (h.same ? " · 이 블로그" : "") + (h.date ? " · " + esc(h.date) : "") + '</span></li>';
    }).join("");
    box.innerHTML =
      '<div class="dw-head">⚠️ ' + esc(cfg.title || "이미 발행한 글과 주제가 겹칩니다") + " — " + hits.length + '편</div>' +
      '<div class="dw-sub">' + esc(anySame ? (cfg.sameBlogAdvice || "") : (cfg.otherBlogAdvice || "")) + '</div>' +
      '<ul>' + lines + '</ul>' +
      '<div class="dw-act">' +
        '<button type="button" class="btn small ghost" data-dup="guide">🧭 다른 각도 보기</button>' +
        '<button type="button" class="btn small ghost" data-dup="keep">그래도 이 주제로 쓰기</button>' +
      '</div>';
    var g = box.querySelector('[data-dup="guide"]');
    if (g && g.addEventListener) g.addEventListener("click", function () { runGuide(); });
    var k = box.querySelector('[data-dup="keep"]');
    if (k && k.addEventListener) k.addEventListener("click", function () {
      state.dupOffTopic = topic;
      show(box, false);
      toast("이 주제는 중복 경고를 접었습니다 — 다른 각도로 비틀어 보세요");
    });
  }

  /* ============================================================
     🧭 블로그·가지글 길잡이 (v2.0.0)
     ① 규칙 기반 폴백 — API 키가 없거나 호출이 실패해도 바로 답을 준다
     ② AI 길잡이 — BS.prompts.guidePrompt 로 6곳 중 메인 1곳 + 키워드·예시 제목
     ============================================================ */
  function guideBigIssue(topic, extra) {
    var G = BS.GUIDE || {};
    var t = String(topic || "") + " " + String(extra || "");
    var kws = (G.bigIssue && G.bigIssue.keywords) || [];
    for (var i = 0; i < kws.length; i++) if (t.indexOf(kws[i]) >= 0) return kws[i];
    return "";
  }

  function guideScored(topic, extra) {
    var t = (String(topic || "") + " " + String(extra || "")).toLowerCase();
    return ((BS.GUIDE || {}).blogs || []).map(function (b) {
      var hits = [];
      (b.keywords || []).forEach(function (k) {
        if (t.indexOf(String(k).toLowerCase()) >= 0 && hits.indexOf(k) < 0) hits.push(k);
      });
      var score = hits.reduce(function (s, k) { return s + Math.min(String(k).length, 5); }, 0);
      return { id: b.id, name: b.name, emoji: b.emoji, hits: hits, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* 규칙 기반 예시 제목 — AI를 못 쓸 때의 초안(각도·금지어만 지킨다) */
  function guideTitleDrafts(topic) {
    var s = String(topic || "").trim();
    if (!s) return [];
    return [
      { title: s + " 그냥 넘기면 3만 원 더 내는 이유", angle: "①", filter: "[필터: ③ = 1개 통과]" },
      { title: s + " 많이 할수록 손해인 이유", angle: "③", filter: "[필터: ①③ = 2개 통과]" },
      { title: s + " 3번 해보고 남은 결론", angle: "⑦", filter: "[필터: ③⑦ = 2개 통과]" }
    ];
  }

  function guideFallback(topic, extra) {
    var G = BS.GUIDE || {};
    var scored = guideScored(topic, extra);
    var main = scored[0] || { id: "mama2624", name: "생활픽스", emoji: "🏠", hits: [], score: 0 };
    var bigHit = guideBigIssue(topic, extra);
    var branches = [];
    if (bigHit) {
      branches = scored.slice(1).filter(function (s) { return s.hits.length && s.id !== main.id; })
        .slice(0, G.maxBranches || 2).map(function (s) {
          var b = (G.blogs || []).filter(function (x) { return x.id === s.id; })[0] || {};
          return {
            id: s.id, name: s.name, emoji: s.emoji,
            keyword: s.hits[0] || topic,
            angle: b.angle || "",
            title: (s.hits[0] || topic) + " 조건부터 확인해야 하는 이유"
          };
        });
    }
    return {
      source: "rule",
      mainId: main.id, mainName: main.name, mainEmoji: main.emoji,
      why: (main.hits.length
        ? "이 글감은 '" + main.hits.join("·") + "' 쪽이라 " + main.name + "이(가) 가장 맞습니다."
        : "맞는 낱말을 찾지 못해 기본 블로그로 잡았습니다 — 주제를 더 구체적으로 적으면 정확해집니다.") +
        " 평소에는 1블로그 1메인으로 씁니다.",
      keywords: main.hits.length ? main.hits.slice(0, G.maxKeywords || 5) : [String(topic || "").trim()],
      titles: guideTitleDrafts(topic),
      branches: branches,
      avoid: [],
      dupNote: "",
      bigIssue: !!bigHit,
      bigHit: bigHit,
      raw: ""
    };
  }

  function parseGuide(text) {
    var G = BS.GUIDE || {};
    var md = String(text || "").replace(/\r/g, "").trim();
    var secs = splitSections(md).secs;
    function sec(names) { return pickSection(secs, names); }
    var out = { source: "ai", mainId: "", mainName: "", mainEmoji: "", why: "", keywords: [], titles: [], branches: [], avoid: [], dupNote: "", raw: md };
    var msec = sec(["메인블로그", "메인 블로그"]);
    if (msec) {
      msec.body.forEach(function (l) {
        var t = String(l).replace(/\*\*/g, "").trim().replace(/^[-*•]\s+/, "");
        var m;
        if ((m = /^블로그\s*[:：]\s*(.+)$/.exec(t))) {
          var v = m[1].trim();
          var idm = /\(([a-zA-Z0-9_]+)\)\s*$/.exec(v);
          if (idm) out.mainId = idm[1];
          out.mainName = v.replace(/\s*\([^)]*\)\s*$/, "").replace(/^[^0-9A-Za-z가-힣]+/, "").trim();
        } else if ((m = /^왜\s*이\s*블로그인가\s*[:：]?\s*(.*)$/.exec(t))) {
          out.why = m[1].trim();
        }
        if (!out.why && /^왜\b/.test(t)) out.why = t.replace(/^왜[^:：]*[:：]?\s*/, "").trim();
      });
      if (!out.why) {
        out.why = msec.body.map(function (l) { return String(l).trim(); })
          .filter(function (l) { return l && !/^[-*•]?\s*블로그\s*[:：]/.test(l); }).slice(0, 2).join(" ");
      }
    }
    var ksec = sec(["추천키워드", "추천 키워드"]);
    if (ksec) {
      ksec.body.forEach(function (l) {
        String(l).split(/\s*[/,·]\s*/).forEach(function (w) {
          var x = w.replace(/^[-*•\d).\s]+/, "").replace(/\*\*/g, "").trim();
          if (x && x.length <= 24 && out.keywords.indexOf(x) < 0) out.keywords.push(x);
        });
      });
      out.keywords = out.keywords.slice(0, G.maxKeywords || 5);
    }
    var tsec = sec(["예시제목", "예시 제목"]);
    if (tsec) {
      tsec.body.forEach(function (l) {
        var t = String(l).trim().replace(/\*\*/g, "");
        var m = /^(?:[-*•]|\d+[).])\s*(.+)$/.exec(t);
        if (!m) return;
        var body = m[1].trim();
        var f = /\[\s*필터[^\]]*\]/.exec(body);
        var title = body.replace(/\[\s*필터[^\]]*\]\s*$/i, "").trim();
        if (title.length > 4) out.titles.push({ title: title, filter: f ? f[0] : "" });
      });
    }
    var bsec = sec(["가지글"]);
    if (bsec) {
      bsec.body.forEach(function (l) {
        var t = String(l).replace(/\*\*/g, "").trim();
        var m = /^(?:[-*•]|\d+[).])\s*(.+)$/.exec(t);
        if (!m) return;
        var s = m[1].trim();
        if (/^없음/.test(s)) return;
        var name = s.split(/\s*[—-]\s*/)[0].trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
        var kw = /검색어\s*[:：]\s*([^/]+)/.exec(s);
        var ang = /각도\s*[:：]\s*([^/]+)/.exec(s);
        var tit = /예시\s*제목\s*[:：]\s*(.+)$/.exec(s);
        var title = tit ? tit[1].replace(/\[\s*필터[^\]]*\]\s*$/i, "").trim() : "";
        if (name) out.branches.push({ name: name, keyword: kw ? kw[1].trim() : "", angle: ang ? ang[1].trim() : "", title: title });
      });
      out.branches = out.branches.slice(0, G.maxBranches || 2);
    }
    var asec = sec(["피해야할블로그", "피해야 할 블로그"]);
    if (asec) {
      asec.body.forEach(function (l) {
        var t = String(l).replace(/\*\*/g, "").trim().replace(/^[-*•]\s+/, "");
        if (t && !/^없음/.test(t)) out.avoid.push(t);
      });
    }
    var dsec = sec(["중복주의", "중복 주의"]);
    if (dsec) {
      out.dupNote = dsec.body.map(function (l) { return String(l).trim().replace(/^[-*•]\s+/, ""); })
        .filter(function (l) { return l && !/^없음/.test(l); }).join(" ");
    }
    if (!out.mainName) return null;
    if (!out.keywords.length) out.keywords = [];
    return out;
  }

  function guideBlogFor(name, id) {
    var list = BS.BLOGS || [];
    var i;
    if (id) { var byId = BS.blogById(id); if (byId) return byId; }
    var n = String(name || "").replace(/\s+/g, "").toLowerCase();
    for (i = 0; i < list.length; i++) {
      if (String(list[i].name).replace(/\s+/g, "").toLowerCase() === n) return list[i];
      if (String(list[i].account).replace(/\s+/g, "").toLowerCase() === n) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      var ln = String(list[i].name).replace(/\s+/g, "").toLowerCase();
      if (n && (ln.indexOf(n) >= 0 || n.indexOf(ln) >= 0)) return list[i];
    }
    return null;
  }

  function guideEmoji(name, id) {
    var b = guideBlogFor(name, id);
    return b ? b.emoji : "📝";
  }

  function guideAllText(g) {
    if (!g) return "";
    var L = [];
    L.push("【메인 블로그】 " + (g.mainName || "") + (g.mainId ? " (" + g.mainId + ")" : ""));
    if (g.why) L.push(g.why);
    if ((g.keywords || []).length) L.push("추천 키워드: " + g.keywords.join(" / "));
    if ((g.titles || []).length) {
      L.push("예시 제목:");
      g.titles.forEach(function (t, i) { L.push(" " + (i + 1) + ") " + t.title + (t.filter ? " " + t.filter : "")); });
    }
    if ((g.branches || []).length) {
      L.push("【가지글】");
      g.branches.forEach(function (b, i) {
        L.push(" " + (i + 1) + ") " + b.name + (b.keyword ? " — 검색어: " + b.keyword : "") +
          (b.angle ? " / 각도: " + b.angle : "") + (b.title ? " / 예시 제목: " + b.title : ""));
      });
    } else {
      L.push("【가지글】 없음 — 1블로그 1메인으로 진행");
    }
    if ((g.avoid || []).length) L.push("【피해야 할 블로그】 " + g.avoid.join(" / "));
    if (g.dupNote) L.push("【중복 주의】 " + g.dupNote);
    return L.join("\n");
  }

  function renderGuide() {
    var box = $("#guideResult");
    var hint = $("#guideHint");
    if (!box) return;
    var g = state.guide;
    if (!g) { show(box, false); return; }
    var mainBlog = guideBlogFor(g.mainName, g.mainId);
    var html = [];
    html.push('<div class="gr-card main">');
    html.push('<div class="gr-top"><span class="gr-name">' + esc(g.mainEmoji || guideEmoji(g.mainName, g.mainId)) + " " + esc(g.mainName) + '</span>' +
      '<span class="gr-badge">메인 블로그</span>' +
      (mainBlog ? '<span class="gr-badge" style="background:#f2ede6;color:#5b554e">' + esc(mainBlog.id) + '</span>' : "") + "</div>");
    if (g.why) html.push('<p class="gr-why">' + esc(g.why) + '</p>');
    if ((g.keywords || []).length) {
      html.push('<div class="gr-lab">추천 키워드 — 누르면 주제칸에 들어갑니다</div><div class="gr-kw">' +
        g.keywords.map(function (k) { return '<button type="button" data-kw="' + esc(k) + '">' + esc(k) + '</button>'; }).join("") + '</div>');
    }
    if ((g.titles || []).length) {
      html.push('<div class="gr-lab">예시 제목 (v1.9.7 7각도·필터 기준)</div>');
      g.titles.forEach(function (t, i) {
        html.push('<p class="gr-title">' + (i + 1) + ") " + esc(t.title) + (t.filter ? '<span class="gr-filter">' + esc(t.filter) + '</span>' : "") + '</p>');
      });
    }
    html.push('<div class="gr-act"><button type="button" class="btn small primary" data-apply="main">이 블로그로 쓰기</button>' +
      (g.titles && g.titles[0] ? '<button type="button" class="btn small ghost" data-title="0">1번 제목 참고로 넣기</button>' : "") + '</div>');
    html.push('</div>');

    (g.branches || []).forEach(function (b, i) {
      html.push('<div class="gr-card">');
      html.push('<div class="gr-top"><span class="gr-name">' + esc(b.emoji || guideEmoji(b.name)) + " " + esc(b.name) + '</span><span class="gr-badge branch">가지글</span></div>');
      if (b.keyword) html.push('<p class="gr-why"><b>검색어</b> ' + esc(b.keyword) + (b.angle ? ' · <b>각도</b> ' + esc(b.angle) : "") + '</p>');
      if (b.title) html.push('<p class="gr-title">' + esc(b.title) + '</p>');
      html.push('<div class="gr-act"><button type="button" class="btn small ghost" data-apply="branch" data-i="' + i + '">이 블로그로 가지글 쓰기</button></div>');
      html.push('</div>');
    });

    if ((g.avoid || []).length) {
      html.push('<div class="gr-card"><div class="gr-top"><span class="gr-name">🚫 피해야 할 블로그</span></div>' +
        g.avoid.map(function (a) { return '<p class="gr-why">' + esc(a) + '</p>'; }).join("") + '</div>');
    }
    if (g.dupNote) {
      html.push('<div class="gr-card"><div class="gr-top"><span class="gr-name">⚠️ 중복 주의</span></div><p class="gr-why">' + esc(g.dupNote) + '</p></div>');
    }
    html.push('<p class="gr-note">' + esc((BS.GUIDE || {}).applyNote || "") +
      (g.source === "rule" ? " · 이번 결과는 규칙 기반 초안입니다 — API 키를 넣고 다시 누르면 예시 제목까지 다듬어 줍니다." : "") + '</p>');
    html.push('<div class="gr-act"><button type="button" class="btn small ghost" id="btnCopyGuide">📋 길잡이 결과 복사</button></div>');
    box.innerHTML = html.join("");
    show(box, true);
    if (hint) hint.textContent = g.source === "rule" ? "규칙 기반 결과" : "AI 길잡이 결과";

    Array.prototype.slice.call(box.querySelectorAll("[data-kw]")).forEach(function (b) {
      b.addEventListener("click", function () {
        var t = $("#topic");
        t.value = b.getAttribute("data-kw");
        renderDupWarn();
        toast('"' + t.value + '" 를 주제칸에 넣었습니다');
      });
    });
    Array.prototype.slice.call(box.querySelectorAll("[data-apply]")).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("data-apply") === "main") {
          applyGuide(g.mainId, g.mainName, (g.keywords && g.keywords[0]) || "", (g.titles && g.titles[0] && g.titles[0].title) || "");
        } else {
          var br = (g.branches || [])[+b.getAttribute("data-i")];
          if (br) applyGuide("", br.name, br.keyword || "", br.title || "");
        }
      });
    });
    Array.prototype.slice.call(box.querySelectorAll("[data-title]")).forEach(function (b) {
      b.addEventListener("click", function () {
        var t = (g.titles || [])[+b.getAttribute("data-title")];
        if (!t) return;
        var n = $("#notes");
        var line = "길잡이 예시 제목 참고: " + t.title;
        n.value = (n.value.indexOf(line) >= 0) ? n.value : ((n.value.trim() ? n.value.trim() + "\n" : "") + line);
        toast("제목을 '지연님 요청사항'에 넣었습니다 — 원고 제목 후보에 반영됩니다");
      });
    });
    var cp = $("#btnCopyGuide");
    if (cp) cp.addEventListener("click", function () {
      copyPlain(guideAllText(g)).then(function (ok) {
        toast(ok ? "길잡이 결과를 복사했습니다 — 카톡·메모에 붙여 두세요" : "복사 실패");
      });
    });
  }

  function applyGuide(id, name, keyword, title) {
    var b = guideBlogFor(name, id);
    if (!b) { toast("그 블로그 카드를 찾지 못했습니다 — 목록에서 직접 골라 주세요"); return; }
    state.blog = b;
    state.internal = [];
    state.internalOff = [];
    state.kwSel = null;
    renderBlogs();
    syncPersona();   // 🎭 길잡이가 고른 블로그 기준 페르소나 (v2.2.0)
    renderChips();
    renderInternal();
    setBlogHint(b);
    rtFollowBlog(b.id);
    if (keyword) { $("#topic").value = keyword; }
    if (title) {
      var n = $("#notes");
      var line = "길잡이 예시 제목 참고: " + title;
      if (n.value.indexOf(line) < 0) n.value = (n.value.trim() ? n.value.trim() + "\n" : "") + line;
    }
    renderDupWarn();
    if ($("#stepTopic") && $("#stepTopic").scrollIntoView) {
      try { $("#stepTopic").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }
    toast(b.name + " 카드로 바꿨습니다" + (keyword ? " — 주제도 '" + keyword + "'로" : ""));
  }

  function runGuide() {
    if (state.busy) { toast("지금 다른 작업이 돌고 있습니다 — 끝나면 다시 눌러 주세요"); return; }
    var topic = $("#topic") ? String($("#topic").value || "").trim() : "";
    if (!topic) { toast("길잡이를 쓰려면 글감을 먼저 넣어 주세요"); $("#topic").focus(); return; }
    var extra = $("#extraKw") ? String($("#extraKw").value || "").trim() : "";
    var bigHit = guideBigIssue(topic, extra);
    var dups = dupList(topic, extra, state.blog.id);
    var key = getKey();
    if (!key) {
      state.guide = guideFallback(topic, extra);
      renderGuide();
      toast("API 키가 없어 규칙 기반으로 안내했습니다 — 설정에서 키를 넣으면 예시 제목까지 다듬어 줍니다", 4200);
      return;
    }
    var req = BS.prompts.guidePrompt({
      topic: topic, extraKeywords: extra,
      notes: $("#notes") ? String($("#notes").value || "").trim() : "",
      bigIssue: !!bigHit, bigHit: bigHit, duplicates: dups
    });
    runScriptJob({
      req: req,
      label: "🧭 길잡이: 메인 블로그와 예시 제목을 고르는 중…",
      statusEl: $("#guideHint"),
      buttons: [$("#btnGuide")],
      gen: { temperature: 0.55, topP: 0.95 },
      apply: function (text) {
        var g = parseGuide(text);
        if (!g) { toast("길잡이 응답을 읽지 못했습니다 — 다시 눌러 주세요"); return false; }
        state.guide = g;
        renderGuide();
        return true;
      },
      /* AI를 못 쓰면 규칙 기반으로라도 답을 준다 — 버튼이 빈손으로 끝나지 않게 (v2.0.0) */
      fallback: function () {
        state.guide = guideFallback(topic, extra);
        renderGuide();
        toast("AI 길잡이를 못 불러 규칙 기반으로 안내했습니다 (키·한도를 확인해 주세요)", 4600);
      },
      retry: runGuide
    });
  }

  /* ============================================================
     🪙🌙 구글 블로거 결과 읽기·그리기 (v2.0.0)
     · 한국어: ## 제목 후보 / ## 최종 추천 제목 / ## SEO 메타 / ## 블로거 본문 HTML / ## 작업 메모
     · 영문: ### PART 1~4 (크리 님 원본 지침 v3)
     ============================================================ */
  function htmlBlockText(md) {
    var m = /```html\s*([\s\S]*?)```/i.exec(String(md || ""));
    if (m) return m[1].trim();
    return "";
  }

  function stripHtmlText(html) {
    return String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  }

  function parseSeoMeta(txt) {
    var out = { title: "", permalink: "", desc: "", labels: "", image1: "", image2: "", raw: String(txt || "").trim() };
    String(txt || "").split("\n").forEach(function (line) {
      var l = String(line).replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim();
      var m;
      if ((m = /^(?:SEO\s*제목|SEO\s*Title)\s*(?:\([^)]*\))?\s*[:：]\s*(.+)$/i.exec(l))) out.title = m[1].trim();
      else if ((m = /^Permalink\s*(?:\([^)]*\))?\s*[:：]\s*(.+)$/i.exec(l))) out.permalink = m[1].trim();
      else if ((m = /^(?:Search\s*Description|메타\s*디스크립션)\s*(?:\([^)]*\))?\s*[:：]\s*(.+)$/i.exec(l))) out.desc = m[1].trim();
      else if ((m = /^(?:Labels|라벨|태그)\s*(?:\([^)]*\))?\s*[:：]\s*(.+)$/i.exec(l))) out.labels = m[1].trim();
      else if ((m = /^Image\s*1\b.*?[:：]\s*(.*)$/i.exec(l))) out.image1 = m[1].trim();
      else if ((m = /^Image\s*2\b.*?[:：]\s*(.*)$/i.exec(l))) out.image2 = m[1].trim();
    });
    return out;
  }

  function parseBloggerResult(text, blog) {
    var lang = (blog && blog.lang) === "en" ? "en" : "ko";
    var md = String(text == null ? "" : text).replace(/\r/g, "").trim();
    var res = { md: md, sections: [], titles: [], rec: "", title: "", bodyChars: 0, blogger: null };
    if (lang === "ko") {
      var parsed = splitSections(md);
      res.sections = parsed.secs || [];
      var secSeo = pickSection(res.sections, ["SEO메타", "SEO 메타"]);
      var secHtml = pickSection(res.sections, ["블로거본문HTML", "블로거 본문 HTML", "블로거본문"]);
      var html = htmlBlockText(md);
      if (!html && secHtml) html = secHtml.body.join("\n");
      html = String(html).replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "").trim();
      var seo = parseSeoMeta(secSeo ? secSeo.body.join("\n") : md);
      res.titles = parseTitles(pickSection(res.sections, ["제목후보", "제목 후보"]), 7);
      res.rec = parseRecommendedTitle(pickSection(res.sections, ["최종추천제목", "최종 추천 제목"]));
      res.title = res.rec || res.titles[0] || seo.title || "";
      var ccKo = charCount(stripHtmlText(html));
      res.bodyChars = ccKo.noSpace;
      res.withSpace = ccKo.withSpace;
      res.blogger = { lang: lang, seo: seo, html: html, parts: [], bodyChars: res.bodyChars, withSpace: res.withSpace };
    } else {
      var parts = [];
      var re = /^###\s*PART\s*([1-4])\s*[.:]?\s*(.*)$/gm;
      var marks = [];
      var mm;
      while ((mm = re.exec(md)) !== null) marks.push({ no: mm[1], title: (mm[2] || "").trim(), at: mm.index, end: re.lastIndex });
      marks.forEach(function (p, i) {
        var body = md.slice(p.end, i + 1 < marks.length ? marks[i + 1].at : md.length).trim();
        parts.push({ no: p.no, title: p.title, body: body });
      });
      var p1 = parts.filter(function (p) { return p.no === "1"; })[0];
      var p2 = parts.filter(function (p) { return p.no === "2"; })[0];
      var seo2 = parseSeoMeta(p1 ? p1.body : md);
      var html2 = p2 ? htmlBlockText(p2.body) : htmlBlockText(md);
      if (!html2 && p2) html2 = p2.body.replace(/^```[a-z]*/i, "").replace(/```$/, "").trim();
      res.sections = parts.map(function (p) { return { h: "PART " + p.no + " " + p.title, body: p.body.split("\n") }; });
      res.title = seo2.title || "";
      var ccEn = charCount(stripHtmlText(html2));
      res.bodyChars = ccEn.noSpace;
      res.withSpace = ccEn.withSpace;
      res.blogger = { lang: lang, seo: seo2, html: html2, parts: parts, bodyChars: res.bodyChars, withSpace: res.withSpace };
    }
    return res;
  }

  function bloggerMetaText(b) {
    var seo = (b && b.seo) || {};
    var L = [];
    L.push("SEO 제목: " + (seo.title || ""));
    L.push("Permalink: " + (seo.permalink || ""));
    L.push("Search Description: " + (seo.desc || ""));
    L.push("Labels: " + (seo.labels || ""));
    if (seo.image1) L.push("Image 1: " + seo.image1);
    if (seo.image2) L.push("Image 2: " + seo.image2);
    return L.join("\n");
  }

  function renderBlogger() {
    var r = state.result;
    var b = r && r.blogger;
    var panel = $("#bloggerPanel");
    if (!panel) return;
    if (!b) { show(panel, false); return; }
    var isEn = b.lang === "en";
    var blog = BS.blogById(r.blogId) || state.blog;
    var seo = b.seo || {};
    show(panel, true);
    $("#bloggerTitle").textContent = (blog && blog.emoji ? blog.emoji + " " : "") + (blog ? blog.name : "구글 블로거") + " 원고";
    $("#bloggerTag").textContent = isEn ? "EN · Blogger HTML" : "한국어 · Blogger HTML";
    $("#bloggerDesc").textContent = isEn
      ? "PART 2의 순수 본문 HTML을 블로거 HTML 보기에 그대로 붙여넣으세요. PART 1은 글 설정(제목·permalink·설명·라벨)에, PART 3은 인스타에 씁니다."
      : "'Blogger 본문 HTML 복사'를 누르고 블로거 글쓰기 화면의 HTML 보기에 붙여넣으세요. 메타 정보는 글 설정의 제목·검색 설명·라벨에 넣습니다.";
    var open = $("#bloggerOpen");
    if (open) open.href = (blog && blog.url) || "https://sub.gold-queen.com/";

    var meta = [];
    function item(k, v, wide) {
      if (!v) return "";
      return '<div class="bm-item' + (wide ? " wide" : "") + '"><div class="bm-k">' + esc(k) + '</div><div class="bm-v">' + esc(v) + '</div></div>';
    }
    meta.push(item(isEn ? "SEO Title" : "SEO 제목", seo.title));
    meta.push(item("Permalink", seo.permalink));
    meta.push(item("Search Description", seo.desc, true));
    meta.push(item("Labels", seo.labels, true));
    if (isEn) {
      meta.push(item("Image 1", seo.image1, true));
      meta.push(item("Image 2", seo.image2, true));
    }
    meta.push(item(isEn ? "본문 단어 수(HTML 제외)" : "본문 글자 수(HTML 제외)", isEn ? (Math.round(b.bodyChars / 5) + " words (영문 추정)") : (b.bodyChars.toLocaleString() + "자")));
    $("#bloggerMeta").innerHTML = meta.join("");
    if ($("#charCount")) {
      $("#charCount").textContent = isEn
        ? "본문 " + Math.round(b.bodyChars / 5) + " words (HTML 제외 · 추정)"
        : "본문 " + b.bodyChars.toLocaleString() + "자 (HTML 제외)";
    }

    var prev = $("#bloggerPreview");
    if (b.html) {
      prev.innerHTML = b.html;
      show(prev, true);
    } else {
      prev.innerHTML = '<p style="color:#a8402a">본문 HTML을 읽지 못했습니다 — 아래 원문에서 확인해 주세요.</p>';
      show(prev, true);
    }

    /* 영문은 PART 1·3·4를 복사할 수 있게 그대로 보여 준다 */
    var partsBox = $("#bloggerParts");
    if (isEn && (b.parts || []).length) {
      partsBox.innerHTML = b.parts.filter(function (p) { return p.no !== "2"; }).map(function (p, i) {
        return '<div class="bg-part"><div class="bp-head"><strong>PART ' + esc(p.no) + '. ' + esc(p.title) + '</strong>' +
          '<button type="button" class="btn small ghost" data-part="' + esc(p.no) + '">복사</button></div>' +
          '<pre>' + esc(p.body) + '</pre></div>';
      }).join("") +
      '<details class="more"><summary>PART 2 HTML 원문 보기</summary><div class="more-body"><pre>' + esc(b.html) + '</pre></div></details>';
      Array.prototype.slice.call(partsBox.querySelectorAll("[data-part]")).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var no = btn.getAttribute("data-part");
          var p = (b.parts || []).filter(function (x) { return x.no === no; })[0];
          if (!p) return;
          copyPlain(p.body).then(function (ok) { toast(ok ? "PART " + no + "을 복사했습니다" : "복사 실패"); });
        });
      });
    } else {
      partsBox.innerHTML = '<details class="more"><summary>본문 HTML 원문 보기</summary><div class="more-body"><pre>' + esc(b.html || "") + '</pre></div></details>';
    }
  }

  /* ============================================================
     ⚡ 원소스 멀티유즈 (v2.0.0 → v2.2.2 연출표) — 원고 1편 → 스레드 훅·첫 댓글 + 클립 20초 연출표
     ============================================================ */
  function parseMultiUse(text) {
    var md = String(text || "").replace(/\r/g, "").trim();
    var secs = splitSections(md).secs;
    var out = { hook: "", firstComment: [], clip: [], hashtags: "", productPick: "", raw: md };
    var s1 = pickSection(secs, ["스레드"]);
    if (s1) {
      var inComment = false;
      s1.body.forEach(function (l) {
        var t = String(l).replace(/\*\*/g, "").trim().replace(/^[-*•]\s+/, "");
        var m;
        if ((m = /^훅\s*[:：]\s*(.+)$/.exec(t))) { out.hook = m[1].trim(); inComment = false; return; }
        if ((m = /^첫\s*댓글\s*[:：]\s*(.*)$/.exec(t))) {
          inComment = true;
          if (m[1].trim()) out.firstComment.push(m[1].trim());
          return;
        }
        if (inComment && t && !/^[-*•]$/.test(t)) out.firstComment.push(t);
      });
    }
    var s2 = pickSection(secs, ["클립 20초 연출표", "클립", "클립20초자막", "클립 20초 자막"]);
    if (s2) {
      s2.body.forEach(function (l) {
        var t = String(l).replace(/\*\*/g, "").trim().replace(/^[-*•]\s+/, "");
        var m;
        if ((m = /^상품\s*선정\s*[:：]\s*(.+)$/.exec(t))) out.productPick = m[1].trim();
        else if ((m = /^(\d+)[).]\s*(?:([0-9~\-\s초]+)\s*[:：]\s*)?(.+)$/.exec(t))) {
          out.clip.push({ no: m[1], time: (m[2] || "").trim(), text: m[3].trim() });
        }
      });
    }
    var s3 = pickSection(secs, ["해시태그"]);
    if (s3) out.hashtags = s3.body.map(function (l) { return String(l).trim(); }).filter(Boolean).join(" ").trim();
    if (!out.hook && !out.clip.length) return null;
    return out;
  }

  /* ============================================================
     🧾 대가성 표시 (v2.0.0 추가 · 공정위 심사지침 예규 제499호)
     제휴·상품 추천이 들어간 원고에서 스레드·멀티유즈를 뽑을 때,
     대가성 문구를 본문 맨 앞에 **확정 표현으로** 넣는다.
     첫 댓글·'더보기' 아래로 숨기지 않는다. 모호한 표현은 지운다.
     ============================================================ */
  function articleDisclosure(r) {
    var S = BS.SNS_DISCLOSURE || {};
    if (!r) return { needed: false, text: "", platform: "" };
    var mode = resultMode(r);
    var pid = "";
    if (mode === "product") {
      pid = r.productPlatform || "coupang";
    } else {
      var md = String(r.md || "");
      if (/쿠팡\s*파트너스\s*활동의\s*일환/.test(md)) pid = "coupang";
      else if (/브랜드\s*커넥트\s*활동의\s*일환/.test(md)) pid = "brandconnect";
      else if (/쇼핑\s*커넥트\s*활동의\s*일환/.test(md)) pid = "creatorshop";
      else if (/여행\s*커넥트\s*활동의\s*일환/.test(md)) pid = "travel";
      else if (/여기서\s*잠깐/.test(md)) pid = r.affiliatePlatform || state.affiliatePlatform || "coupang";
    }
    if (!pid) return { needed: false, text: "", platform: "" };
    return {
      needed: true,
      platform: pid,
      text: BS.snsDisclosureFor(pid),
      place: "본문 맨 앞(첫 타래의 첫 줄 · 멀티유즈는 훅의 첫 줄)"
    };
  }

  /* 문구가 빠졌으면 맨 앞에 넣고, 모호한 표현이 있으면 그 줄을 지운다 */
  function ensureDisclosure(text, line) {
    var t = String(text == null ? "" : text).trim();
    if (!line) return t;
    var vague = (BS.SNS_DISCLOSURE || {}).vague || [];
    if (vague.length) {
      var kept = t.split("\n").filter(function (l) {
        return !vague.some(function (v) { return l.indexOf(v) >= 0; });
      });
      t = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    var flat = t.replace(/\s+/g, " ");
    if (flat.indexOf(line.replace(/\s+/g, " ")) >= 0) return t;
    return line + (t ? "\n\n" + t : "");
  }

  /* 첫 댓글(파트너스 링크가 들어가는 게시글)에도 대가성 문구를 **맨 앞**에 둔다.
     v2.3.5 — v2.0.0~v2.3.4는 `ensureNoDisclosure`로 첫 댓글의 문구를 지웠다.
     그 결과 문구(본문)와 링크(첫 댓글)가 서로 다른 게시글로 나뉘었고, 쿠팡파트너스 공식
     안내(2025-11-26)가 금지하는 배치였다. 지금은 지우지 않고 맨 앞으로 옮긴다.
     스레드 게시글 글자 한도(500자)를 넘으면 본문 꼬리를 줄이고, 문구는 절대 자르지 않는다. */
  function commentCharLimit() {
    var L = (BS.SNS_DISCLOSURE || {}).maxChars;
    return (L && L > 0) ? L : 500;
  }
  /* 500자 한도 안으로 본문을 줄인다 — 줄 경계부터, 한 줄도 안 들어가면 문장 끝에서 */
  function cutThreadBody(body, room) {
    var b = String(body == null ? "" : body).trim();
    if (room <= 0) return "";
    if (b.length <= room) return b;
    var lines = b.split("\n"), acc = [];
    for (var i = 0; i < lines.length; i++) {
      if (acc.concat([lines[i]]).join("\n").length > room) break;
      acc.push(lines[i]);
    }
    var out = acc.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (out) return out;
    var cut = b.slice(0, Math.max(1, room - 1));
    var end = Math.max(cut.lastIndexOf("다."), cut.lastIndexOf("요."), cut.lastIndexOf("."),
      cut.lastIndexOf("?"), cut.lastIndexOf("!"), cut.lastIndexOf("~"));
    if (end >= Math.floor(room * 0.5)) return cut.slice(0, end + 1).trim() + " …";
    return cut.trim() + "…";
  }
  function ensureCommentDisclosure(text, line, limit) {
    var t = String(text == null ? "" : text).trim();
    if (!line) return t;
    var L = limit || commentCharLimit();
    var flatLine = line.replace(/\s+/g, " ");
    /* 1) 어디에 있든 같은 문구 줄을 빼고(중복·중간 배치 제거) */
    var body = t.split("\n").filter(function (l) {
      return l.replace(/\s+/g, " ").indexOf(flatLine) < 0;
    }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    /* 2) 문구를 맨 앞에 둔다 */
    if (line.length >= L) return line.slice(0, L);
    if (!body) return line;
    var room = L - line.length - 2;   // 문구 + 빈 줄 하나
    return line + "\n\n" + cutThreadBody(body, room);
  }

  function multiAllText(m) {
    if (!m) return "";
    var L = [];
    if (m.productPick) L.push("상품 선정: " + m.productPick);
    L.push("【스레드】");
    L.push(m.hook || "");
    if (m.firstComment.length) {
      L.push("");
      L.push("[첫 댓글]");
      m.firstComment.forEach(function (c) { L.push(c); });
    }
    L.push("");
    L.push("【클립 20초 연출표】");
    m.clip.forEach(function (c) { L.push((c.time ? c.time + " " : "") + c.text); });
    if (m.hashtags) { L.push(""); L.push(m.hashtags); }
    return L.join("\n");
  }

  function renderMultiUse() {
    var panel = $("#multiusePanel");
    var m = state.multiuse;
    if (!panel) return;
    if (!m) { show(panel, false); return; }
    var desc = $("#multiuseDesc");
    if (desc) desc.textContent = (BS.MULTIUSE || {}).desc || "";
    var html = [];
    if (m.disclosure) {
      html.push('<div class="mu-disc">🧾 대가성 문구가 <b>훅 첫 줄(본문 맨 앞)</b>과 <b>링크가 있는 첫 댓글 맨 앞</b>에 들어갔습니다 · 첫 댓글 ' + commentCharLimit() + '자 이내 · ' + esc((BS.SNS_DISCLOSURE || {}).law || "") + '</div>');
    }
    if (m.productPick) {
      html.push('<div class="mu-block"><h4>🛒 상품 선정</h4><p>' + esc(m.productPick) + '</p></div>');
    }
    html.push('<div class="mu-block"><h4>🧵 스레드 본문 훅</h4><p>' + esc(m.hook || "(없음)") + '</p>' +
      '<div class="mu-copy"><button type="button" class="btn small ghost" data-mu="hook">훅 복사</button></div></div>');
    html.push('<div class="mu-block"><h4>💬 첫 댓글</h4><p>' + esc((m.firstComment || []).join("\n") || "(없음)") + '</p>' +
      '<div class="mu-copy"><button type="button" class="btn small ghost" data-mu="comment">첫 댓글 복사</button></div></div>');
    var clip = (m.clip || []).map(function (c) {
      return '<div class="mu-line"><b>' + esc(c.time || (c.no + ")")) + '</b><span>' + esc(c.text) + '</span></div>';
    }).join("");
    html.push('<div class="mu-block"><h4>🎬 클립 20초 연출표</h4>' + (clip || "<p>(없음)</p>") +
      '<div class="mu-copy"><button type="button" class="btn small ghost" data-mu="clip">연출표 4줄 복사</button></div></div>');
    if (m.hashtags) {
      html.push('<div class="mu-block"><h4>#️⃣ 해시태그</h4><p>' + esc(m.hashtags) + '</p>' +
        '<div class="mu-copy"><button type="button" class="btn small ghost" data-mu="tags">해시태그 복사</button></div></div>');
    }
    $("#multiuseBody").innerHTML = html.join("");
    show(panel, true);
    Array.prototype.slice.call($("#multiuseBody").querySelectorAll("[data-mu]")).forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-mu");
        var txt = k === "hook" ? m.hook : k === "comment" ? (m.firstComment || []).join("\n")
          : k === "clip" ? (m.clip || []).map(function (c) { return (c.time ? c.time + " " : "") + c.text; }).join("\n")
            : m.hashtags;
        copyPlain(txt || "").then(function (ok) { toast(ok ? "복사했습니다" : "복사 실패"); });
      });
    });
  }

  function runMultiUse() {
    var r = state.result;
    if (!r) { toast("원고가 없습니다 — 먼저 원고를 만들어 주세요"); return; }
    if (r.blogger && r.blogger.lang === "en") { toast("영문 카드는 PART 3 인스타 세트가 이미 들어 있습니다"); return; }
    if (state.busy) { toast("지금 다른 작업이 돌고 있습니다 — 끝나면 다시 눌러 주세요"); return; }
    if (!apiKeyOrAsk()) return;
    var article = r.blogger
      ? [r.title || "", (r.blogger.seo && r.blogger.seo.desc) || "", stripHtmlText(r.blogger.html || "")].join("\n")
      : r.md;
    var req = BS.prompts.multiUsePrompt({
      article: article, topic: r.topic || "", title: r.title || "",
      blog: BS.blogById(r.blogId) || state.blog, docMode: r.docMode || "blog",
      persona6: currentPersona(),
      disclosure: articleDisclosure(r)
    });
    runScriptJob({
      req: req,
      label: "⚡ 멀티유즈: 스레드 훅과 클립 연출표를 같이 뽑는 중…",
      statusEl: $("#multiuseStatus"),
      buttons: [$("#btnMultiUse")],
      gen: { temperature: 0.85, topP: 0.95 },
      apply: function (text) {
        var m = parseMultiUse(text);
        if (!m) { toast("멀티유즈 응답을 읽지 못했습니다 — 다시 눌러 주세요"); return false; }
        var disc = articleDisclosure(r);
        if (disc.needed) {
          m.disclosure = disc.text;
          m.hook = ensureDisclosure(m.hook, disc.text);
          m.firstComment = [ensureCommentDisclosure((m.firstComment || []).join("\n"), disc.text)];
        }
        state.multiuse = m;
        renderMultiUse();
        var disc = articleDisclosure(r);
        setStatus($("#multiuseStatus"), "✅ 스레드 훅·첫 댓글·클립 20초 연출표 준비됨 — 각각 복사해 쓰세요" +
          (disc.needed ? " (대가성 문구는 훅 첫 줄과 링크가 있는 첫 댓글 맨 앞에 넣었습니다 · 첫 댓글 " + commentCharLimit() + "자 이내)" : ""), "ok");
        return true;
      },
      retry: runMultiUse
    });
  }

  /* ---------------- 3. Gemini 호출 ---------------- */
  function apiKeyOrAsk() {
    var k = getKey();
    if (!k) {
      openSettings();
      toast("먼저 설정에서 Gemini API 키를 넣어 주세요");
      return "";
    }
    return k;
  }

  function friendlyError(status, bodyText, model) {
    var msg = "";
    try {
      var j = JSON.parse(bodyText);
      msg = (j.error && (j.error.message || j.error.status)) || "";
    } catch (e) {
      msg = (bodyText || "").slice(0, 300);
    }
    var head = "";
    if (status === 400) head = "요청 형식 오류(400)";
    else if (status === 401 || status === 403) head = "키가 거부되었습니다(" + status + ")";
    else if (status === 404) head = "모델을 찾을 수 없습니다(404)";
    else if (status === 429) head = "한도 초과(429)";
    else if (status >= 500) head = "구글 서버 오류(" + status + ")";
    else head = "오류(" + status + ")";
    var tail = "";
    if (status === 404) tail = " 설정에서 '모델 목록 불러오기'를 눌러 지금 쓸 수 있는 모델 이름으로 바꿔 주세요.";
    if (status === 403) tail = " 키가 올바른지, 해당 프로젝트에서 API가 켜져 있는지 확인해 주세요.";
    if (status === 429) tail = " 무료 등급 한도이거나, 이미지 모델처럼 무료 한도가 0인 경우입니다.";
    return head + " — " + msg + tail + (model ? " (모델: " + model + ")" : "");
  }

  /* 오류 본문에서 한도 정보를 읽는다 — 일일(RPD)인지 분당(RPM)인지에 따라 대처가 다르다 */
  function parseRetryDelay(v) {
    var m = String(v || "").match(/^([\d.]+)s$/);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
    var n = String(v || "").match(/^(\d+)$/);
    return n ? parseInt(n[1], 10) * 1000 : 0;
  }
  function quotaInfo(bodyText) {
    var out = { kind: "", id: "", value: "", delayMs: 0 };
    try {
      var j = JSON.parse(bodyText || "{}");
      var err = (j && j.error) || {};
      (err.details || []).forEach(function (d) {
        var t = d["@type"] || "";
        if (/QuotaFailure/.test(t)) {
          (d.violations || []).forEach(function (v) {
            if (out.id) return;
            out.id = v.quotaId || v.quotaMetric || "";
            out.value = v.quotaValue || "";
            if (/PerDay/i.test(out.id)) out.kind = "day";
            else if (/PerMinute/i.test(out.id)) out.kind = "minute";
            else out.kind = "other";
          });
        }
        if (/RetryInfo/.test(t) && d.retryDelay) out.delayMs = parseRetryDelay(d.retryDelay);
      });
      if (!out.kind && /RESOURCE_EXHAUSTED/.test(err.status || "")) out.kind = "day";
    } catch (e) {}
    return out;
  }

  /* ---------------- 3-0. 저장된 옛 기본 모델 1회 전환 (v2.2.3 · 2026-11-19) ----------------
     기본 모델을 gemini-3.5-flash-lite(무료 하루 500편)로 올렸지만, 이미 쓰던 브라우저의
     localStorage(bs.textModel)에는 예전 기본값 "gemini-2.5-flash"가 남아 있다.
     bs.modelMigrated.223 플래그로 딱 한 번만 새 기본값으로 바꾸고, 이후 설정에서 지연님이
     2.5 Flash를 직접 다시 고른 선택은 덮어쓰지 않는다. 바뀌면 짧게 알린다. */
  function migrateDefaultModel() {
    var M = BS.MODEL_MIGRATION || {};
    if (!M.key || !M.from || !M.to) return "";
    try {
      if (localStorage.getItem(K_MODEL_MIGRATED)) return "";
      var saved = localStorage.getItem(K_TEXT);
      localStorage.setItem(K_MODEL_MIGRATED, "1");   // 실패해도 다시 덮어쓰지 않게 먼저 표시
      if (saved !== M.from) return "";
      localStorage.setItem(K_TEXT, M.to);
      return M.from + " → " + M.to;
    } catch (e) { return ""; }
  }

  /* 상태코드·한도 정보를 담은 오류 (자동 모델 전환이 이 값을 읽어 판단한다) */
  function apiError(status, bodyText, model) {
    var e = new Error(friendlyError(status, bodyText, model));
    e.status = status;
    e.model = model;
    e.quota = quotaInfo(bodyText);
    return e;
  }

  /* ---------------- 3-1. 무료 한도 자동 모델 전환 (v1.6.1 · 2026-11-17) ---------------- */
  function autoSwitchEnabled() {
    var fb = BS.MODEL_FALLBACK || {};
    if (fb.enabled === false) return false;
    try { if (localStorage.getItem(K_AUTO) === "0") return false; } catch (e) {}
    return true;
  }
  function modelChain(start) {
    var list = [start];
    if (!autoSwitchEnabled()) return list;
    ((BS.MODEL_FALLBACK && BS.MODEL_FALLBACK.chain) || []).forEach(function (m) {
      if (m && list.indexOf(m) < 0) list.push(m);
    });
    return list;
  }
  function canAutoSwitch(err) {
    if (!err || err.name === "AbortError") return false;
    if (err.status === 429 || err.status === 404) return true;
    // 구글 서버 일시 혼잡·과부하(500/502/503/504)도 다음 무료 모델로 이어 간다 (v1.7.0)
    if (err.status >= 500 && err.status < 600) return true;
    if (err.status === 400 && /not found|not supported|does not exist|invalid model/i.test(err.message || "")) return true;
    return false;
  }
  function autoSwitchText(sw) {
    if (sw && sw.reason === "busy") {
      return "기본 모델(" + sw.from + ") 혼잡 또는 한도로 " + sw.to + " 모델로 자동 전환해 작성했습니다";
    }
    var base = (BS.MODEL_FALLBACK && BS.MODEL_FALLBACK.notice) ||
      "기본 모델 한도에 도달해 무료 넉넉한 모델(Flash Lite)로 자동 전환해 작성했습니다";
    return base + " (" + sw.from + " → " + sw.to + ")";
  }
  function sleepAbort(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (!ms || ms <= 0) return resolve();
      var done = false;
      var id = setTimeout(function () { cleanup(); done = true; resolve(); }, ms);
      function onAbort() { if (done) return; cleanup(); var e = new Error("aborted"); e.name = "AbortError"; reject(e); }
      function cleanup() { clearTimeout(id); if (signal && signal.removeEventListener) signal.removeEventListener("abort", onAbort); }
      if (signal && signal.addEventListener) {
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort);
      }
    });
  }
  function allModelsFailed(fail, autoOff) {
    var names = fail.map(function (f) { return f.model + "(" + (f.status || "?") + ")"; }).join(" → ");
    var reset = "무료 한도는 태평양시 자정(한국 시간 오후 5시 무렵)에 다시 채워집니다.";
    var busy = fail.some(function (f) { return f.status >= 500; });
    var msg = autoOff
      ? "한도가 끝났거나 모델을 찾지 못했습니다 — " + names +
        ". 설정의 '한도가 끝나면 다른 무료 모델로 자동 전환'을 켜 두면 무료 500편 모델로 이어서 쓸 수 있습니다. " + reset
      : (busy ? "구글 서버가 혼잡해(5xx) 쓸 수 있는 무료 모델을 모두 확인했습니다 — " :
                "무료 한도에 걸려 쓸 수 있는 모델을 모두 확인했습니다 — ") + names +
        ". 잠시 뒤 다시 시도하거나, 설정에서 모델을 바꾸어 주세요. " + reset;
    var e = new Error(msg);
    e.status = fail.length ? fail[fail.length - 1].status : 0;
    e.quota = { kind: "all" };
    return e;
  }

  /* 1단계·2단계 공통 호출 — 429·404·5xx면 다음 무료 모델로 이어서 다시 부른다.
     box: { signal, arm(), disarm(), onModel(m), onSwitch(from, to, reason), onWait(m, ms), onBusy(m, ms) } */
  function geminiTextAuto(model, system, user, box, gen) {
    var list = modelChain(model);
    var i = 0;
    var fail = [];
    var waited = false;
    var triedBusy = {};

    function run() {
      var m = list[i];
      box.arm();
      return geminiText(m, system, user, box.signal, gen).then(function (text) {
        box.disarm();
        if (box.onModel) box.onModel(m);
        var last = fail.length ? fail[fail.length - 1] : null;
        if (m !== model && box.onSwitch) {
          box.onSwitch(last ? last.model : model, m, last && last.status >= 500 ? "busy" : "quota");
        }
        return text;
      }, function (err) {
        box.disarm();
        if (!canAutoSwitch(err)) throw err;
        var q = err.quota || {};
        fail.push({ model: m, status: err.status, kind: q.kind || "" });
        // 서버 혼잡(500/502/503/504) — 같은 모델로 2~3초만 기다렸다 한 번 더, 그래도 안 되면 다음 모델
        if (err.status >= 500 && err.status < 600 && !triedBusy[m]) {
          triedBusy[m] = true;
          var fb0 = BS.MODEL_FALLBACK || {};
          var busyMs = Math.min(fb0.busyWaitMs || 2500, fb0.maxWaitMs || 8000);
          if (box.onBusy) box.onBusy(m, busyMs);
          return sleepAbort(busyMs, box.signal).then(run);
        }
        // 분당 한도(RPM)만 걸린 경우 — 잠깐 기다리면 같은 모델이 다시 된다 (한 번만)
        if (!waited && q.kind === "minute") {
          waited = true;
          var fb = BS.MODEL_FALLBACK || {};
          var ms = Math.min(q.delayMs || fb.rpmWaitMs || 5000, fb.maxWaitMs || 8000);
          if (box.onWait) box.onWait(m, ms);
          return sleepAbort(ms, box.signal).then(run);
        }
        if (i + 1 < list.length) { i += 1; return run(); }
        throw allModelsFailed(fail, !autoSwitchEnabled());
      });
    }
    return run();
  }

  function geminiText(model, system, user, signal, gen) {
    var wantWeb = !!(gen && gen.webSearch) && webSearchAllowed(model, gen);
    return geminiTextOnce(model, system, user, signal, gen, wantWeb).catch(function (err) {
      // 검색 도구 때문에 생긴 400/403/미지원 오류면 tools 없이 한 번 더 — 원고가 실패로 멈추지 않는다
      if (!wantWeb || !webSearchRetryable(err)) throw err;
      if (gen && gen.onSearchFallback) gen.onSearchFallback(model, err);
      return geminiTextOnce(model, system, user, signal, gen, false);
    });
  }

  /* 이 모델에 google_search를 붙일 수 있는지 — Flash Lite 계열이면 배지만 띄우고 일반 작성 */
  function webSearchAllowed(model, gen) {
    if (BS.webSearchSupported && BS.webSearchSupported(model)) return true;
    if (gen && gen.onSearchSkip) gen.onSearchSkip(model);
    return false;
  }

  /* 검색이 붙은 요청이 400/403이나 검색 도구 미지원으로 되돌아온 경우 */
  function webSearchRetryable(err) {
    if (!err || err.name === "AbortError") return false;
    if (err.status === 400 || err.status === 403) return true;
    return err.status === 429 && /grounding|google_search|google search|search tool/i.test(err.message || "");
  }

  function geminiTextOnce(model, system, user, signal, gen, withWeb) {
    var key = getKey();
    var url = BS.API_BASE + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
    var body = {
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: (gen && gen.temperature != null) ? gen.temperature : 0.9,
        topP: (gen && gen.topP != null) ? gen.topP : 0.95
      }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (withWeb) body.tools = [((BS.WEB_SEARCH || {}).tool) || { google_search: {} }];
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) throw apiError(res.status, txt, model);
        var j = JSON.parse(txt);
        if (j.promptFeedback && j.promptFeedback.blockReason) {
          throw new Error("구글이 이 요청을 막았습니다(" + j.promptFeedback.blockReason + "). 주제 표현을 바꿔 다시 시도해 주세요.");
        }
        var cand = (j.candidates || [])[0];
        if (!cand) throw new Error("응답이 비어 있습니다. 다시 시도해 주세요.");
        // 🔍 검색이 붙은 요청이면 실제 검색어·출처를 건져 화면과 2단계 검수에 넘긴다
        if (withWeb && gen && gen.onGrounding) gen.onGrounding(parseGrounding(j), model);
        var text = ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ""; }).join("").trim();
        if (!text) throw new Error("본문이 비어 있습니다. 다시 시도해 주세요.");
        if (cand.finishReason && cand.finishReason !== "STOP") {
          text += "\n\n<!-- 안내: 응답이 " + cand.finishReason + "로 끝났습니다. 분량을 '짧게'로 줄여 다시 생성해 보세요. -->";
        }
        return text;
      });
    });
  }

  function geminiImage(model, prompt) {
    var key = getKey();
    if (/^imagen/i.test(model)) {
      var u = BS.API_BASE + "/models/" + encodeURIComponent(model) + ":predict?key=" + encodeURIComponent(key);
      return fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } })
      }).then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) throw new Error(friendlyError(res.status, txt, model));
          var j = JSON.parse(txt);
          var p = (j.predictions || [])[0];
          if (!p || !p.bytesBase64Encoded) throw new Error("이미지가 오지 않았습니다. 다시 시도해 주세요.");
          return { dataUrl: "data:" + (p.mimeType || "image/png") + ";base64," + p.bytesBase64Encoded, mime: p.mimeType || "image/png" };
        });
      });
    }

    var url = BS.API_BASE + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
    var body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    };
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) throw new Error(friendlyError(res.status, txt, model));
        var j = JSON.parse(txt);
        var parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        var img = parts.filter(function (p) { return p.inlineData || p.inline_data; })[0];
        if (!img) {
          var said = parts.map(function (p) { return p.text || ""; }).join(" ").trim();
          throw new Error("이미지가 오지 않았습니다." + (said ? " 모델 응답: " + said.slice(0, 160) : ""));
        }
        var d = img.inlineData || img.inline_data;
        return { dataUrl: "data:" + (d.mimeType || d.mime_type || "image/png") + ";base64," + d.data, mime: d.mimeType || d.mime_type || "image/png" };
      });
    });
  }

  /* ---------------- 4. 마크다운 파싱/렌더 ---------------- */
  /* ---------- 강조 표시 (v1.7.2 · 2026-11-17 지연님 요청) ----------
     AI가 원고에 남긴 강조 기호를 화면용/스마트에디터용 HTML로 바꿉니다.
       ==문장==   → 노란 형광펜 (핵심 결론·요점)
       @@문장@@  → 하늘 형광펜 (확인 조건·주의사항)
       **단어**   → 굵게
     같은 줄 안에서 짝이 맞는 것만 바꾸고, 남은 기호는 미리보기·복사본에 남기지 않습니다.
     링크 주소(<a href>) 안에 들어 있는 ==·@@는 건드리지 않습니다. */
  function yellowRe() { return /==((?:(?!==)[^\n])+?)==/g; }
  function blueRe() { return /@@((?:(?!@@)[^\n])+?)@@/g; }

  function hlMarkup(kind, inner, inline) {
    var cls = "bs-hl" + (kind === "blue" ? " bs-hl-blue" : "");
    if (!inline) return '<mark class="' + cls + '">' + inner + "</mark>";
    var hl = BS.HL || {};
    var bg = kind === "blue" ? ((hl.blue && hl.blue.bg) || "#d9f3f4") : ((hl.yellow && hl.yellow.bg) || "#fff3a3");
    // 스마트에디터 ONE은 붙여넣기 때 인라인 background-color를 보존한다
    return '<mark class="' + cls + '" style="background-color:' + bg + ';color:inherit">' + inner + "</mark>";
  }

  /* 태그 밖 텍스트에 남은 짝 없는 ==·@@ 기호를 지운다 (주소·스타일 안은 그대로) */
  function stripStrayMarks(html) {
    return String(html == null ? "" : html).split(/(<[^>]*>)/).map(function (seg) {
      if (/^</.test(seg)) return seg;
      return seg.replace(/@@/g, "").replace(/==/g, "");
    }).join("");
  }

  /* 마크다운·순수 텍스트용: 형광펜 기호는 지우고, 굵게(**)는 마크다운 서식이라 남긴다.
     링크 주소 안의 ==·@@는 건드리지 않는다. */
  function stripEmphasisMarks(md) {
    var urls = [];
    var s = String(md == null ? "" : md).replace(/\]\(([^)\s]+)\)/g, function (m, u) {
      urls.push(u);
      return "](__BSURL" + (urls.length - 1) + "__)";
    });
    s = s.replace(yellowRe(), function (m, inner) { return inner; })
      .replace(blueRe(), function (m, inner) { return inner; })
      .replace(/@@/g, "").replace(/==/g, "");
    return s.replace(/\]\(__BSURL(\d+)__\)/g, function (m, i) { return "](" + urls[+i] + ")"; });
  }

  function mdInline(s, inline) {
    var h = esc(s);
    // 순서: 굵게 → 형광펜 → 링크 → 코드. 형광펜 안의 **굵게**(예: ==**추가 비용**은…)도 깨지지 않는다.
    h = h.replace(/\*\*(.+?)\*\*/g, inline
      ? '<strong style="font-weight:700">$1</strong>'
      : "<strong>$1</strong>");
    h = h.replace(yellowRe(), function (m, inner) {
      return inner.trim() ? hlMarkup("yellow", inner, inline) : m;
    });
    h = h.replace(blueRe(), function (m, inner) {
      return inner.trim() ? hlMarkup("blue", inner, inline) : m;
    });
    /* v2.3.0 — 제목에 대괄호가 든 기존 글('[2026 김장 준비] …')도 링크로 살린다.
       CommonMark는 링크 텍스트 안의 짝 맞는 대괄호를 허용하므로 한 겹까지 받는다. */
    h = h.replace(/\[((?:[^\[\]]|\[[^\[\]]*\])+)\]\((https?:\/\/[^)\s]+)\)/g, function (m, t, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener nofollow">' + t + "</a>";
    });
    h = h.replace(/`([^`]+)`/g, inline ? '<code style="font-family:monospace;background:#f4f1ec">$1</code>' : "<code>$1</code>");
    return stripStrayMarks(h);
  }

  function splitSections(md) {
    var lines = md.replace(/\r/g, "").split("\n");
    var secs = [];
    var cur = null;
    var pre = [];
    lines.forEach(function (raw) {
      if (/^\s*```/.test(raw)) return; // 코드블록 표시는 버린다
      var line = raw.replace(/\*\*/g, ""); // 머리말에 붙은 ** 제거
      // 정확히 '## ' 두 개만 섹션 구분 (### 소제목은 본문 안에 둔다)
      var m = line.match(/^\s{0,3}##(?!#)\s*(.+?)\s*$/);
      if (m) {
        cur = { h: m[1].trim(), body: [] };
        secs.push(cur);
        return;
      }
      if (cur) cur.body.push(raw);
      else pre.push(raw);
    });
    // 모델이 ### 로만 쓴 경우 폴백
    if (secs.length < 3) {
      var secs2 = [], cur2 = null, pre2 = [];
      lines.forEach(function (raw) {
        if (/^\s*```/.test(raw)) return;
        var line = raw.replace(/\*\*/g, "");
        var m2 = line.match(/^\s{0,3}#{1,3}(?!#)\s*(.+?)\s*$/);
        if (m2) { cur2 = { h: m2[1].trim(), body: [] }; secs2.push(cur2); return; }
        if (cur2) cur2.body.push(raw); else pre2.push(raw);
      });
      if (secs2.length > secs.length) return { secs: secs2, pre: pre2 };
    }
    return { secs: secs, pre: pre };
  }

  function pickSection(secs, names) {
    for (var i = 0; i < secs.length; i++) {
      var h = secs[i].h.replace(/\[|\]/g, "").replace(/\s/g, "");
      for (var j = 0; j < names.length; j++) {
        if (h.indexOf(names[j].replace(/\s/g, "")) === 0) return secs[i];
      }
    }
    return null;
  }

  /* ---------- 문단 길이 다듬기 (v1.5.1 가독성) ----------
     모델이 한 문단에 4~5문장을 몰아 쓴 경우에도 모바일에서 읽히도록
     문장 단위로 끊어 문단(2문장 안팎)으로 다시 나눈다. 글자는 건드리지 않는다. */
  function splitSentences(text) {
    var s = String(text || "");
    var out = [];
    var buf = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      buf += c;
      if (c === "." || c === "!" || c === "?" || c === "。") {
        // 닫는 따옴표·괄호는 문장 안에 붙여 둔다
        while (i + 1 < s.length && /[”’"'’)\]]/.test(s.charAt(i + 1))) { buf += s.charAt(i + 1); i++; }
        if (i + 1 >= s.length || /\s/.test(s.charAt(i + 1))) {
          out.push(buf.trim());
          buf = "";
          while (i + 1 < s.length && /\s/.test(s.charAt(i + 1))) i++;
        }
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(function (x) { return x; });
  }

  function paragraphGroups(text, maxLen) {
    var t = String(text || "").trim();
    if (!t) return [];
    maxLen = maxLen || 70;
    // 80자(공백 포함, 모바일 2~3줄)까지는 그대로, 넘으면 문장 단위로 나눠 문단 2~3개로 담는다
    if (t.length <= 80) return [t];
    var ss = splitSentences(t);
    if (ss.length < 2) return [t];
    var groups = [];
    var cur = "";
    ss.forEach(function (x) {
      if (cur && (cur.length + 1 + x.length) > maxLen) { groups.push(cur); cur = x; }
      else cur = cur ? cur + " " + x : x;
    });
    if (cur) groups.push(cur);
    // 마지막에 짧은 문장 하나만 남아 홀로 뜨면 앞 문단에 붙인다
    if (groups.length > 1) {
      var last = groups[groups.length - 1];
      var prev = groups[groups.length - 2];
      if (last.length < 40 && prev.length + 1 + last.length <= maxLen) {
        groups[groups.length - 2] = prev + " " + last;
        groups.pop();
      }
    }
    return groups;
  }

  function bodyToHtml(lines, opt) {
    opt = opt || {};
    var rich = !!opt.inline;   // true = 스마트에디터용(인라인 스타일 + 빈 줄)
    var S = {
      p: rich ? ' style="font-size:1em;line-height:1.95;margin:0;color:#222"' : "",
      h3: rich ? RICH_H3_STYLE : "",
      ul: rich ? ' style="margin:0;padding-left:22px"' : "",
      ol: rich ? ' style="margin:0;padding-left:22px"' : "",
      li: rich ? ' style="font-size:1em;line-height:1.85;margin:0 0 10px"' : "",
      bq: rich ? ' style="margin:0;padding:12px 16px;background:#f8f4ee;border-left:4px solid #d9c7ae;color:#413a31;font-size:0.97em;line-height:1.9"' : ""
    };
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var t = line.trim();
      if (!t) { i++; continue; }

      // table
      if (/^\|/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i].trim())) { rows.push(lines[i].trim()); i++; }
        out.push(tableHtml(rows, opt));
        continue;
      }
      // h3/h4 (본문 소제목 — 굵게 + 위아래 빈 줄)
      var hm = t.match(/^(#{3,4})\s+(.*)$/);
      if (hm) {
        out.push("<h3" + S.h3 + "><strong>" + mdInline(hm[2], rich) + "</strong></h3>");
        i++; continue;
      }
      // blockquote
      if (/^>\s?/.test(t)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
        out.push("<blockquote" + S.bq + ">" + q.map(function (x) { return mdInline(x, rich); }).join("<br>") + "</blockquote>");
        continue;
      }
      // list
      if (/^[-*•]\s+/.test(t)) {
        var items = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*•]\s+/, "")); i++; }
        out.push("<ul" + S.ul + ">" + items.map(function (x) { return "<li" + S.li + ">" + mdInline(x, rich) + "</li>"; }).join("") + "</ul>");
        continue;
      }
      if (/^\d+[).]\s+/.test(t)) {
        var oitems = [];
        while (i < lines.length && /^\d+[).]\s+/.test(lines[i].trim())) { oitems.push(lines[i].trim().replace(/^\d+[).]\s+/, "")); i++; }
        out.push("<ol" + S.ol + ">" + oitems.map(function (x) { return "<li" + S.li + ">" + mdInline(x, rich) + "</li>"; }).join("") + "</ol>");
        continue;
      }
      // paragraph (모아서 → 길면 문단 2~3개로 나눠 담는다)
      var para = [];
      while (i < lines.length) {
        var tt = lines[i].trim();
        if (!tt) break;
        if (/^\|/.test(tt) || /^#{1,4}\s/.test(tt) || /^[-*•]\s+/.test(tt) || /^\d+[).]\s+/.test(tt) || /^>\s?/.test(tt)) break;
        para.push(tt); i++;
      }
      if (para.length) {
        paragraphGroups(para.join(" "), opt.paraMax).forEach(function (g) {
          out.push("<p" + S.p + ">" + mdInline(g, rich) + "</p>");
        });
      }
    }
    // 스마트에디터용은 블록 사이에 '진짜 빈 줄'을 넣는다 (CSS margin은 붙여넣을 때 지워짐)
    if (opt.blocks) return out;   // v1.6.2: 빈 줄 수를 부르는 쪽(buildRichHtml)이 블록마다 정한다
    return out.join(rich ? "\n" + RICH_GAP + "\n" : "\n");
  }

  function tableHtml(rows, opt) {
    var cells = rows.map(function (r) {
      return r.replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
    });
    var head = cells[0] || [];
    var body = cells.slice(2);
    var style = opt.inline
      ? ' style="width:100%;border-collapse:collapse;margin:0;font-size:14px" cellspacing="0" cellpadding="8" border="1" bordercolor="#e6dfd5"'
      : "";
    var thS = opt.inline ? ' style="border:1px solid #e6dfd5;padding:8px 10px;background:#f7f3ec;font-weight:700;text-align:left"' : "";
    var tdS = opt.inline ? ' style="border:1px solid #e6dfd5;padding:8px 10px;text-align:left;vertical-align:top"' : "";
    var h = "<table" + style + "><thead><tr>" +
      head.map(function (c) { return "<th" + thS + ">" + mdInline(c, opt.inline) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      body.map(function (r) {
        return "<tr>" + r.map(function (c) { return "<td" + tdS + ">" + mdInline(c, opt.inline) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table>";
    return h;
  }

  /* 제목 뒤에 붙은 〔필터 ①②③ 3개·끝말 신청〕 채점표는 화면·복사본에서 뺀다 */
  function stripTitleMeta(s) {
    return String(s || "")
      .replace(/\s*[〔\[]\s*(?:필터|filter)[^〕\]]*[〕\]]\s*$/i, "")
      .replace(/\s*[〔\[](?:필터|filter)[^〕\]]*[〕\]]/gi, "")
      .replace(/\s*\(\s*\d+\s*자\s*\)\s*$/, "")
      .replace(/\s*\[\s*필터[^\]]*\]\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function parseTitles(sec, max) {
    if (!sec) return [];
    var out = [];
    sec.body.forEach(function (l) {
      var t = l.trim().replace(/\*\*/g, "");
      if (!t) return;
      var m = t.match(/^(?:[-*•]|\d+[).])\s*(.+)$/);
      if (m) out.push(stripTitleMeta(m[1]));
      else if (!/^\(.*\)$/.test(t) && t.length > 8) out.push(stripTitleMeta(t));
    });
    return out.filter(function (x) { return x; }).slice(0, max || 5);
  }

  /* 본문에서 빼야 하는 머리말(작업 메모는 화면에만, 복사본에는 안 넣음) */
  function isMemoSection(label) {
    return /^작업\s*메모/.test(String(label || "").replace(/\s+/g, " "));
  }
  /* 🖼️ 원고 속 이미지 프롬프트 세트 (v2.2.3) — 제미나이에 붙여넣을 작업용이라
     스마트에디터 복사본·글자수에는 넣지 않고 화면에만 보여 준다. */
  function isImagePromptSection(label) {
    return /^이미지\s*프롬프트/.test(String(label || "").replace(/\s+/g, " "));
  }
  /* ---------- 🖼️ 이미지 프롬프트 세트 — 항목별 카드 + [📋 프롬프트 복사] (v2.2.6) ----------
     지연님 "[#29929] 전에는 이부분도 명확히 구분해서 복사탭 있어서 그거만 눌러서 복사하게 했었어".
     출력 예시가 [그룹] → '- 항목' → '  "영문 프롬프트"' 순서라 그대로 파싱해 카드로 그린다.
     '- 기준선 고정:'·'- 본문 고정:' 같은 내부 규칙 설명 줄은 카드로 만들지 않고 버린다. */
  function parseImagePromptCards(lines) {
    var out = [], group = "", cur = null;
    var META = /^[-*•]\s*(?:기준선|본문\s*고정|배너\s*고정|고정|참고|규칙)\s*[:：]/;
    (lines || []).forEach(function (raw) {
      var t = String(raw || "").trim();
      if (!t) return;
      if (/^\[.*\]$/.test(t)) { group = t.replace(/^\[|\]$/g, ""); cur = null; return; }
      if (/^[-*•]\s+/.test(t)) {
        if (META.test(t)) { cur = null; return; }
        var title = t.replace(/^[-*•]\s+/, "").trim();
        var parts = title.split(/\s+—\s+/);
        cur = { group: group, name: parts[0], hint: parts.slice(1).join(" — "), prompt: [], title: title };
        out.push(cur);
        return;
      }
      if (cur) cur.prompt.push(t);
    });
    out.forEach(function (c) {
      var txt = c.prompt.join(" ").replace(/\s+/g, " ").trim();
      if (!txt) {
        /* 제목 줄 안에 영문 프롬프트를 같이 낸 경우 */
        var q1 = c.title.indexOf('"'), q2 = c.title.lastIndexOf('"');
        if (q1 >= 0 && q2 > q1) {
          var inner = c.title.slice(q1 + 1, q2);
          if (/[A-Za-z]{3,}/.test(inner) && inner.replace(/[^A-Za-z]/g, "").length > 20) txt = inner;
        }
      }
      var a = txt.indexOf('"'), b = txt.lastIndexOf('"');
      c.promptText = (a >= 0 && b > a) ? txt.slice(a + 1, b).replace(/\s+/g, " ").trim() : txt;
      delete c.prompt;
    });
    return out.filter(function (c) { return c.promptText; });
  }

  /* 그룹 머리말에 붙은 모델용 지시문(" — 목차 1번부터 FAQ 직전 …")은 화면에서 뺀다 */
  function groupTitle(g) {
    return String(g || "").split(/\s+—\s+/)[0].trim();
  }
  /* 카드에 보여 줄 안내는 '삽입 한글 문구'뿐 — 나머지 템플릿 지시문은 화면에서 숨긴다 */
  function showHint(h) {
    return !!h && /삽입\s*한글\s*문구/.test(h);
  }

  function imagePromptCardsHtml(bodyLines) {
    var cards = parseImagePromptCards(bodyLines);
    if (!cards.length) {
      return '<div class="memo-box"><strong>🖼️ 이미지 프롬프트 세트 · 화면 확인용(복사본에는 빠집니다)</strong>' +
        '<pre style="white-space:pre-wrap;word-break:break-word;margin:10px 0 0;font:inherit;line-height:1.7">' +
        esc((bodyLines || []).join("\n").trim()) + "</pre></div>";
    }
    var html = ['<div class="memo-box imgset-box">',
      '<strong>🖼️ 이미지 프롬프트 세트 · 화면 확인용(복사본에는 빠집니다)</strong>',
      '<div class="imgset-note">항목마다 [📋 프롬프트 복사]를 누르면 따옴표 안 영문 프롬프트만 복사됩니다 — 제미나이 새 대화에 그대로 붙여넣으세요.</div>'];
    var lastGroup = null;
    cards.forEach(function (c, i) {
      if (c.group && c.group !== lastGroup) {
        html.push('<div class="imgset-group">' + esc(groupTitle(c.group)) + "</div>");
        lastGroup = c.group;
      }
      html.push('<div class="imgset-card" data-i="' + i + '">' +
        '<div class="imgset-card-head"><strong>' + esc(c.name) + "</strong></div>" +
        (showHint(c.hint) ? '<div class="imgset-hint">' + esc(c.hint) + "</div>" : "") +
        '<div class="imgset-prompt">' + esc(c.promptText) + "</div>" +
        '<div class="imgset-foot"><button type="button" class="btn small primary" data-imgset-copy="' + i + '">📋 프롬프트 복사</button></div>' +
        "</div>");
    });
    html.push("</div>");
    return html.join("");
  }

  /* 카드 복사 버튼 — 따옴표 안 영문 프롬프트만 복사하고 버튼에 ✅ 복사됨을 보여 준다 */
  function bindImagePromptCopies(box) {
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-imgset-copy]"), function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".imgset-card");
        var el = card ? card.querySelector(".imgset-prompt") : null;
        var txt = el ? el.textContent.trim() : "";
        if (!txt) { toast("복사할 프롬프트를 찾지 못했습니다"); return; }
        copyPlain(txt).then(function (ok) {
          if (!ok) { toast("복사가 막혔습니다 — 프롬프트를 직접 선택해 복사해 주세요"); return; }
          var old = btn.getAttribute("data-label") || btn.textContent;
          btn.setAttribute("data-label", old);
          btn.textContent = "✅ 복사됨";
          btn.classList.add("copied");
          toast("프롬프트를 복사했습니다 — 제미나이에 붙여넣으세요");
          setTimeout(function () { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
        });
      });
    });
  }

  /* 이 화면에서만 보여 주고 복사본에서는 빠지는 계획용 머리말 */
  function isPlanSection(label) {
    return /^제목\s*후보/.test(label) || /^최종\s*추천\s*제목/.test(label) || /^추천\s*제목/.test(label);
  }
  function stripMetaSections(md) {
    return String(md || "")
      .replace(/##\s*제목\s*후보[\s\S]*?(?=##\s|$)/, "")
      .replace(/##\s*(?:🏆\s*)?(?:최종\s*추천\s*제목|추천\s*제목)[\s\S]*?(?=##\s|$)/, "")
      .replace(/##\s*작업\s*메모[\s\S]*?(?=##\s|$)/, "")
      .replace(/##\s*(?:🖼\uFE0F?\s*)?이미지\s*프롬프트(?:\s*세트)?[\s\S]*?(?=##\s|$)/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* 모델이 고른 최종 추천 제목 읽기 ("추천: ..." / 첫줄) */
  function parseRecommendedTitle(sec) {
    if (!sec) return "";
    var rec = "";
    sec.body.forEach(function (l) {
      var t = l.trim().replace(/\*\*/g, "").replace(/^[-*•]\s+/, "");
      if (!t) return;
      var m = t.match(/^(?:추천(?:\s*제목)?|최종\s*추천)\s*[:：]?\s*(?!이유\s*[:：])(.+)$/);
      if (m && !rec) rec = m[1];
    });
    if (!rec) {
      var first = sec.body.filter(function (l) { return l.trim(); })[0];
      if (first) rec = first.trim().replace(/\*\*/g, "").replace(/^[-*•]\s+/, "");
    }
    return stripTitleMeta(rec);
  }
  function recommendationReason(sec) {
    if (!sec) return "";
    var r = "";
    sec.body.forEach(function (l) {
      var t = l.trim().replace(/\*\*/g, "").replace(/^[-*•]\s+/, "");
      var m = t.match(/^(?:추천\s*이유|이유)\s*[:：]\s*(.+)$/);
      if (m) r = m[1];
    });
    return r;
  }

  /* ---------- 렌더 ---------- */
  function sectionLabel(h) {
    return String(h || "")
      .replace(/\[|\]/g, "")
      .replace(/^[^0-9A-Za-z가-힣]+/, "")   // 앞에 붙은 🏆·💡·📌 같은 기호 제거
      .trim();
  }

  function renderArticle() {
    var r = state.result;
    if (!r) return;
    if (r.blogger) { renderBlogger(); return; }   // 🪙🌙 구글 블로거는 전용 패널 (v2.0.0)
    var secs = r.sections;
    var html = [];
    var cafeNoteDone = false;
    html.push('<div class="art-title">' + stripStrayMarks(esc(r.title || "(제목 미선택)")) + "</div>");
    if (isProductResult(r) && !hasProductDisclosure(r.md)) html.push(disclosureHtml(false, r, true));
    /* 🧾 v2.3.5 — 블로그 모드도 대가성 문구를 제목 바로 아래(본문 최상단)에 한 번 */
    if (blogDisclosureWanted(r)) html.push(blogDisclosureHtml(false));

    secs.forEach(function (sec) {
      var label = sectionLabel(sec.h);
      if (!label) return;
      if (/^제목 후보/.test(label)) return;
      if (/^최종\s*추천\s*제목/.test(label) || /^추천\s*제목/.test(label)) {
        var rec = parseRecommendedTitle(sec);
        var why = recommendationReason(sec);
        html.push('<div class="pick-box"><div class="pick-tag">🏆 최종 추천 제목</div>' +
          '<div class="pick-title">' + esc(rec || r.title || "") + '</div>' +
          (why ? '<p class="pick-why">' + mdInline(why) + "</p>" : "") + "</div>");
        return;
      }

      if (/^3초 핵심정리/.test(label)) {
        html.push('<div class="key-box"><strong>3초 핵심정리</strong><ul>' +
          sec.body.filter(function (l) { return l.trim(); })
            .map(function (l) { return "<li>" + mdInline(l.trim().replace(/^[-*•]\s+/, "")) + "</li>"; }).join("") +
          "</ul></div>");
        return;
      }
      if (/^작성일/.test(label)) {
        html.push('<p class="meta">' + mdInline(sec.body.join(" ").trim()) + "</p>");
        return;
      }
      if (/^해시태그/.test(label)) {
        if (isCafeResult(r) && !hasCafeDisclaimer(r.md)) { html.push(cafeDisclaimerHtml(false)); cafeNoteDone = true; }
        var tags = sec.body.join(" ").trim().split(/\s+/).filter(function (x) { return x; });
        html.push('<div class="tags">' + tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>");
        return;
      }
      if (isProductResult(r) && /^상품\s*링크$/.test(label)) {
        var note = sec.body.filter(function (l) { return l.trim(); }).join(" ").trim();
        html.push('<div class="buy-box"><div class="buy-note">' + stripStrayMarks(mdInline(note)) + "</div>" +
          buyCardHtml(false, (BS.PRODUCT.linkCard || {}).bottom, r) + "</div>");
        return;
      }
      if (isMemoSection(label)) {
        html.push('<div class="memo-box"><strong>작업 메모 · 화면 확인용(복사본에는 빠집니다)</strong><ul>' +
          sec.body.filter(function (l) { return l.trim(); })
            .map(function (l) { return "<li>" + mdInline(l.trim().replace(/^[-*•]\s+/, "")) + "</li>"; }).join("") +
          "</ul></div>");
        return;
      }
      if (isImagePromptSection(label)) {
        html.push(imagePromptCardsHtml(sec.body));
        return;
      }
      if (/^FAQ/.test(label)) {
        var qa = [];
        var cur = null;
        sec.body.forEach(function (l) {
          var t = l.trim();
          if (!t) return;
          if (/^Q[.:)]/.test(t)) { cur = { q: t.replace(/^Q[.:)]\s*/, ""), a: [] }; qa.push(cur); }
          else if (/^A[.:)]/.test(t) && cur) { cur.a.push(t.replace(/^A[.:)]\s*/, "")); }
          else if (cur) { if (cur.a.length) cur.a.push(t); else cur.q += " " + t; }
        });
        html.push("<h2>FAQ</h2>");
        html.push(qa.map(function (x) {
          return '<p><strong>Q. ' + mdInline(x.q) + "</strong><br>A. " + mdInline(x.a.join(" ")) + "</p>";
        }).join("\n"));
        return;
      }
      html.push("<h2>" + stripStrayMarks(esc(label)) + "</h2>");
      html.push(bodyToHtml(sec.body));
      if (isProductResult(r) && /한눈에\s*비교/.test(label)) {
        html.push('<p class="buy-line">' + buyCardHtml(false, (BS.PRODUCT.linkCard || {}).mid, r) + "</p>");
      }
    });

    // 제휴·공정위 블록 (블로그 모드만) / 상품 리뷰는 링크 카드·공정위 문구를 따로
    if (isCafeResult(r)) {
      if (!hasCafeDisclaimer(r.md) && !cafeNoteDone) html.push(cafeDisclaimerHtml(false));
    } else if (isProductResult(r)) {
      /* 공정위 문구는 본문 최상단에 이미 넣었다 */
    } else {
      html.push(affiliateHtml(false));
    }
    $("#articlePreview").innerHTML = applyAffiliateLink(html.join("\n"));
    bindImagePromptCopies($("#articlePreview"));   // v2.2.6 — 카드별 [📋 프롬프트 복사]

    // 글자수 (형광펜 기호 ==·@@는 본문 글자로 세지 않는다)
    var plain = stripEmphasisMarks(stripMetaSections(r.md));
    var cc = charCount(plain);
    $("#charCount").textContent = "본문 " + cc.noSpace.toLocaleString() + "자 (공백 제외) · " + cc.withSpace.toLocaleString() + "자 (공백 포함)";
  }

  /* ---------- 글 용도별 출력 요소 (v1.8.0) ----------
     ☕ 카페: 맨 끝 부드러운 면책 한 줄 (박스 없이)
     🛒 제휴 리뷰: 상품 링크 카드(중간·하단) + 플랫폼별 공정위 대가성 문구 */
  function cafeDisclaimerText() { return (BS.CAFE && BS.CAFE.disclaimer) || ""; }
  function hasCafeDisclaimer(md) {
    return /직접\s*알아보고\s*정리한|공식\s*안내도\s*꼭/.test(String(md || ""));
  }
  function cafeDisclaimerHtml(inline) {
    var t = cafeDisclaimerText();
    if (!t) return "";
    if (inline) return '<p style="font-size:0.92em;line-height:1.85;margin:0;color:#7a7268">' + esc(t) + "</p>";
    return '<p class="cafe-note">' + esc(t) + "</p>";
  }

  function productPlatformFor(r) {
    r = r || state.result || {};
    return BS.platform(r.productPlatform || state.productPlatform || "coupang");
  }
  function buyHref(r) {
    r = r || state.result || {};
    var pf = productPlatformFor(r);
    var url = String(r.productUrl || ($("#productUrl") ? $("#productUrl").value : "") || "").trim();
    if (url) return url;
    var kw = r.topic || ($("#topic") ? $("#topic").value : "") || "";
    return (pf.searchUrl || "https://www.coupang.com/np/search?q=") + encodeURIComponent(kw);
  }
  function buyCardHtml(inline, label, r) {
    var href = buyHref(r);
    var txt = label || ((BS.PRODUCT.linkCard || {}).bottom || "👉 상품 정보 확인하러 가기");
    if (inline) {
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener nofollow" style="display:inline-block;padding:11px 18px;background:#1f7a5c;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:10px">' + esc(txt) + "</a>";
    }
    return '<a class="buy-card" href="' + esc(href) + '" target="_blank" rel="noopener nofollow">' + esc(txt) + "</a>";
  }
  function disclosureTextFor(r) { return productPlatformFor(r).disclosure || ""; }
  function hasProductDisclosure(md) {
    return /쿠팡\s*파트너스\s*활동의\s*일환|브랜드\s*커넥트|쇼핑\s*커넥트|여행·쇼핑\s*커넥트|수수료를\s*제공받|수수료를 받습니다/.test(String(md || ""));
  }
  /* 공정위 대가성 문구 — 네이버 커넥트 가이드대로 본문 최상단에 둔다.
     네이버는 안내된 문구를 다른 표현·누락·본문 중간/끝에 두면 페널티 대상이라고 안내한다. */
  function disclosureHtml(inline, r, top) {
    var t = disclosureTextFor(r);
    if (!t) return "";
    if (inline) {
      return top
        ? '<p style="margin:0;padding:10px 12px;background:#f7f7f4;border-left:3px solid #b9b2a6;font-size:13px;line-height:1.7;color:#5d574e">' + esc(t) + "</p>"
        : '<p style="margin:14px 0 0;padding-top:10px;border-top:1px dashed #e0d8cc;font-size:13px;color:#8d857c">' + esc(t) + "</p>";
    }
    return (top ? '<div class="disc disc-top">' : '<div class="disc">') + esc(t) + "</div>";
  }

  /* 본문의 '💡 여기서 잠깐' 제휴 팁에 실제 링크를 바로 붙인다 (확정 규칙: 링크는 팁 안에)
     v2.2.1 — 쿠팡 뿐 아니라 네이버 쇼핑커넥트·크리에이터샵 링크도 같은 자리에 붙인다. */
  function tipAnchorHtml() {
    var pf = affiliateInfo();
    var link = ($("#coupangLink") && $("#coupangLink").value || "").trim();
    var kw = (state.result && (state.result.affiliateKeyword || state.result.topic)) || "";
    var href = link || ((pf.searchUrl || "https://www.coupang.com/np/search?q=") + encodeURIComponent(kw));
    return '<a href="' + href + '" target="_blank" rel="noopener nofollow" style="color:#b8452a;text-decoration:none;font-weight:700">👉 추천 상품 링크</a>';
  }
  function hasTip(md) { return /여기서\s*잠깐/.test(String(md || "")); }
  /* 원고 본문에 어느 플랫폼이든 공정위 문구가 이미 있는지 (v2.2.1 — 네이버 커넥트까지) */
  function bodyHasDisclosure(md) {
    return /쿠팡\s*파트너스\s*활동의\s*일환|브랜드\s*커넥트\s*활동의\s*일환|쇼핑\s*커넥트\s*활동의\s*일환|여행\s*커넥트\s*활동의\s*일환/.test(String(md || ""));
  }
  /* 🧾 블로그 모드 대가성 문구 — 제목 바로 아래(본문 최상단)에 딱 한 번 (v2.3.5)
     v2.3.4까지는 프롬프트가 문구를 '💡 여기서 잠깐' 팁 안(본문 중간)에 넣으라고 했고,
     원고에 없으면 앱이 글 끝에 붙였다. 둘 다 2024-12-01 개정 지침의 부적절 예시다.
     지금은 상품·여행 리뷰 모드와 같은 자리(최상단)에 넣는다. */
  function blogDisclosureWanted(r) {
    r = r || state.result;
    if (!r) return false;
    if (resultMode(r) !== "blog") return false;      // 카페·상품 리뷰는 따로 처리
    if (!$("#optDisclosure") || !$("#optDisclosure").checked) return false;
    if (affiliateSkipped(r.md)) return false;        // 주제 무관으로 생략한 글
    if (!affiliateInfo().disclosure) return false;   // 제휴 글이 아님
    return !bodyHasDisclosure(r.md);
  }
  function blogDisclosureText() {
    return affiliateInfo().disclosure || BS.DISCLOSURE || "";
  }
  function blogDisclosureHtml(inline) {
    var t = blogDisclosureText();
    if (!t) return "";
    if (inline) {
      return '<p style="margin:0;padding:10px 12px;background:#f7f7f4;border-left:3px solid #b9b2a6;font-size:13px;line-height:1.7;color:#5d574e">' + esc(t) + "</p>";
    }
    return '<div class="disc disc-top">' + esc(t) + "</div>";
  }
  /* 원고가 '주제 무관으로 생략'했다고 밝혔는지 (2026-11-17 제휴 연관성 규칙)
     생략한 글에는 앱이 상품 박스도 공정위 문구도 다시 붙이지 않는다. */
  function affiliateSkipped(md) { return /제휴[^\n]{0,20}(생략|무관|없음)/.test(String(md || "")); }
  function applyAffiliateLink(html) {
    if (!$("#optAffiliate").checked) return html;
    if (affiliateSkipped(state.result && state.result.md)) return html;
    var anchor = tipAnchorHtml();
    var re = /(<blockquote[^>]*>(?:(?!<\/blockquote>)[\s\S])*?여기서\s*잠깐[\s\S]*?)(<\/blockquote>)/;
    if (re.test(html)) {
      return html.replace(re, function (m, inner, close) { return inner + "<br>" + anchor + close; });
    }
    return html;
  }

  function affiliateHtml(inline, r) {
    r = r || state.result;
    if (!r) return "";
    var skipped = affiliateSkipped(r.md);
    if (skipped) {
      /* 주제와 무관해 원고가 제휴 팁을 빼면 상품 박스·공정위 문구도 붙이지 않는다.
         미리보기에만 이유를 남기고, 복사본(스마트에디터·마크다운)에는 넣지 않는다. */
      if (!inline) return '<div class="disc">이 글은 주제와 무관해 제휴 상품·공정위 문구를 넣지 않았습니다 (규칙 v1.4)</div>';
      return "";
    }
    var aff = $("#optAffiliate").checked;
    var disc = $("#optDisclosure").checked;
    if (!aff && !disc) return "";
    var tip = hasTip(r.md);
    var out = [];
    if (aff && !tip) {
      var label = '👉 추천 상품 보러가기';
      if (inline) {
        out.push('<div style="margin:16px 0;padding:12px 14px;background:#fff8ec;border:1px solid #f0dfc0;border-radius:10px;font-size:15px">' +
          tipAnchorHtml().replace(">👉 추천 상품 링크<", ">" + label + "<") + "</div>");
      } else {
        out.push('<div class="coupon">' + tipAnchorHtml().replace(">👉 추천 상품 링크<", ">" + label + "<") + "</div>");
      }
    }
    /* v2.3.5 — 대가성 문구는 여기(글 끝)가 아니라 renderArticle()·buildRichHtml()이
       제목 바로 아래에 넣는다. 이 함수는 제휴 링크 카드만 맡는다. */
    return out.join("\n");
  }

  /* 스마트에디터용 인라인 스타일 HTML
     네이버 스마트에디터 ONE은 붙여넣을 때 CSS 여백(margin)을 거의 지운다.
     그래서 여백은 '진짜 빈 줄'인 <p><br></p>로 넣는다.
     v1.6.2 (2026-11-17 지연님이 스마트에디터에서 직접 정리한 사진 기준):
     - 서두·본문·맺음말 같은 구조 라벨 제목과 그 아래 회색 밑줄은 복사본에 넣지 않는다.
       (블로그 실제 글처럼 소제목과 문장이 바로 이어지게)
     - 소제목(h3) 아래·문단 사이는 빈 줄 딱 1줄, 소제목 앞과 섹션 제목 앞은 2줄.
     - 어떤 경우에도 빈 줄이 3줄 이상 연속하지 않는다. */
  var RICH_GAP = "<p><br></p>";
  var RICH_H3_STYLE = ' style="font-size:1.18em;font-weight:800;line-height:1.55;margin:0;color:#1d1a17"';
  /* 복사본에 제목을 남기지 않는 구조 라벨 — 본문 흐름만 이어 붙인다 */
  var STRUCT_LABEL = /^(서두|본문|맺음말|서론|결론)(\s*\d+)?(\s*[:：].*)?(\s*[\(\[].*[\)\]])?$/;
  /* 독자가 실제로 보는 섹션 제목 — 복사본에도 남긴다(밑줄 없이 굵은 제목만) */
  var KEEP_H2 = /^(목차|FAQ|출처|참고\s*출처|참고\s*자료|면책사항|면책)/i;

  function buildRichHtml() {
    var r = state.result;
    if (!r) return "";
    var secs = r.sections;
    var mode = resultMode(r);
    var cafeMode = mode === "cafe";
    var prodMode = mode === "product";
    var cafeNoteDone = false;
    var parts = [];
    var h2s = ' style="font-size:1.42em;font-weight:800;line-height:1.45;margin:0;color:#1d1a17;letter-spacing:-.01em"';
    var h3s = RICH_H3_STYLE;
    var pS = ' style="font-size:1em;line-height:1.95;margin:0;color:#222"';
    var boxTitleS = ' style="font-size:0.98em;font-weight:700;line-height:1.5;margin:0;color:#b8452a"';
    var boxLiS = ' style="font-size:1em;line-height:1.85;margin:0 0 10px"';

    // gaps = 이 블록 앞에 넣을 빈 줄 수 (1=문단 사이, 2=소제목·섹션 제목 앞)
    function add(html, gaps) {
      if (html == null) return;
      var h = String(html).trim();
      if (!h) return;
      parts.push({ html: h, gaps: gaps || 1 });
    }
    function isHeading(h) { return /^<h[23][\s>]/.test(h); }
    /* 본문 한 덩이를 블록 단위로 풀어 넣는다 — 소제목 앞만 2줄, 나머지는 1줄 */
    function addBody(lines, firstGap) {
      if (!lines) return;
      bodyToHtml(lines, { inline: true, blocks: true }).forEach(function (h, i) {
        add(h, isHeading(h) ? 2 : (i === 0 ? (firstGap || 1) : 1));
      });
    }

    secs.forEach(function (sec) {
      var label = sectionLabel(sec.h);
      if (!label || isPlanSection(label)) return;
      if (isMemoSection(label)) return; // 작업 메모는 스마트에디터 복사본에 넣지 않는다
      if (isImagePromptSection(label)) return; // 🖼️ 이미지 프롬프트 세트도 화면 확인용 — 복사본에는 넣지 않는다 (v2.2.3)

      if (/^3초 핵심정리/.test(label)) {
        add('<div style="padding:16px 18px 8px;background:#fbf6f0;border:1px solid #f0e4d6;border-radius:10px">' +
          "<p" + boxTitleS + ">3초 핵심정리</p>" + RICH_GAP +
          '<ul style="margin:0;padding-left:20px">' +
          sec.body.filter(function (l) { return l.trim(); }).map(function (l) {
            return "<li" + boxLiS + ">" + mdInline(l.trim().replace(/^[-*•]\s+/, ""), true) + "</li>";
          }).join("") + "</ul></div>", 2);
        return;
      }
      if (/^작성일/.test(label)) {
        add("<p" + pS.replace("color:#222", "color:#8d857c;font-size:0.9em") + ">" + mdInline(sec.body.join(" ").trim(), true) + "</p>", 1);
        return;
      }
      if (/^해시태그/.test(label)) {
        if (cafeMode && !hasCafeDisclaimer(r.md)) { add(cafeDisclaimerHtml(true), 2); cafeNoteDone = true; }
        add("<p" + pS.replace("color:#222", "color:#3f63a8") + ">" + esc(sec.body.join(" ").trim()) + "</p>", 2);
        return;
      }
      if (prodMode && /^상품\s*링크$/.test(label)) {
        var buyNote = sec.body.filter(function (l) { return l.trim(); }).join(" ").trim();
        add('<p' + pS + ">" + mdInline(buyNote, true) + "</p>" + RICH_GAP + "\n" +
          '<p style="margin:0">' + buyCardHtml(true, (BS.PRODUCT.linkCard || {}).bottom, r) + "</p>", 2);
        return;
      }
      if (/^FAQ/.test(label)) {
        add("<h2" + h2s + ">FAQ</h2>", 2);
        var qa = [];
        var cur = null;
        sec.body.forEach(function (l) {
          var t = l.trim();
          if (!t) return;
          if (/^Q[.:)]/.test(t)) { cur = { q: t.replace(/^Q[.:)]\s*/, ""), a: [] }; qa.push(cur); }
          else if (/^A[.:)]/.test(t) && cur) cur.a.push(t.replace(/^A[.:)]\s*/, ""));
          else if (cur) { if (cur.a.length) cur.a.push(t); else cur.q += " " + t; }
        });
        if (qa.length) {
          // 질문과 답은 한 덩어리로(사이를 붙여 두고), 질문 묶음 사이만 빈 줄로 띄운다
          qa.forEach(function (x) {
            add('<p' + pS.replace("color:#222", "color:#1d1a17;font-weight:700") + '>Q. ' + mdInline(x.q, true) + "</p>" +
              "<p" + pS + ">A. " + mdInline(x.a.join(" "), true) + "</p>", 1);
          });
        } else {
          addBody(sec.body, 1); // Q./A. 형식이 아닌 FAQ도 글을 잃지 않고 그대로 옮긴다
        }
        return;
      }
      // 서두·본문·맺음말: 라벨 제목 없이 본문만 이어 붙인다 (밑줄도 넣지 않는다)
      if (STRUCT_LABEL.test(label)) {
        addBody(sec.body, 1);
        return;
      }
      // 독자가 실제로 보는 섹션 제목(목차·출처·면책사항 …): 제목은 남기고 밑줄은 뺀다
      if (KEEP_H2.test(label)) {
        add("<h2" + h2s + ">" + stripStrayMarks(esc(label)) + "</h2>", 2);
        addBody(sec.body, 1);
        return;
      }
      add("<h3" + h3s + "><strong>" + stripStrayMarks(esc(label)) + "</strong></h3>", 2);
      addBody(sec.body, 1);
      if (prodMode && /한눈에\s*비교/.test(label)) {
        add('<p style="margin:0">' + buyCardHtml(true, (BS.PRODUCT.linkCard || {}).mid, r) + "</p>", 2);
      }
    });
    /* 글 용도별 마무리 — ☕ 카페는 부드러운 면책 한 줄, 🛒 리뷰는 공정위 문구 */
    if (cafeMode) {
      if (!hasCafeDisclaimer(r.md) && !cafeNoteDone) add(cafeDisclaimerHtml(true), 2);
    } else if (prodMode) {
      /* 공정위 문구는 본문 맨 앞 블록으로 넣는다 (아래 unshift) */
    } else {
      add(affiliateHtml(true), 2);
    }
    if (prodMode && !hasProductDisclosure(r.md)) parts.unshift({ html: disclosureHtml(true, r, true), gaps: 1 });
    /* 🧾 v2.3.5 — 블로그 모드 대가성 문구도 복사본 맨 앞(제목 바로 아래 자리)에 */
    if (!cafeMode && !prodMode && blogDisclosureWanted(r)) parts.unshift({ html: blogDisclosureHtml(true), gaps: 1 });

    var html = "";
    parts.forEach(function (p, idx) {
      var g = Math.max(1, Math.min(2, p.gaps || 1));
      if (idx === 0) { html = p.html; return; }
      var sep = "";
      for (var i = 0; i < g; i++) sep += RICH_GAP + "\n";
      html += "\n" + sep + p.html;
    });
    // 안전장치: 어느 경로로든 빈 줄이 3줄 이상 연속하면 2줄로 줄이고, 끝의 빈 줄은 남기지 않는다
    html = html.replace(/(?:<p><br><\/p>\s*){3,}/g, RICH_GAP + "\n" + RICH_GAP + "\n");
    html = html.replace(/(?:\s*<p><br><\/p>)+\s*$/, "");
    return (cafeMode || prodMode) ? html : applyAffiliateLink(html);
  }

  /* 마크다운 복사본 (제목 포함, 머리말 정리) */
  function buildMarkdown() {
    var r = state.result;
    if (!r) return "";
    var md = "# " + (r.title || "") + "\n\n" + stripEmphasisMarks(stripMetaSections(r.md));
    /* ☕ 카페 글 — 제휴·공정위 없이, 맨 끝 부드러운 면책만 */
    if (isCafeResult(r)) {
      if (!hasCafeDisclaimer(r.md)) md += "\n\n" + cafeDisclaimerText();
      return md;
    }
    /* 🛒 제휴 리뷰 — 공정위 문구는 맨 앞(본문 최상단), 상품 링크 카드는 글 끝 */
    if (isProductResult(r)) {
      var ptitle = "# " + (r.title || "") + "\n\n";
      var pbody = stripEmphasisMarks(stripMetaSections(r.md));
      var pout = ptitle + (hasProductDisclosure(r.md) ? "" : disclosureTextFor(r) + "\n\n") + pbody;
      pout += "\n\n> 👉 [" + ((BS.PRODUCT.linkCard || {}).bottom || "상품 정보 확인").replace(/^👉\s*/, "") + "](" + buyHref(r) + ")";
      return pout;
    }
    var aff = $("#optAffiliate").checked;
    var disc = $("#optDisclosure").checked;
    if (affiliateSkipped(r.md)) return md;
    /* 🧾 v2.3.5 — 대가성 문구는 글 끝이 아니라 제목 바로 아래(본문 최상단)에 */
    var mout = "# " + (r.title || "") + "\n\n" +
      (disc && blogDisclosureWanted(r) ? blogDisclosureText() + "\n\n" : "") +
      stripEmphasisMarks(stripMetaSections(r.md));
    if (aff) {
      var link = ($("#coupangLink").value || "").trim();
      mout += "\n\n> 👉 [추천 상품 보러가기](" + (link || ("https://www.coupang.com/np/search?q=" + encodeURIComponent(r.topic || ""))) + ")";
    }
    return mout;
  }

  /* ---------------- 🔍 구글 실시간 검색 (v1.9.3 · 2026-11-17) ----------------
     지연님이 "최신 정보 확인해서 쓰게"라고 해서 붙인 기능이다.
       · 토글(localStorage bs.webSearch · 기본 ON)이 켜져 있으면 검색 지원 모델 호출에
         tools:[{google_search:{}}]를 붙인다.
       · 응답의 groundingMetadata에서 실제 검색어·출처(제목·주소)를 뽑아 화면에 보여 주고,
         2단계 검수에는 "이 제목·주소만 허용"으로 넘겨 가짜 URL을 지운다.
       · 미지원 모델(Flash Lite)이거나 400/403이 나면 tools 없이 다시 불러 원고가 멈추지 않는다. */
  var WS = BS.WEB_SEARCH || {};

  function webSearchEnabled() {
    try {
      var v = localStorage.getItem(K_WEBSEARCH);
      if (v === null || v === "") return WS.defaultOn !== false;
      return v !== "0";
    } catch (e) { return WS.defaultOn !== false; }
  }
  function setWebSearchPref(on) {
    try { localStorage.setItem(K_WEBSEARCH, on ? "1" : "0"); } catch (e) {}
  }

  function wsHost(uri) {
    var m = String(uri == null ? "" : uri).match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].toLowerCase() : "";
  }
  /* 🛡️ 출처 등급 (v2.3.3 · 2026-11-20) — 제목·주소에 체험단·협찬·원고료 표기가 있거나
     리뷰노트·레뷰 같은 체험단 플랫폼 주소인 페이지를 짚는다. 지우지는 않고 표시만 한다. */
  function wsAdHit(s) {
    if (!s) return "";
    var text = String((s.title || "") + " " + (s.url || ""));
    var words = WS.adWords || [];
    var i;
    for (i = 0; i < words.length; i++) {
      if (words[i] && text.indexOf(words[i]) >= 0) return words[i];
    }
    var host = String(s.host || wsHost(s.url || "")).toLowerCase();
    var doms = WS.adDomains || [];
    for (i = 0; i < doms.length; i++) {
      if (doms[i] && host && host.indexOf(doms[i]) >= 0) return doms[i];
    }
    return "";
  }
  /* groundingMetadata → {queries:[], sources:[{title,url,host,redirect,label}]} */
  function parseGrounding(json) {
    var out = { queries: [], sources: [] };
    var cand = ((json && json.candidates) || [])[0] || {};
    var meta = cand.groundingMetadata || cand.grounding_metadata;
    if (!meta) return out;
    var seen = {};
    var redHost = String(WS.redirectHost || "vertexaisearch.cloud.google.com");
    var maxQ = WS.maxQueries || 6;
    var maxS = WS.maxSources || 8;
    (meta.webSearchQueries || meta.web_search_queries || []).forEach(function (q) {
      var s = String(q == null ? "" : q).trim();
      if (!s || seen["q:" + s] || out.queries.length >= maxQ) return;
      seen["q:" + s] = 1;
      out.queries.push(s);
    });
    (meta.groundingChunks || meta.grounding_chunks || []).forEach(function (c) {
      var w = (c && (c.web || c.web_chunk)) || {};
      var uri = String(w.uri || w.url || "").trim();
      var title = String(w.title || "").trim();
      if (!uri && !title) return;
      var key = uri || title;
      if (seen["s:" + key] || out.sources.length >= maxS) return;
      seen["s:" + key] = 1;
      var host = wsHost(uri);
      var redirect = !!host && host.indexOf(redHost) >= 0;
      out.sources.push({
        title: title || host || "구글 검색 결과",
        url: uri,
        host: redirect ? "" : host,
        redirect: redirect,
        label: (title || host || "구글 검색 결과") + (host && !redirect ? " (" + host + ")" : "")
      });
    });
    return out;
  }

  function resetGrounding() {
    state.grounding = { queries: [], sources: [] };
    state.webSearchMode = "";
  }
  /* 1단계·2단계 검색 결과를 한 곳에 모은다 (2단계에서 새 출처가 늘 수 있다) */
  function addGrounding(g, model) {
    if (!g) return;
    var cur = state.grounding || { queries: [], sources: [] };
    (g.queries || []).forEach(function (q) {
      if (cur.queries.indexOf(q) < 0) cur.queries.push(q);
    });
    (g.sources || []).forEach(function (s) {
      var dup = cur.sources.some(function (x) {
        return s.url ? x.url === s.url : x.title === s.title;
      });
      if (!dup) cur.sources.push(s);
    });
    cur.model = model || cur.model || "";
    state.grounding = cur;
    // 실제 검색어·출처가 왔을 때만 배지를 지운다 — 빈 응답이 "검색 미지원/폴백" 경고를 지우지 않게
    if (cur.queries.length || cur.sources.length) state.webSearchMode = "";
    paintWebSearch();
  }
  function noteSearchSkip(model) {
    state.webSearchMode = "skip";
    state.webSearchModel = model || "";
    paintWebSearch();
  }
  function noteSearchFallback(model) {
    state.webSearchMode = "fallback";
    state.webSearchModel = model || "";
    paintWebSearch();
  }

  function paintWebSearch() {
    var stEl = $("#webSearchState");
    var srcEl = $("#webSearchSources");
    if (stEl) {
      var msg = "";
      var warn = false;
      if (state.webSearchMode === "skip") {
        warn = true;
        msg = "⚠️ " + (WS.fallbackBadge || "검색 미지원 모델 → 일반 작성") +
          (state.webSearchModel ? " (" + state.webSearchModel + ")" : "");
      } else if (state.webSearchMode === "fallback") {
        warn = true;
        msg = "⚠️ " + (WS.errorBadge || "검색을 붙이지 못해 일반 작성으로 전환") +
          (state.webSearchModel ? " (" + state.webSearchModel + ")" : "");
      } else if (state.webSearchBusy) {
        msg = WS.runningLabel || "🔍 구글 실시간 검색으로 최신 확인 중…";
      } else if (state.grounding && (state.grounding.sources.length || state.grounding.queries.length)) {
        msg = "🔍 검색어 " + state.grounding.queries.length + "개 · 실제 출처 " +
          state.grounding.sources.length + "건을 원고에 반영했습니다";
      }
      if (msg) {
        stEl.hidden = false;
        stEl.className = "ws-state" + (warn ? " warn" : "");
        stEl.textContent = msg;
      } else {
        stEl.hidden = true;
        stEl.textContent = "";
      }
    }
    if (srcEl) {
      var list = (state.grounding && state.grounding.sources) || [];
      if (!list.length) {
        srcEl.hidden = true;
        srcEl.innerHTML = "";
      } else {
        srcEl.hidden = false;
        var adCount = 0;
        var rows = list.map(function (s) {
          var label = esc(s.label || s.title || s.url || "출처");
          var hit = wsAdHit(s);
          if (hit) adCount++;
          return "<li>" + (s.url
              ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener nofollow">' + label + "</a>"
              : label) +
            (hit ? ' <span class="wss-ad" title="받은 표시: ' + esc(hit) + ' — 근거로 쓰기 전에 공식 출처로 다시 확인하세요">' +
              esc(WS.adMark || "⚠️ 광고성") + "</span>" : "") + "</li>";
        }).join("");
        srcEl.innerHTML = '<div class="wss-head"><strong>' + esc(WS.sourcesTitle || "🔍 실제 구글 검색 출처") +
          '</strong><span class="wss-tag">' + list.length + "건 · " + esc(WS.sourcesTag || "글의 출처·수치 근거") + "</span>" +
          (adCount ? '<span class="wss-adw">' + esc(WS.adWarnTitle || "🛡️ 출처 확인: 광고성 의심") + " " + adCount + "건</span>" : "") +
          "</div>" +
          '<ol class="wss-list">' + rows + "</ol>" +
          (adCount ? '<p class="wss-adhint">' + esc(WS.adWarnHint || "") + "</p>" : "") +
          (list && state.grounding.queries.length
            ? '<p class="wss-q">검색어: ' + esc(state.grounding.queries.join(" · ")) + "</p>"
            : "");
      }
    }
  }

  /* v2.3.3 검증용(화면 동작에는 영향 없음) — 실제 검색 없이 출처 목록을 넣어 배너·표시를 본다
     예: BS.webSourceTest.set([{title:'협찬 리뷰', url:'https://blog.naver.com/x/1'}]) */
  BS.webSourceTest = {
    set: function (list) {
      state.grounding = {
        queries: [],
        sources: (list || []).map(function (s) {
          return {
            title: s.title || "", url: s.url || "", host: s.host || wsHost(s.url || ""),
            redirect: false, label: (s.title || s.url || "") + (wsHost(s.url || "") ? " (" + wsHost(s.url || "") + ")" : "")
          };
        })
      };
      paintWebSearch();
      return state.grounding.sources.length;
    },
    adHit: function (s) { return wsAdHit(s || {}); }
  };

  /* 🛡️ 결과물 검사기 (v2.2.1 · 2026-11-19 크리 님 합의)
     ① 건강 카테고리(긍정예찬·긍정사랑·식단건강·증상병원) — 식품표시광고법 제8조 위반 소지 표현
     ② 제품·리뷰 모드 — 직접 써보지 않은 제품의 1인칭 사용 후기
     원고를 자동으로 고치지 않고, 걸린 표현만 결과 맨 위에 짚어 준다(발행 전 확인). */
  function healthScopeFor(r) {
    if (!r) return false;
    var pid = (BS.personas && typeof BS.personas.id === "function") ? BS.personas.id() : "";
    return BS.healthContext(r.blogId, pid);
  }
  function safetyIssues(r) {
    var out = { health: [], fake: [] };
    if (!r) return out;
    var md = String(r.md || "");
    if (healthScopeFor(r)) out.health = BS.healthHits(md);
    var S = (BS.PRODUCT && BS.PRODUCT.reviewSafety) || {};
    var mode = resultMode(r);
    if (mode === "product" || r.reviewMode) {
      var memo = String(r.productMemo || "");
      /* 지연님이 직접 써 본 기록이 메모에 있으면 경고하지 않는다(진짜 후기) */
      var used = /직접\s*(사용|써|먹어)|써\s*본|사용\s*중/.test(memo);
      if (!used) {
        var hit = [];
        (S.fakeExperience || []).forEach(function (p) {
          if (md.indexOf(p) >= 0 && hit.indexOf(p) < 0) hit.push(p);
        });
        /* '직접 써보니'가 걸렸으면 그 안에 든 '써보니'는 따로 보여 주지 않는다 */
        out.fake = hit.filter(function (p) {
          return !hit.some(function (q) { return q !== p && q.indexOf(p) >= 0; });
        });
      }
    }
    return out;
  }
  function paintSafetyWarn() {
    var el = $("#safetyWarn");
    if (!el) return;
    var S = BS.SAFETY_CHECK || {};
    var iss = safetyIssues(state.result);
    var lines = [];
    if (iss.health.length) {
      lines.push("<b>" + esc(S.healthLabel || "건강 금지어") + "</b> — " + esc(iss.health.join(" · ")) +
        (S.healthHint ? '<div class="wsnw-hint">' + esc(S.healthHint) + "</div>" : ""));
    }
    if (iss.fake.length) {
      lines.push("<b>" + esc(S.fakeLabel || "허위 체험 의심") + "</b> — " + esc(iss.fake.join(" · ")) +
        (S.fakeHint ? '<div class="wsnw-hint">' + esc(S.fakeHint) + "</div>" : ""));
    }
    if (!lines.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = '<div class="wsnw-head"><strong>' + esc(S.head || "🛡️ 발행 전 확인 — 고칠 표현이 남아 있습니다") +
      '</strong></div><div class="wsnw-sub">' + lines.join("<br>") + "</div>";
  }

  /* ♻️ 실시간 검색 없이 작성된 원고 — 결과 화면 맨 위 경고 (v1.9.4 · 2026-11-18)
     검색 미지원 모델·검색 실패·토글 끔·검색 결과 0건으로 날짜·금액을 확인하지 못한 채
     원고가 나온 경우, 발행 전에 한 번 더 보라고 결과 맨 위에 분명하게 붙인다. */
  function liveSearchUsed() {
    var g = state.grounding || {};
    return !!(((g.sources || []).length) || ((g.queries || []).length));
  }
  function paintNoSearchWarn() {
    var el = $("#wsNoSearchWarn");
    if (!el) return;
    var r = state.result;
    // 지난 임시저장 복원본처럼 검색 여부를 모르는 결과에는 붙이지 않는다
    if (!r || r.liveSearch !== false) { el.hidden = true; el.innerHTML = ""; return; }
    var reason = r.liveSearchMode === "skip" ? "검색 미지원 모델로 일반 작성"
      : r.liveSearchMode === "fallback" ? "검색을 붙이지 못해 일반 작성"
        : r.liveSearchMode === "off" ? "검색 토글이 꺼져 있었습니다"
          : "검색 결과가 비어 있었습니다";
    el.hidden = false;
    el.innerHTML = '<div class="wsnw-head"><strong>' +
      esc(WS.noSearchWarn || "⚠️ 실시간 검색 없이 작성됨 — 날짜·금액·일정은 발행 전 한 번 더 확인하세요") +
      '</strong></div><div class="wsnw-sub">' + esc(reason) +
      (WS.noSearchWarnHint ? " · " + esc(WS.noSearchWarnHint) : "") + "</div>";
  }

  /* 검색 결과를 2단계 검수에 넘기는 형태로 — 실제 출처만 허용 */
  function groundingForReview() {
    if (!state.grounding) return [];
    return (state.grounding.sources || []).map(function (s) {
      return { title: s.title || s.host || s.url || "출처", url: s.url || "" };
    });
  }

  /* ---------------- 5. 생성 실행 (v1.6.0 1단계 초안 → 2단계 전수 검수 · v1.6.1 무료 한도 자동 모델 전환) ---------------- */
  var TS = BS.TWO_STAGE || {};

  function stageLabel(stage) {
    return stage === "audit"
      ? (TS.auditLabel || "2/2단계: 지침 처음~끝 대조 검수·수정 중입니다… (오류·누락 점검)")
      : (TS.draftLabel || "1/2단계: 원고 초안을 작성하고 있습니다");
  }
  function stageHtml(stage, sec) {
    var label = stageLabel(stage);
    var tail = label.indexOf("…") >= 0 ? " " : "… ";
    return '<span class="spin"></span>' + label + tail + sec + "초" + (sec > 40 ? " (조금 걸립니다)" : "");
  }
  /* 단계별 진행 상태 + 경과 초 */
  function stageWatcher(statusEl) {
    var w = { stage: "draft", mark: Date.now(), id: null };
    w.paint = function () { setStatus(statusEl, stageHtml(w.stage, Math.round((Date.now() - w.mark) / 1000))); };
    w.set = function (stage) { w.stage = stage; w.mark = Date.now(); w.paint(); };
    w.start = function () { w.mark = Date.now(); w.paint(); clearInterval(w.id); w.id = setInterval(w.paint, 1000); };
    w.stop = function () { clearInterval(w.id); w.id = null; };
    return w;
  }

  /* 단계별 호출 상자 — 제한 시간(arm/disarm)과 모델 전환 알림을 한 곳에 */
  function stageBox(ctl, onSwitch) {
    var kill = null;
    var box = {
      signal: ctl ? ctl.signal : null,
      used: "",
      arm: function () {
        clearTimeout(kill);
        if (ctl) kill = setTimeout(function () { ctl.abort(); }, TS.stageTimeoutMs || 180000);
      },
      disarm: function () { clearTimeout(kill); kill = null; },
      onModel: function (m) { box.used = m; },
      onSwitch: onSwitch || null,
      onBusy: null
    };
    return box;
  }

  /* 5xx(서버 혼잡) 대기 안내 — 같은 모델로 2~3초 뒤 다시 시도한다는 걸 화면에 보여 준다 */
  function attachBusyNote(box) {
    if (!box) return box;
    box.onBusy = function (m, ms) {
      var sec = Math.max(1, Math.round((ms || 2500) / 1000));
      paintAutoNote("⏳ " + esc(m) + " 서버가 잠시 혼잡합니다 — " + sec +
        "초 뒤 다시 시도하고, 계속되면 다음 무료 모델로 자동 전환해 이어서 씁니다…", "warn");
    };
    return box;
  }

  /* 모델 응답 → 결과 구조. 1단계·2단계 응답을 같은 규격으로 읽는다 (parseResult) */  function parseResult(text) {
    var md = String(text == null ? "" : text).replace(/\r/g, "").trim();
    if (!md) return null;
    // 앞에 붙은 인사말·설명은 버리고 첫 '## 제목 후보'부터 읽는다
    var lines = md.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (/^\s{0,3}##(?!#)\s*(?:🏆\s*)?제목\s*후보/.test(lines[i])) {
        if (i > 0) md = lines.slice(i).join("\n");
        break;
      }
    }
    var parsed = splitSections(md);
    var secs = parsed.secs || [];
    if (!secs.length) return null;
    var bodyOnly = stripEmphasisMarks(stripMetaSections(md));
    var cc = charCount(bodyOnly);
    var titles = parseTitles(pickSection(secs, ["제목 후보", "제목후보"]));
    var rec = parseRecommendedTitle(pickSection(secs, ["최종 추천 제목", "추천 제목"]));
    return {
      md: md,
      sections: secs,
      labels: secs.map(function (s) { return sectionLabel(s.h); }),
      titles: titles,
      rec: rec,
      title: rec || titles[0] || "",
      bodyChars: cc.noSpace,
      withSpace: cc.withSpace
    };
  }

  /* 구글 블로거 결과 검증 — 1단계가 형식을 지켰는지 */
  function bloggerDefect(res) {
    var b = res && res.blogger;
    if (!b) return "구글 블로거 구획을 찾지 못했습니다";
    if (!b.html || stripHtmlText(b.html).trim().length < 200) return "본문 HTML이 비었거나 너무 짧습니다";
    if (!(b.seo && (b.seo.title || b.seo.desc))) return "SEO 메타가 없습니다";
    if (b.lang === "ko" && (res.bodyChars || 0) < 600) return "본문이 " + (res.bodyChars || 0) + "자로 너무 짧습니다";
    if (b.lang === "en" && (res.bodyChars || 0) < 1500) return "영문 본문이 너무 짧습니다";
    return "";
  }

  /* 2단계 응답 검증 — 파싱 실패·비정상 짧은 응답이면 사유를 돌려준다 */
  function auditDefect(audited, draftInfo) {
    if (!audited) return "응답이 비어 있습니다";
    if (draftInfo && draftInfo.blogger) {       // v2.0.0 — 구글 블로거
      var bad = bloggerDefect(audited);
      if (bad) return bad;
      return "";
    }
    if (!audited.sections.length) return "머리말(##) 구획을 찾지 못했습니다";
    var hasBody = audited.labels.some(function (l) { return /^본문/.test(l); });
    if (!hasBody) return "본문 구획이 없습니다";
    var hasTitles = audited.labels.some(function (l) { return /^제목\s*후보/.test(l); });
    if (!hasTitles) return "제목 후보 구획이 없습니다";
    if (audited.titles.length < 3) return "제목 후보가 " + audited.titles.length + "개뿐입니다";
    var min = Math.max(TS.minAuditChars || 500, Math.round((draftInfo.bodyChars || 0) * (TS.minAuditRatio || 0.6)));
    if (audited.bodyChars < min) {
      return "본문이 " + audited.bodyChars.toLocaleString() + "자로 초안(" + (draftInfo.bodyChars || 0).toLocaleString() + "자)보다 너무 짧습니다";
    }
    return "";
  }

  /* 2단계 호출 — 실패해도 1단계 초안을 잃지 않는다 (graceful fallback) */
  function auditDraft(draftInfo, opts, model, box) {
    var reqs;
    try {
      reqs = BS.prompts.reviewPrompt({
        blog: opts.blog,
        docMode: opts.docMode || "blog",
        topic: opts.topic,
        extraKeywords: opts.extraKeywords,
        notes: opts.notes,
        articleUrl: opts.articleUrl,
        articleBody: opts.articleBody,
        toneId: opts.toneId,
        lengthBody: opts.lengthBody,
        affiliate: opts.affiliate,
        cta: opts.cta,
        mode: opts.mode,
        productPlatform: opts.productPlatform,
        productUrl: opts.productUrl,
        productMemo: opts.productMemo,
        internalLinks: opts.internalLinks,
        persona: opts.persona,
        webSearch: !!opts.webSearch,
        groundingSources: groundingForReview(),
        draft: draftInfo.md
      });
    } catch (e) {
      return Promise.resolve({ ok: false, info: draftInfo, notice: "2단계 검수 요청을 만들지 못해 초안을 표시합니다 — " + (e && e.message ? e.message : e) });
    }
    box.arm();
    return geminiTextAuto(model, reqs.system, reqs.user, box, {
      temperature: 0.25, topP: 0.9,
      webSearch: !!opts.webSearch,
      onGrounding: addGrounding,
      onSearchSkip: noteSearchSkip,
      onSearchFallback: noteSearchFallback
    })
      .then(function (text) {
        box.disarm();
        var audited = (opts.blog && opts.blog.kind === "blogger")
          ? parseBloggerResult(text, opts.blog)
          : parseResult(text);
        var bad = auditDefect(audited, draftInfo);
        if (bad) {
          return { ok: false, info: draftInfo, notice: "2단계 검수 응답이 규격을 벗어나(" + bad + ") 1단계 초안을 표시합니다" };
        }
        return { ok: true, info: audited, notice: "" };
      })
      .catch(function (err) {
        box.disarm();
        var msg = err && err.name === "AbortError"
          ? "2단계 검수가 " + Math.round((TS.stageTimeoutMs || 180000) / 60000) + "분을 넘겨 중단됐습니다"
          : (err && err.message ? err.message : "알 수 없는 오류");
        return { ok: false, info: draftInfo, notice: "1단계 초안은 완료됐으나 2단계 자동 검수 중 오류가 발생해 초안을 표시합니다 — " + msg };
      });
  }

  /* 결과 화면 그리기 — 1단계 초안이든 2단계 최종본이든 같은 자리 */
  function drawResult(outcome, topic, modeId) {
    var info = outcome.info;
    var status = $("#genStatus");
    var reviewed = !!outcome.ok;
    state.result = {
      md: info.md,
      sections: info.sections,
      titles: info.titles,
      title: info.title || topic,
      blogId: state.blog.id,
      docMode: modeId || docMode(),
      blogger: info.blogger || null,        // 🪙🌙 구글 블로거 결과 (v2.0.0)
      productPlatform: state.productPlatform,
      productUrl: ($("#productUrl") ? String($("#productUrl").value || "").trim() : ""),
      productMemo: ($("#productMemo") ? String($("#productMemo").value || "").trim() : ""),
      affiliatePlatform: state.affiliatePlatform || "coupang",   // 🛍️ v2.2.1 — 대가성 문구·링크 카드 플랫폼
      reviewMode: !!(($("#optReview") && $("#optReview").checked) || (modeId || docMode()) === "product"),
      topic: topic,
      ts: state.genTs || Date.now(),
      affiliateKeyword: topic,
      reviewed: reviewed,
      auditNotice: outcome.notice || "",
      // ♻️ 이 원고가 실제 검색을 거쳤는지 — 결과 맨 위 경고 표시에 쓴다 (v1.9.4)
      liveSearch: liveSearchUsed(),
      liveSearchMode: state.webSearchMode || ""
    };
    state.reviewed = reviewed;

    if (outcome.notice) {
      setStatus(status, "⚠️ " + esc(outcome.notice) +
        '<div class="gen-retry"><button type="button" id="btnRetryAudit" class="btn small ghost">🔁 2단계 검수 다시 시도</button></div>', "warn");
    } else if (reviewed) {
      setStatus(status, "✅ 2단계 검수·수정 완료 — 본문 " + info.bodyChars.toLocaleString() + "자 (공백 제외) · " + info.withSpace.toLocaleString() + "자 (공백 포함)", "ok");
    } else {
      setStatus(status, "✅ 원고 완성 — 본문 " + info.bodyChars.toLocaleString() + "자 (공백 제외) · " + info.withSpace.toLocaleString() + "자 (공백 포함)", "ok");
    }

    // 무료 한도로 모델이 바뀌었으면 짧게 알린다 (투명성)
    if (state.autoSwitch) paintAutoNote("ℹ️ " + esc(autoSwitchText(state.autoSwitch)), "warn");
    else paintAutoNote("");
    // 🔍 실제 구글 검색 출처를 결과 화면 맨 위에 보여 준다 (v1.9.3)
    paintWebSearch();
    // ♻️ 검색 없이 작성됐으면 그 위에 경고를 먼저 보여 준다 (v1.9.4)
    paintNoSearchWarn();
    // 🛡️ 건강 금지어·허위 체험 검사 (v2.2.1) — 발행 전 확인
    paintSafetyWarn();


    renderTitles();
    renderArticle();
    updateRawViews();
    $("#stepResult").hidden = false;
    $("#stepImage").hidden = false;
    /* 🪙🌙 구글 블로거는 스마트에디터 탭·배너 대신 Blogger 패널을 보여 준다 */
    if (state.result.blogger) {
      renderBlogger();
      show($("#resultTabs"), false);
      show($("#copyBar"), false);
      $("#articlePreview").hidden = true;
      $("#rawMd").hidden = true;
      $("#rawHtml").hidden = true;
      show($("#bannerCard"), false);
      $("#stepImage").hidden = true;   // 구글 블로거는 이미지 프롬프트가 PART 1에 들어 있다
    } else {
      show($("#bloggerPanel"), false);
      show($("#resultTabs"), true);
      show($("#copyBar"), true);
      var active = $("#resultTabs .tab.active") || $("#resultTabs .tab");
      var v = active ? active.dataset.view : "preview";
      $("#articlePreview").hidden = v !== "preview";
      $("#rawMd").hidden = v !== "md";
      $("#rawHtml").hidden = v !== "html";
      show($("#bannerCard"), !isCafeResult(state.result));
    }
    state.imgPrompts = [];
    state.images = [];
    $("#imgPromptList").innerHTML = "";
    $("#imgSceneBtns").innerHTML = "";
    $("#imageGrid").innerHTML = "";
    $("#btnDownloadAll").hidden = true;
    $("#btnGenAllImages").hidden = true;
    $("#imgNote").hidden = true;
    $("#apiImgBox").open = false;
    state.thumbs = [];
    if ($("#thumbList")) $("#thumbList").innerHTML = "";
    // 새 원고가 나오면 스레드·영상 대본 패널은 접는다 (v1.9.0)
    state.threads = null;
    state.video = null;
    state.videoFormat = "short";
    state.multiuse = null;
    show($("#multiusePanel"), false);
    if ($("#multiuseBody")) $("#multiuseBody").innerHTML = "";
    setStatus($("#multiuseStatus"), "");
    show($("#threadPanel"), false);
    show($("#videoPanel"), false);
    if ($("#threadList")) $("#threadList").innerHTML = "";
    if ($("#threadExtra")) { $("#threadExtra").innerHTML = ""; show($("#threadExtra"), false); }
    if ($("#videoBody")) $("#videoBody").innerHTML = "";
    setStatus($("#threadStatus"), "");
    setStatus($("#videoStatus"), "");
    paintVideoTabs();
    refreshBanner();
    if (!state.result.blogger) show($("#bannerCard"), !isCafeResult(state.result));
    paintConvertButtons();
    setStatus($("#imgApiStatus"), "");
    setStatus($("#imgStatus"), "");
    saveDraft();
    renderDrafts();
    var rb = $("#btnRetryAudit");
    if (rb) rb.addEventListener("click", retryAudit);
    $("#stepResult").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- 📰 참고 기사·자료 (v1.9.2) ---------------- */
  function refState() {
    return BS.articleRefState(
      $("#refUrl") ? $("#refUrl").value : "",
      $("#refBody") ? $("#refBody").value : "",
      $("#topic") ? $("#topic").value : ""
    );
  }

  /* 링크만 있고 본문이 없으면 "본문을 함께 붙여넣으면 더 정확합니다"를 작게 띄운다 */
  function paintRefHint() {
    var cfg = BS.ARTICLE_REF || {};
    var st = refState();
    var hint = $("#refHint");
    if (hint) {
      hint.textContent = cfg.linkOnlyHint || "기사 본문을 함께 붙여넣으면 더 정확합니다";
      show(hint, st.linkOnly);
    }
    var count = $("#refCount");
    if (count) {
      count.textContent = st.long ? (cfg.longBodyHint || "붙여넣은 자료가 길어 앞 12,000자까지만 반영합니다")
        : (st.body ? "붙여넣은 본문 " + st.body.length + "자" : "");
      count.className = st.long ? "ref-count over" : "ref-count";
    }
    var sum = $("#refSummary");
    if (sum) {
      sum.textContent = (cfg.openLabel || "📰 참고 기사·자료 (선택)") + (st.has ? " · 입력됨" : "");
    }
    return st;
  }

  function clearRefInputs() {
    if ($("#refUrl")) $("#refUrl").value = "";
    if ($("#refBody")) $("#refBody").value = "";
    paintRefHint();
  }

  /* 생성본에서 출처를 스스로 점검 — 입력 링크가 빠졌거나 자리표시자 주소가 남았으면 알린다 */
  function sourceIssues(info, opts) {
    var md = String((info && info.md) || "");
    var out = [];
    if (!md) return out;
    var url = String((opts && opts.articleUrl) || "").trim();
    if (url && md.indexOf(url) < 0) out.push("입력한 참고 링크가 출처에 없습니다");
    if (/https?:\/\/\s*\.\.\./.test(md) || md.indexOf("(https://실제주소)") >= 0) out.push("자리표시자 주소가 남아 있습니다");
    return out;
  }

  /* 마지막 요청 조건 모으기 (1단계·2단계가 같은 조건을 본다) */
  function currentOptions() {
    var lengthId = $("#lengthSelect").value;
    var lengthObj = BS.LENGTHS.filter(function (l) { return l.id === lengthId; })[0] || BS.LENGTHS[1];
    var md = docMode();
    var reviewOn = md === "product" || !!($("#optReview") && $("#optReview").checked);
    var ref = refState();
    return {
      blog: state.blog,
      docMode: md,
      topic: $("#topic").value.trim(),
      extraKeywords: $("#extraKw").value.trim(),
      notes: $("#notes").value.trim(),
      articleUrl: ref.url,
      articleBody: ref.body,
      articleLong: ref.long,
      toneId: $("#toneSelect").value,
      lengthBody: lengthObj.body,
      affiliate: md === "blog" ? $("#optAffiliate").checked : false,
      affiliatePlatform: state.affiliatePlatform || "coupang",   // 🛍️ v2.2.1 — 쿠팡·쇼핑커넥트·브커
      cta: (md === "blog" && $("#ctaSelect")) ? $("#ctaSelect").value : "none",
      mode: reviewOn ? "review" : "",
      productPlatform: state.productPlatform,
      productUrl: ($("#productUrl") ? String($("#productUrl").value || "").trim() : ""),
      productMemo: ($("#productMemo") ? String($("#productMemo").value || "").trim() : ""),
      internalLinks: currentInternalLinks(),
      persona: currentPersona(),
      personaId: state.persona,
      webSearch: webSearchEnabled()
    };
  }

  function generate() {
    if (state.busy) return;
    var key = apiKeyOrAsk();
    if (!key) return;
    var opts = currentOptions();
    var topic = opts.topic;
    if (!topic) { toast("주제나 메인 키워드를 먼저 넣어 주세요"); $("#topic").focus(); return; }

    var model = localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    var req = BS.prompts.articlePrompt(opts);
    var runMode = opts.docMode || docMode();
    if (runMode === "product" && !opts.productUrl) {
      toast("상품 링크가 비어 있어 상품명으로 검색 링크를 카드에 넣습니다", 3200);
    }
    if (opts.articleLong) {
      toast((BS.ARTICLE_REF && BS.ARTICLE_REF.longBodyHint) || "붙여넣은 자료가 길어 앞 12,000자까지만 반영합니다", 3600);
    } else if (refState().linkOnly) {
      toast((BS.ARTICLE_REF && BS.ARTICLE_REF.linkOnlyHint) || "기사 본문을 함께 붙여넣으면 더 정확합니다", 3600);
    }

    state.busy = true;
    state.genTs = Date.now();
    state.autoSwitch = null;
    paintAutoNote("");
    resetGrounding();
    if (!opts.webSearch) state.webSearchMode = "off";   // 토글 꺼짐 — 결과 경고 사유 (v1.9.4)
    state.webSearchBusy = !!opts.webSearch;
    paintWebSearch();
    var btn = $("#btnGenerate");
    btn.disabled = true;
    var status = $("#genStatus");
    var watch = stageWatcher(status);
    watch.start();

    var ctl = new AbortController();
    var box = stageBox(ctl, noteSwitch);
    attachBusyNote(box);

    box.arm();
    geminiTextAuto(model, req.system, req.user, box, {
      webSearch: !!opts.webSearch,
      onGrounding: addGrounding,
      onSearchSkip: noteSearchSkip,
      onSearchFallback: noteSearchFallback
    })
      .then(function (text) {
        box.disarm();
        var isBlogger = state.blog && state.blog.kind === "blogger";
        var draftInfo = isBlogger ? parseBloggerResult(text, state.blog) : parseResult(text);
        if (isBlogger) {
          var bd = bloggerDefect(draftInfo);
          if (bd) throw new Error("구글 블로거 원고 형식을 읽지 못했습니다(" + bd + "). 다시 생성해 주세요.");
        } else if (!draftInfo || !draftInfo.sections.length) {
          throw new Error("원고 형식을 읽지 못했습니다. 다시 생성해 주세요.");
        }
        // 1단계에 실제로 쓰인 모델 — 자동 전환본이면 2단계도 그 모델로 이어간다 (한도 끝난 모델 재호출 금지)
        var draftModel = box.used || model;
        state.lastDraft = { md: draftInfo.md, opts: opts, model: draftModel };
        if (TS.enabled === false) return { ok: false, info: draftInfo, notice: "" };
        watch.set("audit");
        return auditDraft(draftInfo, opts, draftModel, box);
      })
      .then(function (outcome) {
        drawResult(outcome, topic, runMode);
        HOT.genOk = true;
        var issues = sourceIssues(outcome && outcome.info, opts);
        if (issues.length) toast("⚠️ 출처 확인: " + issues.join(" · "), 4600);
      })
      .catch(function (err) {
        box.disarm();
        var msg = err && err.name === "AbortError"
          ? "시간이 너무 오래 걸려 멈췄습니다(3분). 다시 시도하거나 분량을 '짧게'로 줄여 보세요."
          : (err && err.message ? err.message : "알 수 없는 오류");
        setStatus(status, "⚠️ " + msg, "err");
      })
      .then(function () {
        watch.stop();
        state.busy = false;
        state.webSearchBusy = false;
        paintWebSearch();
        btn.disabled = false;
        /* 🔥 화제템 카드에서 '원고+멀티유즈 / 원고+클립'을 골랐으면 원고가 끝난 뒤 이어서 (v2.1.0) */
        if (HOT.chain && HOT.genOk && state.result) {
          var chain = HOT.chain;
          HOT.chain = "";
          paintChainNote();
          setTimeout(function () {
            if (state.busy) return;
            if (chain === "multiuse") runMultiUse();
            else if (chain === "video") convertToVideoScript("short");
          }, 700);
        }
      });
  }

  /* 2단계만 다시 — 429 같은 일시 오류 뒤에 초안을 버리지 않고 재시도 */
  function retryAudit() {
    if (state.busy) return;
    var d = state.lastDraft;
    if (!d) { toast("다시 검수할 초안이 없습니다 — 원고를 새로 생성해 주세요"); return; }
    if (!apiKeyOrAsk()) return;
    var model = d.model || localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    var draftInfo = (d.opts && d.opts.blog && d.opts.blog.kind === "blogger")
      ? parseBloggerResult(d.md, d.opts.blog)
      : parseResult(d.md);
    if (!draftInfo || (!draftInfo.sections.length && !draftInfo.blogger)) { toast("초안을 읽지 못했습니다 — 원고를 새로 생성해 주세요"); return; }

    state.busy = true;
    var btn = $("#btnGenerate");
    if (btn) btn.disabled = true;
    var status = $("#genStatus");
    var watch = stageWatcher(status);
    watch.set("audit");
    watch.start();

    var ctl = new AbortController();
    var box = stageBox(ctl, noteSwitch);
    attachBusyNote(box);

    auditDraft(draftInfo, d.opts, model, box)
      .then(function (outcome) { drawResult(outcome, d.opts.topic); })
      .catch(function (err) { setStatus(status, "⚠️ " + (err && err.message ? err.message : "알 수 없는 오류"), "err"); })
      .then(function () {
        watch.stop();
        state.busy = false;
        state.webSearchBusy = false;
        paintWebSearch();
        if (btn) btn.disabled = false;
      });
  }

  /* 결과 화면 '🔄 다른 형식으로 다시 쓰기' 버튼 상태 (v1.8.0) */
  function paintConvertButtons() {
    var r = state.result;
    var bar = $("#convertBar");
    var toBlog = $("#btnToBlog");
    var toCafe = $("#btnToCafe");
    var toThreads = $("#btnToThreads");
    var toVideo = $("#btnToVideo");
    var toMulti = $("#btnMultiUse");
    var toEng = $("#btnToEnglish");
    if (!r) { show(bar, false); return; }
    var src = resultMode(r);
    var isBlogger = !!r.blogger;
    var isEn = isBlogger && r.blogger.lang === "en";
    var canBlog = !isBlogger && (src === "cafe" || src === "product");
    var canCafe = !isBlogger && (src === "blog" || src === "product");
    /* 🧵 스레드 · 🎬 영상 대본은 어떤 원고에서든 만들 수 있다 (v1.9.0) */
    show(bar, true);
    show(toBlog, canBlog);
    show(toCafe, canCafe);
    show(toThreads, !isBlogger);
    show(toVideo, !isBlogger);
    /* ⚡ 멀티유즈 — 한국어 원고·블로그 결과에서 (영문 카드는 PART 3 인스타 세트가 따로 있다) */
    show(toMulti, !isEn);
    /* 🌙 한국어 원고를 영문 블로그로 현지화 (v2.0.0) */
    show(toEng, !isBlogger && (src === "blog" || src === "cafe" || src === "product"));
    var lab = $("#convertLabel");
    if (lab) lab.textContent = "🔄 다른 형식으로 다시 쓰기 (지금: " + (isBlogger ? (BS.blogById(r.blogId) || {}).name + " · Blogger" : modeLabel(src)) + ")";
  }

  /* 이미 쓴 원고를 다른 형식으로 다시 쓴다.
     핵심 팩트·수치·비교 포인트·(제휴 리뷰였으면) 링크·상품 특징은 살리고,
     제목·도입부·문장 어미·소제목 구성을 완전히 새로 써서 네이버 중복문서를 피한다.
     기존 generate()와 같은 1단계+2단계 검수·자동 모델 전환 경로를 탄다. */
  function convertArticleMode(target) {
    if (state.busy) return;
    var r = state.result;
    if (!r) { toast("변환할 원고가 없습니다 — 먼저 원고를 만들어 주세요"); return; }
    var targetMode = target === "cafe" ? "cafe" : "blog";
    if (resultMode(r) === targetMode) { toast("이미 " + modeLabel(targetMode) + "입니다"); return; }
    if (!apiKeyOrAsk()) return;

    var opts = currentOptions();
    opts.docMode = targetMode;
    opts.topic = r.topic || opts.topic;
    if (targetMode === "cafe") { opts.affiliate = false; opts.cta = "none"; }
    if (resultMode(r) === "product") {
      opts.productPlatform = r.productPlatform || opts.productPlatform;
      opts.productUrl = r.productUrl || opts.productUrl;
      opts.productMemo = r.productMemo || opts.productMemo;
      // 제휴 리뷰를 블로그로 옮길 때는 제휴 링크·공정위 표시를 그대로 살린다
      if (targetMode === "blog") {
        opts.affiliate = true;
        opts.cta = "auto";
        if (r.productUrl && $("#coupangLink")) $("#coupangLink").value = r.productUrl;
      }
    }

    var req;
    try {
      req = BS.prompts.convertPrompt({
        blog: state.blog,
        sourceMode: resultMode(r),
        targetMode: targetMode,
        source: stripMetaSections(r.md),
        topic: opts.topic,
        extraKeywords: opts.extraKeywords,
        notes: opts.notes,
        toneId: opts.toneId,
        lengthBody: opts.lengthBody,
        affiliate: opts.affiliate,
        cta: opts.cta,
        mode: opts.mode,
        productPlatform: opts.productPlatform,
        productUrl: opts.productUrl,
        productMemo: opts.productMemo,
        internalLinks: opts.internalLinks,
        persona: opts.persona
      });
    } catch (e) {
      toast("변환 요청을 만들지 못했습니다 — " + (e && e.message ? e.message : e));
      return;
    }

    var model = localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    state.busy = true;
    state.genTs = Date.now();
    state.autoSwitch = null;
    paintAutoNote("");
    resetGrounding();
    if (!opts.webSearch) state.webSearchMode = "off";   // 토글 꺼짐 — 결과 경고 사유 (v1.9.4)
    state.webSearchBusy = !!opts.webSearch;
    paintWebSearch();
    var btn1 = $("#btnToBlog"), btn2 = $("#btnToCafe");
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;
    var status = $("#genStatus");
    var watch = stageWatcher(status);
    watch.start();

    var ctl = new AbortController();
    var box = stageBox(ctl, noteSwitch);
    attachBusyNote(box);
    box.arm();

    geminiTextAuto(model, req.system, req.user, box, opts.webSearch ? {
      webSearch: true,
      onGrounding: addGrounding,
      onSearchSkip: noteSearchSkip,
      onSearchFallback: noteSearchFallback
    } : null)
      .then(function (text) {
        box.disarm();
        var draftInfo = parseResult(text);
        if (!draftInfo || !draftInfo.sections.length) throw new Error("변환된 원고 형식을 읽지 못했습니다. 다시 시도해 주세요.");
        var used = box.used || model;
        state.lastDraft = { md: draftInfo.md, opts: opts, model: used };
        watch.set("audit");
        return auditDraft(draftInfo, opts, used, box);
      })
      .then(function (outcome) {
        setDocMode(targetMode);
        drawResult(outcome, opts.topic, targetMode);
        toast(modeLabel(targetMode) + "로 다시 썼습니다 — 제목·문장을 새로 써서 중복문서를 피했습니다", 3600);
      })
      .catch(function (err) {
        box.disarm();
        var msg = err && err.name === "AbortError"
          ? "시간이 너무 오래 걸려 멈췄습니다(3분). 다시 시도해 주세요."
          : (err && err.message ? err.message : "알 수 없는 오류");
        setStatus(status, "⚠️ " + msg, "err");
      })
      .then(function () {
        watch.stop();
        state.busy = false;
        state.webSearchBusy = false;
        paintWebSearch();
        if (btn1) btn1.disabled = false;
        if (btn2) btn2.disabled = false;
      });
  }

  /* ---------------- 6-1. 🧵 스레드 타래 · 🎬 클립·릴스·유튜브 대본 (v1.9.0) ----------------
     결과 원고를 ① 스레드 연속 타래 4~5개 ② 영상 대본+장면 프롬프트로 다시 뽑는다.
     영상 MP4 렌더링은 무료 API로 안 되므로, 여기서는 대본·장면 프롬프트만 만들고
     Flow·Vids에 붙이거나 '📋 피클에게 보낼 영상 요청 복사'로 피클에게 넘긴다. */

  /* 응답을 '## 머리말' 단위로 나눈다 (스레드·영상 대본 파서 공통)
     해시태그 줄('#창문단열 #겨울준비')은 머리말이 아니므로 '#' 뒤에 띄어쓰기가 있는 줄만 머리말로 본다. */
  /* 🌙 한국어 원고를 영문 블로그(Daily Health & Pain Guide)로 현지화 (v2.0.0)
     한국어 건강·통증 글감/원고를 넣으면 영문 블로그 + 영문 인스타 세트로 변환되도록 연결한다.
     원고는 참고 자료(본문)로 넣고, 주제칸에는 그 글의 주제를 넣은 다음, 영문 카드에서 새로 생성한다. */
  function convertToEnglishBlog() {
    var r = state.result;
    if (!r) { toast("원고가 없습니다 — 먼저 원고를 만들어 주세요"); return; }
    var gold = BS.blogById("goldqueen");
    if (!gold) { toast("영문 블로그 카드를 찾지 못했습니다"); return; }
    var body = String(r.md || "").trim();
    if (!body) { toast("원고 본문이 비어 있습니다"); return; }
    setDocMode("blog");
    state.blog = gold;
    state.internal = [];
    state.internalOff = [];
    renderBlogs();
    syncPersona();   // 🎭 영문 카드로 옮기면 그 카드의 페르소나로 (v2.2.0)
    renderChips();
    renderInternal();
    setBlogHint(gold);
    rtFollowBlog(gold.id);
    if ($("#topic")) $("#topic").value = String(r.topic || r.title || "").trim();
    var rb = $("#refBody");
    if (rb) rb.value = body.slice(0, (BS.ARTICLE_REF && BS.ARTICLE_REF.maxBody) || 12000);
    paintRefHint();
    renderDupWarn();
    show($("#stepTopic"), true);
    if ($("#stepTopic") && $("#stepTopic").scrollIntoView) {
      try { $("#stepTopic").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }
    toast("🌙 영문 카드로 바꾸고 원고를 참고 자료에 넣었습니다 — '원고 생성하기'를 누르면 영문으로 현지화합니다", 5600);
  }

  function splitHeads(text) {
    var lines = String(text == null ? "" : text).replace(/\r/g, "").split("\n");
    var out = [], cur = null;
    lines.forEach(function (raw) {
      var t = raw.trim();
      var m = t.match(/^#{1,4}[ \t]+(.+?)\s*$/) || t.match(/^#{2,4}([^#\s].*?)\s*$/);
      if (m) {
        cur = { head: m[1].replace(/^[🧵🎬📋#\s]+/, "").trim(), body: [] };
        out.push(cur);
      } else if (cur) {
        cur.body.push(raw);
      }
    });
    return out;
  }

  /* 본문 앞뒤 잡음(구분선·번호 표시)을 지운다 */
  function cleanBlock(s) {
    var lines = String(s == null ? "" : s).replace(/\r/g, "").split("\n");
    lines = lines.filter(function (l) { return !/^\s*[-—–=]{3,}\s*$/.test(l); });
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length) {
      lines[0] = lines[0].replace(/^\s*[([]?\s*\d+\s*\/\s*\d+\s*[)\]]?\s*/, "")
                         .replace(/^\s*\d+\s*[).]\s*/, "");
    }
    return lines.join("\n").trim();
  }

  /* "1) 문구" 처럼 번호가 붙은 줄을 뽑아 문구만 남긴다 */
  function pickNumbered(body, max) {
    var out = [];
    String(body || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      t = t.replace(/^[-*·•]\s*/, "").replace(/^\d+\s*[).]\s*/, "").trim();
      t = t.replace(/^["'“”‘’]/, "").replace(/["'“”‘’]$/, "").trim();
      if (t) out.push(t);
    });
    return out.slice(0, max || 10);
  }

  /* 스레드 응답 → { threads:[{no,role,text}], comment, hashtags, memo } */
  function parseThreads(text) {
    var heads = splitHeads(text);
    var threads = [], comment = "", tags = "", memo = "";
    heads.forEach(function (h) {
      var name = h.head;
      var body = h.body.join("\n").trim();
      var m = name.match(/^타래\s*(\d+)/);
      if (m) {
        var role = /후킹/.test(name) ? "후킹" : (/마무리|마지막/.test(name) ? "마무리" : "핵심");
        threads.push({ no: parseInt(m[1], 10), role: role, text: cleanBlock(body) });
      } else if (/^첫\s*댓글/.test(name)) {
        comment = cleanBlock(body);
      } else if (/^해시태그/.test(name)) {
        /* v2.3.4 — 모델이 여러 개를 붙여도 첫 단어 1개만 남긴다(45자 뭉치 태그 방지) */
        tags = (BS.threadTagOne ? BS.threadTagOne(cleanBlock(body).replace(/^\s*[-*·]\s*/gm, "")) : cleanBlock(body).replace(/^\s*[-*·]\s*/gm, "").trim());
      } else if (/^작업\s*메모/.test(name)) {
        memo = body;
      }
    });
    threads = threads.filter(function (t) { return t.text; })
      .sort(function (a, b) { return a.no - b.no; });
    threads.forEach(function (t, i) {
      if (t.role === "핵심" && i === 0) t.role = "후킹";
      if (t.role === "핵심" && i === threads.length - 1) t.role = "마무리";
    });
    if (threads.length < 3) return null;
    return { threads: threads, comment: comment, hashtags: tags, memo: memo, raw: String(text || "") };
  }

  /* 장면 블록 → { zone, view, caption, narration, prompt } */
  function parseSceneBlock(body) {
    var info = { zone: "", view: "", caption: "", narration: "", prompt: "" };
    var key = "";
    String(body || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      var m = t.match(/^[-*·]?\s*(구간|시간|화면|장면|자막|나레이션|대사|Flow\s*프롬프트|프롬프트|영상\s*프롬프트|장면\s*프롬프트)\s*[:：]\s*(.*)$/i);
      if (m) {
        var k = m[1].replace(/\s/g, "");
        var v = (m[2] || "").trim();
        if (/^구간|^시간/.test(k)) { info.zone = v; key = "zone"; }
        else if (/^화면|^장면/.test(k)) { info.view = v; key = "view"; }
        else if (/^자막/.test(k)) { info.caption = v; key = "caption"; }
        else if (/^나레이션|^대사/.test(k)) { info.narration = v; key = "narration"; }
        else { info.prompt = v; key = "prompt"; }
        return;
      }
      if (key === "prompt") info.prompt += (info.prompt ? "\n" : "") + t;
      else if (key) info[key] = (info[key] ? info[key] + " " : "") + t;
      else info.view = (info.view ? info.view + " " : "") + t;
    });
    if (!info.prompt) info.prompt = info.view || info.narration;
    return info;
  }

  /* 영상 응답 → { thumbs, hook, narration, captions, scenes, memo } */
  function parseVideoScript(text) {
    var heads = splitHeads(text);
    var out = { thumbs: [], hook: "", pick: "", narration: "", captions: [], scenes: [], memo: "",
      direct: "", license: "", raw: String(text || "") };
    var seq = 0;
    heads.forEach(function (h) {
      var name = h.head;
      var body = h.body.join("\n").trim();
      if (/^추천\s*썸네일/.test(name)) {
        out.thumbs = pickNumbered(body, 2);
      } else if (/^상품\s*선정/.test(name)) {
        out.pick = body;
      } else if (/^3\s*초\s*후크|^후크/.test(name)) {
        var first = pickNumbered(body, 1);
        out.hook = first.length ? first[0] : "";
      } else if (/^나레이션/.test(name)) {
        out.narration = cleanBlock(body);
      } else if (/^자막/.test(name)) {
        out.captions = pickNumbered(body, 10);
      } else if (/^장\s*면/.test(name)) {
        var m = name.match(/^장\s*면\s*(\d+)/);
        seq += 1;
        var sc = parseSceneBlock(body);
        sc.no = m ? parseInt(m[1], 10) : seq;
        out.scenes.push(sc);
      } else if (/^작업\s*메모/.test(name)) {
        out.memo = body;
      } else if (/^\d*\s*초\s*절차형\s*연출표|^절차형\s*연출표|^연출표/.test(name)) {
        out.direct = cleanBlock(body);            // 🎬 v2.2.2 — 시간축 연출표
      } else if (/^라이선스/.test(name)) {
        out.license = cleanBlock(body);           // 🔊 v2.2.2 — TTS·BGM 라이선스 확인
      }
    });
    out.scenes.sort(function (a, b) { return a.no - b.no; });
    if (!out.narration || !out.scenes.length) return null;
    return out;
  }

  /* 장면 하나의 Flow/Vids용 지시문 — 모델이 쓴 장면 설명 + 앱이 붙이는 공통 규격 */
  function videoScenePrompt(scene, fmt) {
    var V = BS.VIDEO || {};
    var f = fmt || BS.videoFormat(state.videoFormat);
    var head = "[" + f.label + " · " + f.ratio + " · 장면 " + scene.no + "]";
    var body = String(scene.prompt || scene.view || scene.narration || "").trim();
    var suff = (V.sceneSuffix || []).map(function (s) { return "- " + s; }).join("\n");
    var tail = "형식: " + f.ratio + ", 6초 클립 한 장" + (suff ? "\n" + suff : "");
    return head + "\n\n" + body + "\n\n" + tail;
  }

  /* 타래 전체를 한 덩어리로 (전체 복사·카톡 저장용) */
  function threadsAllText() {
    var t = state.threads;
    if (!t) return "";
    var L = [];
    t.threads.forEach(function (it, i) {
      L.push("[타래 " + (it.no || i + 1) + " · " + it.role + "]");
      L.push(it.text);
      L.push("");
    });
    if (t.comment) { L.push("[첫 댓글]"); L.push(t.comment); L.push(""); }
    if (t.hashtags) { L.push("[해시태그]"); L.push(t.hashtags); }
    return L.join("\n").trim();
  }

  /* ---------------- 📮 피클 업로드 요청 (v1.9.1) ----------------
     연결된 스레드·인스타 3계정 + 희망 시간 + 타래 전체를 한 덩어리로 복사한다.
     계정은 원고 블로그로 기본 선택하고, 칩을 누르면 그 선택이 우선한다. */
  function threadAccounts() {
    return (BS.THREAD_UPLOAD && BS.THREAD_UPLOAD.accounts) || [];
  }

  function threadWhenList() {
    return (BS.THREAD_UPLOAD && BS.THREAD_UPLOAD.whens) || [];
  }

  /* 지금 올릴 계정 — 지연님이 고른 계정 > 원고 블로그 기본값 > 첫 계정 */
  function currentThreadAccount() {
    var picked = state.threadAccount ? BS.threadAccountById(state.threadAccount) : null;
    if (picked) return picked;
    var blogId = (state.result && state.result.blogId) || (state.blog && state.blog.id) || "";
    return BS.threadAccountFor(blogId) || threadAccounts()[0] || null;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function clockText(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function dayWord(d, now) {
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var diff = Math.round((a - b) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    if (diff === -1) return "어제";
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  /* 시간 칩 → 실제 시각이 붙은 한 줄 ('오늘 저녁'이 피클에게 모호하지 않게) */
  function threadWhenText(now) {
    now = (now instanceof Date) ? now : new Date();
    var custom = String(state.threadWhenCustom || "").trim();
    if (custom) return custom;
    var U = BS.THREAD_UPLOAD || {};
    var id = state.threadWhen || U.defaultWhen || "now";
    var evening = typeof U.eveningHour === "number" ? U.eveningHour : 20;
    var morning = typeof U.morningHour === "number" ? U.morningHour : 8;
    var d;
    if (id === "h1") {
      d = new Date(now.getTime() + 3600000);
      return "1시간 뒤 (" + dayWord(d, now) + " " + clockText(d) + ")";
    }
    if (id === "tonight") {
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), evening, 0, 0);
      if (d.getTime() <= now.getTime()) return "오늘 저녁 (오늘 안, 가능한 빨리)";
      return "오늘 저녁 (" + dayWord(d, now) + " " + clockText(d) + ")";
    }
    if (id === "tomorrow8") {
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, morning, 0, 0);
      return "내일 아침 " + morning + "시 (" + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + clockText(d) + ")";
    }
    return "지금 바로";
  }

  /* 첫 댓글은 줄을 살려서 요청에 넣는다 (v2.3.5 — 대가성 문구가 맨 앞 줄로 남는다) */
  function commentRequestLines(s) {
    var lines = String(s == null ? "" : s).split(/\r?\n/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    if (!lines.length) return ["  (없음 — 링크는 첫 댓글에만 넣어 주세요)"];
    return lines.map(function (x) { return "  " + x; });
  }

  /* 첫 댓글·해시태그는 한 줄로 펴서 요청에 넣는다 (줄바꿈은 공백) */
  function oneLine(s) {
    return String(s == null ? "" : s).split(/\r?\n/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x; })
      .join(" ")
      .trim();
  }

  /* 피클에게 그대로 붙여넣을 스레드 업로드 요청 한 덩어리 */
  function threadUploadRequestText(now) {
    var t = state.threads;
    if (!t) return "";
    var a = currentThreadAccount() || { handle: "", label: "", sub: "" };
    var L = [];
    L.push("[스레드 업로드 요청 — 지연님 블로그 작업실 v" + (BS.VERSION || "") + "]");
    L.push("주제: " + ((state.result && state.result.topic) || ""));
    L.push("계정: " + a.handle + " (" + a.label + " · " + a.sub + ")");
    L.push("희망 시간: " + threadWhenText(now));
    L.push("");
    t.threads.forEach(function (it, i) {
      L.push("[타래 " + (it.no || i + 1) + " · " + (it.role || "") + "]");
      L.push(it.text);
      L.push("");
    });
    L.push("첫 댓글:");
    commentRequestLines(t.comment).forEach(function (x) { L.push(x); });
    L.push("해시태그: " + (oneLine(t.hashtags) || "(없음)"));
    L.push("");
    threadPostRulesLines(t.hashtags, t.disclosure).forEach(function (x) { L.push(x); });
    L.push("");
    L.push("위 내용으로 스레드 올려줘!");
    return L.join("\n").trim();
  }

  /* v2.3.4 — 업로드 요청에 붙는 발행 규칙 (태그 1개 · 첫 댓글 태그 없음 · 댓글 유도 금지)
     작업실이 만든 원고를 다른 사람(피클)이 대신 발행할 때도 같은 규칙이 따라가야
     태그가 45자 뭉치로 등록되거나 "아래 댓글에서 확인해"가 본문에 남지 않는다. */
  function threadPostRulesLines(hashtags, disc) {
    var T = BS.THREADS || {};
    var tag = (BS.threadTagOne ? BS.threadTagOne(hashtags) : String(hashtags || "").trim());
    var L = [];
    L.push("[발행 규칙 — 스레드 화면에서 이대로]");
    if (disc) {
      L.push("- 첫 댓글 **맨 앞 줄**에 이 대가성 문구를 한 글자도 바꾸지 말고 그대로 넣어: \"" + disc + "\" — 링크는 그 아래 줄, 첫 댓글 전체 " + commentCharLimit() + "자 이내. 문구와 링크를 서로 다른 게시글로 나누지 마.");
    }
    L.push("- 주제 태그: " + (tag ? "'" + tag + "'" : "주제 단어") + " 딱 1개만 태그 칸에 넣어. '#' 없이 한 단어, 띄어쓰기 없이. 여러 개를 한 줄로 붙이면 그 전체가 태그 하나로 등록돼 아무도 찾지 않는 죽은 태그가 돼.");
    L.push("- 첫 댓글에는 태그를 붙이지 마.");
    L.push("- " + (T.commentBaitRule || "본문 마지막에 '아래 댓글에서 확인해' 같은 댓글 유도 문구를 넣지 마. 본문은 질문으로 끝낸다."));
    L.push("- 첫 댓글 링크는 맥락 문장과 함께 하나만. 본문 글자에는 링크를 넣지 않는다.");
    return L;
  }

  /* 계정·시간 칩과 안내 줄을 다시 그린다 (타래가 없으면 박스 자체를 숨김) */
  function paintThreadUpload() {
    var box = $("#threadUploadBox");
    if (!box) return;
    var has = !!(state.threads && state.threads.threads && state.threads.threads.length);
    show(box, has);
    if (!has) return;

    var acct = currentThreadAccount();
    var chips = $("#threadAccountChips");
    if (chips) {
      chips.innerHTML = threadAccounts().map(function (a) {
        var on = !!(acct && a.id === acct.id);
        return '<button type="button" class="sux-chip' + (on ? " active" : "") + '" data-acct="' + esc(a.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          (a.emoji ? '<span class="sux-emoji">' + esc(a.emoji) + '</span>' : '') +
          '<span class="sux-h">' + esc(a.handle) + '</span>' +
          '<span class="sux-s">' + esc(a.label + " · " + a.sub) + '</span></button>';
      }).join("");
    }

    var custom = String(state.threadWhenCustom || "").trim();
    var wchips = $("#threadWhenChips");
    if (wchips) {
      wchips.innerHTML = threadWhenList().map(function (w) {
        var on = !custom && (state.threadWhen || "now") === w.id;
        return '<button type="button" class="sux-chip when' + (on ? " active" : "") + '" data-when="' + esc(w.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(w.label) + '</button>';
      }).join("");
    }

    var inp = $("#threadWhenInput");
    if (inp) {
      inp.placeholder = (BS.THREAD_UPLOAD && BS.THREAD_UPLOAD.inputHint) || "직접 입력";
      if (document.activeElement !== inp && inp.value !== String(state.threadWhenCustom || "")) {
        inp.value = String(state.threadWhenCustom || "");
      }
    }

    var hint = $("#threadUploadHint");
    if (hint) {
      hint.textContent = "계정 " + (acct ? acct.handle + " · " + acct.label : "—") +
        " / 시간 " + threadWhenText();
    }
  }

  function setThreadAccount(id) {
    var a = BS.threadAccountById(id);
    if (!a) return;
    state.threadAccount = a.id;
    paintThreadUpload();
    toast("업로드 계정을 " + a.handle + "(" + a.label + ")로 바꿨습니다");
  }

  function setThreadWhen(id) {
    var ok = threadWhenList().some(function (w) { return w.id === id; });
    if (!ok) return;
    state.threadWhen = id;
    state.threadWhenCustom = "";
    var inp = $("#threadWhenInput");
    if (inp) inp.value = "";
    paintThreadUpload();
  }

  /* 새 타래를 만들 때 업로드 선택을 원고 기준으로 되돌린다 */
  function resetThreadUpload() {
    state.threadAccount = "";
    state.threadWhen = (BS.THREAD_UPLOAD && BS.THREAD_UPLOAD.defaultWhen) || "now";
    state.threadWhenCustom = "";
    var inp = $("#threadWhenInput");
    if (inp) inp.value = "";
    show($("#threadUploadBox"), false);
  }

  /* 피클에게 그대로 붙여넣을 영상 제작 요청 한 덩어리 */
  function videoRequestText() {
    var v = state.video;
    if (!v) return "";
    var f = BS.videoFormat(state.videoFormat);
    var L = [];
    L.push("[영상 제작 요청 — 지연님 블로그 작업실 v" + (BS.VERSION || "") + "]");
    L.push("");
    L.push("주제: " + (state.result ? (state.result.topic || "") : ""));
    L.push("형식: " + f.emoji + " " + f.label + " (" + f.sub + ") · " + f.seconds + " · " + f.ratio);
    L.push("톤: " + ((BS.VIDEO && BS.VIDEO.persona) || "") + " · AI티 없는 구어체 나레이션");
    if (v.pick) { L.push(""); L.push("[상품 선정 — 대본보다 먼저]"); L.push(v.pick); }
    L.push("");
    L.push("[추천 썸네일 문구]");
    v.thumbs.forEach(function (t, i) { L.push((i + 1) + ") " + t); });
    L.push("");
    L.push("[3초 후크]");
    L.push(v.hook || "");
    L.push("");
    L.push("[나레이션 대본]");
    L.push(v.narration || "");
    L.push("");
    L.push("[자막 핵심 줄]");
    v.captions.forEach(function (c, i) { L.push((i + 1) + ") " + c); });
    L.push("");
    if (v.direct) { L.push(""); L.push("[연출표]"); L.push(v.direct); }
    L.push("");
    L.push("[장면별 Flow 프롬프트]");
    v.scenes.forEach(function (s) {
      L.push("");
      L.push(s.final || videoScenePrompt(s, f));
    });
    L.push("");
    if (v.license) { L.push(""); L.push("[라이선스 확인]"); L.push(v.license); }
    L.push("");
    L.push("[요청]");
    L.push("이걸로 영상 만들어줘. 비율 " + f.ratioShort + ", 인물은 한국인 실사, 화면 글자는 한글, 음성은 AI티 없는 구어체로. TTS·BGM은 상업 무료 라이선스만 쓰고, 비상업 모델(XTTS-v2)은 쓰지 마.");
    return L.join("\n");
  }

  function paintVideoTabs() {
    $$("#videoFormatTabs .vf-tab").forEach(function (b) {
      b.classList.toggle("active", (b.getAttribute("data-fmt") || "") === state.videoFormat);
    });
  }

  /* 스레드·영상 대본 공통 호출 — 원고 생성과 같은 모델 자동 전환 경로를 탄다 */
  function runScriptJob(cfg) {
    if (state.busy) return;
    if (!apiKeyOrAsk()) return;
    var model = localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    var btns = cfg.buttons || [];
    state.busy = true;
    state.genTs = Date.now();
    state.autoSwitch = null;
    paintAutoNote("");
    btns.forEach(function (b) { if (b) b.disabled = true; });

    var status = cfg.statusEl;
    var start = Date.now();
    function paint() {
      var sec = Math.round((Date.now() - start) / 1000);
      setStatus(status, '<span class="spin"></span>' + cfg.label + " " + sec + "초" + (sec > 30 ? " (조금 걸립니다)" : ""));
    }
    paint();
    var tick = setInterval(paint, 1000);

    var ctl = new AbortController();
    var box = stageBox(ctl, noteSwitch);
    attachBusyNote(box);
    box.arm();

    geminiTextAuto(model, cfg.req.system, cfg.req.user, box, cfg.gen || null)
      .then(function (text) {
        box.disarm();
        if (!cfg.apply(text)) throw new Error(cfg.parseMessage || "응답을 읽지 못했습니다. 다시 한 번 눌러 주세요");
      })
      .catch(function (err) {
        box.disarm();
        var msg = err && err.name === "AbortError"
          ? "시간이 너무 오래 걸려 멈췄습니다(3분). 다시 눌러 주세요"
          : (err && err.message ? err.message : "알 수 없는 오류");
        setStatus(status, "⚠️ " + esc(msg) + ' <button type="button" class="btn small ghost" data-retry="1">🔁 다시 시도</button>', "err");
        var rb = status && status.querySelector ? status.querySelector("[data-retry]") : null;
        if (rb && rb.addEventListener && cfg.retry) rb.addEventListener("click", function () { cfg.retry(); });
        if (cfg.fallback) { try { cfg.fallback(err); } catch (e2) {} }
      })
      .then(function () {
        clearInterval(tick);
        state.busy = false;
        btns.forEach(function (b) { if (b) b.disabled = false; });
      });
  }

  function renderThreads() {
    var t = state.threads;
    var box = $("#threadList");
    if (!box) return;
    box.innerHTML = "";
    var ex = $("#threadExtra");
    if (ex) { ex.innerHTML = ""; show(ex, false); }
    if (!t) { paintThreadUpload(); return; }

    t.threads.forEach(function (it, i) {
      var card = document.createElement("div");
      card.className = "thread-card";
      card.innerHTML =
        '<div class="ipc-head"><strong>타래 ' + (it.no || i + 1) + '</strong>' +
        '<span class="ipc-badge">' + esc(it.role) + '</span>' +
        '<span class="tc-len"></span></div>' +
        '<textarea rows="2" spellcheck="false"></textarea>' +
        '<div class="ipc-foot">' +
        '<button type="button" class="btn small primary" data-act="copy">📋 이 타래 복사</button>' +
        '<span class="ipc-tip">복사 → 스레드에 차례로 붙여넣기</span>' +
        '</div>';
      var ta = card.querySelector("textarea");
      var len = card.querySelector(".tc-len");
      function paintLen() { if (len) len.textContent = ta.value.length + "자"; }
      ta.value = it.text;
      paintLen();
      ta.addEventListener("input", function (e) {
        state.threads.threads[i].text = e.target.value;
        paintLen();
        autoGrow(e.target);
      });
      card.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(state.threads.threads[i].text).then(function (ok) {
          toast(ok ? "타래 " + (i + 1) + "을 복사했습니다 — 스레드에 붙여넣으세요" : "복사가 막혔습니다 — 글을 직접 선택해 복사해 주세요");
        });
      });
      box.appendChild(card);
      autoGrow(ta);
    });

    var html = "";
    if (t.comment) {
      html += '<div class="thread-card extra">' +
        '<div class="ipc-head"><strong>첫 댓글</strong><span class="ipc-badge">링크 + 대가성 문구 맨 앞</span>' +
        '<span class="tc-len" data-k="clen"></span></div>' +
        '<textarea rows="2" spellcheck="false" data-k="comment"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy-comment">📋 첫 댓글 복사</button>' +
        '<span class="ipc-tip">본문에는 링크를 넣지 않았습니다 · 대가성 문구는 이 댓글 맨 앞, 500자 이내</span></div></div>';
    }
    if (t.hashtags) {
      html += '<div class="thread-card extra">' +
        '<div class="ipc-head"><strong>해시태그</strong><span class="ipc-badge">주제 태그 1개 · 한 단어</span></div>' +
        '<textarea rows="2" spellcheck="false" data-k="tags"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy-tags"># 해시태그 복사</button>' +
        '<span class="ipc-tip">태그 칸에 \'#\' 없이 이 한 단어만</span></div></div>';
    }
    if (ex && html) {
      ex.innerHTML = html;
      show(ex, true);
      var cta = ex.querySelector('[data-k="comment"]');
      if (cta) {
        var clen = ex.querySelector('[data-k="clen"]');
        var CL = commentCharLimit();
        var paintClen = function () {
          if (!clen) return;
          clen.textContent = cta.value.length + "자 / " + CL + "자";
          clen.style.color = cta.value.length > CL ? "#b8452a" : "";
        };
        cta.value = t.comment;
        paintClen();
        cta.addEventListener("input", function (e) { state.threads.comment = e.target.value; paintClen(); });
        autoGrow(cta);
      }
      var tta = ex.querySelector('[data-k="tags"]');
      if (tta) {
        tta.value = t.hashtags;
        tta.addEventListener("input", function (e) { state.threads.hashtags = e.target.value; });
        autoGrow(tta);
      }
      var cb = ex.querySelector('[data-act="copy-comment"]');
      if (cb) cb.addEventListener("click", function () {
        copyPlain(state.threads.comment).then(function (ok) { toast(ok ? "첫 댓글을 복사했습니다 — 글 올린 뒤 댓글로 붙여넣으세요" : "복사 실패"); });
      });
      var tb = ex.querySelector('[data-act="copy-tags"]');
      if (tb) tb.addEventListener("click", function () {
        copyPlain(state.threads.hashtags).then(function (ok) { toast(ok ? "해시태그를 복사했습니다" : "복사 실패"); });
      });
    }
    paintThreadUpload();
  }

  function renderVideoScript() {
    var v = state.video;
    var box = $("#videoBody");
    if (!box) return;
    box.innerHTML = "";
    if (!v) return;
    var f = BS.videoFormat(state.videoFormat);

    function card(head, badge, text, copyLabel, act, rows, onInput) {
      var c = document.createElement("div");
      c.className = "img-prompt-card";
      c.innerHTML =
        '<div class="ipc-head"><strong>' + esc(head) + '</strong>' +
        (badge ? '<span class="ipc-badge">' + esc(badge) + '</span>' : '') + '</div>' +
        '<textarea rows="' + (rows || 4) + '" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="' + act + '">' + copyLabel + '</button></div>';
      var ta = c.querySelector("textarea");
      ta.value = text;
      ta.addEventListener("input", function (e) {
        if (onInput) onInput(e.target.value);
        autoGrow(e.target);
      });
      c.querySelector('[data-act="' + act + '"]').addEventListener("click", function () {
        copyPlain(ta.value).then(function (ok) { toast(ok ? "복사했습니다 — 붙여넣어 쓰세요" : "복사 실패"); });
      });
      box.appendChild(c);
      autoGrow(ta);
      return c;
    }

    if (v.pick) {
      card("🛒 상품 선정 — 대본보다 먼저", "역순 전략", v.pick, "📋 상품 선정 복사", "copy-pick", 6, function (val) { v.pick = val; });
    }

    v.thumbs.forEach(function (t, i) {
      var c = document.createElement("div");
      c.className = "img-prompt-card thumb-card";
      c.innerHTML =
        '<div class="ipc-head"><strong>썸네일 문구 ' + (i + 1) + '</strong>' +
        '<span class="ipc-badge">' + (i === 0 ? "의외성·경고형" : "질문·숫자형") + '</span></div>' +
        '<textarea rows="2" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy-thumb">📋 문구 복사</button></div>';
      var ta = c.querySelector("textarea");
      ta.value = t;
      ta.addEventListener("input", function (e) { v.thumbs[i] = e.target.value; autoGrow(e.target); });
      c.querySelector('[data-act="copy-thumb"]').addEventListener("click", function () {
        copyPlain(v.thumbs[i]).then(function (ok) { toast(ok ? "썸네일 문구를 복사했습니다" : "복사 실패"); });
      });
      box.appendChild(c);
      autoGrow(ta);
    });

    card("0~3초 후크", "이탈 방지", v.hook, "📋 후크 복사", "copy-hook", 2, function (val) { v.hook = val; });
    card("나레이션 대본", f.seconds + " · " + v.narration.length + "자", v.narration, "📋 나레이션 복사", "copy-narr", 9, function (val) { v.narration = val; });
    card("자막 핵심 줄", v.captions.length + "줄", v.captions.join("\n"), "📋 자막 복사", "copy-caps", 5, function (val) {
      v.captions = val.split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    });

    if (v.direct) {
      card("🎬 절차형 4단계 연출표", "화면·카메라·자막·효과음·BGM",
        v.direct, "📋 연출표 복사", "copy-direct", 18, function (val) { v.direct = val; });
    }

    v.scenes.forEach(function (s, i) {
      if (!s.final) s.final = videoScenePrompt(s, f);
      var c = document.createElement("div");
      c.className = "img-prompt-card scene-card";
      c.innerHTML =
        '<div class="ipc-head"><strong>장면 ' + s.no + '</strong>' +
        '<span class="ipc-badge">' + esc(s.zone || (i === 0 ? "후크" : "전개")) + '</span></div>' +
        '<div class="ipc-role">' +
        (s.view ? "화면 · " + esc(s.view) : "") +
        (s.caption ? '<br>자막 · ' + esc(s.caption) : "") +
        (s.narration ? '<br>나레이션 · ' + esc(s.narration) : "") +
        '</div>' +
        '<textarea rows="6" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy-scene">📋 장면 프롬프트 복사</button>' +
        '<a class="btn small ghost" href="' + BS.VIDEO.flowUrl + '" target="_blank" rel="noopener">Flow 열기 ↗</a></div>';
      var ta = c.querySelector("textarea");
      ta.value = s.final;
      ta.addEventListener("input", function (e) { s.final = e.target.value; autoGrow(e.target); });
      c.querySelector('[data-act="copy-scene"]').addEventListener("click", function () {
        copyPlain(s.final).then(function (ok) { toast(ok ? "장면 " + s.no + " 프롬프트를 복사했습니다" : "복사 실패"); });
      });
      box.appendChild(c);
      autoGrow(ta);
    });

    if (v.license) {
      card("🔊 라이선스 확인", "상업 무료만", v.license, "📋 라이선스 복사", "copy-license", 6, function (val) { v.license = val; });
    }
  }

  function convertToThreads() {
    if (state.busy) return;
    var r = state.result;
    if (!r) { toast("먼저 원고를 만들어 주세요 — 그 원고 내용으로 스레드 타래를 만듭니다"); return; }
    if (!apiKeyOrAsk()) return;
    var persona = BS.threadPersona(state.blog.id, r.topic);
    var req;
    try {
      req = BS.prompts.threadsPrompt({
        blog: state.blog,
        persona: persona,
        persona6: currentPersona(),
        source: stripMetaSections(r.md),
        topic: r.topic,
        title: stripEmphasisMarks(r.title || ""),
        extraKeywords: $("#extraKw") ? $("#extraKw").value.trim() : "",
        notes: $("#notes") ? $("#notes").value.trim() : "",
        disclosure: articleDisclosure(r)
      });
    } catch (e) {
      toast("스레드 요청을 만들지 못했습니다 — " + (e && e.message ? e.message : e));
      return;
    }
    show($("#threadPanel"), true);
    if ($("#threadList")) $("#threadList").innerHTML = "";
    show($("#threadExtra"), false);
    if ($("#threadMeta")) $("#threadMeta").textContent = persona.emoji + " " + persona.label + " · " + persona.no + "번 계정 · 🎭 " + (currentPersona() || {}).label;
    state.threads = null;
    resetThreadUpload();
    runScriptJob({
      req: req,
      statusEl: $("#threadStatus"),
      label: "스레드 타래를 쓰는 중입니다…",
      buttons: [$("#btnToThreads")],
      gen: { temperature: 0.85 },
      parseMessage: "스레드 타래를 읽지 못했습니다 — 다시 한 번 눌러 주세요",
      retry: convertToThreads,
      apply: function (text) {
        var parsed = parseThreads(text);
        if (!parsed) return false;
        var disc = articleDisclosure(r);
        if (disc.needed) {
          parsed.disclosure = disc.text;
          if (parsed.threads.length) parsed.threads[0].text = ensureDisclosure(parsed.threads[0].text, disc.text);
          parsed.comment = ensureCommentDisclosure(parsed.comment, disc.text);
        }
        state.threads = parsed;
        renderThreads();
        setStatus($("#threadStatus"), "✅ 타래 " + parsed.threads.length + "개 준비됨 — 타래마다 복사해 스레드에 차례로 붙여넣으세요 (링크는 첫 댓글, 대가성 문구는 그 댓글 맨 앞)", "ok");
        var panel = $("#threadPanel");
        if (panel && panel.scrollIntoView) { try { panel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
        return true;
      }
    });
  }

  function convertToVideoScript(formatId) {
    if (state.busy) return;
    var r = state.result;
    if (!r) { toast("먼저 원고를 만들어 주세요 — 그 원고 내용으로 영상 대본을 만듭니다"); return; }
    if (!apiKeyOrAsk()) return;
    var f = BS.videoFormat(formatId || state.videoFormat);
    state.videoFormat = f.id;
    paintVideoTabs();
    var req;
    try {
      req = BS.prompts.videoScriptPrompt({
        blog: state.blog,
        fmt: f,
        formatId: f.id,
        persona6: currentPersona(),
        source: stripMetaSections(r.md),
        topic: r.topic,
        title: stripEmphasisMarks(r.title || ""),
        notes: $("#notes") ? $("#notes").value.trim() : ""
      });
    } catch (e) {
      toast("영상 대본 요청을 만들지 못했습니다 — " + (e && e.message ? e.message : e));
      return;
    }
    show($("#videoPanel"), true);
    if ($("#videoBody")) $("#videoBody").innerHTML = "";
    if ($("#videoMeta")) $("#videoMeta").textContent = f.emoji + " " + f.label + " · " + f.ratio + " · 🎭 " + (currentPersona() || {}).label;
    state.video = null;
    runScriptJob({
      req: req,
      statusEl: $("#videoStatus"),
      label: f.emoji + " " + f.label + " 대본을 쓰는 중입니다…",
      buttons: [$("#btnToVideo"), $("#btnToThreads")],
      gen: { temperature: 0.8 },
      parseMessage: "영상 대본을 읽지 못했습니다 — 다시 한 번 눌러 주세요",
      retry: function () { convertToVideoScript(state.videoFormat); },
      apply: function (text) {
        var parsed = parseVideoScript(text);
        if (!parsed) return false;
        state.video = parsed;
        renderVideoScript();
        setStatus($("#videoStatus"), "✅ " + f.label + " 대본 준비됨 — 장면마다 Flow 프롬프트를 복사하거나 '📋 피클에게 보낼 영상 요청 복사'로 한 번에 넘기세요", "ok");
        var panel = $("#videoPanel");
        if (panel && panel.scrollIntoView) { try { panel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
        return true;
      }
    });
  }

  function renderTitles() {
    var r = state.result;
    var box = $("#titleList");
    box.innerHTML = "";
    (r.titles || []).forEach(function (t, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "title-item" + (t === r.title ? " sel" : "");
      b.innerHTML = '<span class="tn">' + (i + 1) + "</span><span>" + esc(t) + '</span><span class="len">' + t.length + "자</span>";
      b.addEventListener("click", function () {
        $$(".title-item").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        setTitle(t, { silent: true });
        renderArticle();
        updateRawViews();
        saveDraft();
      });
      box.appendChild(b);
    });
    paintTitleEdit();
  }

  /* ---------- ✏️ 제목 직접 수정칸 (v1.9.6 · 2026-11-18 지연님 지시) ----------
     "원고 생성 결과 상단에서 제목을 직접 수정" — 후보를 누르면 수정칸에 들어오고,
     고친 제목이 '제목 복사'·마크다운/HTML 복사본·임시저장 파일 제목까지 그대로 간다.
     한 글자 칠 때마다 전체를 다시 그리면 커서가 튀므로, 미리보기 제목만 바로 바꾸고
     복사본 글은 잠깐 뒤에 맞춘다. */
  var titleEditTimer = null;
  function paintTitleEdit() {
    var r = state.result;
    var box = $("#titleEdit");
    if (!r || !box) return;
    var val = stripEmphasisMarks(r.title || "");
    try { if (document.activeElement !== box) box.value = val; } catch (e) { box.value = val; }
    var lenEl = $("#titleEditLen");
    if (lenEl) {
      var n = String(box.value || "").length;
      lenEl.textContent = n ? n + "자" : "";
    }
  }
  function setTitle(t, opts) {
    var r = state.result;
    if (!r) return;
    r.title = stripEmphasisMarks(String(t == null ? "" : t));
    paintTitleEdit();
    var head = document.querySelector(".article .art-title");
    if (head) head.textContent = r.title || "(제목 미선택)";
    if (!opts || !opts.silent) {
      clearTimeout(titleEditTimer);
      titleEditTimer = setTimeout(function () { updateRawViews(); saveDraft(); }, 350);
    }
  }
  /* AI가 고른 추천 제목으로 되돌린다 */
  function recommendedTitleAgain() {
    var r = state.result;
    if (!r) return "";
    return stripEmphasisMarks(parseRecommendedTitle(pickSection(r.sections, ["최종 추천 제목", "추천 제목"])) || (r.titles || [])[0] || "");
  }

  function updateRawViews() {
    var r = state.result;
    if (!r) return;
    if (r.blogger) {
      $("#rawMd").value = r.md || "";
      $("#rawHtml").value = (r.blogger && r.blogger.html) || "";
      return;
    }
    $("#rawMd").value = buildMarkdown();
    $("#rawHtml").value = buildRichHtml();
  }

  /* ---------------- 6. 복사/저장 ---------------- */
  function copyRich(html, plain) {
    if (navigator.clipboard && window.ClipboardItem) {
      var item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain || html.replace(/<[^>]+>/g, "")], { type: "text/plain" })
      });
      return navigator.clipboard.write([item]).then(function () { return true; }).catch(function () { return legacyCopy(html); });
    }
    return Promise.resolve(legacyCopy(html));
  }
  function legacyCopy(html) {
    var d = document.createElement("div");
    d.contentEditable = "true";
    d.style.position = "fixed";
    d.style.left = "-9999px";
    d.innerHTML = html;
    document.body.appendChild(d);
    var range = document.createRange();
    range.selectNodeContents(d);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    sel.removeAllRanges();
    document.body.removeChild(d);
    return ok;
  }
  function copyPlain(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text.replace(/\n/g, "<br>")); });
    }
    return Promise.resolve(legacyCopy(text.replace(/\n/g, "<br>")));
  }

  /* ---------------- 7. 이미지 (무료 모드: 프롬프트 복사 → 제미나이 앱) ---------------- */
  var GEMINI_URL = "https://gemini.google.com/";

  function isNone(v) {
    return !v || /^(없음|없다|없어|none|n\/a|-)$/i.test(String(v).trim());
  }

  /* 모델이 고른 장면을 읽어서, 붙여넣을 한국어 지시문으로 만든다 */
  function parseImageScenes(text, withText) {
    var blocks = [];
    var cur = null;
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var t = raw.replace(/\*\*/g, "").replace(/^[-•·]\s+/, "").trim();
      if (/^#{0,3}\s*장면\s*\d+/.test(t)) {
        cur = { role: "", scene: "", people: "", place: "", phrase: "", legacy: "" };
        blocks.push(cur);
        return;
      }
      if (!cur || !t) return;
      var m = t.match(/^(한글\s*설명|설명|장면(?:\s*묘사|\s*설명)?|인물(?:들)?|배경|문구|사진\s*문구|텍스트|영문\s*프롬프트|English\s*prompt|프롬프트|지시문)\s*[:：]\s*(.*)$/i);
      if (m) {
        var key = m[1].replace(/\s/g, "");
        var val = (m[2] || "").trim();
        if (/^(한글설명|설명)$/.test(key)) cur.role = val;
        else if (key.indexOf("장면") === 0) cur.scene = val;
        else if (key.indexOf("인물") === 0) cur.people = val;
        else if (key === "배경") cur.place = val;
        else if (key === "문구" || key === "사진문구" || key === "텍스트") cur.phrase = val;
        else cur.legacy = cur.legacy ? cur.legacy + " " + val : val; // 이전 형식(영문 프롬프트)
        return;
      }
      if (cur.scene) cur.scene += " " + t;
      else if (cur.role) cur.role += " " + t;
      else cur.role = t;
    });

    return blocks.map(function (b) {
      var prompt;
      if (b.scene || b.place || b.people) {
        prompt = BS.prompts.composeImageInstruction(
          { scene: b.scene, people: b.people, place: b.place, phrase: b.phrase },
          { withText: withText }
        );
      } else {
        prompt = b.legacy;
      }
      return { role: b.role || "", prompt: prompt || "" };
    }).filter(function (p) { return p.prompt; });
  }

  function makeImagePrompts() {
    var key = apiKeyOrAsk();
    if (!key || !state.result) return;
    var model = localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    var withText = $("#optImgText") ? $("#optImgText").checked : false;
    var raw = ($("#imgCount") ? $("#imgCount").value : "3");
    var bySection = raw === "section" && !isCafeResult(state.result);
    var count = bySection ? sectionImageCount() : (parseInt(raw, 10) || 3);
    var btn = $("#btnMakeImgPrompts");
    btn.disabled = true;
    var req = BS.prompts.imagePromptRequest({
      blog: state.blog,
      topic: state.result.topic,
      summary: state.result.md,
      count: count,
      withText: withText,
      bySection: bySection
    });
    setStatus($("#imgStatus"), '<span class="spin"></span>장면 고르는 중…');
    var imgBox = stageBox(null, function (from, to) {
      setStatus($("#imgStatus"), '<span class="spin"></span>🔀 ' + esc(from) + " 한도에 닿아 " + esc(to) + " 모델로 전환해 이어서 고르는 중…");
    });
    geminiTextAuto(model, req.system, req.user, imgBox, null)
      .then(function (text) {
        var prompts = parseImageScenes(text, withText);
        if (!prompts.length) {
          setStatus($("#imgStatus"), "⚠️ 장면을 읽지 못했습니다. 한 번 더 눌러 주세요.", "err");
          return;
        }
        state.imgPrompts = prompts.slice(0, 9);
        state.images = [];
        $("#imageGrid").innerHTML = "";
        $("#btnDownloadAll").hidden = true;
        $("#imgNote").hidden = true;
        renderImgPrompts();
        setStatus($("#imgStatus"), "✅ 장면 " + state.imgPrompts.length + "개 준비됨 — 복사해서 제미나이에 붙여넣으세요 (지시문은 직접 고쳐도 됩니다)", "ok");
      })
      .catch(function (err) {
        setStatus($("#imgStatus"), "⚠️ " + (err.message || err), "err");
      })
      .then(function () { btn.disabled = false; });
  }

  function autoGrow(ta) {
    if (!ta) return;
    /* v2.3.1 — 숨겨 둔 카드에서 부르면 scrollHeight 가 0 이라 높이가 4px 로 줄어
       글자가 위아래로 잘렸다(지연님 화면 제보). 숨은 동안은 인라인 높이를 지워
       CSS 기본 높이(min-height)로 두고, 보인 뒤 autoGrowIn 이 다시 키운다. */
    if (ta.offsetParent === null || !ta.scrollHeight) { ta.style.height = ""; return; }
    ta.style.height = "auto";
    ta.style.height = Math.min(Math.max(ta.scrollHeight + 4, 72), 900) + "px";   // v2.3.1 — 상한을 900px 로 넓혀 모바일에서도 글자가 잘리지 않게
  }

  /* 카드가 화면에 보인 직후 안의 글상자를 내용 높이에 맞춘다 (v2.3.1) */
  function autoGrowIn(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll("textarea");
    for (var i = 0; i < list.length; i++) autoGrow(list[i]);
  }

  function renderImgPrompts() {
    var box = $("#imgPromptList");
    box.innerHTML = "";
    state.imgPrompts.forEach(function (p, i) {
      var card = document.createElement("div");
      card.className = "img-prompt-card";
      card.innerHTML =
        '<div class="ipc-head"><strong>장면 ' + (i + 1) + '</strong><span class="ipc-badge">제미나이용 지시문</span></div>' +
        '<div class="ipc-role">' + esc(p.role || "장면 설명") + "</div>" +
        '<textarea rows="6" data-i="' + i + '" spellcheck="false">' + esc(p.prompt) + "</textarea>" +
        '<div class="ipc-foot">' +
        '<button type="button" class="btn small primary" data-act="copy">📋 프롬프트 복사</button>' +
        '<a class="btn small ghost" href="' + GEMINI_URL + '" target="_blank" rel="noopener">제미나이 열기 ↗</a>' +
        '<span class="ipc-tip">복사 → 제미나이에 붙여넣기 → 전송</span>' +
        "</div>";
      var ta = card.querySelector("textarea");
      ta.addEventListener("input", function (e) {
        state.imgPrompts[i].prompt = e.target.value;
        autoGrow(e.target);
      });
      card.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(state.imgPrompts[i].prompt).then(function (ok) {
          toast(ok ? "장면 " + (i + 1) + " 지시문을 복사했습니다 — 제미나이에 붙여넣으세요" : "복사가 막혔습니다 — 지시문을 직접 선택해 복사해 주세요");
        });
      });
      box.appendChild(card);
      autoGrow(ta);
    });
    $("#btnGenAllImages").hidden = !state.imgPrompts.length;
    renderSceneButtons();
  }

  /* ---------------- 7-1. 하단 허브 배너 · 대표 썸네일 2종 ---------------- */
  function refreshBanner() {
    var ta = $("#bannerPrompt");
    if (ta) ta.value = BS.prompts.bannerInstruction();
    // ☕ 카페 글에는 3:1 허브 배너를 쓰지 않는다 (v1.8.0)
    show($("#bannerCard"), !(state.result && isCafeResult(state.result)));
  }

  function sectionImageCount() {
    if (!state.result) return 3;
    var sec = pickSection(state.result.sections, ["목차"]);
    if (!sec) return 3;
    var n = sec.body.filter(function (l) { return /^\d+[).]\s+/.test(l.trim()); }).length;
    return Math.min(Math.max(n, 1), 9);
  }

  function makeThumbs() {
    if (!state.result) { toast("원고를 먼저 만들어 주세요"); return; }
    state.thumbs = BS.prompts.thumbnailInstructions({
      blog: state.blog,
      title: state.result.title,
      topic: state.result.topic,
      summary: state.result.md   // 글 요지까지 넣어야 '이 글에서 궁금한 것'을 찌르는 문구가 나온다(v1.7.3)
    });
    renderThumbs();
    toast("썸네일 2종 프롬프트를 만들었습니다 — 짧은 호기심 훅 문구로 뽑습니다");
  }

  function renderThumbs() {
    var box = $("#thumbList");
    if (!box) return;
    box.innerHTML = "";
    (state.thumbs || []).forEach(function (t, i) {
      var parts = String(t.role || "").split(" · ");
      var card = document.createElement("div");
      card.className = "img-prompt-card";
      card.innerHTML =
        '<div class="ipc-head"><strong>' + esc(parts[0] || ("썸네일 " + (i + 1))) + '</strong>' +
        '<span class="ipc-badge">' + esc(parts[1] || "프롬프트") + "</span></div>" +
        '<textarea rows="6" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy">📋 프롬프트 복사</button>' +
        '<a class="btn small ghost" href="' + GEMINI_URL + '" target="_blank" rel="noopener">제미나이 열기 ↗</a></div>';
      var ta = card.querySelector("textarea");
      ta.value = t.prompt;
      ta.addEventListener("input", function (e) { state.thumbs[i].prompt = e.target.value; autoGrow(e.target); });
      card.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(state.thumbs[i].prompt).then(function (ok) {
          toast(ok ? "프롬프트를 복사했습니다 — 제미나이에 붙여넣으세요" : "복사가 막혔습니다 — 직접 선택해 복사해 주세요");
        });
      });
      box.appendChild(card);
      autoGrow(ta);
    });
  }

  /* 보조: 결제 연결된 API 키로 바로 생성 */
  function renderSceneButtons() {
    var box = $("#imgSceneBtns");
    if (!box) return;
    box.innerHTML = "";
    if (!state.imgPrompts.length) return;
    var lbl = document.createElement("span");
    lbl.className = "scene-btns-label";
    lbl.textContent = "장면별로 바로 생성:";
    box.appendChild(lbl);
    state.imgPrompts.forEach(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn small ghost";
      b.textContent = "장면 " + (i + 1);
      b.addEventListener("click", function () { genImage(i); });
      box.appendChild(b);
    });
  }

  function imgModel() { return localStorage.getItem(K_IMAGE) || BS.DEFAULT_IMAGE_MODEL; }

  function genImage(i) {
    var key = apiKeyOrAsk();
    if (!key) return Promise.resolve(false);
    var p = state.imgPrompts[i];
    if (!p) return Promise.resolve(false);
    var grid = "#imageGrid";
    var old = document.getElementById("tile-" + i);
    if (old) old.remove();
    var tile = document.createElement("div");
    tile.className = "img-tile";
    tile.id = "tile-" + i;
    tile.innerHTML = '<div class="tile-busy"><span class="spin"></span> 이미지 만드는 중…</div>';
    $(grid).appendChild(tile);
    $("#apiImgBox").open = true;
    setStatus($("#imgApiStatus"), '<span class="spin"></span>이미지 생성 중…');

    return geminiImage(imgModel(), p.prompt)
      .then(function (res) {
        var t = document.getElementById("tile-" + i);
        if (!t) return false;
        t.innerHTML = '<img alt="생성 이미지 ' + (i + 1) + '" src="' + res.dataUrl + '">' +
          '<div class="tile-bar"><button type="button" class="btn small ghost">다운로드</button></div>';
        t.querySelector("button").addEventListener("click", function () { downloadImage(res.dataUrl, i); });
        state.images.push({ dataUrl: res.dataUrl, mime: res.mime, prompt: p.prompt, idx: i });
        $("#btnDownloadAll").hidden = false;
        setStatus($("#imgApiStatus"), "✅ 이미지 " + state.images.length + "장 완성", "ok");
        $("#imgNote").hidden = true;
        return true;
      })
      .catch(function (err) {
        var msg = err.message || String(err);
        var t = document.getElementById("tile-" + i);
        if (t) t.remove();
        setStatus($("#imgApiStatus"), "⚠️ " + msg, "err");
        showImageFallback(msg, p.prompt);
        return false;
      });
  }

  function showImageFallback(msg, prompt) {
    var n = $("#imgNote");
    n.hidden = false;
    n.innerHTML =
      "<strong>API로는 그림이 나오지 않았습니다</strong>" +
      "<p>" + esc(msg) + "</p>" +
      "<p>지연님 AI Studio는 <b>무료 등급</b>이라 이미지 모델 한도가 0입니다. 위의 장면 지시문을 복사해 <b>제미나이 앱</b>에 붙여넣으면 같은 그림을 만들 수 있습니다. 결제를 연결하면 이 보조 기능도 그대로 살아납니다.</p>" +
      '<p><a href="https://gemini.google.com/" target="_blank" rel="noopener">제미나이 앱 열기</a> · <a href="https://aistudio.google.com/" target="_blank" rel="noopener">AI Studio 열기</a></p>';
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn small";
    b.textContent = "프롬프트 복사";
    b.addEventListener("click", function () {
      copyPlain(prompt).then(function (ok) { toast(ok ? "프롬프트를 복사했습니다" : "복사 실패"); });
    });
    n.appendChild(b);
  }

  function downloadImage(dataUrl, i) {
    var a = document.createElement("a");
    a.href = dataUrl;
    var ext = (dataUrl.match(/^data:image\/(\w+)/) || [])[1] || "png";
    a.download = "이미지_" + (i + 1) + "." + (ext === "jpeg" ? "jpg" : ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadAll() {
    if (!state.images.length) return;
    state.images.forEach(function (im, k) {
      setTimeout(function () { downloadImage(im.dataUrl, im.idx != null ? im.idx : k); }, k * 700);
    });
    toast(state.images.length + "장을 차례로 저장합니다 (브라우저가 여러 개를 막으면 한 장씩 눌러 주세요)");
  }

  /* ---------------- 8. 임시저장 ---------------- */
  function saveDraft() {
    var r = state.result;
    if (!r) return;
    var list = getDrafts();
    var item = {
      id: r.ts,
      ts: r.ts,
      title: r.title || r.topic,
      topic: r.topic,
      blogId: r.blogId,
      docMode: resultMode(r),
      productPlatform: r.productPlatform || "",
      affiliatePlatform: r.affiliatePlatform || state.affiliatePlatform || "coupang",
      productUrl: r.productUrl || "",
      productMemo: r.productMemo || "",
      md: r.md
    };
    var idx = list.findIndex(function (d) { return d.id === item.id; });
    if (idx >= 0) list[idx] = item;
    else list.unshift(item);
    setDrafts(list);
    $("#draftCount").textContent = "· " + getDrafts().length + "개";
  }

  function renderDrafts() {
    var list = getDrafts();
    var box = $("#draftList");
    box.innerHTML = "";
    $("#draftCount").textContent = list.length ? "· " + list.length + "개" : "";
    if (!list.length) {
      box.innerHTML = '<div class="ir-empty">아직 저장된 원고가 없습니다.</div>';
      return;
    }
    list.forEach(function (d) {
      var blog = BS.BLOGS.filter(function (b) { return b.id === d.blogId; })[0];
      var row = document.createElement("div");
      row.className = "draft-item";
      row.innerHTML = '<div class="di-main"><div class="di-title">' + esc(d.title) + '</div>' +
        '<div class="di-meta">' + (blog ? esc(blog.name) : "") +
        (d.docMode && d.docMode !== "blog" ? " · " + esc(modeLabel(d.docMode)) : "") +
        " · " + kdate(d.ts) + "</div></div>";
      var load = document.createElement("button");
      load.type = "button"; load.className = "btn small ghost"; load.textContent = "불러오기";
      load.addEventListener("click", function () { loadDraft(d.id); });
      var del = document.createElement("button");
      del.type = "button"; del.className = "btn small ghost danger"; del.textContent = "삭제";
      del.addEventListener("click", function () {
        setDrafts(getDrafts().filter(function (x) { return x.id !== d.id; }));
        renderDrafts();
      });
      row.appendChild(load); row.appendChild(del);
      box.appendChild(row);
    });
  }

  function loadDraft(id) {
    var d = getDrafts().filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var blog = BS.BLOGS.filter(function (b) { return b.id === d.blogId; })[0];
    if (blog && blog.id !== state.blog.id) {
      state.blog = blog;
      renderBlogs(); renderChips(); renderInternal();
      syncPersona();   // 🎭 불러온 원고의 블로그 기준 페르소나 (v2.2.0)
    }
    state.docMode = d.docMode || "blog";
    if (d.productPlatform) state.productPlatform = d.productPlatform;
    if (d.affiliatePlatform) setAffiliatePlatform(d.affiliatePlatform, { silent: true });
    renderModes();
    setDocMode(state.docMode);
    if ($("#productUrl")) $("#productUrl").value = d.productUrl || "";
    if ($("#productMemo")) $("#productMemo").value = d.productMemo || "";
    var parsed = (blog && blog.kind === "blogger")
      ? parseBloggerResult(d.md, blog)
      : splitSections(d.md);
    var titles = parsed.titles || parseTitles(pickSection(parsed.secs, ["제목 후보"]));
    var rec = parsed.blogger ? parsed.rec : parseRecommendedTitle(pickSection(parsed.secs, ["최종 추천 제목", "추천 제목"]));
    state.result = {
      md: d.md, sections: parsed.secs, titles: titles,
      title: stripEmphasisMarks(d.title || rec || titles[0] || ""), blogId: d.blogId, topic: d.topic, ts: d.ts,
      docMode: d.docMode || "blog", productPlatform: d.productPlatform || "",
      productUrl: d.productUrl || "", productMemo: d.productMemo || "",
      blogger: parsed.blogger || null,
      affiliateKeyword: d.topic
    };
    $("#topic").value = d.topic || "";
    renderTitles();
    renderArticle();
    updateRawViews();
    paintSafetyWarn();
    show($("#bloggerPanel"), !!state.result.blogger);
    show($("#resultTabs"), !state.result.blogger);
    show($("#copyBar"), !state.result.blogger);
    if (state.result.blogger) renderBlogger();
    refreshBanner();
    $("#stepResult").hidden = false;
    $("#stepImage").hidden = false;
    $("#stepResult").scrollIntoView({ behavior: "smooth" });
    toast("임시저장 원고를 불러왔습니다");
  }

  /* ---------------- 9. 설정 ---------------- */
  function openSettings() {
    $("#apiKey").value = getKey() ? "••••••••••••••••" : "";
    $("#apiKey").dataset.has = getKey() ? "1" : "";
    /* 🔑 GitHub 토큰은 저장돼 있으면 점으로만 보여 준다 */
    if ($("#ghToken")) {
      $("#ghToken").value = getGhToken() ? "••••••••••••••••" : "";
      $("#ghToken").dataset.has = getGhToken() ? "1" : "";
    }
    if ($("#ghTokenState")) {
      $("#ghTokenState").textContent = getGhToken()
        ? "✅ GitHub 토큰이 이 브라우저에 저장돼 있습니다 — 🔄 새로고침이 그 자리에서 수집을 돌립니다"
        : "아직 없습니다 — 없으면 🔄 새로고침은 마지막 수집본만 다시 읽습니다";
    }
    $("#textModel").value = localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL;
    $("#imageModel").value = localStorage.getItem(K_IMAGE) || BS.DEFAULT_IMAGE_MODEL;
    if ($("#optAutoModel")) $("#optAutoModel").checked = autoSwitchEnabled();
    var help = $("#autoModelHelp");
    if (help) {
      var chain = ((BS.MODEL_FALLBACK && BS.MODEL_FALLBACK.chain) || []).join(" → ");
      help.textContent = chain
        ? "429(한도 초과) · 404(모델 없음) · 503(서버 혼잡)일 때 " + chain + " 순서로 넘어가 이어서 작성합니다. 잠깐 혼잡하면 같은 모델로 한 번 더 시도합니다. 끄면 바로 오류로 알려 줍니다."
        : "";
    }
    fillDatalists(BS.TEXT_MODEL_HINTS, BS.IMAGE_MODEL_HINTS);
    $("#settingsModal").hidden = false;
  }
  function closeSettings() { $("#settingsModal").hidden = true; }

  function fillDatalists(text, image) {
    $("#textModelList").innerHTML = text.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("");
    $("#imageModelList").innerHTML = image.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("");
  }

  function saveSettings() {
    var v = $("#apiKey").value.trim();
    if (v && v.indexOf("••") !== 0) {
      if (!/^AIza[0-9A-Za-z_-]{20,}/.test(v)) {
        toast("AI Studio 키는 보통 'AIza'로 시작합니다. 다시 확인해 주세요");
      }
      setKey(v);
    }
    var tm = $("#textModel").value.trim() || BS.DEFAULT_TEXT_MODEL;
    var im = $("#imageModel").value.trim() || BS.DEFAULT_IMAGE_MODEL;
    localStorage.setItem(K_TEXT, tm);
    localStorage.setItem(K_IMAGE, im);
    if ($("#optAutoModel")) {
      try { localStorage.setItem(K_AUTO, $("#optAutoModel").checked ? "1" : "0"); } catch (e) {}
    }
    /* 🔑 GitHub 토큰 — 점으로 가려진 값은 건드리지 않는다(다시 저장해도 기존 값 유지) */
    var gt = $("#ghToken") ? String($("#ghToken").value || "").trim() : "";
    if (gt && gt.indexOf("••") !== 0) {
      if (!/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]{10,}/.test(gt)) {
        toast("GitHub 토큰은 보통 github_pat_ 또는 ghp_로 시작합니다 — 그래도 저장했습니다");
      }
      setGhToken(gt);
    }
    updateKeyState();
    closeSettings();
    toast("설정을 저장했습니다");
  }

  function updateKeyState() {
    var el = $("#keyState");
    if (getKey()) {
      el.textContent = "키 저장됨 · " + (localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL);
      el.className = "key-state on";
    } else {
      el.textContent = "키 미설정";
      el.className = "key-state off";
    }
  }

  function listModels() {
    var key = getKey();
    if (!key) { toast("키를 먼저 저장해 주세요"); return; }
    setStatus($("#genStatus"), "");
    $("#modelNote").textContent = "불러오는 중…";
    fetch(BS.API_BASE + "/models?pageSize=200&key=" + encodeURIComponent(key))
      .then(function (r) { return r.text().then(function (t) { if (!r.ok) throw new Error(friendlyError(r.status, t)); return JSON.parse(t); }); })
      .then(function (j) {
        var names = (j.models || []).map(function (m) { return (m.name || "").replace(/^models\//, ""); });
        var text = names.filter(function (n) {
          return !/embedding|tts|image|imagen|veo|audio|live|transcribe/i.test(n) && /gemini|gemma/i.test(n);
        });
        var image = names.filter(function (n) { return /image|imagen/i.test(n); });
        if (!text.length && !image.length) { $("#modelNote").textContent = "모델 목록이 비어 있습니다."; return; }
        fillDatalists(text.length ? text : BS.TEXT_MODEL_HINTS, image.length ? image : BS.IMAGE_MODEL_HINTS);
        $("#modelNote").textContent = "텍스트 " + text.length + "개 · 이미지 " + image.length + "개 불러옴";
        if (image.length && !localStorage.getItem(K_IMAGE)) $("#imageModel").value = image[0];
        toast("모델 목록을 불러왔습니다");
      })
      .catch(function (err) { $("#modelNote").textContent = "⚠️ " + (err.message || err); });
  }

/* ============================================================
   실시간 키워드 롤링 패널 (v1.7.0 · 2026-11-17)
   - data/realtime-trends.json 을 캐시 없이 불러와(매시 10분 GitHub Actions 갱신)
     갱신 시각·전체/블로그별 필터·롤링 하이라이트·원클릭 주제 입력을 제공한다.
   ============================================================ */
  var RT_CFG = BS.REALTIME || {};
  var RT_URL = RT_CFG.url || "data/realtime-trends.json";
  var rt = {
    data: null,
    filter: "all",
    intent: "all",      // v2.3.7 — 의도 필터(정보글·구매·비교글·이슈·트렌드)
    active: -1,
    timer: null,
    paused: false,
    loading: false
  };

  function rtReduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function rtBlogMeta(id) {
    var list = (rt.data && rt.data.blogs) || BS.BLOGS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function rtSrcName(s) {
    var map = {
      "구글 트렌드": "구글", "시그널": "시그널", "네이버": "네이버", "네이트": "네이트",
      "연예·생활": "연예", "건강": "건강"
    };
    return map[s] || s;
  }
  /* 블로그 필터만 적용한 목록 — 의도 칩 숫자도 이 위에서 센다 */
  function rtBlogFiltered() {
    var items = (rt.data && rt.data.keywords) || [];
    if (rt.filter === "all") return items.slice();
    return items.filter(function (it) { return (it.blogs || []).indexOf(rt.filter) >= 0; });
  }
  function rtIntentOf(it) {
    return (BS.kwIntent ? BS.kwIntent(it && it.k).id : "info");
  }
  function rtFiltered() {
    var items = rtBlogFiltered();
    if (rt.intent === "all") return items;
    return items.filter(function (it) { return rtIntentOf(it) === rt.intent; });
  }

  /* 🏷️ v2.3.7 — 의도 배지 (정보글 / 구매·비교글 / 이슈·트렌드) */
  function kwIntentBadge(k, full) {
    var m = (BS.kwIntent ? BS.kwIntent(k) : null);
    if (!m) return "";
    return '<span class="kw-intent i-' + esc(m.id) + '" title="' +
      esc(m.label + " · " + m.desc + " (" + m.basis + ")") + '">' +
      esc(full ? m.label : m.short) + "</span>";
  }

  /* 🔺 v2.3.7 — 급상승 배지: 지난 수집본과 견준 실제 값만 쓴다(지어낸 배수 없음)
     - prev 는 수집기(tools/fetch_realtime_trends.py)가 지난 실행의 순위표와 비교해 넣는다.
     - 6시간 넘게 끊긴 비교는 '급상승'으로 보지 않는다. */
  var RT_PREV_MAX_MIN = +(RT_CFG.prevMaxMinutes || 360);
  function rtPrevInfo() {
    var p = (rt.data && rt.data.prev) || null;
    if (!p || !p.generated_at) return null;
    var t = Date.parse(p.generated_at);
    if (!t || isNaN(t)) return null;
    var age = (Date.now() - t) / 60000;
    if (age < 0 || age > RT_PREV_MAX_MIN) return null;
    return { at: p.generated_at, age: age, count: p.count || 0 };
  }
  function rtAgeWord(min) {
    return min < 90 ? Math.max(1, Math.round(min)) + "분" : Math.round(min / 60) + "시간";
  }
  function rtTrendBadges(it) {
    var p = rtPrevInfo();
    if (!p || !it) return "";
    if (it["new"]) {
      return '<span class="rt-badge tr-new" title="' +
        esc(rtAgeWord(p.age) + " 전 수집에 없던 키워드 — 새로 들어왔습니다") + '">NEW</span>';
    }
    if ((it.delta || 0) >= 2) {
      return '<span class="rt-badge tr-up" title="' +
        esc(rtAgeWord(p.age) + " 전 " + (it.prev || 0) + "위 → 지금 " + (it.rank || 0) +
          "위 · " + it.delta + "계단 상승") + '">▲' + (it.delta | 0) + "계단</span>";
    }
    return "";
  }

  /* 블로그 배지 + 출처(또는 여러 곳 동시 포착) 배지 */
  function rtBadgeLabel(id) {
    var map = { mama2624: "생활", jiyn74: "경제", "2sunshines": "건강", jinjin2624: "질병" };
    return map[id] || id;
  }
  function rtBadges(it) {
    var h = "";
    var blogs = it.blogs || [];
    if (blogs.length) {
      blogs.slice(0, 2).forEach(function (id) {
        var b = rtBlogMeta(id);
        h += '<span class="rt-badge b-' + esc(id) + '" title="' + esc(b ? b.name : id) + '">' +
          esc(b ? b.emoji : "•") + esc(rtBadgeLabel(id)) + "</span>";
      });
    } else {
      h += '<span class="rt-badge b-all" title="4대 블로그 밖 공통 이슈">공통</span>';
    }
    var srcs = it.src || [];
    if (srcs.length >= 2) {
      h += '<span class="rt-badge tr-multi" title="' +
        esc(srcs.map(rtSrcName).join(" · ") + " — " + srcs.length + "곳에서 동시에 포착") + '">' +
        srcs.length + "곳 동시</span>";
    } else if (srcs.length) {
      h += '<span class="rt-badge src">' + esc(rtSrcName(srcs[0])) + "</span>";
    }
    return h;
  }

  function rtRenderTabs() {
    var box = $("#rtTabs");
    if (!box) return;
    var items = (rt.data && rt.data.keywords) || [];
    var defs = [{ id: "all", label: "전체", emoji: "" }].concat(
      ((rt.data && rt.data.blogs) || BS.BLOGS || []).map(function (b) {
        return { id: b.id, label: b.name, emoji: b.emoji || "" };
      })
    );
    box.innerHTML = "";
    defs.forEach(function (d) {
      var n = d.id === "all" ? items.length : items.filter(function (i) {
        return (i.blogs || []).indexOf(d.id) >= 0;
      }).length;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rt-tab" + (rt.filter === d.id ? " active" : "");
      b.setAttribute("data-filter", d.id);
      b.setAttribute("aria-pressed", rt.filter === d.id ? "true" : "false");
      b.innerHTML = (d.emoji ? esc(d.emoji) + " " : "") + esc(d.label) +
        '<span class="rt-tab-n">' + n + "</span>";
      b.addEventListener("click", function () { rtSetFilter(d.id); });
      box.appendChild(b);
    });
    rtRenderIntents();
  }

  /* 🏷️ v2.3.7 — 의도 칩(정보·구매·이슈) — 블로그 탭과 따로 겹쳐 고를 수 있다 */
  function rtIntentMeta(id) {
    var M = (BS.KW_INTENT && BS.KW_INTENT.meta) || {};
    return M[id] || { label: id, short: id, desc: "" };
  }
  function rtRenderIntents() {
    var box = $("#rtIntents");
    if (!box) return;
    var items = rtBlogFiltered();
    if (!items.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    var ids = (BS.KW_INTENT && BS.KW_INTENT.ids) || ["info", "buy", "issue"];
    var defs = [{ id: "all" }].concat(ids.map(function (id) { return { id: id }; }));
    box.innerHTML = "";
    defs.forEach(function (d) {
      var n = d.id === "all" ? items.length : items.filter(function (it) {
        return rtIntentOf(it) === d.id;
      }).length;
      if (d.id !== "all" && !n) return;      // 지금 없는 의도는 칩을 만들지 않는다
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rt-chip" + (rt.intent === d.id ? " active" : "") + " ci-" + d.id;
      b.setAttribute("data-intent", d.id);
      b.setAttribute("aria-pressed", rt.intent === d.id ? "true" : "false");
      b.title = d.id === "all" ? "의도 전체 — 정보·구매·이슈를 모두 봅니다" : rtIntentMeta(d.id).desc;
      b.innerHTML = esc(d.id === "all" ? "의도 전체" : rtIntentMeta(d.id).short) +
        '<span class="rt-chip-n">' + n + "</span>";
      b.addEventListener("click", function () { rtSetIntent(d.id); });
      box.appendChild(b);
    });
  }
  function rtSetIntent(id) {
    rt.intent = id || "all";
    rtRenderIntents();
    rtRenderList();
    rtStartRotate();
  }

  function rtRenderList() {
    var box = $("#rtList");
    if (!box) return;
    var items = rtFiltered();
    box.innerHTML = "";
    rt.active = -1;
    var empty = $("#rtEmpty");
    if (empty) {
      empty.hidden = items.length > 0;
      if (!items.length) {
        empty.textContent = !rt.data
          ? "실시간 키워드를 아직 불러오지 못했습니다. 🔄 새로고침을 눌러 주세요."
          : (rt.intent !== "all"
            ? "지금은 ‘" + rtIntentMeta(rt.intent).short + "’ 키워드가 없습니다. [의도 전체]로 보세요."
            : (rt.filter === "all"
              ? "지금은 실시간 키워드가 없습니다. 🔄 새로고침을 눌러 주세요."
              : "지금은 이 블로그에 바로 맞는 실시간 키워드가 없습니다. '전체'에서 골라 보세요."));
      }
    }
    var title = $("#rtListTitle");
    if (title) {
      title.textContent = (rt.filter === "all" ? "지금 뜨는 키워드" : "이 블로그에 맞는 키워드") +
        (rt.intent === "all" ? "" : " · " + rtIntentMeta(rt.intent).short);
    }

    items.forEach(function (it, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rt-item";
      b.setAttribute("data-k", it.k);
      var src = (it.src || []).map(rtSrcName).join("·");
      var im = (BS.kwIntent ? BS.kwIntent(it.k) : null);
      var trendNote = "";
      if (rtPrevInfo()) {
        if (it["new"]) trendNote = "\n🏷 새로 진입한 키워드";
        else if ((it.delta || 0) >= 2) trendNote = "\n📈 " + rtAgeWord(rtPrevInfo().age) + " 전 " + (it.prev || 0) + "위 → 지금 " + (it.rank || 0) + "위";
      }
      b.title = it.k + (src ? " · " + src : "") +
        (im ? "\n" + im.label + " · " + im.basis : "") + trendNote +
        (it.news && it.news[0] ? "\n" + it.news[0].t : "") + "\n(누르면 주제칸에 들어갑니다)";
      b.innerHTML = '<span class="rt-main">' +
        '<span class="rt-n">' + (i + 1) + "</span>" +
        '<span class="rt-k">' + esc(it.k) + "</span>" +
        '<span class="rt-trend">' + rtTrendBadges(it) + "</span>" +
        "</span>" +
        '<span class="rt-sub">' + kwIntentBadge(it.k) + rtBadges(it) + "</span>";
      b.addEventListener("click", function () { rtPick(it.k); });
      li.appendChild(b);
      box.appendChild(li);
    });
    box.scrollTop = 0;
  }

  function rtRenderLinks() {
    var box = $("#rtLinks");
    if (!box) return;
    var defs = (rt.data && rt.data.shortcuts) || [
      { name: "🔥 핫허브", url: "https://hothub.app/" },
      { name: "구글 트렌드 한국", url: "https://trends.google.com/trends/trendingsearches/daily?geo=KR" },
      { name: "시그널 실시간", url: "https://signal.bz/" },
      { name: "네이트 이슈", url: "https://news.nate.com/rank/interest?sc=du" },
      { name: "네이버 많이 본", url: "https://news.naver.com/main/ranking/popularDay.naver" }
    ];
    box.innerHTML = "";
    defs.forEach(function (d) {
      var a = document.createElement("a");
      a.className = "rt-link" + (d.id === "hothub" || /핫허브/.test(d.name || "") ? " rt-link-hot" : "");
      a.href = d.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = d.name + " ↗";
      a.title = (d.name || "") + " — " + d.url + " (새 창)";
      box.appendChild(a);
    });
  }

  function rtRenderNews() {
    var box = $("#rtNews");
    if (!box) return;
    box.innerHTML = "";
    var list = ((rt.data && rt.data.news) || []).slice(0, 6);
    if (!list.length) {
      var li0 = document.createElement("li");
      li0.className = "rt-news-empty";
      li0.textContent = "주요 뉴스를 불러오는 중…";
      box.appendChild(li0);
      return;
    }
    list.forEach(function (n) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = n.u || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = (n.s ? '<span class="rt-news-s">' + esc(n.s) + "</span>" : "") +
        '<span class="rt-news-t">' + esc(n.t) + "</span>";
      li.appendChild(a);
      box.appendChild(li);
    });
  }

  function rtRenderAge() {
    var el = $("#rtAge");
    var note = $("#rtNote");
    var t = rt.data && rt.data.generated_at ? Date.parse(rt.data.generated_at) : 0;
    if (!t || isNaN(t)) {
      if (el) el.textContent = "";
      return;
    }
    var min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (el) {
      el.textContent = min < 1 ? "방금" : (min < 60 ? min + "분 전" : Math.floor(min / 60) + "시간 " + (min % 60) + "분 전");
    }
    var stale = RT_CFG.staleMinutes || 180;
    if (note) {
      if (min >= stale) {
        note.hidden = false;
        note.textContent = "자동 갱신이 " + (min >= 120 ? Math.floor(min / 60) + "시간" : min + "분") +
          " 멈춘 것 같습니다. 🔄 새로고침을 눌러 보세요.";
      } else {
        note.hidden = true;
        note.textContent = "";
      }
    }
  }

  /* 접었을 때 머리에 보여 줄 지금 뜨는 키워드 3개 */
  function rtRenderPeek() {
    var el = $("#rtPeek");
    if (!el) return;
    var top = ((rt.data && rt.data.keywords) || []).slice(0, 3).map(function (k) { return k.k; });
    el.textContent = top.length ? "지금 " + top.join(" · ") : "";
  }

  function rtRenderFoot() {
    var el = $("#rtFoot");
    if (!el) return;
    var list = (rt.data && rt.data.sources) || [];
    var ok = list.filter(function (s) { return s.ok; }).length;
    var fail = list.length - ok;
    el.textContent = "구글 트렌드 · 시그널 · 네이버 · 네이트 · 연예·건강 RSS 중 " + ok + "곳에서 모아 4대 블로그로 나눕니다." +
      (fail ? " (" + fail + "곳 일시 실패)" : "") + " " + ((rt.data && rt.data.auto_note) || "");
  }

  function rtApply(j) {
    rt.data = j || null;
    // v1.9.7 — 실시간 파일 안에 담긴 '오늘 홈판 관찰'을 그대로 쓴다(매일 04:40 GitHub Actions)
    if (j && j.homefeed && j.homefeed.stats) {
      hf.data = j.homefeed;
      hf.loaded = true;
      BS.HOMEFEED_DATA = j.homefeed;
      hfRender();
    }
    // v1.9.9 — 기존 글 자동 내부링크 목록도 같은 파일에 실려 온다(매시 갱신 · 긍정사랑 제외)
    if (j && j.internalLinks && (j.internalLinks.items || []).length) {
      BS.INTERNAL_DATA = j.internalLinks;
      renderInternal($("#internalSearch") ? $("#internalSearch").value : "");
      renderDupWarn();   // 목록이 도착하면 중복 경고도 바로 계산 (v2.0.0)
    }
    var upd = $("#rtUpdated");
    if (upd) upd.textContent = (j && (j.generated_label || j.generated_at)) || "갱신 시각 없음";
    rtRenderAge();
    rtRenderTabs();
    rtRenderList();
    rtRenderLinks();
    rtRenderNews();
    rtRenderPeek();
    rtRenderFoot();
    rtStartRotate();
  }

  function rtFail(err) {
    rt.data = null;
    var upd = $("#rtUpdated");
    if (upd) upd.textContent = "불러오지 못했습니다";
    var age = $("#rtAge");
    if (age) age.textContent = "";
    var note = $("#rtNote");
    if (note) {
      note.hidden = false;
      note.textContent = "실시간 키워드를 불러오지 못했습니다 — " +
        ((err && err.message) || "네트워크 오류") + ". 🔄 새로고침을 눌러 다시 시도해 주세요.";
    }
    rtRenderList();
    rtRenderIntents();
  }

  function rtLoad(manual) {
    if (rt.loading) return;
    rt.loading = true;
    var btn = $("#btnRtRefresh");
    if (btn) btn.classList.add("spinning");
    var url = RT_URL + "?t=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (j) {
        rtApply(j);
        if (manual) toast("실시간 키워드를 새로 불러왔습니다" + (j && j.generated_label ? " (" + j.generated_label + ")" : ""));
      })
      .catch(function (err) { rtFail(err); })
      .then(function () {
        rt.loading = false;
        if (btn) btn.classList.remove("spinning");
      });
  }

  /* 롤링 하이라이트 — 3.2초마다 다음 키워드를 짚고, 목록을 따라 스크롤한다 */
  function rtStopRotate() {
    if (rt.timer) clearInterval(rt.timer);
    rt.timer = null;
  }
  function rtStep() {
    if (rt.paused || document.hidden) return;
    var items = $$("#rtList .rt-item");
    if (!items.length) return;
    items.forEach(function (b) { b.classList.remove("active"); });
    rt.active = (rt.active + 1) % items.length;
    var el = items[rt.active];
    el.classList.add("active");
    var box = $("#rtList");
    if (box) {
      var top = el.offsetTop - 6;
      var bottom = top + el.offsetHeight;
      if (top < box.scrollTop) box.scrollTop = top;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    }
  }
  function rtStartRotate() {
    rtStopRotate();
    if (rtReduced() || !rt.data) return;
    rt.timer = setInterval(rtStep, RT_CFG.rotateMs || 3200);
  }

  function rtSetFilter(id) {
    rt.filter = id || "all";
    rtRenderTabs();
    rtRenderList();
    rtStartRotate();
  }
  /* 블로그를 고르면 오른쪽 패널도 그 블로그 맞춤으로 따라간다 */
  function rtFollowBlog(id) {
    if (!id) return;
    rtSetFilter(id);
  }

  function rtSetCollapsed(collapsed) {
    var p = $("#rtPanel");
    if (!p) return;
    if (collapsed) p.classList.add("collapsed");
    else p.classList.remove("collapsed");
    var btn = $("#btnRtFold");
    if (btn) {
      btn.textContent = collapsed ? "펼치기" : "접기";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  }

  /* 키워드 클릭 → 왼쪽 '주제 / 메인 키워드' 칸에 넣고 스크롤·포커스 */
  function rtPick(kw) {
    var t = $("#topic");
    if (!t || !kw) return;
    t.value = kw;
    state.autoTopic = kw;
    state.kwSel = null;
    renderKeywordList();
    var hint = $("#kwHint");
    if (hint) { hint.hidden = true; hint.innerHTML = ""; }
    if (window.innerWidth < 1080) rtSetCollapsed(true);
    var sec = $("#stepTopic");
    if (sec && sec.scrollIntoView) {
      try { sec.scrollIntoView({ behavior: rtReduced() ? "auto" : "smooth", block: "start" }); }
      catch (e) { sec.scrollIntoView(); }
    }
    setTimeout(function () {
      try { t.focus({ preventScroll: true }); } catch (e) { try { t.focus(); } catch (e2) {} }
      try { t.setSelectionRange(t.value.length, t.value.length); } catch (e3) {}
    }, 80);
    toast('"' + kw + '" 키워드를 주제칸에 넣었습니다 — 바로 원고를 만들 수 있어요');
  }

  /* ============================================================
     네이버 홈판 관찰 (v1.9.7 · 2026-11-18)
     - GitHub Actions 가 매일 04:40 KST 에 비로그인으로 모은 data/naver-homefeed.json 을 읽어
       BS.HOMEFEED_DATA 에 넣는다. 모든 원고·검수 프롬프트의 homefeedBlock() 이 이 값을 쓴다.
     - 오른쪽 패널에는 오늘 관찰(건수·판·제목 숫자 비율)을 한 줄로 보여 준다.
       파일이 없거나 못 읽으면 조용히 빠지고 작업실은 그대로 돈다.
     ============================================================ */
  var hf = { data: null, loaded: false };

  function hfUrl() {
    var cfg = BS.HOMEFEED || {};
    return cfg.url || "data/naver-homefeed.json";
  }
  function hfRender() {
    var box = $("#rtHomefeed");
    if (!box) return;
    var d = hf.data;
    if (!d || !d.stats) { box.hidden = true; return; }
    var s = d.stats;
    var panels = Object.keys(s.panels || {}).sort(function (a, b) { return s.panels[b] - s.panels[a]; })
      .slice(0, 3).map(function (k) { return k + " " + s.panels[k]; }).join("·");
    var md = String(d.observedDate || "").slice(5).replace("-", "/");
    var txt = "📊 홈판 관찰 " + (md || "") + " · " + (s.total || 0) + "건" +
      (panels ? " · " + panels : "") +
      " · 제목 숫자 " + Math.round((s.rates && s.rates.digit) || 0) + "%" +
      " · 따옴표 " + Math.round((s.rates && s.rates.quote) || 0) + "%";
    var stale = false;
    var mt = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(d.observedAt || ""));
    if (mt) {
      var t = Date.UTC(+mt[1], +mt[2] - 1, +mt[3], +(mt[4] || 0) - 9, +(mt[5] || 0));
      stale = (Date.now() - t) / 3600000 > ((BS.HOMEFEED || {}).staleHours || 30);
    }
    box.textContent = (stale ? "(어제 관찰) " : "") + txt;
    box.title = (d.promptBlock || "") + "\n\n(매일 04:40 GitHub Actions 가 비로그인으로 모은 홈판 관찰 — 제목 뽑기·검수에 자동 반영)";
    box.classList.toggle("stale", !!stale);
    box.hidden = false;
  }
  function hfFetch(url) {
    return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }
  function hfAge(j) {
    var mt = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String((j && j.observedAt) || ""));
    if (!mt) return Infinity;
    return Date.now() - Date.UTC(+mt[1], +mt[2] - 1, +mt[3], +(mt[4] || 0) - 9, +(mt[5] || 0));
  }
  function hfApply(j, manual) {
    hf.data = j || null;
    hf.loaded = true;
    BS.HOMEFEED_DATA = j || null;
    hfRender();
    if (manual) {
      toast(j && j.stats && j.stats.total
        ? "홈판 관찰을 새로 불러왔습니다 — " + j.stats.total + "건 (" + (j.observedAt || "") + ")"
        : "홈판 관찰 자료가 아직 없습니다 — 내일 04:30 수집 뒤에 들어옵니다");
    }
  }
  function hfLoad(manual) {
    var gasUrl = (BS.HOMEFEED || {}).gasUrl || "";
    hfFetch(hfUrl())
      .then(function (j) {
        // 저장소 파일이 최근 것이면 그대로 쓴다
        if (j && j.stats && hfAge(j) < ((BS.HOMEFEED || {}).staleHours || 30) * 3600000) return hfApply(j, manual);
        return hfFetch(gasUrl || hfUrl())
          .then(function (g) { hfApply((g && g.stats && hfAge(g) < hfAge(j)) ? g : j, manual); })
          .catch(function () { hfApply(j, manual); });
      })
      .catch(function () {
        if (!gasUrl) { hfApply(null, manual); return; }
        // 저장소 파일을 못 읽으면 구글 무료 스크립트 웹앱 값을 쓴다
        hfFetch(gasUrl)
          .then(function (g) { hfApply(g, manual); })
          .catch(function () {
            BS.HOMEFEED_DATA = null;
            hf.loaded = true;
            hfRender();
            if (manual) toast("홈판 관찰 자료를 불러오지 못했습니다 — 제목 규칙은 그대로 돌아갑니다");
          });
      });
  }
  function initHomefeed() {
    hfRender();
    hfLoad(false);
  }

  /* 🔗 기존 글 자동 내부링크 예비 경로 (v1.9.9) — 실시간 파일에 internalLinks 가 없을 때만 */
  function initInternalLinks() {
    if (BS.INTERNAL_DATA) return;
    var url = (BS.INTERNAL_LINKS || {}).url || "data/internal-links.json";
    fetch(url + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (j) {
        if (BS.INTERNAL_DATA) return;   // 실시간 파일(realtime-trends.json)이 더 새롭다
        if (!j || !(j.items || []).length) return;
        BS.INTERNAL_DATA = j;
        renderInternal($("#internalSearch") ? $("#internalSearch").value : "");
        renderDupWarn();
      })
      .catch(function () { /* 목록이 없으면 자동 내부링크 블록만 빠지고 나머지는 그대로 */ });
  }

  function initRealtime() {
    if (!$("#rtPanel")) return;
    rtRenderTabs();
    rtRenderLinks();
    rtSetCollapsed(window.innerWidth < 1080);

    var refresh = $("#btnRtRefresh");
    if (refresh) refresh.addEventListener("click", function () { rtLoad(true); hfLoad(true); });
    var fold = $("#btnRtFold");
    if (fold) {
      fold.addEventListener("click", function () {
        rtSetCollapsed(!$("#rtPanel").classList.contains("collapsed"));
      });
    }
    var list = $("#rtList");
    if (list) {
      ["mouseenter", "focusin"].forEach(function (ev) {
        list.addEventListener(ev, function () { rt.paused = true; });
      });
      ["mouseleave", "focusout"].forEach(function (ev) {
        list.addEventListener(ev, function () { rt.paused = false; });
      });
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) rtRenderAge();
    });
    window.addEventListener && window.addEventListener("resize", function () {
      if (window.innerWidth >= 1080) {
        var p = $("#rtPanel");
        if (p) p.classList.remove("collapsed");
      }
    });
    rtLoad(false);
  }

  /* ============================================================
     🔥 실시간 화제템 집합소 (v2.1.0 · 2026-11-18)
     지연님 결정 — "🔥 클리앙 핫딜 + 핫허브 RSS로 바로 추가 (0원 자동)".

     ● 데이터: data/hot-items.json(배포 시점 스냅샷, 예비)과
       data/realtime-trends.json 의 hotItems(매시 10분 갱신) 둘 중
       generated_at 이 더 새로운 쪽을 읽는다. 둘 다 없으면 안내만 띄운다.
     ● 화면: 지금 뜨는 딜 카드 그리드 + 커뮤니티 화제글 목록
       + 출처(전체·클리앙·핫허브) / 종류(전체·상품 딜·정보) / 카테고리 필터 + 검색
     ● 원클릭: 카드 → 글쓰기 화면(블로그 자동 선택 · 주제·참고자료·제품 모드 채움)
       → 원고 생성 → (고른 경우) ⚡ 멀티유즈 · 🎬 클립 대본까지 자동으로 이어서
     ● 🔄 새로고침: 최신 JSON을 다시 읽고, 설정에 GitHub 토큰이 있으면
       workflow_dispatch 로 그 자리에서 수집을 돌려(약 20~40초) 끝나면 자동 반영.
     ● 19금(adult) 항목은 지연님 블로그 소재가 아니라 목록에서 뺀다.
     ============================================================ */
  var HOT = {
    data: null,          // 수집 payload (deals · hot_posts · stats · sources · notes)
    loaded: false,
    loading: false,
    refreshing: false,   // 🔄 새로고침 → 즉시 수집이 도는 중
    failed: "",          // 실패 사유 (화면 안내문)
    origin: "",          // 'snapshot'(hot-items.json) | 'embedded'(realtime-trends.json) | 'github'(방금 수집)
    stamp: 0,            // generated_at (ms)
    view: "write",       // write | hot
    q: "",               // 검색어
    source: "all",       // all | clien(클리앙) | hothub(핫허브)
    kind: "all",         // all | deal(상품 딜) | info(정보·무료)
    cat: "all",          // 카테고리 id
    chain: "",           // 원고 뒤에 이어서 돌릴 작업 — '' | 'multiuse' | 'video'
    chainItem: null,     // 안내문에 쓸 카드
    genOk: false,        // 이번 생성이 성공했는지 (실패한 원고에 체인을 걸지 않기 위해)
    last: null           // 마지막으로 고른 카드
  };

  function hotCfg() { return BS.HOT_ITEMS || {}; }

  function hotStamp(p) {
    var t = Date.parse(String((p && p.generated_at) || ""));
    return isNaN(t) ? 0 : t;
  }
  function hotComma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function hotAgo(ms) {
    if (!ms) return "";
    var m = Math.round(ms / 60000);
    if (m < 1) return "방금";
    if (m < 60) return m + "분 전";
    var h = Math.round(m / 60);
    if (h < 24) return h + "시간 전";
    return Math.round(h / 24) + "일 전";
  }

  /* 카드에 쓰는 값 다듬기 */
  function hotPrice(d) {
    if (!d || !d.price) return "";
    return d.currency === "USD" ? "$" + hotComma(d.price) : hotComma(d.price) + "원";
  }
  function hotViews(n) {
    if (!n) return "";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    return hotComma(n);
  }
  function hotWhen(s) {
    var m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
    return m ? (m[2] + "-" + m[3] + " " + m[4] + ":" + m[5]) : String(s || "");
  }
  function hotSrcShort(id) { return id === "hothub" ? "핫허브" : "클리앙"; }
  function hotCut(s, n) {
    var t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }

  /* 검색 — 제목·주제·요약·몰·카테고리·걸린 키워드까지 한 번에 본다 */
  function hotHay(d) {
    return [d.title, d.topic, d.preview, d.mall, d.category_label, d.community, d.source_name,
      (d.matched_keywords || []).join(" ")].join(" ").toLowerCase();
  }
  function hotTextHit(d) {
    var q = String(HOT.q || "").trim().toLowerCase();
    if (!q) return true;
    var hay = hotHay(d);
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function hotAllItems() {
    var d = HOT.data || {};
    var out = [];
    (d.deals || []).forEach(function (x) { if (!x.adult) out.push(x); });
    (d.hot_posts || []).forEach(function (x) { if (!x.adult) out.push(x); });
    return out;
  }

  function hotFilterDeals() {
    var d = (HOT.data && HOT.data.deals) || [];
    var max = hotCfg().maxDeals || 60;
    return d.filter(function (x) {
      if (x.adult) return false;
      if (HOT.source === "hothub") return false;      // 화제글만 보는 중
      if (HOT.kind === "deal" && !x.is_product) return false;
      if (HOT.kind === "info" && x.is_product) return false;
      if (HOT.cat !== "all" && x.category !== HOT.cat) return false;
      return hotTextHit(x);
    }).slice(0, max);
  }

  function hotFilterPosts() {
    var d = (HOT.data && HOT.data.hot_posts) || [];
    return d.filter(function (x) {
      if (x.adult) return false;
      if (HOT.source === "clien") return false;       // 딜만 보는 중
      if (HOT.kind === "deal") return false;          // 화제글은 상품이 아니라 '정보' 쪽
      if (HOT.cat !== "all" && x.category !== HOT.cat) return false;
      return hotTextHit(x);
    });
  }

  function hotItemById(id) {
    var all = hotAllItems();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    var raw = ((HOT.data && HOT.data.deals) || []).concat((HOT.data && HOT.data.hot_posts) || []);
    for (var j = 0; j < raw.length; j++) if (raw[j].id === id) return raw[j];
    return null;
  }

  /* ---------------- 필터 칩 ---------------- */
  function hotChip(key, label, on, n, act) {
    return '<button type="button" class="hchip' + (on ? " on" : "") + '" data-' + act + '="' + esc(key) +
      '" aria-pressed="' + (on ? "true" : "false") + '">' + label +
      (n == null ? "" : '<span class="hchip-n">' + n + '</span>') + '</button>';
  }

  function hotRenderChips() {
    var items = hotAllItems();
    var deals = (HOT.data && HOT.data.deals) || [];
    var posts = (HOT.data && HOT.data.hot_posts) || [];
    var liveDeals = deals.filter(function (x) { return !x.adult; });
    var livePosts = posts.filter(function (x) { return !x.adult; });
    var nProduct = liveDeals.filter(function (x) { return x.is_product; }).length;
    var nInfo = liveDeals.length - nProduct;

    var src = "";
    src += hotChip("all", "전체", HOT.source === "all", items.length, "src");
    src += hotChip("clien", "🛍 클리앙 알뜰구매", HOT.source === "clien", liveDeals.length, "src");
    src += hotChip("hothub", "💬 핫허브", HOT.source === "hothub", livePosts.length, "src");
    if ($("#hotSourceChips")) $("#hotSourceChips").innerHTML = src;

    var kind = "";
    kind += hotChip("all", "전체", HOT.kind === "all", liveDeals.length, "kind");
    kind += hotChip("deal", "🛍 상품 딜", HOT.kind === "deal", nProduct, "kind");
    kind += hotChip("info", "📄 정보·무료", HOT.kind === "info", nInfo, "kind");
    if ($("#hotKindChips")) $("#hotKindChips").innerHTML = kind;

    /* 카테고리는 실제 데이터에 있는 것만, 많은 순서로 */
    var byCat = {};
    items.forEach(function (x) {
      var k = x.category || "etc";
      if (!byCat[k]) byCat[k] = { n: 0, label: x.category_label || "기타", emoji: x.category_emoji || "•" };
      byCat[k].n++;
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b].n - byCat[a].n; });
    var chips = hotChip("all", "전체", HOT.cat === "all", items.length, "cat");
    cats.forEach(function (k) {
      chips += hotChip(k, byCat[k].emoji + " " + esc(byCat[k].label), HOT.cat === k, byCat[k].n, "cat");
    });
    if ($("#hotCatChips")) $("#hotCatChips").innerHTML = chips;
  }

  /* ---------------- 카드 ---------------- */
  function hotShopLinks(q) {
    var list = hotCfg().shopSearch || [];
    var name = String(q || "").trim();
    if (!name || !list.length) return "";
    return list.map(function (s) {
      var u = String(s.url || "").replace("{q}", encodeURIComponent(name));
      return '<a class="hc-shop" href="' + esc(u) + '" target="_blank" rel="noopener">' +
        esc(s.emoji || "") + " " + esc(s.label || s.id) + " ↗</a>";
    }).join("");
  }

  function hotActButtons(d) {
    var id = esc(d.id);
    return '<div class="hc-acts">' +
      '<button type="button" class="btn small primary hc-go" data-act="write" data-id="' + id + '">✍️ 이걸로 글쓰기</button>' +
      '<div class="hc-alt">' +
        '<button type="button" class="btn small ghost" data-act="multiuse" data-id="' + id + '" title="원고가 나오면 스레드 훅·첫 댓글 + 클립 20초 연출표까지 이어서 돕니다">⚡ 원고+멀티유즈</button>' +
        '<button type="button" class="btn small ghost" data-act="video" data-id="' + id + '" title="원고가 나오면 클립·릴스 대본까지 이어서 만듭니다">🎬 원고+클립</button>' +
      "</div>" +
      "</div>";
  }

  function hotDealCardHtml(d) {
    var cat = (d.category_emoji || "•") + " " + (d.category_label || "기타");
    var price = hotPrice(d);
    var meta = [];
    if (price) meta.push('<span class="hc-price">' + esc(price) + '</span>');
    if (d.discount_pct) meta.push('<span class="hc-disc">' + d.discount_pct + "%</span>");
    if (d.mall) meta.push('<span class="hc-mall">' + esc(d.mall) + "</span>");
    if (d.comments) meta.push('<span class="hc-cmt">💬 ' + hotViews(d.comments) + "</span>");
    if (d.views) meta.push('<span class="hc-view">👁 ' + hotViews(d.views) + "</span>");
    if (d.posted_at) meta.push('<span class="hc-time">' + esc(hotWhen(d.posted_at)) + "</span>");

    var kws = (d.matched_keywords || []).slice(0, 2).map(function (k) {
      return '<span class="hc-kw">#' + esc(k) + "</span>";
    }).join("");

    return '<article class="hot-card' + (d.is_product ? "" : " info") + '" data-id="' + esc(d.id) + '">' +
      '<div class="hc-top">' +
        '<span class="hc-src">' + esc(hotSrcShort(d.source)) + "</span>" +
        '<span class="hc-cat">' + esc(cat) + "</span>" +
        (d.is_product ? "" : '<span class="hc-info">정보</span>') +
        (d.is_new ? '<span class="hc-new">NEW</span>' : "") +
      '</div>' +
      '<h4 class="hc-title"><a href="' + esc(d.url || "#") + '" target="_blank" rel="noopener">' + esc(d.title || d.topic || "") +
        "</a></h4>" +
      (meta.length ? '<div class="hc-meta">' + meta.join("") + "</div>" : "") +
      (d.preview ? '<p class="hc-preview">' + esc(hotCut(d.preview, 110)) + "</p>" : "") +
      (kws ? '<div class="hc-kws">' + kws + "</div>" : "") +
      hotActButtons(d) +
      '<div class="hc-links">' +
        '<a class="hc-orig" href="' + esc(d.url || "#") + '" target="_blank" rel="noopener">원문 ↗</a>' +
        hotShopLinks(d.topic || d.title) +
      "</div>" +
    "</article>";
  }

  function hotPostRowHtml(p, i) {
    var cat = (p.category_emoji || "•") + " " + (p.category_label || "기타");
    return '<li class="hot-post" data-id="' + esc(p.id) + '">' +
      '<span class="hp-rank">' + (i + 1) + "</span>" +
      '<div class="hp-body">' +
        '<a class="hp-title" href="' + esc(p.url || "#") + '" target="_blank" rel="noopener">' + esc(p.title || p.topic || "") + "</a>" +
        '<div class="hp-meta">' +
          (p.community ? '<span class="hp-com">' + esc(p.community) + "</span>" : "") +
          (p.published ? '<span class="hp-time">' + esc(hotWhen(p.published)) + "</span>" : "") +
          '<span class="hp-cat">' + esc(cat) + "</span>" +
        "</div>" +
        hotActButtons(p) +
      "</div>" +
    "</li>";
  }

  /* ---------------- 그리기 ---------------- */
  function hotEmptyMsg(kind) {
    if (kind === "posts" && HOT.kind === "deal") return "화제글은 상품 딜이 아니라 '정보'로 묶입니다 — 종류를 '정보·무료'로 바꾸면 보입니다.";
    if (kind === "deals" && HOT.source === "hothub") return "클리앙 딜이 아니라 핫허브만 보고 있습니다 — 출처를 '전체'로 바꾸면 딜도 보입니다.";
    if (kind === "posts" && HOT.source === "clien") return "핫허브 인기글은 출처가 '핫허브'입니다 — 출처를 '전체'로 바꾸면 보입니다.";
    if (HOT.q) return '"' + HOT.q + '"에 맞는 화제템이 없습니다 — 검색어를 줄이거나 지워 보세요.';
    return hotCfg().emptyNote || "지금은 조건에 맞는 화제템이 없습니다 — 검색어나 필터를 풀어 보세요.";
  }

  function hotRenderDeals(list) {
    var box = $("#hotGrid");
    var empty = $("#hotDealsEmpty");
    var cap = $("#hotDealCount");
    if (box) box.innerHTML = list.map(hotDealCardHtml).join("");
    if (cap) {
      var total = ((HOT.data && HOT.data.deals) || []).filter(function (x) { return !x.adult; }).length;
      cap.textContent = list.length + (list.length === total ? "건" : " / " + total + "건");
    }
    if (empty) {
      empty.hidden = !!list.length;
      empty.textContent = list.length ? "" : hotEmptyMsg("deals");
    }
  }

  function hotRenderPosts(list) {
    var box = $("#hotPosts");
    var empty = $("#hotPostsEmpty");
    var cap = $("#hotPostCount");
    if (box) box.innerHTML = list.map(hotPostRowHtml).join("");
    if (cap) {
      var total = ((HOT.data && HOT.data.hot_posts) || []).filter(function (x) { return !x.adult; }).length;
      cap.textContent = list.length + (list.length === total ? "건" : " / " + total + "건");
    }
    if (empty) {
      empty.hidden = !!list.length;
      empty.textContent = list.length ? "" : hotEmptyMsg("posts");
    }
  }

  function hotRenderSources() {
    var box = $("#hotSources");
    var notes = $("#hotNotes");
    var cap = $("#hotSrcCount");
    var d = HOT.data || {};
    var srcs = d.sources || [];
    if (box) {
      box.innerHTML = srcs.map(function (s) {
        return '<li class="hs-item' + (s.ok ? "" : " fail") + '">' +
          '<b>' + esc(s.name || s.id || "") + '</b>' +
          '<span class="hs-n">' + (s.ok ? s.count + "건" : "실패") + '</span>' +
          (s.ms ? '<span class="hs-ms">' + s.ms + "ms</span>" : "") +
          (s.stale ? '<span class="hs-stale">지난 수집 유지</span>' : "") +
          (s.error ? '<span class="hs-err">' + esc(hotCut(s.error, 80)) + "</span>" : "") +
          (s.url ? '<a class="hs-link" href="' + esc(s.url) + '" target="_blank" rel="noopener">↗</a>' : "") +
          "</li>";
      }).join("");
    }
    if (notes) {
      notes.innerHTML = (d.notes || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    }
    if (cap) cap.textContent = srcs.length ? srcs.filter(function (s) { return s.ok; }).length + " / " + srcs.length + " 소스 정상" : "";
  }

  function hotPaintHead() {
    var d = HOT.data;
    var meta = $("#hotMeta");
    var stale = $("#hotStale");
    var note = $("#hotNote");
    var badge = $("#vtHotCount");
    var hint = $("#vtHint");
    var cfg = hotCfg();
    var all = hotAllItems();

    if (meta) {
      if (!d) {
        meta.textContent = HOT.loading ? "불러오는 중…" : (HOT.failed || "아직 자료가 없습니다");
        meta.className = "hb-meta bad";
      } else {
        var where = HOT.origin === "github" ? "방금 수집" : (HOT.origin === "embedded" ? "매시 갱신본" : "배포 스냅샷");
        meta.textContent = (d.generated_label || hotWhen(d.generated_at)) + " · 딜 " +
          ((d.stats && d.stats.deals) || 0) + " · 화제글 " + ((d.stats && d.stats.hot_posts) || 0) + " · " + where;
        meta.className = "hb-meta";
      }
    }

    if (stale) {
      var age = HOT.stamp ? (Date.now() - HOT.stamp) : 0;
      var limit = (cfg.staleMinutes || 180) * 60000;
      if (d && age > limit) {
        stale.hidden = false;
        stale.textContent = "⏰ 마지막 수집이 " + hotAgo(age) + "입니다(" + (d.generated_label || "") +
          ") — 🔄 새로고침을 눌러 주세요.";
      } else {
        stale.hidden = true;
        stale.textContent = "";
      }
    }

    if (note) {
      note.textContent = [cfg.screenNote || "", cfg.priceNote || "", cfg.ratioNote || ""].filter(Boolean).join(" ");
    }
    if (badge) {
      badge.hidden = !all.length;
      badge.textContent = all.length ? String(all.length) : "";
    }
    if (hint && d) {
      hint.textContent = "딜 " + ((d.stats && d.stats.deals) || 0) + " · 화제글 " +
        ((d.stats && d.stats.hot_posts) || 0) + " · " + (d.generated_label || "");
    }
  }

  function hotRender() {
    hotRenderChips();
    var deals = hotFilterDeals();
    var posts = hotFilterPosts();
    hotRenderDeals(deals);
    hotRenderPosts(posts);
    hotRenderSources();
    hotPaintHead();
    var clear = $("#btnHotClear");
    if (clear) clear.hidden = !String(HOT.q || "").length;
    return { deals: deals.length, posts: posts.length };
  }

  /* ---------------- 데이터 불러오기 ---------------- */
  function hotFetchJson(url) {
    return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  function hotApplyPayload(payload, origin) {
    HOT.data = payload;
    HOT.origin = origin || "";
    HOT.stamp = hotStamp(payload);
    HOT.loaded = !!payload;
    HOT.loading = false;
    if (payload) HOT.failed = "";
    return hotRender();
  }

  function hotLoad(manual) {
    if (HOT.loading) return;
    HOT.loading = true;
    HOT.failed = "";
    hotPaintHead();
    var cfg = hotCfg();
    var jobs = [
      { key: "snapshot", url: cfg.url || "data/hot-items.json" },
      { key: "embedded", url: cfg.embeddedUrl || "data/realtime-trends.json" }
    ].map(function (u) {
      return hotFetchJson(u.url).then(function (j) {
        var p = u.key === "embedded" ? (j && j.hotItems) : j;
        var ok = !!p && (!!(p.deals && p.deals.length) || !!(p.hot_posts && p.hot_posts.length));
        return { key: u.key, payload: ok ? p : null, err: ok ? "" : "hotItems 없음" };
      }).catch(function (e) {
        return { key: u.key, payload: null, err: String((e && e.message) || e) };
      });
    });
    return Promise.all(jobs).then(function (res) {
      var ok = res.filter(function (r) { return !!r.payload; });
      ok.sort(function (a, b) { return hotStamp(b.payload) - hotStamp(a.payload); });
      if (!ok.length) {
        HOT.loading = false;
        HOT.failed = "자료를 불러오지 못했습니다 — " + res.map(function (r) { return r.key + " " + r.err; }).join(" / ");
        hotRender();
        if (manual) toast("화제템 자료를 불러오지 못했습니다 — 잠시 뒤 🔄 새로고침을 눌러 주세요", 3600);
        return false;
      }
      /* 방금 GitHub에서 받아 온 자료가 더 새로우면 그대로 둔다 */
      if (HOT.origin === "github" && hotStamp(ok[0].payload) <= HOT.stamp) {
        HOT.loading = false;
        return true;
      }
      hotApplyPayload(ok[0].payload, ok[0].key);
      if (manual && !HOT.refreshing) {
        toast("최신 화제템을 다시 읽었습니다 — 딜 " + ((HOT.data.stats && HOT.data.stats.deals) || 0) +
          " · 화제글 " + ((HOT.data.stats && HOT.data.stats.hot_posts) || 0), 3200);
      }
      return true;
    });
  }

  /* ---------------- 화면 전환 ---------------- */
  function hotSwitchView(view, opts) {
    var v = view === "hot" ? "hot" : (view === "finish" ? "finish" : "write");
    HOT.view = v;
    show($("#studioLayout"), v === "write");
    show($("#hotView"), v === "hot");
    show($("#finishView"), v === "finish");
    $$("#viewTabs .view-tab").forEach(function (b) {
      var on = b.getAttribute("data-view") === v;
      if (on) b.classList.add("on"); else b.classList.remove("on");
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var vtHint = $("#vtHint");
    if (vtHint) vtHint.hidden = v !== "hot";   // 화제템 설명은 화제템 탭에서만
    /* v2.3.1 — 숨어 있을 때 만든 글상자는 보이는 순간 내용 높이로 다시 맞춘다 */
    if (v === "write") {
      autoGrowIn($("#threadList"));
      autoGrowIn($("#threadExtra"));
    }
    if (v === "hot") {
      if (!HOT.loaded && !HOT.loading) hotLoad(false);
      else hotRender();
    }
    /* 📎 v2.3.0 — 내 글 탭에 처음 들어올 때 그리고, 기존 글 목록이 늦게 도착했으면 다시 그린다 */
    if (v === "finish") {
      if (!FIN.booted) initFinish();
      else {
        finPaintBlogs();
        finPaintCounts();
        finRenderLinks();
        finPaintPicked();
        finPaintUpload();
        /* v2.3.1 — 숨어 있을 때 만든 타래·첫 댓글 글상자를 이제 보이는 상태에서 다시 키운다 */
        autoGrowIn($("#finishThreadList"));
      }
    }
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", v === "hot" ? "#hot" : (v === "finish" ? "#finish" : (window.location.pathname + window.location.search)));
      }
    } catch (e) { /* file:// 등에서는 주소를 못 바꾼다 — 화면은 그대로 */ }
    if (!opts || !opts.silent) { try { window.scrollTo(0, 0); } catch (e2) {} }
    return v;
  }

  /* ---------------- 🔄 지금 새로 수집 (workflow_dispatch) ---------------- */
  function ghCfg() { return BS.GH_DISPATCH || {}; }
  function ghRepoPath() {
    var g = ghCfg();
    return "/repos/" + (g.owner || "mama2624") + "/" + (g.repo || "blog-studio");
  }
  function hotDispatchUrl() {
    var g = ghCfg();
    return "https://api.github.com" + ghRepoPath() + "/actions/workflows/" + (g.workflow || "realtime-trends.yml") + "/dispatches";
  }
  function hotRunsUrl() {
    var g = ghCfg();
    return "https://api.github.com" + ghRepoPath() + "/actions/workflows/" + (g.workflow || "realtime-trends.yml") +
      "/runs?per_page=3&branch=" + encodeURIComponent(g.ref || "main");
  }
  function hotContentsUrl() {
    var g = ghCfg();
    return "https://api.github.com" + ghRepoPath() + "/contents/data/realtime-trends.json?ref=" + encodeURIComponent(g.ref || "main");
  }
  function ghHeaders(token, accept) {
    return {
      "Authorization": "Bearer " + token,
      "Accept": accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function hotSetStatus(html, cls) {
    var el = $("#hotStatus");
    if (!el) return;
    if (!html) { el.hidden = true; el.innerHTML = ""; el.className = "hot-status"; return; }
    el.hidden = false;
    el.className = "hot-status" + (cls ? " " + cls : "");
    el.innerHTML = html;
  }

  function hotRefresh() {
    if (HOT.refreshing) return;
    var token = getGhToken();
    /* 1) 언제나 최신 JSON을 먼저 캐시 무시로 읽는다 */
    hotLoad(true);
    if (!token) {
      hotSetStatus(esc((ghCfg().noTokenNote || "즉시 수집을 쓰려면 ⚙️ 설정에서 GitHub 토큰을 한 번만 등록해 주세요.")) +
        ' <button type="button" class="btn small ghost" data-act="open-settings">⚙️ 설정 열기</button>', "warn");
      return;
    }
    HOT.refreshing = true;
    var btn = $("#btnHotRefresh");
    if (btn) btn.disabled = true;
    var t0 = Date.now();
    hotSetStatus('<span class="spin"></span>' + esc(ghCfg().runningNote || "지금 새로 수집 중… (약 20~40초) — 5초마다 확인합니다"), "run");

    fetch(hotDispatchUrl(), {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({ ref: ghCfg().ref || "main" })
    }).then(function (res) {
      if (res.status === 204 || res.status === 201 || res.ok) return true;
      if (res.status === 401) throw new Error("토큰이 만료됐거나 잘못됐습니다(401) — ⚙️ 설정에서 다시 넣어 주세요");
      if (res.status === 403) throw new Error("토큰에 Actions 쓰기 권한이 없습니다(403) — actions:write 를 켜 주세요");
      if (res.status === 404) throw new Error("저장소·워크플로를 찾지 못했습니다(404) — 토큰 권한과 저장소를 확인해 주세요");
      throw new Error("수집 요청이 거부됐습니다 (HTTP " + res.status + ")");
    }).then(function () {
      return hotPollRun(token, t0, 0);
    }).catch(function (err) {
      hotSetStatus("⚠️ " + esc(err && err.message ? err.message : err) +
        ' <button type="button" class="btn small ghost" data-act="open-settings">⚙️ 설정 열기</button>', "err");
    }).then(function () {
      HOT.refreshing = false;
      if (btn) btn.disabled = false;
    });
  }

  function hotPollRun(token, t0, n) {
    var wait = n === 0 ? 4000 : ((ghCfg().runsWaitMs) || 5000);
    var max = (ghCfg().maxPolls) || 24;
    return new Promise(function (resolve) { setTimeout(resolve, wait); })
      .then(function () {
        return fetch(hotRunsUrl(), { headers: ghHeaders(token), cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("진행 상태를 읽지 못했습니다 (HTTP " + res.status + ")");
        return res.json();
      })
      .then(function (j) {
        var runs = (j && j.workflow_runs) || [];
        var run = null;
        for (var i = 0; i < runs.length; i++) {
          var rt = hotStamp({ generated_at: runs[i].created_at });
          if (runs[i].status === "completed" && rt >= t0 - 120000) { run = runs[i]; break; }
        }
        if (run) return hotAfterRun(token, run);
        if (n + 1 >= max) {
          hotSetStatus("⏱ 1~2분 안에 수집이 끝나지 않았습니다 — 잠시 뒤 🔄 새로고침을 다시 눌러 주세요." +
            ' <button type="button" class="btn small ghost" data-act="open-settings">⚙️ 설정</button>', "warn");
          return false;
        }
        var sec = Math.round((Date.now() - t0) / 1000);
        hotSetStatus('<span class="spin"></span>지금 새로 수집 중… ' + sec + "초 (" +
          ((runs[0] && runs[0].status) || "대기") + ") — 5초마다 확인합니다", "run");
        return hotPollRun(token, t0, n + 1);
      });
  }

  function hotAfterRun(token, run) {
    if (run && run.conclusion && run.conclusion !== "success") {
      hotSetStatus("⚠️ 수집이 '" + esc(run.conclusion) + "'로 끝났습니다 — 잠시 뒤 다시 눌러 주세요. (지금은 마지막 수집본을 보여 줍니다)", "err");
      return false;
    }
    /* 워크플로가 커밋한 JSON을 GitHub API에서 바로 받아 온다(Pages 재배포를 기다리지 않는다) */
    return new Promise(function (resolve) { setTimeout(resolve, 2500); })
      .then(function () {
        return fetch(hotContentsUrl() + "&t=" + Date.now(),
          { headers: ghHeaders(token, "application/vnd.github.raw"), cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (j) {
        var p = j && j.hotItems;
        if (!p || !(p.deals || p.hot_posts)) throw new Error("hotItems 없음");
        hotApplyPayload(p, "github");
        hotSetStatus("✅ 새로 수집 완료 — 딜 " + ((p.stats && p.stats.deals) || 0) + " · 화제글 " +
          ((p.stats && p.stats.hot_posts) || 0) + " · " + (p.generated_label || ""), "ok");
        toast("✅ 방금 새로 수집했습니다 — 딜 " + ((p.stats && p.stats.deals) || 0) + " · 화제글 " +
          ((p.stats && p.stats.hot_posts) || 0), 3600);
        return true;
      })
      .catch(function () {
        hotSetStatus('<span class="spin"></span>수집은 끝났습니다 — 배포 파일을 다시 읽는 중…', "run");
        return hotLoad(true).then(function () {
          hotSetStatus("✅ 새로 수집 완료 — 딜 " + ((HOT.data && HOT.data.stats && HOT.data.stats.deals) || 0) +
            " · 화제글 " + ((HOT.data && HOT.data.stats && HOT.data.stats.hot_posts) || 0) +
            " (GitHub 커밋 반영까지 1분쯤 걸릴 수 있습니다)", "ok");
          return true;
        });
      });
  }

  /* ---------------- 원클릭 글쓰기 연결 ---------------- */
  function hotPickBlog(id) {
    var b = null;
    if (BS.blogById) b = BS.blogById(id);
    if (!b || b.kind === "blogger") b = BS.blogById ? BS.blogById("mama2624") : BS.BLOGS[0];
    if (!b) return null;
    if (state.blog.id !== b.id) {
      state.blog = b;
      state.internal = [];
      state.internalOff = [];
      state.kwSel = null;
      renderBlogs();
      syncPersona();   // 🎭 화제템 카드가 고른 블로그 기준 페르소나 (v2.2.0)
      renderChips();
      renderInternal();
      setBlogHint(b);
      renderDupWarn();
    }
    rtFollowBlog(b.id);
    return b;
  }

  function hotRefBody(d) {
    var lines = [];
    var isPost = !(d.kind === "deal" || d.kind === "info" || d.source === "clien_jirum");
    lines.push("[" + (d.source_name || hotSrcShort(d.source)) + (d.community ? " · " + d.community : "") + "] " + (d.title || ""));
    if (d.mall) lines.push("- 판매처: " + d.mall);
    var price = hotPrice(d);
    if (price) lines.push("- 가격(제목 기준, 원문 확인 필요): " + price + (d.discount_pct ? " (" + d.discount_pct + "% 할인 표기)" : ""));
    if (d.comments || d.views) {
      lines.push("- 반응: 댓글 " + (d.comments || 0) + " · 조회 " + hotViews(d.views || 0) + (d.votes ? " · 추천 " + d.votes : ""));
    }
    if (d.posted_at) lines.push("- 게시: " + d.posted_at);
    if (d.published) lines.push("- 올라온 시각: " + d.published);
    if (d.url) lines.push("- 원문 주소: " + d.url);
    if (d.preview) lines.push("- 원문 요약: " + d.preview);
    if (isPost) lines.push("- 제목만 보고 씁니다. 확인되지 않은 내용·수치는 쓰지 말고, 원문은 링크에서 확인하세요.");
    else lines.push("- 가격·재고·할인은 우리가 확인한 값이 아닙니다. 원문에서 확인해야 하는 값으로 표시하고, 확인 안 된 수치는 쓰지 마세요.");
    return lines.join("\n");
  }

  function hotProductMemo(d) {
    var parts = [];
    if (d.topic) parts.push(d.topic);
    if (d.mall) parts.push("판매처 " + d.mall);
    var price = hotPrice(d);
    if (price) parts.push("표기 가격 " + price + "(원문 확인 필요)");
    if (d.comments || d.views) parts.push("클리앙 반응 댓글 " + (d.comments || 0) + " · 조회 " + (d.views || 0));
    if (d.preview) parts.push("원문 요약: " + hotCut(d.preview, 160));
    return parts.join("\n");
  }

  function paintChainNote() {
    var box = $("#chainNote");
    if (!box) return;
    if (!HOT.chain) { box.hidden = true; box.innerHTML = ""; return; }
    var label = HOT.chain === "multiuse"
      ? "원고가 나오면 ⚡ 멀티유즈(스레드 훅·첫 댓글 + 클립 20초 연출표)가 이어서 돕니다"
      : "원고가 나오면 🎬 클립·릴스 대본이 이어서 만들어집니다";
    var nm = HOT.chainItem ? (HOT.chainItem.topic || HOT.chainItem.title || "") : "";
    box.hidden = false;
    box.innerHTML = '<span class="cn-emoji">🔥</span><span class="cn-text"><b>' + esc(hotCut(nm, 60)) +
      "</b> 카드에서 왔습니다 — " + label + '</span>' +
      '<button type="button" class="btn small ghost cn-x" data-act="chain-cancel">체인 끄기</button>';
  }

  function hotUseItem(item, chain) {
    if (!item) return false;
    var cfg = hotCfg();
    var isProduct = !!item.is_product;
    var bid = item.blog || (cfg.blogByCategory || {})[item.category] || cfg.blogFallback || "mama2624";
    hotPickBlog(bid);

    hotSwitchView("write", { silent: true });
    setDocMode(isProduct ? "product" : "blog");

    var topic = item.topic || item.title || "";
    var t = $("#topic");
    if (t) t.value = topic;
    state.autoTopic = "";
    state.kwSel = null;
    renderKeywordList(false);
    renderTopicHint(null);

    if ($("#refUrl")) $("#refUrl").value = item.url || "";
    if ($("#refBody")) $("#refBody").value = hotRefBody(item);
    paintRefHint();

    if (isProduct) {
      state.productPlatform = "coupang";
      if ($("#productPlatform")) $("#productPlatform").value = "coupang";
      paintProductNote();
      if ($("#productUrl")) $("#productUrl").value = "";
      if ($("#productMemo")) $("#productMemo").value = hotProductMemo(item);
      if ($("#optReview")) $("#optReview").checked = true;
    }

    var notes = $("#notes");
    if (notes && !String(notes.value || "").trim()) {
      notes.value = isProduct
        ? "실제 사는 사람 입장에서 장단점을 정직하게. 가격·재고·할인은 원문에서 확인해야 하는 값으로 표시하고 확인 안 된 수치는 쓰지 말 것."
        : "화제글 제목과 원문만 보고 씁니다. 확인되지 않은 내용·수치는 쓰지 말고, 독자가 바로 할 수 있는 행동으로 정리.";
    }

    HOT.chain = (chain === "multiuse" || chain === "video") ? chain : "";
    HOT.chainItem = item;
    HOT.last = item;
    paintChainNote();

    var sec = $("#stepTopic");
    if (sec && sec.scrollIntoView) {
      try { sec.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { try { sec.scrollIntoView(); } catch (e2) {} }
    }
    setTimeout(function () { try { if (t) t.focus({ preventScroll: true }); } catch (e) {} }, 90);

    var bl = BS.blogById ? BS.blogById(state.blog.id) : state.blog;
    toast("\"" + hotCut(topic, 26) + "\" → " + (bl ? bl.name : "블로그") + " 원고 준비" +
      (isProduct ? " · 제품 리뷰 모드" : "") + (HOT.chain ? " · 원고 뒤 " + (HOT.chain === "multiuse" ? "멀티유즈" : "클립 대본") + "까지" : ""), 3600);
    return true;
  }


  /* ============================================================
     📎 내 글 내부링크·후작업 (v2.3.0 · 2026-11-19 지연님 지시)

     지연님 —
       "[#30000] 내가 작성한 글 넣고 내부링크 걸어즐 탭이 없네?"
       "[#30026] 스레드 릴스 클립 재성해 달라고 체크하는 칸도 없도"
       "[#30039] 또 스레드나 릴스에 올리기 칸도 같이 만들어 줘야지"

     ● 흐름: 내 글 붙여넣기 → 내부링크 추천·삽입(키 없이) → 체크한 작업만
       차례로(스레드·릴스/클립·이미지 프롬프트·멀티유즈) → 올리기 요청 복사.
     ● 원문은 고치지 않는다 — 연결 문장 한 줄만 문단 끝에 덧붙인다.
     ● 이 화면은 글쓰기 탭의 state.result/state.blog 를 건드리지 않는다
       (글쓰다 만 원고가 있는데 붙여넣은 글로 덮어쓰지 않게).
     ============================================================ */
  var FINCFG = BS.FINISH || {};
  var FIN = {
    blogId: "",
    includeOther: null,  // [내 다른 블로그 포함] 상태 — null이면 설정 기본값(v2.3.1 켜짐)
    recos: [],          // 지금 보여 주는 후보 (추천 또는 검색 결과)
    picked: {},         // url → {title,url,date,blog,score}
    added: [],          // 직접 추가한 글
    q: "",              // 기존 글 검색어
    last: null,         // 내부링크 삽입 결과 {md, title, links, mode, placed}
    threads: null,
    video: null,
    multi: null,
    images: null,
    run: false,
    uploadAccounts: [],
    uploadChannels: [],   // v2.3.2 — 올릴 채널(threads·insta·clip) 중 켜 둔 것
    uploadWhen: "",
    uploadWhenCustom: "",
    draftTimer: null,
    matchTimer: null,
    booted: false
  };

  function finNote(key) { return (FINCFG.notes || {})[key] || ""; }
  function finBlogList() { return (BS.BLOGS || []).filter(function (b) { return b && b.id; }); }
  function finBlog() { return BS.blogById(FIN.blogId) || finBlogList()[0] || { id: "mama2624", name: "생활픽스" }; }
  function finHomeBlog(blog) {
    /* 블로그 홈에서 원 글 제목·링크를 만들 때 쓰는 기본 주소 */
    return (blog && blog.url) || "https://blog.naver.com/mama2624";
  }
  function finTitleValue() { return $("#finishTitle") ? String($("#finishTitle").value || "").trim() : ""; }
  function finBodyValue() { return $("#finishBody") ? String($("#finishBody").value || "") : ""; }
  function finTopicFrom(title, md) {
    var t = String(title || "").trim();
    if (t) return t;
    var first = String(md || "").split(/\r?\n/).filter(function (l) { return l.trim() && !/^#/.test(l.trim()); })[0] || "";
    return first.trim().slice(0, 60);
  }

  /* ---------------- 내부링크 후보 목록 ---------------- */
  function finLoadAdded() {
    try {
      var j = JSON.parse(localStorage.getItem(FINCFG.storageAdded || "bs.finish.added") || "[]");
      FIN.added = Array.isArray(j) ? j.filter(function (x) { return x && x.url; }) : [];
    } catch (e) { FIN.added = []; }
  }
  function finSaveAdded() {
    try { localStorage.setItem(FINCFG.storageAdded || "bs.finish.added", JSON.stringify(FIN.added)); } catch (e) {}
  }

  function finItems(blogId, includeOther) {
    var out = [];
    if (blogId === "jinjin2624") {
      (BS.INTERNAL_POSTS || []).forEach(function (p) {
        if (p && p[0] && p[1]) out.push({ blog: "jinjin2624", title: p[0], url: p[1], date: "", tags: [], keywords: [], summary: "" });
      });
    } else {
      var C = BS.INTERNAL_LINKS || {};
      var D = BS.INTERNAL_DATA || null;
      ((D && D.items) || []).forEach(function (it) {
        if (!it || !it.url || !it.title) return;
        if (it.blog === blogId) { out.push(it); return; }
        /* v2.3.1 — 내 다른 블로그 글도 함께. 긍정사랑(exclude)은 제외 */
        if (!includeOther) return;
        if ((C.exclude || []).indexOf(it.blog) >= 0) return;
        if ((C.targets || []).indexOf(it.blog) < 0) return;
        out.push(it);
      });
    }
    (FIN.added || []).forEach(function (a) {
      if (!blogId || a.blog === blogId) out.push(a);
    });
    return out;
  }

  /* [내 다른 블로그 포함] 값 — 화면 칸 → FIN 상태 → 설정 기본값(v2.3.1 켜짐) */
  function finOtherOn() {
    var box = $("#finishOtherBlogs");
    if (box && typeof box.checked === "boolean") return !!box.checked;
    if (typeof FIN.includeOther === "boolean") return FIN.includeOther;
    return !!((FINCFG.otherBlogs || {}).enabled);
  }
  function finHasList(blogId) {
    return finItems(blogId).length > 0;
  }

  /* ---------------- 관련도 계산 (순수 함수 — 단위 테스트용) ----------------
     방향을 뒤집었다 — 내 글 낱말로 기존 글을 훑는 대신, 기존 글의 제목·태그·키워드가
     내 제목/본문에 실제로 들어 있는지 본다. 조사가 붙어도('단열이') 부분 문자열로 걸린다. */
  /* 조사·어미를 떼어 낱말 단위로 맞춘다.
     부분 문자열(indexOf)로 맞추면 '절반입니다' 안의 '반입' 같은 것이 걸려 엉뚱한 글이 올라온다. */
  var FIN_PARTICLES = ["입니다", "합니다", "했습니다", "했다", "한다", "하는", "되는", "되어", "에서", "에게",
    "으로는", "으로", "부터", "까지", "보다", "처럼", "마다", "라고", "이라", "이고", "이면", "이다", "인데",
    "지만", "는데", "면서", "한테", "에는", "에도", "에만", "에서는", "들이", "들을", "은", "는", "이", "가",
    "을", "를", "의", "에", "도", "만", "과", "와", "로", "랑", "나", "께"];

  /* 낱말처럼 생겼지만 어디에나 붙는 말 — 이것만 겹쳐서 추천이 올라오지 않게 */
  var FIN_NOSTOP = {
    "가야": 1, "하면": 1, "하는": 1, "자꾸": 1, "그냥": 1, "위한": 1, "대한": 1, "관한": 1,
    "따라": 1, "통해": 1, "정도": 1, "경우": 1, "때문": 1, "생각": 1, "사람": 1, "이야기": 1,
    "모두": 1, "다시": 1, "먼저": 1, "아주": 1, "너무": 1, "정말": 1, "진짜": 1, "완전": 1,
    "많이": 1, "조금": 1, "가장": 1, "특히": 1, "사실": 1, "바로": 1, "이제": 1, "여기": 1,
    "거기": 1, "이것": 1, "그것": 1, "저것": 1, "넘기면": 1, "보면": 1, "있으면": 1, "없으면": 1
  };
  function finKeys(item) {
    return ilTokens([item.title || "", (item.tags || []).join(" "), (item.keywords || []).join(" ")].join(" "))
      .filter(function (t) { return !FIN_NOSTOP[t]; });
  }

  function finNormWord(w) {
    var t = String(w || "");
    for (var i = 0; i < FIN_PARTICLES.length; i++) {
      var p = FIN_PARTICLES[i];
      if (t.length > p.length + 1 && t.slice(-p.length) === p) return t.slice(0, -p.length);
    }
    return t;
  }

  function finWordSet(text) {
    var set = {};
    String(text || "").toLowerCase().split(/[^0-9a-z가-힣]+/).forEach(function (w) {
      if (w.length < 2) return;
      set[w] = 1;
      var n = finNormWord(w);
      if (n.length >= 2) set[n] = 1;
    });
    return set;
  }

  function finScoreItem(item, titleSet, bodySet, df, N) {
    var keys = finKeys(item);
    var titleToks = finWordSet(item.title || "");
    var raw = 0, hits = 0, spec = 0, titleStrong = 0, matched = [];
    keys.forEach(function (t) {
      var inTitle = !!titleSet[t];
      var inBody = !inTitle && !!bodySet[t];
      if (!inTitle && !inBody) return;
      var d = (df && df[t]) || 1;
      var idf = Math.log(((N || 1) + 1) / (d + 0.5)) + 0.15;   // 어디에나 나오는 낱말(겨울·비교)은 낮게
      var w = Math.min(t.length, 6) * Math.max(0.25, idf);
      raw += w * (inTitle ? 2.6 : 1);
      hits += 1;
      matched.push(t);
      var strong = (t.length >= 3 && d <= Math.max(2, (N || 1) * 0.25)) || (t.length >= 2 && d <= 2);
      if (strong) spec += 1;
      if (strong && titleToks[t]) titleStrong += 1;
    });
    var norm = Math.sqrt(Math.max(4, Math.min(keys.length, 14)));
    return { score: Math.round((raw / norm) * 10) / 10, hits: hits, spec: spec, titleStrong: titleStrong, matched: matched };
  }

  function finMatchList(title, body, blogId, items) {
    var titleSet = finWordSet(title);
    var bodySet = finWordSet(body);
    var bodyLower = String(body || "").toLowerCase();
    var list = items || finItems(blogId);
    if (!list.length || String(body || "").trim().length < (FINCFG.minBody || 40)) return [];
    var df = {}, N = list.length, seen = null;
    list.forEach(function (it) {
      if (!it || !it.url || !it.title) return;
      seen = {};
      ilTokens([it.title, (it.tags || []).join(" "), (it.keywords || []).join(" ")].join(" ")).forEach(function (t) {
        if (seen[t]) return;
        seen[t] = 1;
        df[t] = (df[t] || 0) + 1;
      });
    });
    var scored = [];
    list.forEach(function (item) {
      if (!item || !item.url || !item.title) return;
      if (bodyLower.indexOf(String(item.url).toLowerCase()) >= 0) return;   // 이미 본문에 있는 링크
      var m = finScoreItem(item, titleSet, bodySet, df, N);
      if (m.hits < 2 || m.spec < 1) return;
      if (!(m.titleStrong >= 1 || m.spec >= 2)) return;
      if (m.score < 8) return;
      scored.push({ title: item.title, url: item.url, date: item.date || "", blog: item.blog || blogId,
        score: m.score, hits: m.hits, spec: m.spec, matched: m.matched });
    });
    if (!scored.length) return [];
    /* v2.3.1 — 고른 블로그 글은 sameBoost 배 먼저, 다른 블로그 글은 maxOther 까지 상위에 섞는다.
       (같은 블로그 자리가 다 차 있어도 다른 블로그 글이 더 잘 맞으면 보여 준다) */
    var O = FINCFG.otherBlogs || {};
    var boost = O.sameBoost || 1.12;
    scored.forEach(function (x) { x.rank = (x.score || 0) * (x.blog === blogId ? boost : 1); });
    scored.sort(function (a, b) {
      return (b.rank - a.rank) || (b.score - a.score) || (b.date > a.date ? 1 : -1);
    });
    var best = 0;
    scored.forEach(function (x) { if (x.score > best) best = x.score; });
    var min = Math.max(8, best * 0.45);
    var maxOther = O.maxOther || 3, otherN = 0, out = [], cap = FINCFG.maxRecos || 8;
    for (var i = 0; i < scored.length && out.length < cap; i++) {
      var x = scored[i];
      if (x.score < min) continue;
      if (x.blog !== blogId) {
        if (otherN >= maxOther) continue;
        otherN += 1;
      }
      out.push(x);
    }
    return out;
  }

  /* ---------------- 내부링크 삽입 (순수 함수) ---------------- */
  function finBlockKind(first) {
    var t = String(first || "").trim();
    if (/^#{1,6}\s/.test(t)) return "h";
    if (/^[-*•]\s/.test(t) || /^\d+[).]\s/.test(t)) return "li";
    if (/^>/.test(t)) return "quote";
    if (/^\|/.test(t)) return "table";
    if (/^(```|\*\*\*|---|!\[)/.test(t)) return "skip";
    return "p";
  }

  function finBlockScore(text, link) {
    var set = finWordSet(text);
    var keys = finKeys(link);
    var s = 0, kw = "", kwLen = 0;
    keys.forEach(function (k) {
      if (!set[k]) return;
      s += Math.min(k.length, 6);
      if (k.length > kwLen) { kwLen = k.length; kw = k; }
    });
    return { score: s, kw: kw };
  }

  /* 붙여넣은 글에 이미 '함께 보면 좋은 글' 칸이 있으면(젬이 넣어 둔 경우)
     지우지 않고 링크를 걷어 와서 아래 목록에 합친다 — 지연님이 이미 고른 링크를 잃지 않게. */
  function finTakeGoodSection(md) {
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var out = [], skipped = [], skipping = false;
    lines.forEach(function (l) {
      var t = l.trim();
      if (!skipping && /^#{1,3}\s*함께\s*보면\s*좋은\s*글\s*$/.test(t)) { skipping = true; return; }
      if (skipping) {
        if (/^#{1,2}\s+/.test(t)) { skipping = false; out.push(l); }
        else skipped.push(l);
        return;
      }
      out.push(l);
    });
    var existing = [];
    skipped.forEach(function (l) {
      var m = String(l).trim().match(/^[-*•]\s*\[(.+)\]\((https?:\/\/[^)\s]+)\)/);
      if (m) existing.push({ title: m[1].trim(), url: m[2].trim() });
    });
    var text = out.join("\n").replace(/\s+$/, "");
    return { md: text, existing: existing };
  }

  function finInsertMd(md, links, mode) {
    var taken = finTakeGoodSection(md);
    var src = taken.md;
    var lines = src.split("\n");
    var blocks = [], cur = null, curHead = "";
    function closeBlock(endIdx) {
      if (!cur) return;
      cur.end = endIdx;
      blocks.push(cur);
      cur = null;
    }
    lines.forEach(function (l, i) {
      if (!l.trim()) { closeBlock(i - 1); return; }
      /* 소제목 줄은 따로 떼어 둔다 — '## 소제목' 바로 다음 줄에 본문이 붙어 있어도
         그 본문 문단에 연결 문장을 넣을 수 있게 (마크다운은 빈 줄 없이도 이어진다) */
      if (/^\s{0,3}#{1,6}\s+/.test(l)) {
        closeBlock(i - 1);
        curHead = l.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\*\*/g, "").trim();
        blocks.push({ start: i, end: i, lines: [l], head: curHead });
        return;
      }
      if (!cur) cur = { start: i, end: i, lines: [], head: curHead };
      cur.lines.push(l);
      cur.end = i;
    });
    closeBlock(lines.length - 1);
    blocks.forEach(function (b) { b.text = b.lines.join(" ").trim(); b.kind = finBlockKind(b.lines[0]); });

    var used = {}, inserts = {}, placed = [], inlineUsed = {};
    var cap = mode === "bottom" ? 0 : (FINCFG.maxInsertInline || 3);
    (links || []).forEach(function (link, li) {
      if (!link || !link.url) return;
      if (placed.length >= cap) return;
      var best = -1, bestScore = 0, bestKw = "";
      blocks.forEach(function (b, bi) {
        if (b.kind !== "p" || used[bi] || b.text.length < 40) return;
        var m = finBlockScore(b.text, link);
        /* 그 문단이 속한 소제목이 링크와 맞으면 그 문단을 우선한다
           ('## 절임배추 보관' 아래 문단 > 서두에서 스친 문단) */
        if (b.head) {
          var hm = finBlockScore(b.head, link);
          if (hm.score) m = { score: m.score + hm.score * 0.8, kw: m.kw || hm.kw };
        }
        if (m.score > bestScore) { bestScore = m.score; best = bi; bestKw = m.kw; }
      });
      if (best < 0 || bestScore < 6) return;
      used[best] = 1;
      var tpl = bestKw
        ? (FINCFG.sentences || [])[li % Math.max(1, (FINCFG.sentences || []).length)]
        : (FINCFG.sentenceNoKw || [])[li % Math.max(1, (FINCFG.sentenceNoKw || []).length)];
      if (!tpl) return;
      var line = tpl.replace("{kw}", bestKw).replace("{title}", link.title || "").replace("{url}", link.url);
      inserts[blocks[best].end] = (inserts[blocks[best].end] ? inserts[blocks[best].end] + "\n\n" : "") + line;
      inlineUsed[link.url] = 1;
      placed.push({ title: link.title || "", url: link.url, kw: bestKw,
        where: "본문 " + (best + 1) + "번째 덩어리 뒤" + (bestKw ? " (" + bestKw + ")" : "") });
    });

    var out = [];
    lines.forEach(function (l, i) {
      out.push(l);
      if (inserts[i]) { out.push(""); out.push(inserts[i]); }
    });
    var text = out.join("\n").replace(/[ \t]+$/gm, "").replace(/\s+$/, "");

    var newBottom = (links || []).filter(function (l) {
      if (!l || !l.url) return false;
      if (mode === "both" || mode === "bottom") return true;
      return !inlineUsed[l.url];
    });
    /* 젬이 넣어 둔 기존 링크는 앞에 그대로 두고, 새로 고른 링크만 뒤에 붙인다(주소 중복 제거) */
    var merged = [], seenUrl = {};
    taken.existing.forEach(function (l) {
      if (seenUrl[l.url]) return;
      seenUrl[l.url] = 1;
      merged.push(l);
    });
    newBottom.forEach(function (l) {
      if (seenUrl[l.url]) return;
      seenUrl[l.url] = 1;
      merged.push(l);
      if (!inlineUsed[l.url]) placed.push({ title: l.title || "", url: l.url, kw: "", where: "글 맨 아래 '함께 보면 좋은 글'" });
    });
    if (merged.length) {
      text += "\n\n## " + (FINCFG.bottomHeading || "함께 보면 좋은 글") + "\n" +
        merged.map(function (l) { return "- [" + (l.title || "") + "](" + l.url + ")"; }).join("\n");
    }
    return { md: text, placed: placed, links: (links || []).slice(), kept: taken.existing.length };
  }

  /* ---------------- 마크다운 → 화면/스마트에디터 HTML ---------------- */
  function finSections(md) {
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var secs = [{ h: "", body: [] }];
    lines.forEach(function (raw) {
      var m = raw.match(/^\s{0,3}##(?!#)\s*(.+?)\s*$/);
      if (m) { secs.push({ h: m[1].replace(/\*\*/g, "").trim(), body: [] }); return; }
      secs[secs.length - 1].body.push(raw);
    });
    return secs.filter(function (s) { return s.h || s.body.join("").trim(); });
  }

  function finHtml(md, rich) {
    var H2 = rich ? ' style="font-size:1.25em;font-weight:700;line-height:1.4;margin:0;color:#222"' : "";
    var parts = [];
    finSections(md).forEach(function (sec) {
      if (sec.h) parts.push("<h2" + H2 + ">" + esc(sec.h) + "</h2>");
      /* 지연님이 쓴 문단은 그대로 둔다 — 문단을 쪼개면 연결 문장 안의 링크가 끊긴다 */
      bodyToHtml(sec.body, { inline: !!rich, blocks: true, paraMax: 100000 }).forEach(function (b) { parts.push(b); });
    });
    return parts.join(rich ? "\n" + RICH_GAP + "\n" : "\n");
  }

  /* 이미지 프롬프트에 넣을 '글 요지' — 화면 기호·링크 주소를 걷어낸 평문 */
  function finPlainText(md) {
    return String(md || "")
      .replace(/!\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\([^)]*\)/g, " ")
      .replace(/\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\((?:https?:)?\/\/[^)]*\)/g, "$1")
      .replace(/\]\([^)]*\)/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/[*_`>|~]/g, " ")
      .replace(/^\s*[-•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------------- 화면 그리기 ---------------- */
  function finPaintBlogs() {
    var box = $("#finishBlogChips");
    if (!box) return;
    box.innerHTML = finBlogList().map(function (b) {
      var on = b.id === FIN.blogId;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-fin-blog="' + esc(b.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
        esc((b.emoji ? b.emoji + " " : "") + b.name) + "</button>";
    }).join("");
    var cnt = $("#finishBlogCount");
    if (cnt) {
      var n = finItems(FIN.blogId).length;
      var extra = (FIN.blogId === "jinjin2624" || !finOtherOn()) ? 0
        : finItems(FIN.blogId, true).length - n;
      cnt.textContent = n ? n + "편" + (extra ? " + 다른 블로그 " + extra + "편" : "") + "에서 찾기" : "자동 목록 없음";
    }
    var note = $("#finishBlogNote");
    if (note) {
      var b = finBlog();
      var msg = "";
      if (FIN.blogId === "jinjin2624") msg = finNote("jinjin");
      else if (!finHasList(FIN.blogId)) msg = finNote("noList");
      else msg = (b.name || "") + " 기존 글 " + finItems(FIN.blogId).length + "편" +
        (finOtherOn() ? " + 내 다른 블로그 글까지 제목·태그·요약을 대조해 찾습니다" : "에서 제목·태그·요약을 대조해 찾습니다") +
        " (긍정사랑은 201편 관리대장에서 직접 고르기).";
      note.textContent = msg;
    }
  }

  function finIsPicked(url) { return !!(url && FIN.picked[url]); }
  function finPickedList() {
    var keys = Object.keys(FIN.picked);
    return keys.map(function (k) { return FIN.picked[k]; });
  }

  function finPaintPicked() {
    var box = $("#finishPicked");
    if (!box) return;
    var list = finPickedList();
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = '<div class="fin-picked-head">고른 내부링크 <span class="fp-n">' + list.length + "편 · 최대 " + (FINCFG.maxPick || 5) + '편</span></div>' +
      '<div class="fin-chips">' + list.map(function (l) {
        return '<span class="fin-chip"><span>' + esc(l.title) + "</span>" +
          '<button type="button" data-fin-unpick="' + esc(l.url) + '" aria-label="빼기">✕</button></span>';
      }).join("") + "</div>";
    var cnt = $("#finishLinkCount");
    if (cnt) cnt.textContent = list.length ? list.length + "편 선택" : "";
  }

  function finRenderLinks() {
    var box = $("#finishLinkList");
    if (!box) return;
    var q = String($("#finishLinkSearch") ? $("#finishLinkSearch").value : "").trim().toLowerCase();
    var list;
    if (q) {
      list = finItems(FIN.blogId, finOtherOn()).filter(function (it) {
        return String(it.title || "").toLowerCase().indexOf(q) >= 0;
      }).slice(0, 30);
      var cnt0 = $("#finishLinkCount");
      if (cnt0) cnt0.textContent = list.length + "편 검색됨";
    } else {
      list = FIN.recos;
      var cnt1 = $("#finishLinkCount");
      if (cnt1) cnt1.textContent = list.length ? list.length + "편 추천" : "";
    }

    if (!list.length) {
      var note = q ? finNote("noMatch") : (finBodyValue().trim().length < (FINCFG.minBody || 40) ? finNote("noBody") : finNote("noMatch"));
      box.innerHTML = '<div class="fin-links-empty">' + esc(note) + "</div>";
      return;
    }
    box.innerHTML = list.map(function (it, i) {
      var on = finIsPicked(it.url);
      var date = it.date ? String(it.date).slice(2).replace(/-/g, ".") : "";
      var score = it.score ? '<span class="fl-score">관련 ' + it.score + "</span>" : "";
      var blogId = it.blog || FIN.blogId;
      var other = blogId !== FIN.blogId;
      var blogName = ilBlogName(blogId);
      return '<div class="fin-link' + (on ? " on" : "") + (other ? " other" : "") + '" data-fin-url="' + esc(it.url) + '">' +
        '<input type="checkbox" id="finPick' + i + '" data-fin-pick="' + esc(it.url) + '"' + (on ? " checked" : "") + ' aria-label="' + esc(it.title) + '">' +
        '<label class="fl-main" for="finPick' + i + '">' +
          '<span class="fl-title">' + esc(it.title) + "</span>" +
          '<span class="fl-meta">' + (date ? "<span>" + esc(date) + "</span>" : "") +
            '<span class="' + (other ? "fl-other-blog" : "") + '">' + esc(other ? "내 다른 블로그 · " + blogName : blogName) + "</span></span>" +
        "</label>" + score +
        '<a class="fl-open" href="' + esc(it.url) + '" target="_blank" rel="noopener" aria-label="새 창에서 열기">↗</a>' +
        "</div>";
    }).join("");
  }

  function finPaintCounts() {
    var el = $("#finishBodyCount");
    if (el) {
      var n = finBodyValue().length;
      el.textContent = n ? n.toLocaleString() + "자" : "0자";
    }
    var meta = $("#finishMeta");
    if (meta) {
      var b = finBlog();
      var t = finTitleValue();
      meta.textContent = b.name + (t ? " · " + (t.length > 22 ? t.slice(0, 22) + "…" : t) : "");
    }
  }

  /* ---------------- 붙여넣은 글 임시 기억 ---------------- */
  function finSaveDraft() {
    try {
      localStorage.setItem(FINCFG.storageDraft || "bs.finish.draft", JSON.stringify({
        blogId: FIN.blogId,
        title: finTitleValue(),
        body: finBodyValue(),
        mode: $("#finishInsertMode") ? $("#finishInsertMode").value : "inline",
        ai: !!($("#finishAiLink") && $("#finishAiLink").checked),
        at: Date.now()
      }));
    } catch (e) { /* 저장 공간이 꽉 차면 붙여넣은 글은 화면에만 남는다 */ }
  }
  function finQueueSave() {
    clearTimeout(FIN.draftTimer);
    FIN.draftTimer = setTimeout(finSaveDraft, 420);
  }
  function finRestoreDraft() {
    var j = null;
    try { j = JSON.parse(localStorage.getItem(FINCFG.storageDraft || "bs.finish.draft") || "null"); } catch (e) { j = null; }
    if (!j) return;
    if (j.blogId && BS.blogById(j.blogId)) FIN.blogId = j.blogId;
    if ($("#finishTitle") && j.title) $("#finishTitle").value = j.title;
    if ($("#finishBody") && j.body) $("#finishBody").value = j.body;
    if ($("#finishInsertMode") && j.mode) $("#finishInsertMode").value = j.mode;
    if ($("#finishAiLink")) $("#finishAiLink").checked = !!j.ai;
  }

  function finRecalc(silent) {
    var title = finTitleValue(), body = finBodyValue();
    FIN.recos = finMatchList(title, body, FIN.blogId, finItems(FIN.blogId, finOtherOn()));
    /* 이미 본문에 들어간 내부링크는 후보에서도 뺀다 */
    finRenderLinks();
    finPaintPicked();
    finPaintCounts();
    if (!silent) {
      var note = $("#finishLinkNote");
      if (note) {
        var otherN = FIN.recos.filter(function (r) { return (r.blog || FIN.blogId) !== FIN.blogId; }).length;
        note.textContent = FIN.recos.length
          ? "관련도 순 " + FIN.recos.length + "편" +
            (otherN ? " (내 다른 블로그 " + otherN + "편 포함)" : "") +
            " — 체크해서 고르세요 (최대 " + (FINCFG.maxPick || 5) + "편). 본문 속 문단 끝에 자연스럽게 꽂거나, 글 맨 아래에 모을 수 있습니다."
          : (body.trim().length < (FINCFG.minBody || 40) ? finNote("noBody") : finNote("noMatch"));
      }
    }
  }

  /* ---------------- 선택 ---------------- */
  function finPick(url, on) {
    if (!url) return;
    if (on) {
      var item = null;
      FIN.recos.concat(finItems(FIN.blogId, finOtherOn())).some(function (it) { if (it.url === url) { item = it; return true; } return false; });
      if (!item) return;
      var max = FINCFG.maxPick || 5;
      if (Object.keys(FIN.picked).length >= max) {
        toast("내부링크는 한 글에 " + max + "편까지 고를 수 있습니다 — 하나를 빼고 다시 골라 주세요");
        finRenderLinks();   // 막힌 체크는 화면에서도 풀어 둔다
        return;
      }
      FIN.picked[url] = { title: item.title, url: url, date: item.date || "", blog: item.blog || FIN.blogId, score: item.score || 0 };
    } else {
      delete FIN.picked[url];
    }
    finRenderLinks();
    finPaintPicked();
  }

  /* ---------------- 생성 공통 (Gemini) ---------------- */
  function finModel() { return localStorage.getItem(K_TEXT) || BS.DEFAULT_TEXT_MODEL; }
  function finCall(system, user, gen) {
    return new Promise(function (resolve, reject) {
      var box = { arm: function () {}, disarm: function () {} };
      geminiTextAuto(finModel(), system, user, box, gen || { temperature: 0.85, topP: 0.95 }).then(resolve, reject);
    });
  }
  function finKeyOrExplain() {
    if (getKey()) return true;
    toast((FINCFG.notes || {}).needKey || "Gemini API 키가 필요합니다 — ⚙️ 설정에서 넣어 주세요", 4600);
    return false;
  }
  function finDisclosure(md) {
    var r = {
      md: String(md || ""), docMode: "blog", blogId: FIN.blogId,
      affiliatePlatform: state.affiliatePlatform || "coupang", topic: finTitleValue()
    };
    return articleDisclosure(r);
  }

  /* ---------------- 기능 A/B: 내부링크 삽입 ---------------- */
  function finDoLink() {
    var title = finTitleValue();
    var body = finBodyValue().trim();
    if (!body) return Promise.reject(new Error(finNote("emptyLink")));
    var links = finPickedList();
    if (!links.length) {
      /* 체크한 것이 없으면 자동 매칭 상위 3편으로 진행 — '자동 매칭 & 글에 꽂기'의 뜻 */
      finRecalc(true);
      links = FIN.recos.slice(0, Math.min(3, FINCFG.maxInsertInline || 3)).map(function (it) {
        return { title: it.title, url: it.url, date: it.date, blog: it.blog, score: it.score };
      });
      if (!links.length) return Promise.reject(new Error(finNote("noMatch")));
      links.forEach(function (l) { FIN.picked[l.url] = l; });
      finPaintPicked();
    }
    var mode = $("#finishInsertMode") ? $("#finishInsertMode").value : "inline";
    var useAi = !!($("#finishAiLink") && $("#finishAiLink").checked) && !!getKey();

    function finish(ins, via) {
      FIN.last = { md: ins.md, title: title, links: ins.links, placed: ins.placed, mode: mode, via: via, at: Date.now() };
      finRenderLinkResult();
      var card = $("#finishResultCard");
      if (card) card.hidden = false;
      var empty = $("#finishResultEmpty");
      if (empty) empty.hidden = true;
      return FIN.last;
    }

    var offline = finInsertMd(body, links, mode);
    if (!useAi) return Promise.resolve(finish(offline, "rule"));
    return finCall(
      "너는 한국 블로그 편집자다. 이미 완성된 글의 문장·수치·팩트는 한 글자도 바꾸지 않고, 지정한 기존 글 링크를 본문 흐름에 자연스럽게 잇는 문장 한 줄만 덧붙인다.",
      ["아래 [내 글]을 그대로 살린다. 문장·순서·수치·강조는 고치지 않는다. 새로운 사실이나 추정을 더하지 않는다.",
        "아래 [내부링크]의 제목과 주소를 글자 하나 바꾸지 않고 마크다운 링크 [제목](주소)로 쓴다.",
        "각 링크는 내 글에서 그 주제를 다루는 문단의 끝에 연결 문장 한 줄로 넣는다. 붙일 곳이 없으면 글 맨 아래 '## " + (FINCFG.bottomHeading || "함께 보면 좋은 글") + "' 아래 목록으로 둔다.",
        "본문 전체를 마크다운으로 그대로 돌려준다. 머리말·설명·코드블록은 쓰지 않는다.",
        "",
        "[내부링크]",
        links.map(function (l) { return "- " + l.title + " | " + l.url; }).join("\n"),
        "",
        "[내 글]",
        body].join("\n"),
      { temperature: 0.35, topP: 0.9 }
    ).then(function (text) {
      var clean = String(text || "").replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
      var okLen = clean.length >= offline.md.length * 0.72;
      var hasAll = links.every(function (l) { return clean.indexOf(l.url) >= 0; });
      if (!okLen || !hasAll) {
        toast("AI 다듬기 응답이 원문을 줄였거나 링크가 빠져 규칙 기반 결과로 보여 드립니다", 4200);
        return finish(offline, "rule");
      }
      return finish({ md: clean, placed: offline.placed, links: links }, "ai");
    }, function (err) {
      toast("AI 다듬기에 실패해 규칙 기반으로 꽂았습니다 — " + (err && err.message ? err.message : err), 4200);
      return finish(offline, "rule");
    });
  }

  function finRenderLinkResult() {
    var r = FIN.last;
    var block = $("#finishLinkResult");
    if (!r || !block) return;
    block.hidden = false;
    var tag = $("#finishLinkResultTag");
    if (tag) tag.textContent = r.links.length + "편 · " + (r.via === "ai" ? "AI 다듬기" : "규칙 기반") + " · " + (r.mode === "bottom" ? "글 맨 아래" : r.mode === "both" ? "본문+글 아래" : "본문 속");
    var note = $("#finishPlacedNote");
    if (note) {
      note.textContent = (FINCFG.notes || {}).inserted + " " +
        r.placed.map(function (p) { return "· 「" + (p.title.length > 24 ? p.title.slice(0, 24) + "…" : p.title) + "」 → " + p.where; }).join("  ") +
        (r.kept ? "  · 붙여넣은 글의 '함께 보면 좋은 글' 링크 " + r.kept + "편은 그대로 두었습니다" : "");
    }
    var prev = $("#finishPreview");
    if (prev) prev.innerHTML = finHtml(r.md, false);
    var raw = $("#finishRawMd");
    if (raw) raw.value = r.md;
    var meta = $("#finishResultMeta");
    if (meta) meta.textContent = "원고 " + finBodyValue().length.toLocaleString() + "자 → " + r.md.length.toLocaleString() + "자";
  }

  /* ---------------- 기능 C: 스레드 ---------------- */
  function finSourceMd() {
    return FIN.last ? FIN.last.md : finBodyValue();
  }
  function finDoThread(source) {
    if (!finKeyOrExplain()) return Promise.reject(new Error("Gemini API 키 없음"));
    var md = String(source || "").trim();
    if (!md) return Promise.reject(new Error(finNote("emptyLink")));
    var blog = finBlog();
    var title = finTitleValue();
    var topic = finTopicFrom(title, md);
    var persona = BS.threadPersona(blog.id, topic);
    var persona6 = BS.persona(BS.personaForBlog(blog.id, personaPref(blog.id)));
    var req;
    try {
      req = BS.prompts.threadsPrompt({
        blog: blog, persona: persona, persona6: persona6,
        source: md, topic: topic, title: title,
        extraKeywords: "", notes: "지연님이 이미 쓴 글을 붙여넣은 후작업입니다. 원문 팩트를 그대로 쓰세요.",
        disclosure: finDisclosure(md)
      });
    } catch (e) { return Promise.reject(e); }
    setStatus($("#finishRunState"), '<span class="spin"></span>🧵 스레드 타래를 쓰는 중입니다…');
    return finCall(req.system, req.user, { temperature: 0.85 }).then(function (text) {
      var parsed = parseThreads(text);
      if (!parsed) throw new Error("스레드 타래를 읽지 못했습니다 — 다시 한 번 실행해 주세요");
      var disc = finDisclosure(md);
      if (disc.needed) {
        parsed.disclosure = disc.text;
        if (parsed.threads.length) parsed.threads[0].text = ensureDisclosure(parsed.threads[0].text, disc.text);
        parsed.comment = ensureCommentDisclosure(parsed.comment, disc.text);
      }
      FIN.threads = parsed;
      finRenderThreads();
      var card = $("#finishResultCard");
      if (card) card.hidden = false;
      var empty = $("#finishResultEmpty");
      if (empty) empty.hidden = true;
      /* 카드를 연 뒤에 글상자 높이를 내용에 맞춘다 (v2.3.1 — 숨은 채 계산해 글자가 잘리던 문제) */
      setTimeout(function () { autoGrowIn($("#finishThreadList")); }, 0);
      return parsed;
    });
  }

  function finThreadsText(t) {
    if (!t) return "";
    var L = [];
    (t.threads || []).forEach(function (it, i) {
      L.push("[타래 " + (it.no || i + 1) + " · " + (it.role || "") + "]");
      L.push(it.text);
      L.push("");
    });
    if (t.comment) { L.push("[첫 댓글]"); L.push(t.comment); L.push(""); }
    if (t.hashtags) { L.push("[해시태그]"); L.push(t.hashtags); }
    return L.join("\n").trim();
  }

  function finRenderThreads() {
    var t = FIN.threads;
    var block = $("#finishThreadResult");
    var box = $("#finishThreadList");
    if (!t || !block || !box) return;
    block.hidden = false;
    var tag = $("#finishThreadTag");
    if (tag) tag.textContent = "타래 " + t.threads.length + "개 · " + ((BS.threadAccountFor(FIN.blogId) || {}).handle || "업로드 계정은 아래에서");
    box.innerHTML = "";
    t.threads.forEach(function (it, i) {
      var card = document.createElement("div");
      card.className = "thread-card";
      card.innerHTML =
        '<div class="ipc-head"><strong>타래 ' + (it.no || i + 1) + '</strong>' +
        '<span class="ipc-badge">' + esc(it.role || "") + '</span><span class="tc-len"></span></div>' +
        '<textarea rows="2" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy">📋 이 타래 복사</button>' +
        '<span class="ipc-tip">복사 → 스레드에 차례로 붙여넣기</span></div>';
      var ta = card.querySelector("textarea");
      var len = card.querySelector(".tc-len");
      ta.value = it.text;
      function paint() { if (len) len.textContent = ta.value.length + "자"; }
      paint();
      ta.addEventListener("input", function (e) { FIN.threads.threads[i].text = e.target.value; paint(); autoGrow(e.target); });
      card.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(FIN.threads.threads[i].text).then(function (ok) { toast(ok ? "타래 " + (i + 1) + "을 복사했습니다" : "복사 실패"); });
      });
      box.appendChild(card);
      autoGrow(ta);
    });
    if (t.comment) {
      var c = document.createElement("div");
      c.className = "thread-card extra";
      c.innerHTML = '<div class="ipc-head"><strong>첫 댓글</strong><span class="ipc-badge">링크 + 대가성 문구 맨 앞</span>' +
        '<span class="tc-len"></span></div>' +
        '<textarea rows="2" spellcheck="false"></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-act="copy">📋 첫 댓글 복사</button>' +
        '<span class="ipc-tip">대가성 문구는 맨 앞 · 500자 이내</span></div>';
      var cta = c.querySelector("textarea");
      var clen = c.querySelector(".tc-len");
      var CL2 = commentCharLimit();
      var paintC = function () {
        if (!clen) return;
        clen.textContent = cta.value.length + "자 / " + CL2 + "자";
        clen.style.color = cta.value.length > CL2 ? "#b8452a" : "";
      };
      cta.value = t.comment;
      paintC();
      cta.addEventListener("input", function (e) { FIN.threads.comment = e.target.value; paintC(); autoGrow(e.target); });
      c.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(FIN.threads.comment).then(function (ok) { toast(ok ? "첫 댓글을 복사했습니다" : "복사 실패"); });
      });
      box.appendChild(c);
      autoGrow(cta);
    }
    if (t.hashtags) {
      var h = document.createElement("div");
      h.className = "thread-card extra";
      h.innerHTML = '<div class="ipc-head"><strong>해시태그</strong><span class="ipc-badge">주제 태그 1개 · 한 단어</span></div><textarea rows="2" spellcheck="false" readonly></textarea>' +
        '<div class="ipc-foot"><button type="button" class="btn small ghost" data-act="copy"># 해시태그 복사</button>' +
        '<span class="ipc-tip">태그 칸에 \'#\' 없이 이 한 단어만</span></div>';
      h.querySelector("textarea").value = t.hashtags;
      h.querySelector('[data-act="copy"]').addEventListener("click", function () {
        copyPlain(t.hashtags).then(function (ok) { toast(ok ? "해시태그를 복사했습니다" : "복사 실패"); });
      });
      box.appendChild(h);
    }
    /* v2.3.1 — 위에서 카드는 숨은 채로 만들어진다. 결과 카드가 열린 뒤 한 번 더 키운다. */
    setTimeout(function () {
      autoGrowIn(block);
      autoGrowIn(box);
    }, 30);
    finPaintUpload();
  }

  /* ---------------- 기능 C: 릴스·클립 대본 ---------------- */
  function finDoVideo(source) {
    if (!finKeyOrExplain()) return Promise.reject(new Error("Gemini API 키 없음"));
    var md = String(source || "").trim();
    if (!md) return Promise.reject(new Error(finNote("emptyLink")));
    var blog = finBlog();
    var title = finTitleValue();
    var f = BS.videoFormat("short");
    var persona6 = BS.persona(BS.personaForBlog(blog.id, personaPref(blog.id)));
    var req;
    try {
      req = BS.prompts.videoScriptPrompt({
        blog: blog, fmt: f, formatId: f.id, persona6: persona6,
        source: md, topic: finTopicFrom(title, md), title: title,
        notes: "지연님이 이미 쓴 글을 붙여넣은 후작업입니다. 원문 팩트를 그대로 쓰세요."
      });
    } catch (e) { return Promise.reject(e); }
    setStatus($("#finishRunState"), '<span class="spin"></span>🎬 릴스·클립 대본을 쓰는 중입니다…');
    return finCall(req.system, req.user, { temperature: 0.8 }).then(function (text) {
      var parsed = parseVideoScript(text);
      if (!parsed) throw new Error("영상 대본을 읽지 못했습니다 — 다시 한 번 실행해 주세요");
      parsed.format = f;
      FIN.video = parsed;
      finRenderVideo();
      var card = $("#finishResultCard");
      if (card) card.hidden = false;
      var empty = $("#finishResultEmpty");
      if (empty) empty.hidden = true;
      return parsed;
    });
  }

  function finVideoText(v, heading) {
    if (!v) return "";
    var f = v.format || BS.videoFormat("short");
    var L = [heading || "[릴스·클립 숏폼 대본]"];
    L.push("형식: " + f.emoji + " " + f.label + " (" + f.sub + ") · " + f.seconds + " · " + f.ratio);
    if (v.pick) { L.push(""); L.push("[상품 선정]"); L.push(v.pick); }
    if (v.thumbs.length) { L.push(""); L.push("[추천 썸네일 문구]"); v.thumbs.forEach(function (t, i) { L.push((i + 1) + ") " + t); }); }
    L.push(""); L.push("[3초 후크]"); L.push(v.hook || "");
    L.push(""); L.push("[나레이션]"); L.push(v.narration || "");
    if (v.captions.length) { L.push(""); L.push("[자막]"); v.captions.forEach(function (c, i) { L.push((i + 1) + ") " + c); }); }
    if (v.direct) { L.push(""); L.push("[연출표]"); L.push(v.direct); }
    if (v.scenes.length) {
      L.push(""); L.push("[장면별 Flow 프롬프트]");
      v.scenes.forEach(function (s) { L.push(""); L.push(videoScenePrompt(s, f)); });
    }
    if (v.license) { L.push(""); L.push("[라이선스 확인]"); L.push(v.license); }
    return L.join("\n");
  }

  function finRenderVideo() {
    var v = FIN.video;
    var block = $("#finishVideoResult");
    var box = $("#finishVideoBody");
    if (!v || !block || !box) return;
    block.hidden = false;
    var f = v.format || BS.videoFormat("short");
    var tag = $("#finishVideoTag");
    if (tag) tag.textContent = f.emoji + " " + f.label + " · " + f.seconds + " · " + f.ratio;
    var html = [];
    function vbox(title, body, copyLabel, copyText) {
      return '<div class="fin-vbox"><h4>' + esc(title) + "</h4><p>" + esc(body || "") + "</p>" +
        (copyText ? '<div class="fvb-foot"><button type="button" class="btn small ghost" data-fin-copy="' + esc(copyText) + '">' + esc(copyLabel) + "</button></div>" : "") +
        "</div>";
    }
    if (v.pick) html.push(vbox("🛒 상품 선정 (대본보다 먼저)", v.pick));
    if (v.thumbs && v.thumbs.length) html.push(vbox("🖼️ 추천 썸네일 문구", v.thumbs.map(function (t, i) { return (i + 1) + ") " + t; }).join("\n"), "문구 복사", v.thumbs.join("\n")));
    html.push(vbox("⚡ 3초 후크", v.hook, "후크 복사", v.hook));
    html.push(vbox("🎙️ 나레이션", v.narration, "나레이션 복사", v.narration));
    if (v.captions && v.captions.length) html.push(vbox("💬 자막", v.captions.map(function (c, i) { return (i + 1) + ") " + c; }).join("\n"), "자막 복사", v.captions.join("\n")));
    if (v.direct) html.push(vbox("🎬 연출표", v.direct, "연출표 복사", v.direct));
    (v.scenes || []).forEach(function (s) {
      var pr = videoScenePrompt(s, f);
      html.push('<div class="fin-vbox"><div class="fvb-line"><span class="fvb-n">장면 ' + s.no + "</span> " + esc(s.view || "") + "</div>" +
        (s.caption ? '<div class="fvb-line">자막: ' + esc(s.caption) + "</div>" : "") +
        (s.narration ? '<div class="fvb-line">나레이션: ' + esc(s.narration) + "</div>" : "") +
        '<div class="fvb-prompt">' + esc(pr) + "</div>" +
        '<div class="fvb-foot"><button type="button" class="btn small ghost" data-fin-copy="' + esc(pr) + '">📋 장면 프롬프트 복사</button></div></div>');
    });
    if (v.license) html.push(vbox("🔊 라이선스 확인", v.license));
    box.innerHTML = html.join("");
    bindFinCopyButtons(box);
    finPaintUpload();
  }

  /* ---------------- 기능 C: 이미지 프롬프트 세트 ---------------- */
  function finDoImage(source) {
    var md = String(source || "").trim();
    if (!md) return Promise.reject(new Error(finNote("emptyLink")));
    var blog = finBlog();
    var title = finTitleValue();
    var topic = finTopicFrom(title, md);
    var cards = [];
    /* 썸네일 2종 + 3:1 배너는 키 없이 바로 만들어진다 */
    var gist = finPlainText(md).slice(0, 700);
    (BS.prompts.thumbnailInstructions({ blog: blog, title: title || topic, topic: topic, summary: gist }) || []).forEach(function (t) {
      cards.push({ role: t.role || "썸네일", prompt: t.prompt || "", kind: "thumb" });
    });
    cards.push({ role: "글 하단 3:1 허브 배너", prompt: BS.prompts.bannerInstruction(), kind: "banner" });
    FIN.images = { cards: cards, body: false, at: Date.now() };
    finRenderImages();
    if (!getKey()) {
      setStatus($("#finishRunState"), "🖼️ 썸네일 2종·배너 프롬프트는 준비됐습니다 — 본문 장면 이미지는 Gemini 키가 있어야 만듭니다", "");
      return Promise.resolve(FIN.images);
    }
    var count = Math.min(9, Math.max(1, finSections(md).length - 1)) || 3;
    var req;
    try {
      req = BS.prompts.imagePromptRequest({ blog: blog, topic: topic, summary: gist, count: count, withText: false, bySection: false });
    } catch (e) { return Promise.resolve(FIN.images); }
    setStatus($("#finishRunState"), '<span class="spin"></span>🖼️ 본문 장면 이미지 프롬프트를 고르는 중입니다…');
    return finCall(req.system, req.user, null).then(function (text) {
      var scenes = parseImageScenes(text, false);
      if (scenes.length) {
        scenes.slice(0, 9).forEach(function (p, i) {
          cards.push({ role: "본문 장면 " + (i + 1) + (p.role ? " · " + p.role : ""), prompt: p.prompt, kind: "body" });
        });
        FIN.images = { cards: cards, body: true, at: Date.now() };
        finRenderImages();
      }
      return FIN.images;
    }, function (err) {
      setStatus($("#finishRunState"), "⚠️ 본문 장면 프롬프트는 실패했습니다 — 썸네일·배너는 위에 준비됐습니다 (" + esc(err && err.message ? err.message : err) + ")", "warn");
      return FIN.images;
    });
  }

  function finRenderImages() {
    var im = FIN.images;
    var block = $("#finishImageResult");
    var box = $("#finishImageBody");
    if (!im || !block || !box) return;
    block.hidden = false;
    var tag = $("#finishImageTag");
    var thumbs = im.cards.filter(function (c) { return c.kind === "thumb"; }).length;
    if (tag) tag.textContent = "프롬프트 " + im.cards.length + "개 · 썸네일 " + thumbs + (im.body ? " · 본문 장면 포함" : " · 본문 장면은 키 필요");
    box.innerHTML = im.cards.map(function (c, i) {
      return '<div class="img-prompt-card"><div class="ipc-head"><strong>' + esc(c.role) + '</strong><span class="ipc-badge">' +
        (c.kind === "body" ? "본문 1:1" : c.kind === "banner" ? "3:1 배너" : "대표 썸네일") + "</span></div>" +
        '<textarea rows="5" spellcheck="false" data-fin-img="' + i + '">' + esc(c.prompt) + "</textarea>" +
        '<div class="ipc-foot"><button type="button" class="btn small primary" data-fin-imgcopy="' + i + '">📋 프롬프트 복사</button>' +
        '<a class="btn small ghost" href="https://gemini.google.com/" target="_blank" rel="noopener">제미나이 열기 ↗</a>' +
        '<span class="ipc-tip">따옴표 안 영문만 복사됩니다</span></div></div>';
    }).join("");
    Array.prototype.slice.call(box.querySelectorAll("textarea[data-fin-img]")).forEach(function (ta) {
      var i = parseInt(ta.getAttribute("data-fin-img"), 10);
      ta.addEventListener("input", function (e) { FIN.images.cards[i].prompt = e.target.value; autoGrow(e.target); });
      autoGrow(ta);
    });
    Array.prototype.slice.call(box.querySelectorAll("[data-fin-imgcopy]")).forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-fin-imgcopy"), 10);
        var p = FIN.images.cards[i];
        copyPlain(p.prompt).then(function (ok) { toast(ok ? "프롬프트를 복사했습니다 — 제미나이에 붙여넣으세요" : "복사 실패 — 지시문을 직접 선택해 주세요"); });
      });
    });
    finPaintUpload();
  }

  /* ---------------- 기능 C: 멀티유즈 ---------------- */
  function finDoMulti(source) {
    if (!finKeyOrExplain()) return Promise.reject(new Error("Gemini API 키 없음"));
    var md = String(source || "").trim();
    if (!md) return Promise.reject(new Error(finNote("emptyLink")));
    var blog = finBlog();
    var title = finTitleValue();
    var persona6 = BS.persona(BS.personaForBlog(blog.id, personaPref(blog.id)));
    var req = BS.prompts.multiUsePrompt({
      article: md, topic: finTopicFrom(title, md), title: title,
      blog: blog, docMode: "blog", persona6: persona6, disclosure: finDisclosure(md)
    });
    setStatus($("#finishRunState"), '<span class="spin"></span>⚡ 스레드 훅·20초 클립을 같이 뽑는 중입니다…');
    return finCall(req.system, req.user, { temperature: 0.85, topP: 0.95 }).then(function (text) {
      var m = parseMultiUse(text);
      if (!m) throw new Error("멀티유즈 응답을 읽지 못했습니다 — 다시 한 번 실행해 주세요");
      var disc = finDisclosure(md);
      if (disc.needed) {
        m.disclosure = disc.text;
        m.hook = ensureDisclosure(m.hook, disc.text);
        m.firstComment = [ensureCommentDisclosure((m.firstComment || []).join("\n"), disc.text)];
      }
      FIN.multi = m;
      finRenderMulti();
      var card = $("#finishResultCard");
      if (card) card.hidden = false;
      var empty = $("#finishResultEmpty");
      if (empty) empty.hidden = true;
      return m;
    });
  }

  function finMultiTextFor(m, sel) {
    /* v2.3.2 — 고른 채널의 부분만 담는다(스레드 훅/첫 댓글, 릴스·클립 20초 연출표) */
    if (!m) return "";
    sel = sel || finUploadSel();
    var wantThread = !!sel.threads;
    var wantClip = !!(sel.insta || sel.clip);
    if (!wantThread && !wantClip) return "";
    var L = [];
    if (m.productPick) L.push("상품 선정: " + m.productPick);
    if (wantThread) {
      L.push("【스레드】");
      L.push(m.hook || "");
      if ((m.firstComment || []).length) { L.push(""); L.push("[첫 댓글]"); m.firstComment.forEach(function (c) { L.push(c); }); }
    }
    if (wantClip) {
      if (wantThread) L.push("");
      L.push(sel.clip && !sel.insta ? "【네이버 클립 20초 연출표】" : (sel.insta && !sel.clip ? "【릴스 20초 연출표】" : "【클립 20초 연출표】"));
      (m.clip || []).forEach(function (c) { L.push((c.time ? c.time + " " : "") + c.text); });
    }
    if (m.hashtags) { L.push(""); L.push(m.hashtags); }
    return L.join("\n");
  }

  function finMultiText(m) {
    if (!m) return "";
    var L = [];
    if (m.productPick) L.push("상품 선정: " + m.productPick);
    L.push("【스레드】");
    L.push(m.hook || "");
    if ((m.firstComment || []).length) { L.push(""); L.push("[첫 댓글]"); m.firstComment.forEach(function (c) { L.push(c); }); }
    L.push(""); L.push("【클립 20초 연출표】");
    (m.clip || []).forEach(function (c) { L.push((c.time ? c.time + " " : "") + c.text); });
    if (m.hashtags) { L.push(""); L.push(m.hashtags); }
    return L.join("\n");
  }

  function finRenderMulti() {
    var m = FIN.multi;
    var block = $("#finishMultiResult");
    var box = $("#finishMultiBody");
    if (!m || !block || !box) return;
    block.hidden = false;
    var html = [];
    if (m.disclosure) html.push('<div class="mu-disc">🧾 대가성 문구가 훅 첫 줄과 링크가 있는 첫 댓글 맨 앞에 들어갔습니다 · 첫 댓글 ' + commentCharLimit() + '자 이내 · ' + esc((BS.SNS_DISCLOSURE || {}).law || "") + "</div>");
    if (m.productPick) html.push('<div class="mu-block"><h4>🛒 상품 선정</h4><p>' + esc(m.productPick) + "</p></div>");
    html.push('<div class="mu-block"><h4>🧵 스레드 본문 훅</h4><p>' + esc(m.hook || "(없음)") + '</p><div class="mu-copy"><button type="button" class="btn small ghost" data-fin-copy="' + esc(m.hook || "") + '">훅 복사</button></div></div>');
    html.push('<div class="mu-block"><h4>💬 첫 댓글</h4><p>' + esc((m.firstComment || []).join("\n") || "(없음)") + '</p><div class="mu-copy"><button type="button" class="btn small ghost" data-fin-copy="' + esc((m.firstComment || []).join("\n")) + '">첫 댓글 복사</button></div></div>');
    var clip = (m.clip || []).map(function (c) {
      return '<div class="mu-line"><b>' + esc(c.time || (c.no + ")")) + "</b><span>" + esc(c.text) + "</span></div>";
    }).join("");
    html.push('<div class="mu-block"><h4>🎬 클립 20초 연출표</h4>' + (clip || "<p>(없음)</p>") +
      '<div class="mu-copy"><button type="button" class="btn small ghost" data-fin-copy="' + esc((m.clip || []).map(function (c) { return (c.time ? c.time + " " : "") + c.text; }).join("\n")) + '">연출표 복사</button></div></div>');
    if (m.hashtags) html.push('<div class="mu-block"><h4>#️⃣ 해시태그</h4><p>' + esc(m.hashtags) + '</p><div class="mu-copy"><button type="button" class="btn small ghost" data-fin-copy="' + esc(m.hashtags) + '">해시태그 복사</button></div></div>');
    box.innerHTML = html.join("");
    bindFinCopyButtons(box);
    finPaintUpload();
  }

  function bindFinCopyButtons(root) {
    if (!root) return;
    Array.prototype.slice.call(root.querySelectorAll("[data-fin-copy]")).forEach(function (b) {
      b.addEventListener("click", function () {
        copyPlain(b.getAttribute("data-fin-copy") || "").then(function (ok) { toast(ok ? "복사했습니다" : "복사 실패"); });
      });
    });
  }

  /* ---------------- 📮 올리기 (스레드·릴스·클립) ---------------- */
  function finUploadCfg() { return FINCFG.upload || {}; }
  function finUploadAccountsAll() {
    return ((BS.THREAD_UPLOAD || {}).accounts || []);
  }
  /* v2.3.2 — 올릴 채널(🧵 스레드 / 📸 인스타(릴스) / 🎬 네이버 클립) */
  function finUploadChannelsAll() {
    return ((BS.THREAD_UPLOAD || {}).channels || []);
  }
  function finUploadChannelIds() {
    var all = finUploadChannelsAll().map(function (c) { return c.id; });
    var list = (FIN.uploadChannels || []).filter(function (id) { return all.indexOf(id) >= 0; });
    if (!list.length) list = (((BS.THREAD_UPLOAD || {}).defaultChannels) || all).filter(function (id) { return all.indexOf(id) >= 0; });
    if (!list.length) list = all.slice();
    /* 설정 순서(스레드 → 인스타 → 클립)로 돌려준다 — 버튼·요청·저장본 문구가 늘 같게 */
    return all.filter(function (id) { return list.indexOf(id) >= 0; });
  }
  function finUploadSel() {
    var ids = finUploadChannelIds();
    var sel = {};
    finUploadChannelsAll().forEach(function (c) { sel[c.id] = ids.indexOf(c.id) >= 0; });
    return sel;
  }
  function finUploadChannelLabel(sel) {
    sel = sel || finUploadSel();
    var all = finUploadChannelsAll();
    var on = all.filter(function (c) { return sel[c.id]; });
    if (all.length && on.length === all.length) return (BS.THREAD_UPLOAD || {}).allChannelsLabel || on.map(function (c) { return c.short; }).join("·");
    return on.map(function (c) { return c.short; }).join("·");
  }
  function finUploadChannelFull(sel) {
    sel = sel || finUploadSel();
    return finUploadChannelsAll().filter(function (c) { return sel[c.id]; })
      .map(function (c) { return c.full || c.short; }).join(" / ");
  }
  function finUploadNeeds() {
    /* 고른 채널 중 아직 원고가 없는 것 — 안내 문구에 쓴다 */
    var sel = finUploadSel();
    var miss = [];
    if (sel.threads && !FIN.threads) miss.push("스레드 타래");
    if ((sel.insta || sel.clip) && !FIN.video) miss.push("릴스·클립 대본");
    return miss;
  }
  function finLoadUploadPref() {
    var j = null;
    try { j = JSON.parse(localStorage.getItem(FINCFG.storageUpload || "bs.finish.upload") || "null"); } catch (e) { j = null; }
    if (j && Array.isArray(j.accounts)) FIN.uploadAccounts = j.accounts.filter(function (id) { return BS.threadAccountById(id); });
    if (j && Array.isArray(j.channels)) {
      var chIds = finUploadChannelsAll().map(function (c) { return c.id; });
      FIN.uploadChannels = j.channels.filter(function (id) { return chIds.indexOf(id) >= 0; });
    }
    if (j && j.when) FIN.uploadWhen = j.when;
    if (j && j.whenCustom) FIN.uploadWhenCustom = j.whenCustom;
    FIN.uploadChannels = finUploadChannelIds();
    if (!FIN.uploadAccounts.length) {
      var def = BS.threadAccountFor(FIN.blogId) || finUploadAccountsAll()[0];
      if (def) FIN.uploadAccounts = [def.id];
    }
    if (!FIN.uploadWhen) FIN.uploadWhen = (BS.THREAD_UPLOAD || {}).defaultWhen || "now";
  }
  function finSaveUploadPref() {
    try {
      localStorage.setItem(FINCFG.storageUpload || "bs.finish.upload", JSON.stringify({
        accounts: FIN.uploadAccounts, channels: finUploadChannelIds(), when: FIN.uploadWhen, whenCustom: FIN.uploadWhenCustom
      }));
    } catch (e) {}
  }
  function finSelectedAccounts() {
    return FIN.uploadAccounts.map(function (id) { return BS.threadAccountById(id); }).filter(Boolean);
  }
  function finWhenText(now) {
    now = (now instanceof Date) ? now : new Date();
    var custom = String(FIN.uploadWhenCustom || "").trim();
    if (custom) return custom;
    var U = BS.THREAD_UPLOAD || {};
    var id = FIN.uploadWhen || U.defaultWhen || "now";
    var evening = typeof U.eveningHour === "number" ? U.eveningHour : 20;
    var morning = typeof U.morningHour === "number" ? U.morningHour : 8;
    var d;
    if (id === "h1") { d = new Date(now.getTime() + 3600000); return "1시간 뒤 (" + dayWord(d, now) + " " + clockText(d) + ")"; }
    if (id === "tonight") {
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), evening, 0, 0);
      if (d.getTime() <= now.getTime()) return "오늘 저녁 (오늘 안, 가능한 빨리)";
      return "오늘 저녁 (" + dayWord(d, now) + " " + clockText(d) + ")";
    }
    if (id === "tomorrow8") {
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, morning, 0, 0);
      return "내일 아침 " + morning + "시 (" + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + clockText(d) + ")";
    }
    return "지금 바로";
  }

  function finPaintUpload() {
    var box = $("#finishUploadBox");
    if (!box) return;
    var desc = $("#finishUploadDesc");
    if (desc) desc.textContent = finUploadCfg().desc || "";
    var accts = finUploadAccountsAll();
    var ach = $("#finishUploadAccounts");
    if (ach) {
      ach.innerHTML = accts.map(function (a) {
        var on = FIN.uploadAccounts.indexOf(a.id) >= 0;
        return '<button type="button" class="sux-chip' + (on ? " active" : "") + '" data-fin-acct="' + esc(a.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          (a.emoji ? '<span class="sux-emoji">' + esc(a.emoji) + "</span>" : "") +
          '<span class="sux-h">' + esc(a.handle) + "</span>" +
          '<span class="sux-s">' + esc(a.label + " · " + a.sub) + "</span></button>";
      }).join("");
    }
    var whens = (BS.THREAD_UPLOAD || {}).whens || [];
    var custom = String(FIN.uploadWhenCustom || "").trim();
    var wch = $("#finishUploadWhens");
    if (wch) {
      wch.innerHTML = whens.map(function (w) {
        var on = !custom && (FIN.uploadWhen || "now") === w.id;
        return '<button type="button" class="sux-chip when' + (on ? " active" : "") + '" data-fin-when="' + esc(w.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(w.label) + "</button>";
      }).join("");
    }
    var inp = $("#finishUploadWhenInput");
    if (inp) {
      inp.placeholder = (BS.THREAD_UPLOAD || {}).inputHint || "직접 입력 — 예: 내일 오전 9시 30분";
      if (document.activeElement !== inp && inp.value !== String(FIN.uploadWhenCustom || "")) inp.value = String(FIN.uploadWhenCustom || "");
    }
    var chBox = $("#finishUploadChannels");
    if (chBox) {
      var sel = finUploadSel();
      chBox.innerHTML = finUploadChannelsAll().map(function (c) {
        var on = !!sel[c.id];
        return '<button type="button" class="sux-chip ch' + (on ? " active" : "") + '" data-fin-channel="' + esc(c.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span class="sux-emoji">' + esc(c.emoji || "") + "</span>" +
          '<span class="sux-h">' + esc(c.label.replace(/^\S+\s*/, "")) + "</span>" +
          '<span class="sux-s">' + (on ? "올림" : "안 올림") + "</span></button>";
      }).join("");
    }
    var hint = $("#finishUploadHint");
    if (hint) {
      var names = finSelectedAccounts().map(function (a) { return a.handle; }).join(", ") || "계정을 골라 주세요";
      var miss = finUploadNeeds();
      hint.textContent = "계정 " + names + " / 시간 " + finWhenText() + " / 채널 " + finUploadChannelLabel() +
        (miss.length ? " · " + miss.join("·") + " 아직 없음 — " + (finUploadCfg().noContent || "") : "");
    }
    var copyBtn = $("#btnFinishCopyUpload");
    if (copyBtn) copyBtn.textContent = "📋 피클에게 " + finUploadChannelLabel() + " 업로드 요청 한 번에 복사";
    var urlInp = $("#finishArticleUrl");
    if (urlInp && !urlInp.value && finStoredArticleUrl()) urlInp.value = finStoredArticleUrl();
  }
  function finStoredArticleUrl() {
    try { return localStorage.getItem("bs.finish.articleUrl") || ""; } catch (e) { return ""; }
  }

  function finUploadAskLine(sel, names) {
    /* v2.3.2 — 고른 채널만 말한다(스레드 / 인스타 릴스 / 네이버 클립) */
    var where = [];
    if (sel.threads) where.push("스레드 타래는 스레드(" + names + ")에");
    if (sel.insta && sel.clip) where.push("릴스·클립 대본은 인스타그램 릴스와 네이버 클립(" + names + ")에");
    else if (sel.insta) where.push("릴스 대본은 인스타그램 릴스(" + names + ")에");
    else if (sel.clip) where.push("클립 대본은 네이버 클립(" + names + ")에");
    if (!where.length) return "올릴 채널을 하나 이상 골라 주세요.";
    var s = "위 " + where.join(", ") + " " + finWhenText() + " 올려줘.";
    if (sel.threads || sel.insta) s += " 첫 댓글 링크는 원글 링크로 넣어 줘.";
    return s;
  }

  function finUploadRequestText() {
    var sel = finUploadSel();
    var title = finTitleValue() || "(제목 없음)";
    var blog = finBlog();
    var url = $("#finishArticleUrl") ? String($("#finishArticleUrl").value || "").trim() : "";
    var accts = finSelectedAccounts();
    var L = [];
    L.push("[" + finUploadChannelLabel(sel) + " 업로드 요청 — 지연님 블로그 작업실 v" + (BS.VERSION || "") + "]");
    L.push("원글 제목: " + title);
    L.push("블로그: " + (blog.name || "") + " (" + (blog.url || "") + ")");
    L.push("원글 링크: " + (url || "(발행 후 링크를 넣어 주세요 — 첫 댓글 링크로 씁니다)"));
    L.push("계정: " + (accts.length ? accts.map(function (a) { return a.handle + " (" + a.label + " · " + a.sub + ")"; }).join(" / ") : "(계정 미선택)"));
    L.push("희망 시간: " + finWhenText());
    L.push("올릴 채널: " + finUploadChannelFull(sel) + (finUploadChannelIds().length === finUploadChannelsAll().length ? " (3개 모두)" : ""));
    L.push("");
    if (sel.threads && FIN.threads) {
      L.push("[스레드 타래]");
      (FIN.threads.threads || []).forEach(function (it, i) {
        L.push("[타래 " + (it.no || i + 1) + " · " + (it.role || "") + "]");
        L.push(it.text);
        L.push("");
      });
      L.push("첫 댓글:");
      commentRequestLines(FIN.threads.comment).forEach(function (x) { L.push(x); });
      L.push("해시태그: " + (oneLine(FIN.threads.hashtags) || "(없음)"));
      L.push("");
      threadPostRulesLines(FIN.threads.hashtags, FIN.threads.disclosure).forEach(function (x) { L.push(x); });
      L.push("");
    }
    if ((sel.insta || sel.clip) && FIN.video) {
      var vhead = (sel.insta && sel.clip) ? "[릴스·클립 숏폼 대본]" : (sel.insta ? "[인스타 릴스 대본]" : "[네이버 클립 대본]");
      L.push(finVideoText(FIN.video, vhead));
      L.push("");
    }
    if (FIN.multi) {
      var mt = finMultiTextFor(FIN.multi, sel);
      if (mt) { L.push("[원소스 멀티유즈 — 고른 채널에 해당하는 부분만]"); L.push(mt); L.push(""); }
    }
    if (FIN.images && FIN.images.cards.length) {
      L.push("[이미지 프롬프트 세트 — 제미나이로 만들 이미지]");
      FIN.images.cards.forEach(function (c) { L.push("- " + c.role + ": " + c.prompt); });
      L.push("");
    }
    var names = accts.map(function (a) { return a.handle; }).join(", ") || "@mama062624";
    L.push("[요청]");
    L.push(finUploadAskLine(sel, names));
    return L.join("\n").trim();
  }

  /* ---------------- 작업 실행 ---------------- */
  function finCheckedTasks() {
    var t = [];
    if ($("#finTaskLink") && $("#finTaskLink").checked) t.push("link");
    if ($("#finTaskThread") && $("#finTaskThread").checked) t.push("thread");
    if ($("#finTaskVideo") && $("#finTaskVideo").checked) t.push("video");
    if ($("#finTaskImage") && $("#finTaskImage").checked) t.push("image");
    if ($("#finTaskMulti") && $("#finTaskMulti").checked) t.push("multi");
    return t;
  }
  var FIN_TASK_NAME = { link: "🔗 내부링크", thread: "🧵 스레드", video: "🎬 클립 대본", image: "🖼️ 이미지", multi: "⚡ 멀티유즈" };

  function finSetBusy(on) {
    ["#btnFinishRun", "#btnFinishLinkOnly", "#btnFinishThreadOnly", "#btnFinishVideoOnly",
      "#btnFinishImageOnly", "#btnFinishMultiOnly", "#btnFinishCopyUpload"].forEach(function (sel) {
      var b = $(sel);
      if (!b) return;
      if (on) { b.disabled = true; } else { b.disabled = false; }
    });
  }

  function finTaskPromise(id, source) {
    if (id === "link") return finDoLink().then(function (r) { return r; });
    if (id === "thread") return finDoThread(source);
    if (id === "video") return finDoVideo(source);
    if (id === "image") return finDoImage(source);
    if (id === "multi") return finDoMulti(source);
    return Promise.resolve(null);
  }

  function finRunOnly(id) {
    if (FIN.run) { toast("지금 작업이 돌고 있습니다 — 끝나면 다시 눌러 주세요"); return; }
    if (!finBodyValue().trim()) { toast(finNote("emptyLink"), 3600); return; }
    FIN.run = true;
    finSetBusy(true);
    setStatus($("#finishRunState"), '<span class="spin"></span>' + (FIN_TASK_NAME[id] || "작업") + " 실행 중…");
    finTaskPromise(id, finSourceMd()).then(function () {
      setStatus($("#finishRunState"), "✅ " + (FIN_TASK_NAME[id] || "작업") + " 완료", "ok");
      if (id === "link" || id === "thread" || id === "video" || id === "image" || id === "multi") finScrollResults();
    }, function (err) {
      setStatus($("#finishRunState"), "⚠️ " + esc(err && err.message ? err.message : err), "err");
    }).then(function () {
      FIN.run = false;
      finSetBusy(false);
    });
  }

  function finRunAll() {
    if (FIN.run) { toast("지금 작업이 돌고 있습니다 — 끝나면 다시 눌러 주세요"); return; }
    if (!finBodyValue().trim()) { toast(finNote("emptyLink"), 3600); return; }
    var tasks = finCheckedTasks();
    if (!tasks.length) { toast("실행할 작업을 하나 이상 체크해 주세요"); return; }
    FIN.run = true;
    finSetBusy(true);
    var ok = [], fails = [], i = 0;
    function next() {
      if (i >= tasks.length) return Promise.resolve();
      var id = tasks[i];
      setStatus($("#finishRunState"), '<span class="spin"></span>' + (FIN_TASK_NAME[id] || id) + " 실행 중… (" + (i + 1) + "/" + tasks.length + ")");
      return finTaskPromise(id, finSourceMd()).then(function () {
        ok.push(id);
      }, function (err) {
        fails.push({ id: id, msg: (err && err.message ? err.message : String(err)) });
      }).then(function () { i += 1; return next(); });
    }
    next().then(function () {
      var msg;
      if (!ok.length) {
        msg = "⚠️ 실행하지 못했습니다 — " + fails.map(function (f) { return FIN_TASK_NAME[f.id] + ": " + f.msg; }).join(" / ");
      } else {
        msg = "✅ " + ok.length + "개 완료 (" + ok.map(function (id) { return FIN_TASK_NAME[id]; }).join(" · ") + ")";
        if (fails.length) msg += " · ⚠️ " + fails.length + "개 못 함 — " + fails.map(function (f) { return FIN_TASK_NAME[f.id] + ": " + f.msg; }).join(" / ");
      }
      setStatus($("#finishRunState"), msg, fails.length ? "warn" : "ok");
      if (ok.length) finScrollResults();
      FIN.run = false;
      finSetBusy(false);
    });
  }

  function finScrollResults() {
    var card = $("#finishResultCard");
    if (!card) return;
    card.hidden = false;
    var empty = $("#finishResultEmpty");
    if (empty) empty.hidden = true;
    if (card.scrollIntoView) { try { card.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
  }

  /* ---------------- 초기화 ---------------- */
  function initFinish() {
    if (FIN.booted) return;
    FIN.booted = true;
    FIN.blogId = (finBlogList()[0] || {}).id || "mama2624";
    finLoadAdded();
    finRestoreDraft();
    finLoadUploadPref();
    finPaintBlogs();
    finPaintUpload();
    finRecalc(true);
    finPaintCounts();
    var note = $("#finishRunHint");
    if (note) note.textContent = (FINCFG.notes || {}).needKey || "";

    var chips = $("#finishBlogChips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-fin-blog]") : null;
        if (!b) return;
        var id = b.getAttribute("data-fin-blog");
        if (!id || id === FIN.blogId) return;
        FIN.blogId = id;
        FIN.recos = [];
        FIN.picked = {};
        var def = BS.threadAccountFor(id);
        if (def) FIN.uploadAccounts = [def.id];
        finPaintBlogs();
        finRecalc(true);
        finPaintPicked();
        finPaintUpload();
        finSaveDraft();
        toast("블로그를 " + (finBlog().name || id) + "로 바꿨습니다 — 그 블로그 기존 글에서 찾습니다");
      });
    }

    /* v2.3.1 — [내 다른 블로그 포함] 체크박스 */
    if ($("#finishOtherBlogs")) {
      $("#finishOtherBlogs").addEventListener("change", function (e) {
        FIN.includeOther = !!e.target.checked;
        finPaintBlogs();
        finRecalc();
        toast(FIN.includeOther ? finNote("otherOn") : finNote("otherOff"), 3800);
      });
    }

    ["#finishTitle", "#finishBody"].forEach(function (sel) {      if (!$(sel)) return;
      $(sel).addEventListener("input", function () {
        FIN.last = null;
        finPaintCounts();
        finQueueSave();
        clearTimeout(FIN.matchTimer);
        FIN.matchTimer = setTimeout(function () { finRecalc(true); }, 500);
      });
    });
    if ($("#finishBody")) {
      $("#finishBody").addEventListener("paste", function () { setTimeout(function () { finPaintCounts(); finQueueSave(); finRecalc(true); }, 60); });
    }
    if ($("#finishInsertMode")) $("#finishInsertMode").addEventListener("change", finQueueSave);
    if ($("#finishAiLink")) $("#finishAiLink").addEventListener("change", finQueueSave);

    if ($("#btnFinishClear")) {
      $("#btnFinishClear").addEventListener("click", function () {
        if (!finBodyValue().trim() && !finTitleValue()) { toast("비울 내용이 없습니다"); return; }
        if (!window.confirm("붙여넣은 제목·본문을 비웁니다. 계속할까요?")) return;
        if ($("#finishTitle")) $("#finishTitle").value = "";
        if ($("#finishBody")) $("#finishBody").value = "";
        FIN.last = null; FIN.threads = null; FIN.video = null; FIN.multi = null; FIN.images = null;
        FIN.recos = []; FIN.picked = {};
        ["#finishLinkResult", "#finishThreadResult", "#finishVideoResult", "#finishImageResult", "#finishMultiResult"].forEach(function (s) { show($(s), false); });
        show($("#finishResultCard"), false);
        show($("#finishResultEmpty"), true);
        finRecalc(true); finPaintCounts(); finSaveDraft();
      });
    }

    if ($("#btnFinishMatch")) {
      $("#btnFinishMatch").addEventListener("click", function () {
        if (finBodyValue().trim().length < (FINCFG.minBody || 40)) { toast(finNote("noBody"), 3200); return; }
        finRecalc();
        toast(FIN.recos.length ? "관련 글 " + FIN.recos.length + "편을 찾았습니다 — 체크해서 고르세요" : finNote("noMatch"), 3600);
      });
    }
    if ($("#finishLinkSearch")) {
      $("#finishLinkSearch").addEventListener("input", function () { finRenderLinks(); });
    }
    if ($("#btnFinishLinkClear")) {
      $("#btnFinishLinkClear").addEventListener("click", function () {
        if (!finPickedList().length) { toast("고른 내부링크가 없습니다"); return; }
        FIN.picked = {};
        finRenderLinks(); finPaintPicked();
      });
    }
    if ($("#finishLinkList")) {
      $("#finishLinkList").addEventListener("change", function (e) {
        var t = e.target;
        if (!t || !t.getAttribute || !t.getAttribute("data-fin-pick")) return;
        finPick(t.getAttribute("data-fin-pick"), !!t.checked);
      });
    }
    if ($("#finishPicked")) {
      $("#finishPicked").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-fin-unpick]") : null;
        if (!b) return;
        finPick(b.getAttribute("data-fin-unpick"), false);
      });
    }
    if ($("#btnFinishAdd")) {
      $("#btnFinishAdd").addEventListener("click", function () {
        var t = $("#finishAddTitle") ? String($("#finishAddTitle").value || "").trim() : "";
        var u = $("#finishAddUrl") ? String($("#finishAddUrl").value || "").trim() : "";
        if (!t || !u) { toast("글 제목과 주소를 모두 넣어 주세요"); return; }
        if (!/^https?:\/\//i.test(u)) { toast("주소는 https:// 로 시작해야 합니다"); return; }
        var item = { blog: FIN.blogId, title: t, url: u, date: "", tags: [], keywords: [], summary: "" };
        FIN.added.push(item);
        finSaveAdded();
        FIN.picked[u] = { title: t, url: u, date: "", blog: FIN.blogId, score: 0 };
        if ($("#finishAddTitle")) $("#finishAddTitle").value = "";
        if ($("#finishAddUrl")) $("#finishAddUrl").value = "";
        var q = $("#finishLinkSearch");
        if (q) q.value = "";
        finRenderLinks(); finPaintPicked();
        toast("내부링크로 추가했습니다 — " + t);
      });
    }

    [["#finTaskLink", "link"], ["#finTaskThread", "thread"], ["#finTaskVideo", "video"],
      ["#finTaskImage", "image"], ["#finTaskMulti", "multi"]].forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      el.addEventListener("change", function () {
        var row = el.closest ? el.closest(".fin-task") : null;
        if (row) row.classList.toggle("on", !!el.checked);
      });
    });
    if ($("#btnFinishRun")) $("#btnFinishRun").addEventListener("click", finRunAll);
    if ($("#btnFinishLinkOnly")) $("#btnFinishLinkOnly").addEventListener("click", function () { finRunOnly("link"); });
    if ($("#btnFinishThreadOnly")) $("#btnFinishThreadOnly").addEventListener("click", function () { finRunOnly("thread"); });
    if ($("#btnFinishVideoOnly")) $("#btnFinishVideoOnly").addEventListener("click", function () { finRunOnly("video"); });
    if ($("#btnFinishImageOnly")) $("#btnFinishImageOnly").addEventListener("click", function () { finRunOnly("image"); });
    if ($("#btnFinishMultiOnly")) $("#btnFinishMultiOnly").addEventListener("click", function () { finRunOnly("multi"); });

    if ($("#btnFinishCopyHtml")) {
      $("#btnFinishCopyHtml").addEventListener("click", function () {
        if (!FIN.last) { toast("내부링크를 먼저 꽂아 주세요"); return; }
        var md = "# " + (FIN.last.title || "") + "\n\n" + FIN.last.md;
        copyRich(finHtml(FIN.last.md, true), md).then(function (ok) {
          toast(ok ? "스마트에디터에 붙여넣기 하세요 (서식 유지 · 제목은 따로)" : "복사가 막혔습니다 — 마크다운 원문에서 직접 복사해 주세요");
        });
      });
    }
    if ($("#btnFinishCopyMd")) {
      $("#btnFinishCopyMd").addEventListener("click", function () {
        if (!FIN.last) { toast("내부링크를 먼저 꽂아 주세요"); return; }
        copyPlain("# " + (FIN.last.title || "") + "\n\n" + FIN.last.md).then(function (ok) { toast(ok ? "마크다운을 복사했습니다 (제목 포함)" : "복사 실패"); });
      });
    }
    if ($("#btnFinishCopyTitle")) {
      $("#btnFinishCopyTitle").addEventListener("click", function () {
        var t = (FIN.last && FIN.last.title) || finTitleValue();
        if (!t) { toast("제목이 비어 있습니다"); return; }
        copyPlain(t).then(function (ok) { toast(ok ? "제목을 복사했습니다" : "복사 실패"); });
      });
    }
    if ($("#btnFinishCopyThreads")) {
      $("#btnFinishCopyThreads").addEventListener("click", function () {
        if (!FIN.threads) { toast("스레드 타래가 없습니다 — 먼저 만들어 주세요"); return; }
        copyPlain(finThreadsText(FIN.threads)).then(function (ok) { toast(ok ? "타래 전체를 복사했습니다" : "복사 실패"); });
      });
    }
    if ($("#btnFinishCopyVideo")) {
      $("#btnFinishCopyVideo").addEventListener("click", function () {
        if (!FIN.video) { toast("클립 대본이 없습니다 — 먼저 만들어 주세요"); return; }
        copyPlain(finVideoText(FIN.video)).then(function (ok) { toast(ok ? "대본 전체를 복사했습니다" : "복사 실패"); });
      });
    }
    if ($("#btnFinishCopyImages")) {
      $("#btnFinishCopyImages").addEventListener("click", function () {
        if (!FIN.images || !FIN.images.cards.length) { toast("이미지 프롬프트가 없습니다 — 먼저 만들어 주세요"); return; }
        copyPlain(FIN.images.cards.map(function (c) { return "[" + c.role + "]\n" + c.prompt; }).join("\n\n")).then(function (ok) {
          toast(ok ? "이미지 프롬프트 전체를 복사했습니다" : "복사 실패");
        });
      });
    }
    if ($("#btnFinishCopyMulti")) {
      $("#btnFinishCopyMulti").addEventListener("click", function () {
        if (!FIN.multi) { toast("멀티유즈 결과가 없습니다 — 먼저 만들어 주세요"); return; }
        copyPlain(finMultiText(FIN.multi)).then(function (ok) { toast(ok ? "멀티유즈 세트를 복사했습니다" : "복사 실패"); });
      });
    }

    if ($("#finishUploadAccounts")) {
      $("#finishUploadAccounts").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-fin-acct]") : null;
        if (!b) return;
        var id = b.getAttribute("data-fin-acct");
        var at = FIN.uploadAccounts.indexOf(id);
        if (at >= 0) {
          if (FIN.uploadAccounts.length === 1) { toast("계정은 하나 이상 골라 두세요"); return; }
          FIN.uploadAccounts.splice(at, 1);
        } else {
          FIN.uploadAccounts.push(id);
        }
        finSaveUploadPref();
        finPaintUpload();
      });
    }
    if ($("#finishUploadChannels")) {
      $("#finishUploadChannels").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-fin-channel]") : null;
        if (!b) return;
        var id = b.getAttribute("data-fin-channel");
        if (!id) return;
        var list = finUploadChannelIds().slice();
        var at = list.indexOf(id);
        if (at >= 0) {
          if (list.length === 1) { toast((BS.THREAD_UPLOAD || {}).channelMin || "채널은 하나 이상 골라 두세요"); return; }
          list.splice(at, 1);
        } else {
          list.push(id);
        }
        /* 설정 순서(스레드 → 인스타 → 클립)로 정리해 두면 버튼·요청 문구가 늘 같다 */
        FIN.uploadChannels = finUploadChannelsAll().map(function (c) { return c.id; }).filter(function (cid) { return list.indexOf(cid) >= 0; });
        finSaveUploadPref();
        finPaintUpload();
      });
    }
    if ($("#finishUploadWhens")) {
      $("#finishUploadWhens").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-fin-when]") : null;
        if (!b) return;
        FIN.uploadWhen = b.getAttribute("data-fin-when") || "now";
        FIN.uploadWhenCustom = "";
        if ($("#finishUploadWhenInput")) $("#finishUploadWhenInput").value = "";
        finSaveUploadPref();
        finPaintUpload();
      });
    }
    if ($("#finishUploadWhenInput")) {
      $("#finishUploadWhenInput").addEventListener("input", function (e) {
        FIN.uploadWhenCustom = String(e && e.target ? e.target.value : "").trim();
        finSaveUploadPref();
        finPaintUpload();
      });
    }
    if ($("#finishArticleUrl")) {
      $("#finishArticleUrl").addEventListener("change", function (e) {
        try { localStorage.setItem("bs.finish.articleUrl", String(e.target.value || "").trim()); } catch (e2) {}
      });
    }
    if ($("#btnFinishCopyUpload")) {
      $("#btnFinishCopyUpload").addEventListener("click", function () {
        if (!finBodyValue().trim()) { toast("내 글을 먼저 붙여넣어 주세요"); return; }
        var miss = finUploadNeeds();
        if (miss.length) toast(miss.join("·") + " 아직 없음 — " + (finUploadCfg().noContent || "스레드·클립을 먼저 만들면 요청에 함께 담깁니다"), 4600);
        copyPlain(finUploadRequestText()).then(function (ok) {
          toast(ok ? "업로드 요청을 복사했습니다 — 카톡 '나와의 채팅'에 붙여 피클에게 보내세요" : "복사가 막혔습니다 — 요청을 직접 선택해 복사해 주세요", 4200);
        });
      });
    }
    if ($("#btnFinishWrite")) $("#btnFinishWrite").addEventListener("click", function () { hotSwitchView("write"); });
  }

  /* 검증용(화면 동작에는 영향 없음) — 붙여넣은 글 없이도 매칭·삽입을 콘솔에서 확인
     예: BS.finish.match("창문 단열", "본문…", "mama2624")  ·  BS.finish.insert(md, links, "inline") */
  BS.finish = {
    version: (FINCFG.version || "v2.3.5"),
    state: function () {
      return {
        blogId: FIN.blogId, picked: finPickedList(), recos: FIN.recos,
        hasLink: !!FIN.last, hasThread: !!FIN.threads, hasVideo: !!FIN.video,
        hasImage: !!(FIN.images && FIN.images.cards.length), hasMulti: !!FIN.multi,
        threads: FIN.threads ? FIN.threads.threads.length : 0,
        scenes: FIN.video ? (FIN.video.scenes || []).length : 0,
        imageCards: FIN.images ? FIN.images.cards.length : 0,
        uploadAccounts: FIN.uploadAccounts.slice(), uploadWhen: FIN.uploadWhen, running: FIN.run,
        uploadChannels: finUploadChannelIds().slice(), uploadChannelLabel: finUploadChannelLabel(),
        uploadChannelFull: finUploadChannelFull()
      };
    },
    items: function (blogId) { return finItems(blogId || FIN.blogId); },
    match: function (title, body, blogId, items) { return finMatchList(title, body, blogId || FIN.blogId, items); },
    insert: function (md, links, mode) { return finInsertMd(md, links, mode || "inline"); },
    html: finHtml,
    plainText: finPlainText,
    request: finUploadRequestText,
    whenText: finWhenText,
    channels: function () { return finUploadChannelIds().slice(); },
    channelLabel: finUploadChannelLabel,
    channelFull: finUploadChannelFull,
    setChannels: function (ids) {
      var all = finUploadChannelsAll().map(function (c) { return c.id; });
      var list = (ids || []).filter(function (id) { return all.indexOf(id) >= 0; });
      FIN.uploadChannels = list.length ? list : all.slice();
      finSaveUploadPref();
      finPaintUpload();
      return finUploadChannelIds().slice();
    },
    /* v2.3.2 검증용 — 올리기 요청에 담길 원고를 콘솔에서 직접 넣어 본다 */
    setThreads: function (t) { FIN.threads = t || null; if (t) finRenderThreads(); finPaintUpload(); return true; },
    setVideo: function (v) { FIN.video = v || null; if (v) finRenderVideo(); finPaintUpload(); return true; },
    setMulti: function (m) { FIN.multi = m || null; if (m) finRenderMulti(); finPaintUpload(); return true; },
    tasks: finCheckedTasks
  };

  /* ---------------- 초기화·이벤트 ---------------- */
  function initHot() {
    var tabs = $("#viewTabs");
    if (tabs) {
      tabs.addEventListener("click", function (e) {
        var b = e && e.target && e.target.closest ? e.target.closest(".view-tab") : null;
        if (!b) return;
        hotSwitchView(b.getAttribute("data-view"));
      });
    }
    if ($("#btnHotRefresh")) $("#btnHotRefresh").addEventListener("click", hotRefresh);
    if ($("#btnHotWrite")) $("#btnHotWrite").addEventListener("click", function () { hotSwitchView("write"); });

    if ($("#hotSearch")) {
      $("#hotSearch").addEventListener("input", function (e) {
        HOT.q = (e && e.target ? e.target.value : $("#hotSearch").value) || "";
        hotRender();
      });
    }
    if ($("#btnHotClear")) {
      $("#btnHotClear").addEventListener("click", function () {
        HOT.q = "";
        if ($("#hotSearch")) { $("#hotSearch").value = ""; try { $("#hotSearch").focus(); } catch (e) {} }
        hotRender();
      });
    }

    ["#hotSourceChips", "#hotKindChips", "#hotCatChips"].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      box.addEventListener("click", function (e) {
        var b = e && e.target && e.target.closest ? e.target.closest("[data-src],[data-kind],[data-cat]") : null;
        if (!b) return;
        if (b.getAttribute("data-src") != null) HOT.source = b.getAttribute("data-src") || "all";
        if (b.getAttribute("data-kind") != null) HOT.kind = b.getAttribute("data-kind") || "all";
        if (b.getAttribute("data-cat") != null) HOT.cat = b.getAttribute("data-cat") || "all";
        hotRender();
      });
    });

    ["#hotGrid", "#hotPosts"].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      box.addEventListener("click", function (e) {
        var a = e && e.target && e.target.closest ? e.target.closest("a") : null;
        if (a) return;   // 원문·검색 링크는 그냥 열린다
        var b = e && e.target && e.target.closest ? e.target.closest("[data-act]") : null;
        if (!b) return;
        var act = b.getAttribute("data-act");
        if (act !== "write" && act !== "multiuse" && act !== "video") return;
        var item = hotItemById(b.getAttribute("data-id"));
        if (!item) { toast("카드를 다시 찾지 못했습니다 — 새로고침 후 눌러 주세요"); return; }
        hotUseItem(item, act === "write" ? "" : act);
      });
    });

    if ($("#hotStatus")) {
      $("#hotStatus").addEventListener("click", function (e) {
        var b = e && e.target && e.target.closest ? e.target.closest('[data-act="open-settings"]') : null;
        if (!b) return;
        openSettings();
        var f = $("#ghToken");
        if (f) { try { f.focus(); } catch (e2) {} }
      });
    }

    var chainBox = $("#chainNote");
    if (chainBox) {
      chainBox.addEventListener("click", function (e) {
        var b = e && e.target && e.target.closest ? e.target.closest('[data-act="chain-cancel"]') : null;
        if (!b) return;
        HOT.chain = "";
        HOT.chainItem = null;
        paintChainNote();
        toast("이어서 돌릴 작업을 껐습니다 — 원고만 만듭니다");
      });
    }

    var hash = "";
    try { hash = (window.location && window.location.hash) || ""; } catch (e) { hash = ""; }
    if (hash === "#hot") hotSwitchView("hot", { silent: true });
  }

  /* 검증용 — 화면 동작에는 영향 없음 */
  BS.hot = {
    state: HOT,
    cfg: hotCfg,
    stamp: hotStamp,
    setData: hotApplyPayload,
    render: hotRender,
    deals: hotFilterDeals,
    posts: hotFilterPosts,
    items: hotAllItems,
    find: hotItemById,
    cardHtml: hotDealCardHtml,
    postHtml: hotPostRowHtml,
    refBody: hotRefBody,
    memo: hotProductMemo,
    use: hotUseItem,
    view: hotSwitchView,
    load: hotLoad,
    refresh: hotRefresh,
    dispatchUrl: hotDispatchUrl,
    runsUrl: hotRunsUrl,
    contentsUrl: hotContentsUrl,
    hasToken: function () { return !!getGhToken(); },
    setFilter: function (o) {
      o = o || {};
      if (o.q != null) HOT.q = o.q;
      if (o.source != null) HOT.source = o.source;
      if (o.kind != null) HOT.kind = o.kind;
      if (o.cat != null) HOT.cat = o.cat;
      return hotRender();
    },
    clearChain: function () { HOT.chain = ""; HOT.chainItem = null; paintChainNote(); }
  };

  /* ---------------- 초기화 ---------------- */
  /* ============================================================
     🔒 입장 잠금 (v2.1.1 · 2026-11-18)
     지연님·크리 님만 들어오는 전용 작업실이다. 그래서 앱 화면은 잠금을 풀기 전에는
     아예 보이지 않고(html.locked → body 의 잠금 화면 말고 전부 숨김), 비밀번호도
     소스에 평문으로 두지 않는다 — 입력값을 SHA-256 으로 해싱해 해시하고 비교만 한다.
       · crypto.subtle(https·localhost) 우선, 없으면 같은 SHA-256 순수 JS 폴백
         (http 로컬 테스트·구형 브라우저도 같은 결과로 통과)
       · 해제하면 localStorage 'bs.unlock.v2' 에 그 해시를 남겨 새로고침해도 유지된다
       · ⚙️ 설정의 '🔒 화면 잠그기' 로 언제든 다시 잠근다 (기억도 함께 지운다)
       · 해제 기억 키에 버전(v2)을 붙였다 — 이전 버전이 남긴 기억은 아예 읽지 않으므로,
         비밀번호를 바꾸면 예전에 풀어 둔 브라우저도 첫 화면부터 다시 잠긴다.
     ============================================================ */
  var K_UNLOCK = "bs.unlock.v2";        // v2.2.0 — 이전 키(bs.unlocked)의 해제 기억은 무효
  var K_UNLOCK_OLD = "bs.unlocked";     // 지우기만 한다(예전 기억 청소)
  /* SHA-256("비밀번호") — 평문은 코드 어디에도 없다. 바꿀 때는 이 값만 새 해시로 교체한다. */
  var LOCK_HASH = "af6dab2207e14431a4137029b4dbd46f3b78f63579c001420767f76d63bcdbed";
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var lockOn = false;      // 지금 잠겨 있는지 (화면 상태)
  var lockBound = false;   // 잠금 화면 이벤트를 걸었는지
  var booted = false;      // 앱 초기화(init)를 한 번이라도 마쳤는지

  function lockRotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  /* 문자열 → UTF-8 바이트 (비밀번호는 숫자지만 한글·기호도 같은 방식으로 다룬다) */
  function lockBytes(str) {
    var out = [], i, c, c2, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        c2 = str.charCodeAt(++i);
        cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return out;
  }

  /* 순수 JS SHA-256 — crypto.subtle 이 없는 http·구형 환경용. 결과는 subtle 과 같다. */
  function lockSha256Js(str) {
    var bytes = lockBytes(str), len = bytes.length, bitLen = len * 8;
    var total = (((len + 8) >> 6) + 1) * 16, w = [], wv = [], i, off;
    for (i = 0; i < total; i++) w[i] = 0;
    for (i = 0; i < len; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    w[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    w[total - 2] = Math.floor(bitLen / 4294967296) | 0;
    w[total - 1] = bitLen | 0;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for (i = 0; i < 64; i++) wv[i] = 0;
    for (off = 0; off < total; off += 16) {
      var a, b, c, d, e, f, g, h, t1, t2;
      for (i = 0; i < 16; i++) wv[i] = w[off + i] | 0;
      for (i = 16; i < 64; i++) {
        wv[i] = (wv[i - 16]
          + (lockRotr(wv[i - 15], 7) ^ lockRotr(wv[i - 15], 18) ^ (wv[i - 15] >>> 3))
          + wv[i - 7]
          + (lockRotr(wv[i - 2], 17) ^ lockRotr(wv[i - 2], 19) ^ (wv[i - 2] >>> 10))) | 0;
      }
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (i = 0; i < 64; i++) {
        t1 = (h + (lockRotr(e, 6) ^ lockRotr(e, 11) ^ lockRotr(e, 25))
              + ((e & f) ^ (~e & g)) + SHA_K[i] + wv[i]) | 0;
        t2 = ((lockRotr(a, 2) ^ lockRotr(a, 13) ^ lockRotr(a, 22))
              + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var hex = "";
    for (i = 0; i < 8; i++) hex += ("00000000" + (H[i] >>> 0).toString(16)).slice(-8);
    return hex;
  }

  /* 입력값 → SHA-256 16진 문자열 (subtle 있으면 subtle, 없으면 순수 JS) — 항상 Promise */
  function lockHashPin(pin) {
    var text = String(pin == null ? "" : pin);
    var cr = (typeof window !== "undefined" && window.crypto) ? window.crypto : null;
    if (cr && cr.subtle && typeof cr.subtle.digest === "function" && typeof TextEncoder === "function") {
      try {
        return cr.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
          var b = new Uint8Array(buf), s = "";
          for (var i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
          return s;
        });
      } catch (e) { /* 아래 순수 JS 폴백 */ }
    }
    return Promise.resolve(lockSha256Js(text));
  }

  function lockStored() { try { return localStorage.getItem(K_UNLOCK) || ""; } catch (e) { return ""; } }
  function lockOpen() { return LOCK_HASH.length === 64 && lockStored() === LOCK_HASH; }
  function lockVerify(pin) { return lockHashPin(pin).then(function (h) { return h === LOCK_HASH; }); }

  /* 잠금 화면 ↔ 작업실 화면 전환 — html.locked 클래스 하나로 CSS 가 본문·헤더·설정창을 모두 숨긴다 */
  function lockSet(on) {
    lockOn = !!on;
    var html = document.documentElement;
    if (html && html.classList) {
      if (lockOn) html.classList.add("locked"); else html.classList.remove("locked");
    }
    var box = $("#lockScreen");
    if (box) box.setAttribute("aria-hidden", lockOn ? "false" : "true");
    if (lockOn) {
      var inp = $("#lockInput");
      if (inp) { inp.value = ""; try { inp.focus(); } catch (e) {} }
      var err = $("#lockErr");
      if (err) { err.hidden = true; err.textContent = ""; }
    }
  }

  function lockError(msg) {
    var err = $("#lockErr");
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }

  function lockSubmit() {
    var input = $("#lockInput");
    var pin = input ? String(input.value || "").trim() : "";
    var err = $("#lockErr");
    if (err) { err.hidden = true; err.textContent = ""; }
    if (!pin) { lockError("비밀번호를 입력해 주세요."); return; }
    lockVerify(pin).then(function (ok) {
      if (!ok) {
        lockError("비밀번호가 맞지 않습니다.");
        if (input) { input.value = ""; try { input.focus(); } catch (e) {} }
        return;
      }
      try { localStorage.setItem(K_UNLOCK, LOCK_HASH); } catch (e) {}   // 새로고침에도 유지
      lockSet(false);
      if (!booted) lockBoot();      // 처음 풀 때만 앱을 깨운다 (다시 잠갔다 풀면 화면만 되돌린다)
    });
  }

  /* 잠금 화면 입력 — Enter(폼 submit)와 '잠금 해제' 버튼이 같은 길로 들어온다 */
  function lockBind() {
    if (lockBound) return;
    lockBound = true;
    try { localStorage.removeItem(K_UNLOCK_OLD); } catch (e) {}   // v2.2.0 — 예전 버전 해제 기억 청소
    var form = $("#lockForm");
    var input = $("#lockInput");
    if (form) {
      form.addEventListener("submit", function (e) {
        if (e && e.preventDefault) e.preventDefault();
        lockSubmit();
      });
    }
    if (input) { input.value = ""; try { input.focus(); } catch (e) {} }
  }

  /* ⚙️ 설정의 '🔒 화면 잠그기' — 이 브라우저의 해제 기억까지 지우고 다시 잠근다 */
  function lockNow() {
    try { localStorage.removeItem(K_UNLOCK); } catch (e) {}
    try { localStorage.removeItem(K_UNLOCK_OLD); } catch (e) {}
    lockSet(true);
  }

  function lockBoot() {
    if (booted) return;
    booted = true;
    lockSet(false);
    initApp();
  }

  /* 앱 진입점 — 잠겨 있으면 잠금 화면만 보여 주고 앱은 깨우지 않는다 */
  function init() {
    if (booted) return;
    lockBind();
    if (!lockOpen()) { lockSet(true); return; }
    lockBoot();
  }

  function initApp() {
    HOT.genOk = false;
    /* 🔧 v2.2.3 — 예전 기본 모델(2.5 Flash)이 저장된 브라우저는 새로고침 1회로 새 기본값으로 바뀐다 */
    var modelMoved = migrateDefaultModel();
    if (modelMoved && BS.MODEL_MIGRATION && BS.MODEL_MIGRATION.notice) {
      toast(BS.MODEL_MIGRATION.notice, 5200);
    }
    // 셀렉트 채우기
    $("#toneSelect").innerHTML = BS.TONES.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label) + "</option>"; }).join("");
    $("#lengthSelect").innerHTML = BS.LENGTHS.map(function (l) { return '<option value="' + l.id + '"' + (l.id === "std" ? " selected" : "") + ">" + esc(l.label) + "</option>"; }).join("");
    if ($("#ctaSelect")) {
      $("#ctaSelect").innerHTML = BS.CTAS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === "auto" ? " selected" : "") + ">" + esc(c.label) + "</option>"; }).join("");
    }

    renderModes();
    renderProductPlatforms();
    paintProductNote();
    renderAffiliatePlatforms();   // 🛍️ v2.2.1 — 블로그 모드 제휴 플랫폼(쿠팡·쇼핑커넥트·브커)
    paintGuideNotes();
    setDocMode("blog");

    renderBlogs();
    syncPersona();   // 🎭 블로그에 맞는 페르소나 추천·기억된 선택 복원 (v2.2.0)
    renderChips();
    renderInternal();
    renderKeywordList(true);
    renderDupWarn();   // ⚠️ 기발행 중복 경고 (v2.0.0 — 목록이 도착하면 rtApply 가 다시 계산)
    if ($("#guideDesc") && BS.GUIDE && BS.GUIDE.screenNote) $("#guideDesc").textContent = BS.GUIDE.screenNote;
    renderDrafts();
    updateKeyState();
    loadToday();   // 오늘자 80선 → 도착하면 1번 키워드를 주제칸에 채운다
    initRealtime();   // 오른쪽 실시간 키워드 롤링 패널 (v1.7.0)
    initHot();        // 🔥 실시간 화제템 집합소 탭 + 지금 새로 수집 (v2.1.0)
    initFinish();     // 📎 내 글 내부링크·후작업 탭 (v2.3.0)
    initHomefeed();   // 네이버 홈판 관찰 한 줄 + 제목 프롬프트 반영 (v1.9.7)
    initInternalLinks();  // 기존 글 자동 내부링크 목록 (v1.9.9)

    $("#topic").addEventListener("input", function () {
      renderTopicHint(null); paintRefHint();
      if ((BS.INTERNAL_LINKS || {}).targets && (BS.INTERNAL_LINKS.targets).indexOf(state.blog.id) >= 0) renderInternal();
      if (dupTimer) clearTimeout(dupTimer);
      dupTimer = setTimeout(renderDupWarn, 420);   // 타자를 칠 때마다 계산하지 않고 잠깐 쉰 뒤 (v2.0.0)
    });
    if ($("#extraKw")) $("#extraKw").addEventListener("input", function () {
      if (dupTimer) clearTimeout(dupTimer);
      dupTimer = setTimeout(renderDupWarn, 420);
    });

    /* 🧭 길잡이 · ⚡ 멀티유즈 · 🪙🌙 블로거 (v2.0.0) */
    if ($("#btnGuide")) $("#btnGuide").addEventListener("click", runGuide);
    if ($("#btnMultiUse")) $("#btnMultiUse").addEventListener("click", runMultiUse);
    if ($("#btnMultiClose")) $("#btnMultiClose").addEventListener("click", function () { show($("#multiusePanel"), false); });
    if ($("#btnCopyMultiAll")) {
      $("#btnCopyMultiAll").addEventListener("click", function () {
        if (!state.multiuse) { toast("아직 멀티유즈 결과가 없습니다 — ⚡ 버튼을 먼저 눌러 주세요"); return; }
        copyPlain(multiAllText(state.multiuse)).then(function (ok) {
          toast(ok ? "스레드·클립 세트를 통째로 복사했습니다 — 카톡에 붙여 두고 피클에게 보내세요" : "복사 실패", 3600);
        });
      });
    }
    if ($("#btnCopyBloggerHtml")) {
      $("#btnCopyBloggerHtml").addEventListener("click", function () {
        var b = state.result && state.result.blogger;
        if (!b || !b.html) { toast("복사할 HTML이 없습니다"); return; }
        copyPlain(b.html).then(function (ok) {
          toast(ok ? "Blogger 본문 HTML을 복사했습니다 — 글쓰기 화면의 HTML 보기에 붙여넣으세요" : "복사 실패 — 아래 원문에서 직접 선택해 복사해 주세요", 4200);
        });
      });
    }
    if ($("#btnCopyBloggerMeta")) {
      $("#btnCopyBloggerMeta").addEventListener("click", function () {
        var b = state.result && state.result.blogger;
        if (!b) { toast("복사할 메타 정보가 없습니다"); return; }
        copyPlain(bloggerMetaText(b)).then(function (ok) { toast(ok ? "메타 정보를 복사했습니다" : "복사 실패"); });
      });
    }
    if ($("#btnToEnglish")) $("#btnToEnglish").addEventListener("click", convertToEnglishBlog);

    /* 📰 참고 기사·자료 (v1.9.2) — 링크·본문 입력과 비우기 */
    if ($("#refUrl")) $("#refUrl").addEventListener("input", paintRefHint);
    if ($("#refBody")) $("#refBody").addEventListener("input", paintRefHint);
    if ($("#btnRefClear")) {
      $("#btnRefClear").addEventListener("click", function () {
        clearRefInputs();
        toast("참고 기사·자료를 비웠습니다");
      });
    }
    paintRefHint();

    /* 🔍 구글 실시간 검색 토글 (v1.9.3) — 기본 ON, 선택은 이 브라우저에 저장 */
    if ($("#optWebSearch")) {
      $("#optWebSearch").checked = webSearchEnabled();
      $("#optWebSearch").addEventListener("change", function () {
        var on = !!$("#optWebSearch").checked;
        setWebSearchPref(on);
        if (!on) { resetGrounding(); }
        state.webSearchBusy = false;
        paintWebSearch();
        toast(on ? "🔍 구글 실시간 검색으로 최신 확인 후 작성합니다"
          : "🔍 실시간 검색을 끄고 일반 작성으로 갑니다");
      });
      paintWebSearch();
    }
    if ($("#btnKwFold")) {
      $("#btnKwFold").addEventListener("click", function () {
        var folded = $("#kwPanel").classList.toggle("folded");
        this.textContent = folded ? "20개 펼치기" : "접기";
        this.setAttribute("aria-expanded", folded ? "false" : "true");
      });
    }

    $("#btnSettings").addEventListener("click", openSettings);
    /* 🔒 화면 잠그기 (v2.1.1) — 설정창을 닫고 잠금 화면으로 돌아간다 */
    if ($("#btnLockNow")) $("#btnLockNow").addEventListener("click", function () { closeSettings(); lockNow(); });
    $("#btnCloseSettings").addEventListener("click", closeSettings);
    $("#settingsModal").addEventListener("click", function (e) { if (e.target.id === "settingsModal") closeSettings(); });
    $("#btnSaveSettings").addEventListener("click", saveSettings);
    $("#btnClearKey").addEventListener("click", function () {
      clearKey();
      $("#apiKey").value = "";
      updateKeyState();
      toast("키를 삭제했습니다 (이 브라우저에서만)");
    });
    $("#btnListModels").addEventListener("click", listModels);
    if ($("#btnClearGh")) {
      $("#btnClearGh").addEventListener("click", function () {
        setGhToken("");
        if ($("#ghToken")) { $("#ghToken").value = ""; $("#ghToken").dataset.has = ""; }
        if ($("#ghTokenState")) $("#ghTokenState").textContent = "GitHub 토큰을 지웠습니다 — 🔄 새로고침은 마지막 수집본만 다시 읽습니다";
        toast("GitHub 토큰을 지웠습니다 (이 브라우저에서만)");
      });
    }

    /* 🎭 페르소나 칩 (v2.2.0) — 다시 그려지므로 컨테이너에서 받는다 */
    if ($("#personaChips")) {
      $("#personaChips").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-persona]") : null;
        if (!b) return;
        var id = b.getAttribute("data-persona") || "";
        if (id === state.persona) return;
        setPersona(id);
      });
    }
    if ($("#btnPersonaReset")) $("#btnPersonaReset").addEventListener("click", function () { resetPersona(); });

    $("#btnGenerate").addEventListener("click", generate);
    if ($("#btnToBlog")) $("#btnToBlog").addEventListener("click", function () { convertArticleMode("blog"); });
    if ($("#btnToCafe")) $("#btnToCafe").addEventListener("click", function () { convertArticleMode("cafe"); });

    /* 🧵 스레드 타래 · 🎬 영상 대본 (v1.9.0) */
    if ($("#btnToThreads")) $("#btnToThreads").addEventListener("click", function () { convertToThreads(); });
    if ($("#btnToVideo")) $("#btnToVideo").addEventListener("click", function () { convertToVideoScript(state.videoFormat); });
    if ($("#videoFormatTabs")) {
      $("#videoFormatTabs").addEventListener("click", function (e) {
        var tab = e.target && e.target.closest ? e.target.closest(".vf-tab") : null;
        if (!tab) return;
        var fmt = tab.getAttribute("data-fmt") || "";
        if (fmt === state.videoFormat && state.video) return;
        convertToVideoScript(fmt);
      });
    }
    if ($("#btnThreadClose")) $("#btnThreadClose").addEventListener("click", function () { show($("#threadPanel"), false); });
    if ($("#btnVideoClose")) $("#btnVideoClose").addEventListener("click", function () { show($("#videoPanel"), false); });
    if ($("#btnCopyAllThreads")) {
      $("#btnCopyAllThreads").addEventListener("click", function () {
        if (!state.threads) { toast("아직 스레드 타래가 없습니다 — 🧵 스레드 타래 만들기를 먼저 눌러 주세요"); return; }
        copyPlain(threadsAllText()).then(function (ok) { toast(ok ? "타래 전체를 복사했습니다 — 카톡에 붙여 두고 하나씩 쓰세요" : "복사 실패"); });
      });
    }
    if ($("#btnCopyPickleRequest")) {
      $("#btnCopyPickleRequest").addEventListener("click", function () {
        if (!state.video) { toast("아직 영상 대본이 없습니다 — 🎬 대본 만들기를 먼저 눌러 주세요"); return; }
        copyPlain(videoRequestText()).then(function (ok) {
          toast(ok ? "영상 요청을 복사했습니다 — 카톡 '나와의 채팅'에 붙여 두고 피클에게 보내면 됩니다" : "복사 실패", 3600);
        });
      });
    }
    /* 📮 피클 업로드 요청 (v1.9.1) — 계정·시간 칩은 다시 그려지므로 컨테이너에서 받는다 */
    if ($("#threadAccountChips")) {
      $("#threadAccountChips").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-acct]") : null;
        if (!b) return;
        setThreadAccount(b.getAttribute("data-acct"));
      });
    }
    if ($("#threadWhenChips")) {
      $("#threadWhenChips").addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-when]") : null;
        if (!b) return;
        setThreadWhen(b.getAttribute("data-when"));
      });
    }
    if ($("#threadWhenInput")) {
      $("#threadWhenInput").addEventListener("input", function (e) {
        state.threadWhenCustom = e.target.value || "";
        paintThreadUpload();
      });
    }
    if ($("#btnCopyThreadUpload")) {
      $("#btnCopyThreadUpload").addEventListener("click", function () {
        if (!state.threads) { toast("아직 스레드 타래가 없습니다 — 🧵 스레드 타래 만들기를 먼저 눌러 주세요"); return; }
        copyPlain(threadUploadRequestText()).then(function (ok) {
          toast(ok ? "스레드 업로드 요청을 복사했습니다 — 카톡 '나와의 채팅'에 붙여 피클에게 보내면 됩니다" : "복사 실패", 3600);
        });
      });
    }
    if ($("#productPlatform")) {
      $("#productPlatform").addEventListener("change", function (e) {
        state.productPlatform = e.target.value || "coupang";
        paintProductNote();
      });
    }
    if ($("#affiliatePlatform")) {
      $("#affiliatePlatform").addEventListener("change", function (e) {
        setAffiliatePlatform(e.target.value || "coupang", { silent: true });
        if (state.result && !isProductResult(state.result)) { renderArticle(); updateRawViews(); }
        toast("제휴 플랫폼: " + affiliateInfo().label + " — 대가성 문구도 이 플랫폼 것으로 바뀝니다", 3000);
      });
    }
    if ($("#coupangLink")) {
      $("#coupangLink").addEventListener("input", function (e) {
        autoDetectAffiliate(e && e.target ? e.target.value : "", "blog");
        if (state.result && !isProductResult(state.result)) { renderArticle(); updateRawViews(); }
      });
    }
    if ($("#productUrl")) {
      $("#productUrl").addEventListener("input", function (e) {
        autoDetectAffiliate(e && e.target ? e.target.value : "", "product");
        if (state.result && isProductResult(state.result)) { renderArticle(); updateRawViews(); }
      });
    }
    $("#internalSearch").addEventListener("input", function (e) { renderInternal(e.target.value); });
    /* v2.3.1 — [내 다른 블로그 포함] 을 끄면 이 블로그 글만 다시 보여 준다 */
    if ($("#internalOtherBlogs")) {
      $("#internalOtherBlogs").addEventListener("change", function (e) {
        renderInternal($("#internalSearch") ? $("#internalSearch").value : "");
        toast(e.target.checked
          ? "내 다른 블로그(행복한긍정씨·긍정예찬·부자닷컴·영문) 글까지 함께 찾습니다"
          : "이 블로그 글만 찾습니다", 3200);
      });
    }

    $("#btnCopyHtml").addEventListener("click", function () {
      if (!state.result) return;
      var html = buildRichHtml();
      var md = buildMarkdown();
      copyRich(html, md).then(function (ok) {
        toast(ok ? "스마트에디터에 붙여넣기 하세요 (서식 유지)" : "복사가 막혔습니다 — HTML 탭에서 전체 선택해 복사해 주세요");
      });
    });
    $("#btnCopyMd").addEventListener("click", function () {
      if (!state.result) return;
      copyPlain(buildMarkdown()).then(function (ok) { toast(ok ? "마크다운을 복사했습니다" : "복사 실패"); });
    });
    $("#btnCopyTitle").addEventListener("click", function () {
      if (!state.result) return;
      var box = $("#titleEdit");
      var t = stripEmphasisMarks(String((box && box.value) || state.result.title || "")).trim();
      if (!t) { toast("제목이 비어 있습니다 — 후보를 고르거나 수정칸에 직접 써 주세요"); return; }
      state.result.title = t;
      saveDraft();
      copyPlain(t).then(function (ok) { toast(ok ? "수정한 제목을 복사했습니다" : "복사 실패"); });
    });
    if ($("#titleEdit")) {
      $("#titleEdit").addEventListener("input", function (e) {
        var box = $("#titleEdit");
        setTitle(e && e.target && e.target.value != null ? e.target.value : (box ? box.value : ""));
      });
      $("#titleEdit").addEventListener("keydown", function (e) {
        if (e && e.key === "Enter") { e.preventDefault(); saveDraft(); toast("제목을 저장했습니다 — '제목 복사'로 복사하세요"); }
      });
    }
    if ($("#btnTitleReset")) {
      $("#btnTitleReset").addEventListener("click", function () {
        if (!state.result) return;
        var rec = recommendedTitleAgain();
        if (!rec) { toast("되돌릴 추천 제목이 없습니다"); return; }
        setTitle(rec, { silent: true });
        renderTitles();
        renderArticle();
        updateRawViews();
        saveDraft();
        toast("AI가 고른 추천 제목으로 되돌렸습니다");
      });
    }
    /* 미리보기의 🏆 추천 제목을 누르면 수정칸으로 커서가 간다 */
    if ($("#articlePreview")) {
      $("#articlePreview").addEventListener("click", function (e) {
        var pick = e && e.target && e.target.closest ? e.target.closest(".pick-title") : null;
        if (!pick) return;
        var box = $("#titleEdit");
        if (!box) return;
        try { box.focus(); if (box.select) box.select(); } catch (err) {}
        toast("위 '최종 제목 · 직접 수정'칸에서 고쳐 주세요");
      });
    }
    $("#btnDownloadMd").addEventListener("click", function () {
      if (!state.result) return;
      var blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.result.title || "원고").replace(/[\\/:*?"<>|]/g, "").slice(0, 60) + ".md";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    });

    $("#resultTabs").addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      $$("#resultTabs .tab").forEach(function (t) { t.classList.toggle("active", t === tab); });
      var v = tab.dataset.view;
      $("#articlePreview").hidden = v !== "preview";
      $("#rawMd").hidden = v !== "md";
      $("#rawHtml").hidden = v !== "html";
      updateRawViews();
    });

    $("#btnMakeImgPrompts").addEventListener("click", makeImagePrompts);
    if ($("#btnMakeThumbs")) $("#btnMakeThumbs").addEventListener("click", makeThumbs);
    if ($("#btnCopyBanner")) {
      $("#btnCopyBanner").addEventListener("click", function () {
        copyPlain(BS.prompts.bannerInstruction()).then(function (ok) {
          toast(ok ? "배너 프롬프트를 복사했습니다 — 제미나이에 붙여넣으세요" : "복사가 막혔습니다 — 아래 문구를 직접 선택해 복사해 주세요");
        });
      });
    }
    if ($("#btnCopyHub")) {
      $("#btnCopyHub").addEventListener("click", function () {
        copyPlain(BS.HUB_BANNER.link).then(function (ok) {
          toast(ok ? "허브 링크를 복사했습니다 (네이버 이미지에 붙일 링크)" : "복사 실패");
        });
      });
    }
    refreshBanner();
    ["#optImgText", "#imgCount"].forEach(function (sel) {
      $(sel).addEventListener("change", function () {
        if (state.imgPrompts.length) {
          setStatus($("#imgStatus"), "장면 수나 문구 설정이 바뀌었습니다 — '장면 프롬프트 만들기'를 다시 눌러 주세요", "");
        }
      });
    });
    $("#btnGenAllImages").addEventListener("click", function () {
      state.images = [];
      $("#imageGrid").innerHTML = "";
      $("#apiImgBox").open = true;
      var i = 0;
      (function next() {
        if (i >= state.imgPrompts.length) { $("#btnDownloadAll").hidden = !state.images.length; return; }
        genImage(i).then(function (ok) {
          i++;
          setTimeout(next, ok ? 400 : 1200);
        });
      })();
    });
    $("#btnDownloadAll").addEventListener("click", downloadAll);

    // 쿠팡 링크 입력 시 결과 갱신
    $("#coupangLink").addEventListener("input", function () {
      if (state.result) { renderArticle(); updateRawViews(); }
    });
    $("#optAffiliate").addEventListener("change", function () {
      if (state.result) { renderArticle(); updateRawViews(); }
    });
    $("#optDisclosure").addEventListener("change", function () {
      if (state.result) { renderArticle(); updateRawViews(); }
    });

    // 키가 없으면 안내
    if (!getKey()) {
      $("#genStatus").hidden = false;
      $("#genStatus").className = "gen-status";
      $("#genStatus").innerHTML = "처음 한 번만 <b>설정</b>에서 Gemini API 키를 넣어 주세요. 키는 이 브라우저에만 저장됩니다.";
    }
  }

  /* 검증용(화면 동작에는 영향 없음) — 콘솔에서 붙여넣기용 HTML을 바로 확인할 수 있게 열어 둔다.
     예: BS.richHtmlPreview("## 서두\n첫 문단입니다.\n\n## 본문\n### 질문?\n답입니다.") */
  BS.richHtmlPreview = function (md, title) {
    var parsed = splitSections(String(md || ""));
    if (!parsed.secs.length) return "";
    var saved = state.result;
    state.result = {
      md: String(md || ""),
      sections: parsed.secs,
      title: title || "",
      titles: [],
      blogId: state.blog.id,
      topic: title || "",
      affiliateKeyword: title || ""
    };
    var out = "";
    try { out = buildRichHtml(); } finally { state.result = saved; }
    return out;
  };

  /* 검증용 — 1단계·2단계 응답 파서를 콘솔에서 직접 확인할 수 있게 열어 둔다.
     예: BS.parseResult("## 제목 후보\n1) ...").titles */
  BS.parseResult = parseResult;
  /* v2.2.3 검증용 — 옛 기본 모델 1회 전환을 콘솔에서 직접 확인
     예: BS.modelMigration.migrate()  ·  BS.modelMigration.key */
  BS.modelMigration = {
    key: K_MODEL_MIGRATED,
    migrate: migrateDefaultModel,
    notice: (BS.MODEL_MIGRATION && BS.MODEL_MIGRATION.notice) || "",
    from: (BS.MODEL_MIGRATION && BS.MODEL_MIGRATION.from) || "",
    to: (BS.MODEL_MIGRATION && BS.MODEL_MIGRATION.to) || ""
  };
  BS.modelChain = modelChain;   // v2.2.3 — 자동 전환 사슬에 같은 모델이 두 번 들어가지 않는지 검증용
  BS.webSearchAllowed = webSearchAllowed;   // v2.2.3 — 기본 모델(Flash Lite)이 검색 미지원으로 바로 일반 작성으로 내려가는지 검증용
  BS.renderArticle = renderArticle;   // v2.2.3 — 결과 화면의 이미지 프롬프트 박스 렌더 검증용
  BS.parseImagePromptCards = parseImagePromptCards;   // v2.2.6 — 이미지 프롬프트 세트 카드 파싱 검증용
  BS.imagePromptCardsHtml = imagePromptCardsHtml;     // v2.2.6 — 카드 HTML·복사 버튼 검증용
  /* v2.3.1 검증용 — 내 다른 블로그 내부링크 매칭을 콘솔에서 직접 확인
     예: BS.ilLinks.mixed('mama2624', '겨울 창문 단열')  ·  BS.finMatch.items('mama2624', true).length */
  BS.ilLinks = { auto: autoLinksFor, other: otherBlogLinksFor, mixed: mixedLinksFor, on: otherBlogsOn };
  BS.finMatch = { list: finMatchList, items: finItems, otherOn: finOtherOn };
  /* v2.3.1 검증용 — 타래 결과 카드를 직접 그려 글상자 높이를 확인
     예: BS.finThreads.set({threads:[{no:1,role:'훅',text:'...'}], comment:'...', hashtags:'#태그'}) */
  BS.finThreads = {
    render: finRenderThreads,
    set: function (t) { FIN.threads = t; finRenderThreads(); return true; },
    grow: function () { autoGrowIn($("#finishThreadList")); return true; }
  };
  BS.auditDefect = auditDefect;
  BS.parseGrounding = parseGrounding;
  /* v2.0.0 검증용 — 중복 경고·길잡이·블로거·멀티유즈를 콘솔에서 직접 확인 */
  BS.dupList = dupList;
  BS.dupCheck = function (topic, extra, blogId) { return dupList(topic, extra, blogId); };
  BS.guideScored = guideScored;
  BS.guideBigIssue = guideBigIssue;
  BS.guideBlogFor = guideBlogFor;
  BS.guideFallback = guideFallback;
  BS.guideTitleDrafts = guideTitleDrafts;
  BS.parseGuide = parseGuide;
  BS.guideAllText = guideAllText;
  BS.parseBloggerResult = parseBloggerResult;
  BS.parseSeoMeta = parseSeoMeta;
  BS.bloggerDefect = bloggerDefect;
  BS.bloggerMetaText = bloggerMetaText;
  BS.parseMultiUse = parseMultiUse;
  BS.parseVideoScript = parseVideoScript;   // v2.2.2 — 연출표·라이선스 칸까지 읽는지 검증용
  BS.renderVideoScript = renderVideoScript; // v2.2.2 — 결과 화면 카드 렌더 검증용
  BS.multiAllText = multiAllText;
  BS.articleDisclosure = articleDisclosure;
  BS.ensureDisclosure = ensureDisclosure;
  BS.ensureCommentDisclosure = ensureCommentDisclosure;   // v2.3.5 — 첫 댓글 맨 앞 문구 + 500자
  BS.cutThreadBody = cutThreadBody;
  BS.commentCharLimit = commentCharLimit;
  BS.state = state;
  BS.stageLabels = function () { return { draft: stageLabel("draft"), audit: stageLabel("audit") }; };
  /* v2.1.1 검증용 — 잠금 해시·해제 여부·해제/재잠금을 콘솔에서 직접 확인
     예: BS.lock.hash("입력값")  ·  BS.lock.open()  ·  BS.lock.verify(x) */
  BS.lock = {
    key: K_UNLOCK,
    hash: LOCK_HASH,
    sha256: lockSha256Js,
    hashPin: lockHashPin,
    verify: lockVerify,
    open: lockOpen,
    on: function () { return lockOn; },
    lockNow: lockNow,
    unlock: lockSubmit
  };

  /* v2.3.7 검증용 — 🏷️ 의도 태그·급상승 배지를 콘솔에서 직접 확인
     예: BS.kwIntent('가습기 추천')  ·  BS.rt  (내부 상태 — 테스트에서 rt.data 를 넣고 부른다) */
  BS.kwIntentBadge = kwIntentBadge;
  BS.rtTrendBadges = rtTrendBadges;
  BS.rtBadges = rtBadges;
  BS.rtRenderList = rtRenderList;
  BS.rtRenderIntents = rtRenderIntents;
  BS.rtSetIntent = rtSetIntent;
  BS.rt = rt;

  /* v2.2.0 검증용 — 🎭 페르소나를 콘솔에서 직접 확인·전환
     예: BS.personas.current()  ·  BS.personas.set('money_policy')  ·  BS.personas.forBlog('jinjin2624') */
  BS.personas = {
    current: currentPersona,
    id: function () { return state.persona; },
    sync: syncPersona,
    set: setPersona,
    reset: resetPersona,
    manual: personaIsManual,
    paint: paintPersonas,
    pref: personaPref,
    defaultFor: BS.personaDefault,
    forBlog: BS.personaForBlog,
    byId: BS.persona
  };

  /* v2.2.1 검증용 — 🛡️ 안전장치 3종을 콘솔에서 직접 확인
     예: BS.safety.issues()  ·  BS.safety.healthHits('면역 특효')  ·  BS.affiliate.set('creatorshop') */
  BS.safety = {
    issues: function () { return safetyIssues(state.result); },
    scan: safetyIssues,
    paint: paintSafetyWarn,
    healthHits: BS.healthHits,
    healthContext: BS.healthContext,
    healthScopeFor: healthScopeFor,
    platformFromUrl: BS.platformFromUrl
  };
  BS.affiliate = {
    info: affiliateInfo,
    choices: affiliateChoices,
    set: setAffiliatePlatform,
    render: renderAffiliatePlatforms,
    detect: autoDetectAffiliate,
    link: tipAnchorHtml,
    html: affiliateHtml,
    disclosure: function () { return articleDisclosure(state.result); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
