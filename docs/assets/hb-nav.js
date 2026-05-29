/* Audiobook Studio 2.0 handbook — shared chrome injector.
   Reads window.HB_NAV (nav-data.js) and the per-page globals:
     window.HB_ROOT     relative path to the handbook root (e.g. "../" or "")
     window.HB_SECTION  current section dir (omit on the handbook home)
     window.HB_PAGE     current page slug (omit on the handbook home)
   Injects the top nav, sidebar, breadcrumb, prev/next, and footer into
   placeholder elements, so none of that is duplicated in page source. */
(function () {
  "use strict";
  var NAV = window.HB_NAV || { parts: [] };
  var ROOT = window.HB_ROOT || "";
  var SECTION = window.HB_SECTION || "";
  var PAGE = window.HB_PAGE || "";

  var hbHome = ROOT + "index.html";
  var siteHome = ROOT + "../index.html";
  var gh = NAV.github || "#";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pageUrl(dir, slug) { return ROOT + dir + "/" + slug + ".html"; }
  function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  /* flat ordered list for prev/next + lookups */
  var flat = [];
  NAV.parts.forEach(function (part) {
    part.sections.forEach(function (sec) {
      sec.pages.forEach(function (p) {
        flat.push({ dir: sec.dir, sectionTitle: sec.title, slug: p.slug, title: p.title, flag: p.flag });
      });
    });
  });

  function badge(flag) {
    if (!flag) return "";
    return ' <span class="tag">' + (flag === "future" ? "future" : "soon") + "</span>";
  }

  function buildTop() {
    var html =
      '<a class="brand" href="' + hbHome + '"><img src="' + ROOT + '../assets/logo.png" alt="Audiobook Studio" /><span>Audiobook&nbsp;Studio</span></a>' +
      '<div class="nav-links">' +
        '<a href="' + hbHome + '">Handbook</a>' +
        '<a href="' + siteHome + '">Site</a>' +
        '<a href="' + gh + '">GitHub</a>' +
      "</div>";
    set("hb-top", html);
  }

  function buildSidebar() {
    if (!document.getElementById("hb-sidebar")) return;
    var html = "";
    NAV.parts.forEach(function (part) {
      html += '<div class="group-part">' + esc(part.title) + "</div>";
      part.sections.forEach(function (sec) {
        html += '<div class="group"><div class="group-title">' + esc(sec.title) + "</div>";
        sec.pages.forEach(function (p) {
          var active = sec.dir === SECTION && p.slug === PAGE ? ' class="active"' : "";
          html += "<a" + active + ' href="' + pageUrl(sec.dir, p.slug) + '">' + esc(p.title) + badge(p.flag) + "</a>";
        });
        html += "</div>";
      });
    });
    set("hb-sidebar", html);
  }

  function buildCrumb() {
    var sec = flat.filter(function (f) { return f.dir === SECTION; })[0];
    var secTitle = sec ? sec.sectionTitle : "";
    set("hb-crumb", '<a href="' + hbHome + '">Handbook</a> › ' + esc(secTitle));
  }

  function buildPrevNext() {
    if (!document.getElementById("hb-next")) return;
    var idx = -1;
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].dir === SECTION && flat[i].slug === PAGE) { idx = i; break; }
    }
    if (idx === -1) { return; }
    var html = "";
    var prev = flat[idx - 1], next = flat[idx + 1];
    if (prev) {
      html += '<a href="' + pageUrl(prev.dir, prev.slug) + '"><span class="dir">‹ Previous</span><div class="ttl">' + esc(prev.title) + "</div></a>";
    } else { html += "<span></span>"; }
    if (next) {
      html += '<a href="' + pageUrl(next.dir, next.slug) + '"><span class="dir">Next ›</span><div class="ttl">' + esc(next.title) + "</div></a>";
    }
    set("hb-next", html);
  }

  function buildFooter() {
    set("hb-foot",
      "&copy; 2026 Audiobook Studio · Local-first, professional audiobook production.<br />" +
      '<a href="' + hbHome + '">Handbook</a> · <a href="' + siteHome + '">Site</a> · <a href="' + gh + '">GitHub</a>');
  }

  function run() { buildTop(); buildSidebar(); buildCrumb(); buildPrevNext(); buildFooter(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else { run(); }
})();
