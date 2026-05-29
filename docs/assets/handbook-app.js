/* Audiobook Studio 2.0 handbook — jQuery SPA.
   The design lives in the shell (index.html) + studio2.css/handbook.css.
   Content lives as unstyled JSON in handbook/content/<section>/<slug>.json.
   This app routes by URL hash, loads the matching JSON, and renders it into the
   central design. Restyling later means editing CSS/this renderer only — the
   content JSON never changes.

   Note: loads JSON via AJAX, so it needs to be served over http(s)
   (e.g. GitHub Pages). Opening from file:// will block the fetch. */
(function ($) {
  "use strict";
  var NAV = window.HB_NAV || { parts: [] };
  var GH = NAV.github || "#";

  // flatten pages in display order for prev/next + section lookups
  var flat = [];
  NAV.parts.forEach(function (part) {
    part.sections.forEach(function (sec) {
      sec.pages.forEach(function (p) {
        flat.push({ dir: sec.dir, sectionTitle: sec.title, slug: p.slug, title: p.title, flag: p.flag });
      });
    });
  });

  function esc(s) { return $("<div>").text(s == null ? "" : s).html(); }
  function decode(s) { return $("<div>").html(s || "").text(); }
  function tag(flag) { return flag ? ' <span class="tag">' + (flag === "future" ? "future" : "soon") + "</span>" : ""; }

  function topnav() {
    return '<a class="brand" href="index.html"><img src="../assets/logo.png" alt="Audiobook Studio" /><span>Audiobook&nbsp;Studio</span></a>' +
      '<div class="hb-search"><input type="search" id="hb-q" placeholder="Search the handbook…" autocomplete="off" aria-label="Search the handbook" /><div class="hb-results" id="hb-results"></div></div>' +
      '<div class="nav-links"><a href="#">Handbook</a><a href="../index.html">Site</a><a href="' + GH + '">GitHub</a></div>';
  }
  function footer() {
    return "&copy; 2026 Audiobook Studio · Local-first, professional audiobook production.<br />" +
      '<a href="#">Handbook</a> · <a href="../index.html">Site</a> · <a href="' + GH + '">GitHub</a>';
  }
  function sidebar(curDir, curSlug) {
    var h = "";
    NAV.parts.forEach(function (part) {
      h += '<div class="group-part">' + esc(part.title) + "</div>";
      part.sections.forEach(function (sec) {
        h += '<div class="group"><div class="group-title">' + esc(sec.title) + "</div>";
        sec.pages.forEach(function (p) {
          var a = sec.dir === curDir && p.slug === curSlug ? ' class="active"' : "";
          h += "<a" + a + ' href="#' + sec.dir + "/" + p.slug + '">' + esc(p.title) + tag(p.flag) + "</a>";
        });
        h += "</div>";
      });
    });
    return h;
  }

  function renderArticle(dir, slug) {
    $.getJSON("content/" + dir + "/" + slug + ".json")
      .done(function (d) {
        var sec = flat.filter(function (f) { return f.dir === dir; })[0];
        var crumb = '<a href="#">Handbook</a> › ' + esc(sec ? sec.sectionTitle : "");
        var idx = -1, i;
        for (i = 0; i < flat.length; i++) { if (flat[i].dir === dir && flat[i].slug === slug) { idx = i; break; } }
        var nx = "";
        if (idx > 0) { var pv = flat[idx - 1]; nx += '<a href="#' + pv.dir + "/" + pv.slug + '"><span class="dir">‹ Previous</span><div class="ttl">' + esc(pv.title) + "</div></a>"; }
        else { nx += "<span></span>"; }
        if (idx >= 0 && idx < flat.length - 1) { var nn = flat[idx + 1]; nx += '<a href="#' + nn.dir + "/" + nn.slug + '"><span class="dir">Next ›</span><div class="ttl">' + esc(nn.title) + "</div></a>"; }
        var html = '<div class="doc-breadcrumb">' + crumb + "</div>" +
          "<h1>" + d.title + "</h1>" +
          '<p class="lede">' + d.lede + "</p>" +
          d.body +
          '<div class="next-links">' + nx + "</div>";
        $("#hb-article").html(html);
        mountDemos();
        $("#hb-sidebar").html(sidebar(dir, slug));
        document.title = decode(d.title) + " | Handbook";
        window.scrollTo(0, 0);
      })
      .fail(function () {
        $("#hb-article").html("<h1>Coming soon</h1><p class=\"lede\">This page hasn't been written yet. Use the sidebar to browse what's available.</p>");
        $("#hb-sidebar").html(sidebar(dir, slug));
        document.title = "Handbook | Audiobook Studio 2.0";
      });
  }

  function renderHome() {
    var h = '<div class="hb-hero"><span class="badge">Handbook</span>' +
      "<h1>Everything you need to produce audiobooks</h1>" +
      "<p>From your first install to building voices, casting characters, and extending Studio with your own engines and integrations.</p></div>";
    NAV.parts.forEach(function (part) {
      h += '<div class="section"><div class="section-header"><span class="badge">' + esc(part.title) + "</span></div><div class=\"grid grid-3\">";
      part.sections.forEach(function (sec) {
        var first = sec.pages[0];
        h += '<a class="card" href="#' + sec.dir + "/" + first.slug + '"><h3>' + esc(sec.title) + "</h3><p>" + sec.pages.length + " pages</p></a>";
      });
      h += "</div></div>";
    });
    $("#hb-article").html(h);
    $("#hb-sidebar").html(sidebar("", ""));
    document.title = "Handbook | Audiobook Studio 2.0";
    window.scrollTo(0, 0);
  }

  // ---- reusable demo player (data: content/demos/<id>.json) ----
  var CURSOR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 7-6 2-2 6-6-15z" fill="#6d5efc" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  function buildDemo($el, d) {
    var steps = (d && d.steps) || [];
    if (!steps.length) { $el.html('<div class="hb-demo-caption">Demo unavailable.</div>'); return; }
    var n = steps.length, cur = 0, timer = null;
    $el.html(
      '<div class="hb-demo-head"><span class="pill">Demo</span><span class="ttl">' + (d.title || "Walkthrough") + "</span></div>" +
      '<div class="hb-demo-stage"><div class="hb-demo-frame"></div><div class="hb-demo-hotspot"></div><div class="hb-demo-cursor">' + CURSOR + "</div></div>" +
      '<div class="hb-demo-caption"></div>' +
      '<div class="hb-demo-controls"><button class="prev">‹ Prev</button><button class="play">▶ Play</button><button class="next">Next ›</button><button class="restart" title="Restart">⟲</button><span class="counter"></span><span class="dots"></span></div>'
    );
    var $frame = $el.find(".hb-demo-frame"), $hot = $el.find(".hb-demo-hotspot"), $cur = $el.find(".hb-demo-cursor"),
        $cap = $el.find(".hb-demo-caption"), $cnt = $el.find(".counter"), $dots = $el.find(".dots"),
        $prev = $el.find(".prev"), $next = $el.find(".next"), $play = $el.find(".play");
    var dh = ""; for (var k = 0; k < n; k++) dh += '<i data-i="' + k + '"></i>'; $dots.html(dh);
    function render(i) {
      cur = i; var s = steps[i];
      if (s.frame) { $frame.html('<img class="hb-demo-shot" src="' + s.frame + '" alt="" />'); }
      else { $frame.html('<div class="hb-demo-screen"><div class="bar"><i></i><i></i><i></i></div><div class="label">' + esc(s.screen || "") + "</div></div>"); }
      if (s.hotspot) { var h = s.hotspot; $hot.css({ left: h[0] + "%", top: h[1] + "%", width: h[2] + "%", height: h[3] + "%", opacity: 1 }); }
      else { $hot.css("opacity", 0); }
      var c = s.cursor || [50, 50]; $cur.css({ left: c[0] + "%", top: c[1] + "%" });
      $cur.removeClass("click"); void $cur[0].offsetWidth; $cur.addClass("click");
      $cap.html('<span class="step-n">' + (i + 1) + ".</span> " + (s.caption || ""));
      $cnt.text((i + 1) + " / " + n);
      $dots.find("i").removeClass("on").eq(i).addClass("on");
      $prev.prop("disabled", i === 0); $next.prop("disabled", i === n - 1);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $play.html("▶ Play"); }
    function play() { if (timer) { stop(); return; } $play.html("❚❚ Pause"); timer = setInterval(function () { if (cur >= n - 1) { stop(); return; } render(cur + 1); }, 3000); }
    $prev.on("click", function () { stop(); if (cur > 0) render(cur - 1); });
    $next.on("click", function () { stop(); if (cur < n - 1) render(cur + 1); });
    $el.find(".restart").on("click", function () { stop(); render(0); });
    $play.on("click", play);
    $dots.on("click", "i", function () { stop(); render(+$(this).data("i")); });
    render(0);
  }
  function mountDemos() {
    $(".hb-demo[data-demo]").each(function () {
      var $el = $(this), id = $el.attr("data-demo");
      if ($el.data("mounted")) return; $el.data("mounted", true);
      $.getJSON("content/demos/" + id + ".json")
        .done(function (d) { buildDemo($el, d); })
        .fail(function () { $el.html('<div class="hb-demo-caption">Demo unavailable.</div>'); });
    });
  }

  // ---- search (index: content/search-index.json) ----
  function sectionTitle(route) {
    var dir = route.split("/")[0];
    var f = flat.filter(function (x) { return x.dir === dir; })[0];
    return f ? f.sectionTitle : "";
  }
  function snippet(text, q) {
    var i = text.toLowerCase().indexOf(q);
    if (i < 0) return text.slice(0, 130) + (text.length > 130 ? "…" : "");
    var s = Math.max(0, i - 45);
    return (s > 0 ? "…" : "") + text.slice(s, s + 130).trim() + "…";
  }
  function initSearch() {
    var INDEX = [];
    $.getJSON("content/search-index.json").done(function (d) { INDEX = d; });
    var $q = $("#hb-q"), $r = $("#hb-results");
    function run() {
      var q = $.trim($q.val()).toLowerCase();
      if (q.length < 2) { $r.removeClass("open").empty(); return; }
      var res = [];
      INDEX.forEach(function (p) {
        var score = p.t.toLowerCase().indexOf(q) >= 0 ? 3
          : (p.d || "").toLowerCase().indexOf(q) >= 0 ? 2
          : (p.x || "").toLowerCase().indexOf(q) >= 0 ? 1 : 0;
        if (score) res.push({ p: p, score: score });
      });
      res.sort(function (a, b) { return b.score - a.score; });
      if (!res.length) { $r.html('<div class="hb-noresult">No matches for “' + esc(q) + '”.</div>').addClass("open"); return; }
      var h = "";
      res.slice(0, 8).forEach(function (o) {
        var p = o.p;
        h += '<a class="hb-result" href="#' + p.r + '">' +
          '<div class="hb-result-ttl">' + esc(p.t) + "</div>" +
          '<div class="hb-result-sec">' + esc(sectionTitle(p.r)) + "</div>" +
          '<div class="hb-result-snip">' + esc(snippet(((p.d || "") + " " + (p.x || "")).trim(), q)) + "</div></a>";
      });
      $r.html(h).addClass("open");
    }
    $q.on("input focus", run);
    $r.on("click", "a", function () { $r.removeClass("open").empty(); $q.val(""); });
    $(document).on("click", function (e) { if (!$(e.target).closest(".hb-search").length) $r.removeClass("open"); });
    $(document).on("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") { e.preventDefault(); $q.focus(); }
      else if (e.key === "Escape") { $r.removeClass("open"); $q.blur(); }
    });
  }

  function route() {
    var r = location.hash.replace(/^#\/?/, "");
    var parts = r.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) { renderArticle(parts[0], parts[1]); }
    else { renderHome(); }
  }

  $(function () {
    $("#hb-top").html(topnav());
    $("#hb-foot").html(footer());
    initSearch();
    $(window).on("hashchange", route);
    route();
  });
})(jQuery);
