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

  function route() {
    var r = location.hash.replace(/^#\/?/, "");
    var parts = r.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) { renderArticle(parts[0], parts[1]); }
    else { renderHome(); }
  }

  $(function () {
    $("#hb-top").html(topnav());
    $("#hb-foot").html(footer());
    $(window).on("hashchange", route);
    route();
  });
})(jQuery);
