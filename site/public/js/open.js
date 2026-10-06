// "Open in Kitty" hands the link to the Kitty app as an Android intent pinned
// to its package. A custom kitty:// link would go to whichever installed app
// claims that scheme first, and these links carry keys that move money. An
// intent has no fragment, so the part after the # rides as the query; it
// stays on the phone either way. Without the app, the phone opens /download.
function KittyIntent() {
  var fallback = encodeURIComponent(location.origin + "/download");
  return "intent://" + location.host + location.pathname + "?" + location.hash.slice(1) +
    "#Intent;scheme=https;package=xyz.kitty.app;S.browser_fallback_url=" + fallback + ";end";
}
