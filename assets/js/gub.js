/* Renders the guide from data/gub.json. Every piece of text goes in through textContent. */
(function () {
  "use strict";

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "text") node.textContent = v;
        else if (k === "className") node.className = v;
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) if (children[i]) node.appendChild(children[i]);
    }
    return node;
  }

  function entryHref(id) { return "entry.html?id=" + encodeURIComponent(id); }

  function loadGuide() {
    return fetch("data/gub.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("status " + r.status);
      return r.json();
    });
  }

  function showError(target) {
    target.textContent = "";
    target.appendChild(el("p", { className: "notice", text: "The guide couldn't load. Refresh the page to try again." }));
  }

  /* Home page */
  function renderHome(data) {
    var route = document.getElementById("route-list");
    var parts = document.getElementById("parts");
    route.textContent = "";
    parts.textContent = "";

    data.sections.forEach(function (section, index) {
      var entries = data.entries.filter(function (e) { return e.section === section.id; });
      var count = entries.length + (entries.length === 1 ? " entry" : " entries");

      route.appendChild(el("li", { className: "route__item" }, [
        el("a", { href: "#part-" + section.id, text: section.title }),
        el("span", { className: "route__meta", text: count })
      ]));

      var cards = entries.map(function (e) {
        var card = el("article", { className: "card", "data-search": [e.title, e.summary, (e.tags || []).join(" ")].join(" ").toLowerCase() }, [
          el("h3", null, [el("a", { href: entryHref(e.id), text: e.title })]),
          el("p", { text: e.summary }),
          e.warning ? el("p", { className: "card__flag", text: "Includes a compliance warning" }) : null
        ]);
        return card;
      });

      var part = el("section", { className: "part", id: "part-" + section.id, "aria-labelledby": "part-title-" + section.id }, [
        el("header", { className: "part__head" }, [
          el("p", { className: "part__num", text: "Part " + (index + 1) + " of " + data.sections.length }),
          el("h2", { id: "part-title-" + section.id, text: section.title }),
          el("p", { className: "part__intro", text: section.intro })
        ]),
        el("div", { className: "cards" }, cards)
      ]);
      parts.appendChild(part);
    });

    setupFinder(data.entries.length);
  }

  function setupFinder(total) {
    var input = document.getElementById("finder-input");
    var count = document.getElementById("finder-count");
    if (!input || !count) return;
    function apply() {
      var q = input.value.trim().toLowerCase();
      var words = q ? q.split(/\s+/) : [];
      var shown = 0;
      var parts = document.querySelectorAll(".part");
      for (var i = 0; i < parts.length; i++) {
        var cards = parts[i].querySelectorAll(".card");
        var visibleInPart = 0;
        for (var j = 0; j < cards.length; j++) {
          var hay = cards[j].getAttribute("data-search") || "";
          var match = words.every(function (w) { return hay.indexOf(w) !== -1; });
          cards[j].hidden = !match;
          if (match) { visibleInPart++; shown++; }
        }
        parts[i].hidden = visibleInPart === 0;
      }
      if (!q) count.textContent = total + " entries across five parts.";
      else if (shown === 0) count.textContent = "No entries match. Try a broader word, or ask the engine.";
      else count.textContent = shown + (shown === 1 ? " entry matches." : " entries match.");
    }
    input.addEventListener("input", apply);
    apply();
  }

  /* Entry page */
  function renderEntry(data) {
    var target = document.getElementById("entry");
    target.textContent = "";
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id") || "";
    var index = -1;
    for (var i = 0; i < data.entries.length; i++) if (data.entries[i].id === id) { index = i; break; }

    if (index === -1) {
      document.title = "Entry not found — Solo Operator";
      target.appendChild(el("div", { className: "entry__head" }, [
        el("h1", { text: "That entry doesn't exist" }),
        el("p", { className: "entry__summary", text: "The link may be old or mistyped. Every entry is listed on the guide's home page." }),
        el("p", { className: "ask" }, [el("a", { className: "btn btn--primary", href: "index.html", text: "Browse all entries" })])
      ]));
      return;
    }

    var e = data.entries[index];
    var section = data.sections.filter(function (s) { return s.id === e.section; })[0] || { id: "", title: "Guide" };
    document.title = e.title + " — Solo Operator";

    var head = el("header", { className: "entry__head" }, [
      el("p", { className: "crumbs" }, [
        el("a", { href: "index.html", text: "Guide" }),
        document.createTextNode(" / "),
        el("a", { href: "index.html#part-" + section.id, text: section.title })
      ]),
      el("h1", { text: e.title }),
      el("p", { className: "entry__summary", text: e.summary })
    ]);

    var body = el("div", { className: "entry__body" });
    if (e.warning) {
      body.appendChild(el("div", { className: "warn", role: "note" }, [
        el("strong", { text: "Before you use this" }),
        el("span", { text: e.warning })
      ]));
    }
    (e.body || []).forEach(function (p) { body.appendChild(el("p", { text: p })); });
    if (e.steps && e.steps.length) {
      body.appendChild(el("h2", { text: "Step by step" }));
      body.appendChild(el("ol", { className: "steps" }, e.steps.map(function (s) { return el("li", { text: s }); })));
    }

    var rows = Object.keys(e.details || {}).map(function (label) {
      return el("div", { className: "glance__row" }, [el("dt", { text: label }), el("dd", { text: String(e.details[label]) })]);
    });
    var side = el("aside", { className: "entry__side", "aria-labelledby": "glance-title" }, [
      el("div", { className: "glance" }, [
        el("h2", { id: "glance-title", text: "At a glance" }),
        el("dl", null, rows),
        el("ul", { className: "tags", "aria-label": "Topics" }, (e.tags || []).map(function (t) { return el("li", { text: t }); })),
        el("p", { className: "source", text: "Source: " + e.source }),
        el("div", { className: "ask" }, [
          el("a", { className: "btn btn--primary", href: "engine.html", text: "Talk this through with the engine" })
        ])
      ])
    ]);

    var layout = el("div", { className: "entry__layout" }, [body, side]);

    var prev = data.entries[index - 1];
    var next = data.entries[index + 1];
    var pager = el("nav", { className: "pager", "aria-label": "More entries" }, [
      prev ? el("a", { className: "pager__prev", href: entryHref(prev.id) }, [
        el("span", { className: "pager__dir", text: "Previous" }), el("span", { className: "pager__title", text: prev.title })
      ]) : null,
      next ? el("a", { className: "pager__next", href: entryHref(next.id) }, [
        el("span", { className: "pager__dir", text: "Next" }), el("span", { className: "pager__title", text: next.title })
      ]) : null
    ]);

    target.appendChild(head);
    target.appendChild(layout);
    target.appendChild(pager);
  }

  function init() {
    var page = document.body.getAttribute("data-page");
    var target = page === "entry" ? document.getElementById("entry") : document.getElementById("parts");
    if (!target) return;
    loadGuide().then(function (data) {
      if (page === "entry") renderEntry(data);
      else renderHome(data);
    }).catch(function () {
      showError(target);
      var route = document.getElementById("route-list");
      if (route) { route.textContent = ""; }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
