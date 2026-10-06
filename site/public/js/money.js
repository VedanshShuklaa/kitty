// Pay links (/p/) and send links (/s/). Everything after the # stays in this
// browser: a send link's key is never sent to a server.
(function () {
  var kind = location.pathname.split("/")[1];
  var params = {};
  location.hash.slice(1).split("&").forEach(function (p) { var i = p.indexOf("="); if (i > 0) params[p.slice(0, i)] = p.slice(i + 1); });
  var name = "";
  try { name = decodeURIComponent(params.n || "").replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "").slice(0, 40); } catch (e) {}
  var title = document.getElementById("title"), lead = document.getElementById("lead");
  if (kind === "s") {
    title.textContent = (name || "Someone") + " sent you money";
    lead.textContent = "Collect it in the Kitty app. Until you do, the sender can take it back.";
    document.getElementById("warn").hidden = false;
  } else if (kind === "p") {
    title.textContent = "Send money to " + (name || "a Kitty member");
    lead.textContent = "Open Kitty to choose an amount. Your phone asks for your fingerprint before anything leaves your account.";
  }
  document.title = title.textContent;
  document.getElementById("open").href = KittyIntent();
})();
