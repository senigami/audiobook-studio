/* Audiobook Studio Handbook — client-side search.
   Flattens window.NAV_DATA into a searchable index (single source of truth —
   no separate index file to drift). Pure vanilla JS, no dependencies, file:// safe. */
(function () {
  "use strict";

  var ROOT = window.HANDBOOK_ROOT || "";
  var data = window.NAV_DATA || { sections: [] };

  // Build flat index from the nav tree.
  var index = [];
  data.sections.forEach(function (section) {
    section.pages.forEach(function (p) {
      index.push({
        title: p.title,
        url: p.url,
        section: section.title,
        inProgress: !!p.inProgress,
        haystack: (p.title + " " + section.title + " " + (p.keywords || []).join(" ")).toLowerCase()
      });
    });
  });

  var input = document.getElementById("search-input");
  var box = document.getElementById("search-results");
  if (!input || !box) return;

  var results = [];
  var activeIdx = -1;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function run(q) {
    q = q.trim().toLowerCase();
    if (!q) { close(); return; }
    var terms = q.split(/\s+/);
    results = index
      .map(function (item) {
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i];
          if (item.haystack.indexOf(t) === -1) return null;
          if (item.title.toLowerCase().indexOf(t) !== -1) score += 3;
          else score += 1;
        }
        return { item: item, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 12)
      .map(function (r) { return r.item; });

    activeIdx = -1;
    render();
  }

  function render() {
    if (!results.length) {
      box.innerHTML = '<div class="empty">No matches. Try a feature name like “voice”, “queue”, or “plugin”.</div>';
      box.hidden = false;
      return;
    }
    box.innerHTML = results
      .map(function (r, i) {
        var badge = r.inProgress ? ' <span class="badge">soon</span>' : "";
        return (
          '<a class="result" data-i="' + i + '" href="' + ROOT + r.url + '">' +
          '<span class="r-title">' + escapeHtml(r.title) + badge + "</span><br>" +
          '<span class="r-section">' + escapeHtml(r.section) + "</span></a>"
        );
      })
      .join("");
    box.hidden = false;
  }

  function close() { box.hidden = true; box.innerHTML = ""; activeIdx = -1; }

  function setActive(i) {
    var nodes = box.querySelectorAll(".result");
    if (!nodes.length) return;
    activeIdx = (i + nodes.length) % nodes.length;
    nodes.forEach(function (n, idx) { n.classList.toggle("active", idx === activeIdx); });
    nodes[activeIdx].scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("input", function () { run(input.value); });
  input.addEventListener("focus", function () { if (input.value.trim()) run(input.value); });

  input.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === "Enter") {
      var nodes = box.querySelectorAll(".result");
      if (activeIdx >= 0 && nodes[activeIdx]) { window.location.href = nodes[activeIdx].getAttribute("href"); }
      else if (nodes[0]) { window.location.href = nodes[0].getAttribute("href"); }
    } else if (e.key === "Escape") { close(); input.blur(); }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".search")) close();
  });

  // "/" focuses search (skip when typing in a field).
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); input.focus();
    }
  });
})();
