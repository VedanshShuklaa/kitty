// The invite key and names live after the #, which never reaches a server.
// This page only reads them to greet the invitee and hand them to the app.
(function () {
  var hash = location.hash.slice(1), params = {};
  hash.split("&").forEach(function (p) { var i = p.indexOf("="); if (i > 0) params[p.slice(0, i)] = p.slice(i + 1); });
  // link text is the sender's to choose: no control or direction-flipping
  // characters, and short, so a link can't dress the page up as anything else
  var clean = function (s, n) { return String(s).replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "").slice(0, n); };
  try {
    var meta = JSON.parse(decodeURIComponent(params.m || ""));
    var seat = Number(location.pathname.split("/")[3]);
    if (meta.t) document.getElementById("title").textContent = clean(meta.t, 60);
    if (meta.n && meta.n[0]) {
      var who = meta.n[seat] ? clean(meta.n[seat], 30) + ", " : "";
      document.getElementById("lead").textContent = who + clean(meta.n[0], 30) + " invited you to join this savings circle on Kitty.";
    }
  } catch (e) {}
  document.getElementById("open").href = KittyIntent();
})();
