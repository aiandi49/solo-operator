/* Solo Operator engine. Talks only to /api/chat. State lives in sessionStorage.
   All model and user text is rendered with textContent. */
(function () {
  "use strict";

  var STORE_KEY = "solo-engine-v1";
  var MAX_SEND = 20;          // most recent messages sent to the server
  var MAX_INPUT = 2000;       // characters per message (server allows more)
  var TIMEOUT_MS = 40000;
  var CIRC = 2 * Math.PI * 48; // gauge circumference

  var WELCOME = "Tell me where you are and what you're trying to do: what you sell or want to sell, who it's for, and what's stuck. I'll ask a question or two if I need to, then give you a specific next step from the guide.";

  var state = { messages: [], matches: [], selected: null };
  var guide = null; // id -> {title, section}
  var busy = false;

  var log, input, form, sendBtn, statusEl, resetBtn, topBody, shortBody, detailsBody, gaugeValue, gaugeNum, gaugeLabel;

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
    if (children) for (var i = 0; i < children.length; i++) if (children[i]) node.appendChild(children[i]);
    return node;
  }

  /* ---------- storage ---------- */
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && Array.isArray(s.messages)) {
        state.messages = s.messages.filter(function (m) {
          return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
        });
        state.matches = Array.isArray(s.matches) ? s.matches.map(cleanMatch).filter(Boolean) : [];
        state.selected = typeof s.selected === "string" ? s.selected : null;
      }
    } catch (e) { /* ignore unreadable state */ }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }

  /* ---------- MATCH parsing ---------- */
  function cleanMatch(m) {
    if (!m || typeof m !== "object") return null;
    var id = typeof m.id === "string" ? m.id.trim().slice(0, 80) : "";
    var title = typeof m.title === "string" ? m.title.trim().slice(0, 160) : "";
    var score = Number(m.score);
    if (!id || !title || !isFinite(score)) return null;
    score = Math.max(0, Math.min(100, Math.round(score)));
    var why = typeof m.why === "string" ? m.why.trim().slice(0, 400) : "";
    var details = {};
    if (m.details && typeof m.details === "object" && !Array.isArray(m.details)) {
      Object.keys(m.details).slice(0, 8).forEach(function (k) {
        var v = m.details[k];
        if (typeof v === "string" || typeof v === "number") details[String(k).slice(0, 60)] = String(v).slice(0, 300);
      });
    }
    return { id: id, title: title, score: score, why: why, details: details };
  }

  // Splits a raw model reply into visible text and parsed matches.
  // Every line starting with MATCH: is removed, even when its JSON is malformed.
  function splitReply(raw) {
    var visible = [];
    var matches = [];
    String(raw || "").split(/\r?\n/).forEach(function (line) {
      if (/^\s*MATCH:/i.test(line)) {
        var json = line.replace(/^\s*MATCH:\s*/i, "");
        try {
          var m = cleanMatch(JSON.parse(json));
          if (m) matches.push(m);
        } catch (e) { /* malformed: dropped from view, not used */ }
      } else {
        visible.push(line);
      }
    });
    var text = visible.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    var seen = {};
    matches = matches.filter(function (m) { if (seen[m.id]) return false; seen[m.id] = true; return true; });
    matches.sort(function (a, b) { return b.score - a.score; });
    return { text: text, matches: matches };
  }

  /* ---------- rendering ---------- */
  // Paragraphs split on blank lines; runs of "- " or "1." lines become lists, even inside a paragraph block.
  function renderText(container, text) {
    var bullet = /^\s*[-•*]\s+/;
    var numbered = /^\s*\d+[.)]\s+/;
    text.split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split("\n").filter(function (l) { return l.trim() !== ""; });
      var prose = [];
      var list = null;
      var listType = "";
      function flushProse() { if (prose.length) { container.appendChild(el("p", { text: prose.join("\n") })); prose = []; } }
      function flushList() { if (list) { container.appendChild(list); list = null; listType = ""; } }
      lines.forEach(function (l) {
        var type = bullet.test(l) ? "ul" : numbered.test(l) ? "ol" : "";
        if (!type) { flushList(); prose.push(l); return; }
        flushProse();
        if (listType !== type) { flushList(); list = el(type); listType = type; }
        list.appendChild(el("li", { text: l.replace(type === "ul" ? bullet : numbered, "") }));
      });
      flushProse();
      flushList();
    });
  }

  function bubble(role, text) {
    var node = el("div", { className: "msg " + (role === "user" ? "msg--user" : "msg--bot") });
    if (role === "user") node.appendChild(el("p", { text: text }));
    else renderText(node, text || "…");
    return node;
  }

  function renderLog() {
    log.textContent = "";
    log.appendChild(bubble("assistant", WELCOME));
    state.messages.forEach(function (m) {
      var text = m.role === "assistant" ? splitReply(m.content).text : m.content;
      log.appendChild(bubble(m.role, text));
    });
    scrollLog();
  }

  function scrollLog() { log.scrollTop = log.scrollHeight; }

  function notice(message) {
    var node = el("div", { className: "msg msg--notice", role: "status" }, [
      el("strong", { text: "Not sent. " }),
      document.createTextNode(message)
    ]);
    log.appendChild(node);
    scrollLog();
  }

  function guideLink(id, label) {
    if (!guide || !guide[id]) return null;
    return el("a", { className: "pill-link", href: "entry.html?id=" + encodeURIComponent(id), text: label || "Open the guide entry" });
  }

  function selectedMatch() {
    if (!state.matches.length) return null;
    for (var i = 0; i < state.matches.length; i++) if (state.matches[i].id === state.selected) return state.matches[i];
    return state.matches[0];
  }

  function renderCards() {
    var top = state.matches[0] || null;

    // Top match
    topBody.textContent = "";
    if (!top) {
      topBody.appendChild(el("p", { className: "empty", text: "Your best-fitting guide entry appears here once the engine has enough to recommend something." }));
    } else {
      topBody.appendChild(el("h3", { className: "top__title", text: top.title }));
      topBody.appendChild(el("p", { className: "top__score" }, [el("b", { text: String(top.score) }), el("span", { text: "/ 100 fit" })]));
      if (top.why) topBody.appendChild(el("p", { className: "top__why", text: top.why }));
      var link = guideLink(top.id);
      if (link) topBody.appendChild(link);
    }

    // Gauge + shortlist
    var score = top ? top.score : 0;
    gaugeValue.setAttribute("stroke-dasharray", (CIRC * score / 100).toFixed(1) + " " + CIRC.toFixed(1));
    gaugeNum.textContent = top ? String(score) : "–";
    gaugeLabel.textContent = top ? "Top match score: " + score + " out of 100" : "Top match score: none yet";

    shortBody.textContent = "";
    if (!state.matches.length) {
      shortBody.appendChild(el("p", { className: "empty", text: "Other good fits are ranked here by score. Select one to see its details." }));
    } else {
      var current = selectedMatch();
      var list = el("ul", { className: "short-list" });
      state.matches.forEach(function (m) {
        var btn = el("button", {
          type: "button", className: "short-item",
          "aria-pressed": current && current.id === m.id ? "true" : "false",
          "aria-label": m.title + ", score " + m.score + ". Show details"
        }, [el("span", { className: "short-item__title", text: m.title }), el("span", { className: "short-item__score", text: String(m.score) })]);
        btn.addEventListener("click", function () { state.selected = m.id; save(); renderCards(); });
        list.appendChild(el("li", null, [btn]));
      });
      shortBody.appendChild(list);
    }

    // Details
    detailsBody.textContent = "";
    var sel = selectedMatch();
    if (!sel) {
      detailsBody.appendChild(el("p", { className: "empty", text: "Practical specifics for the selected match — next step, time needed, tools — appear here." }));
    } else {
      detailsBody.appendChild(el("h3", { className: "details-title", text: sel.title }));
      var keys = Object.keys(sel.details);
      if (keys.length) {
        detailsBody.appendChild(el("dl", { className: "dl" }, keys.map(function (k) {
          return el("div", { className: "dl__row" }, [el("dt", { text: k }), el("dd", { text: sel.details[k] })]);
        })));
      } else if (sel.why) {
        detailsBody.appendChild(el("p", { text: sel.why }));
      }
      var dlink = guideLink(sel.id, "Read the full entry");
      if (dlink) detailsBody.appendChild(dlink);
    }
  }

  /* ---------- sending ---------- */
  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    input.setAttribute("aria-busy", on ? "true" : "false");
    statusEl.textContent = on ? "Thinking…" : "";
  }

  function send(text) {
    if (busy) return;
    text = text.trim().slice(0, MAX_INPUT);
    if (!text) { statusEl.textContent = "Type a message first."; input.focus(); return; }

    state.messages.push({ role: "user", content: text });
    save();
    log.appendChild(bubble("user", text));
    input.value = "";
    var typing = el("div", { className: "typing", "aria-label": "The engine is replying" }, [el("span"), el("span"), el("span")]);
    log.appendChild(typing);
    scrollLog();
    setBusy(true);

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ messages: state.messages.slice(-MAX_SEND) }),
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function (res) {
      if (!res.ok || typeof res.data.reply !== "string") {
        var fallback = res.status === 429
          ? "You're sending messages quickly. Wait a minute, then try again."
          : "The engine couldn't answer just now. Try again in a moment.";
        throw new Error(typeof res.data.error === "string" && res.data.error ? res.data.error : fallback);
      }
      var reply = res.data.reply;
      var parsed = splitReply(reply);
      state.messages.push({ role: "assistant", content: reply });
      if (parsed.matches.length) {
        state.matches = parsed.matches;
        state.selected = parsed.matches[0].id;
      }
      save();
      typing.remove();
      log.appendChild(bubble("assistant", parsed.text));
      scrollLog();
      renderCards();
    }).catch(function (err) {
      typing.remove();
      // Remove the unsent message so the history stays valid, and put it back in the box.
      var last = state.messages[state.messages.length - 1];
      if (last && last.role === "user" && last.content === text) {
        state.messages.pop();
        save();
        var bubbles = log.querySelectorAll(".msg--user");
        if (bubbles.length) bubbles[bubbles.length - 1].remove();
        input.value = text;
      }
      var msg = err && err.name === "AbortError" ? "The reply took too long. Try again." : (err && err.message) || "Something went wrong. Try again.";
      notice(msg);
    }).then(function () {
      if (timer) clearTimeout(timer);
      setBusy(false);
    });
  }

  function reset() {
    state = { messages: [], matches: [], selected: null };
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    renderLog();
    renderCards();
    statusEl.textContent = "Started a new conversation.";
    input.focus();
  }

  function loadGuideIndex() {
    fetch("data/gub.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("status");
      return r.json();
    }).then(function (data) {
      guide = {};
      (data.entries || []).forEach(function (e) { guide[e.id] = { title: e.title, section: e.section }; });
      renderCards();
    }).catch(function () { /* links to entries are simply omitted */ });
  }

  function init() {
    log = document.getElementById("log");
    input = document.getElementById("composer-input");
    form = document.getElementById("composer");
    sendBtn = document.getElementById("send-btn");
    statusEl = document.getElementById("status");
    resetBtn = document.getElementById("reset-btn");
    topBody = document.getElementById("top-body");
    shortBody = document.getElementById("short-body");
    detailsBody = document.getElementById("details-body");
    gaugeValue = document.getElementById("gauge-value");
    gaugeNum = document.getElementById("gauge-num");
    gaugeLabel = document.getElementById("gauge-label");

    load();
    renderLog();
    renderCards();
    loadGuideIndex();

    form.addEventListener("submit", function (ev) { ev.preventDefault(); send(input.value); });
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    input.addEventListener("keydown", function (ev) {
      // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards: Enter adds a line; use the Send button.
      if (ev.key === "Enter" && !ev.shiftKey && !coarse && !ev.isComposing) { ev.preventDefault(); send(input.value); }
    });
    resetBtn.addEventListener("click", reset);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
