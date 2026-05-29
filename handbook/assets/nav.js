/* Audiobook Studio Handbook — sidebar renderer + shell behavior.
   Reads window.NAV_DATA (single source of truth). Progressive enhancement:
   without JS the page content still renders; this adds the navigable shell. */
(function () {
  "use strict";

  var ROOT = window.HANDBOOK_ROOT || "";
  var CURRENT = window.HANDBOOK_PAGE || "";
  var data = window.NAV_DATA || { sections: [] };

  /* ---------- Sidebar ---------- */
  function buildSidebar() {
    var host = document.getElementById("sidebar");
    if (!host) return;
    var html = "";
    var lastPart = null;

    data.sections.forEach(function (section, i) {
      if (section.part && section.part !== lastPart) {
        html += '<div class="nav-part">' + escapeHtml(section.part) + "</div>";
        lastPart = section.part;
      }
      var hasActive = section.pages.some(function (p) { return p.id === CURRENT; });
      html += '<div class="nav-section' + (hasActive ? " open" : "") + '" data-section="' + section.id + '">';
      html += '<button class="nav-section-btn" aria-expanded="' + (hasActive ? "true" : "false") + '">';
      html += '<span class="nav-section-num">' + (i + 1) + "</span>";
      html += "<span>" + escapeHtml(section.title) + "</span>";
      html += '<span class="chevron">▶</span>';
      html += "</button>";
      html += '<ul class="nav-items">';
      section.pages.forEach(function (p) {
        var active = p.id === CURRENT ? " active" : "";
        var badge = p.inProgress ? '<span class="badge">soon</span>' : "";
        html += '<li><a class="' + "navlink" + active + '" href="' + ROOT + p.url + '">' +
          "<span>" + escapeHtml(p.title) + "</span>" + badge + "</a></li>";
      });
      html += "</ul></div>";
    });

    host.innerHTML = html;

    // Collapsible toggles
    host.querySelectorAll(".nav-section-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sec = btn.closest(".nav-section");
        var open = sec.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---------- Mobile drawer ---------- */
  function wireMenu() {
    var toggle = document.querySelector(".menu-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!document.body.classList.contains("nav-open")) return;
      if (e.target.closest(".sidebar") || e.target.closest(".menu-toggle")) return;
      document.body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  /* ---------- Theme (auto / light / dark, Apple-style) ---------- */
  function wireTheme() {
    var root = document.documentElement;
    var stored = null;
    try { stored = localStorage.getItem("handbook-theme"); } catch (e) {}
    if (stored) root.setAttribute("data-theme", stored);

    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    var order = ["auto", "light", "dark"];
    var label = { auto: "◐", light: "☀", dark: "☾" };
    function reflect() {
      var t = root.getAttribute("data-theme") || "auto";
      btn.textContent = label[t] || "◐";
      btn.title = "Theme: " + t + " (click to change)";
    }
    reflect();
    btn.addEventListener("click", function () {
      var t = root.getAttribute("data-theme") || "auto";
      var next = order[(order.indexOf(t) + 1) % order.length];
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("handbook-theme", next); } catch (e) {}
      reflect();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  buildSidebar();
  wireMenu();
  wireTheme();
})();
