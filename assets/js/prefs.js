/* Theme toggle and text-size selector. Shared by every page.
   State lives on <html data-theme data-font-size>; choices are saved in localStorage
   (keys pref-theme and pref-font-size). The inline <head> script restores them before first paint. */
(function () {
  "use strict";
  var root = document.documentElement;
  var SIZE_NAMES = { sm: "Small", md: "Medium", lg: "Large", xl: "Extra large" };

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable: choice lasts for this page only */ }
  }

  function syncTheme() {
    var dark = root.getAttribute("data-theme") === "dark";
    var buttons = document.querySelectorAll(".theme-btn");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.setAttribute("aria-pressed", dark ? "true" : "false");
      b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      var text = b.querySelector(".theme-btn__text");
      if (text) text.textContent = dark ? "Light" : "Dark";
    }
  }

  function syncSize() {
    var current = root.getAttribute("data-font-size") || "md";
    var buttons = document.querySelectorAll(".size-btn");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var size = b.getAttribute("data-size");
      var on = size === current;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", SIZE_NAMES[size] + " text" + (on ? " (selected)" : ""));
    }
  }

  function init() {
    var themeButtons = document.querySelectorAll(".theme-btn");
    for (var i = 0; i < themeButtons.length; i++) {
      themeButtons[i].addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        save("pref-theme", next);
        syncTheme();
      });
    }
    var sizeButtons = document.querySelectorAll(".size-btn");
    for (var j = 0; j < sizeButtons.length; j++) {
      sizeButtons[j].addEventListener("click", function (ev) {
        var size = ev.currentTarget.getAttribute("data-size");
        if (!SIZE_NAMES[size]) return;
        root.setAttribute("data-font-size", size);
        save("pref-font-size", size);
        syncSize();
      });
    }
    syncTheme();
    syncSize();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
