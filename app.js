/* ===================== ZEON MUSIC — APP.JS (ES5 ONLY) ===================== */
/* No arrow functions, no const/let, no template literals, no destructuring. */

var API_BASE = "http://localhost:5000";

var state = {
  queue: [],
  queueIndex: -1,
  currentSong: null,
  isPlaying: false,
  shuffle: false,
  repeatMode: "off", // off | all | one
  volume: 0.7,
  muted: false,
  aiMood: "chill",
  aiLang: "tamil",
  srcFilter: "all",
  typeFilter: "songs",
  liked: [],
  history: [],
  playlists: [],
  downloads: [],
  session: null,
  pendingAuthEmail: "",
  onboardLang: "tamil",
  onboardSelected: [],
  autoplayLoading: false
};

var audioEl = null;

/* Song cache — avoids embedding raw JSON (with quotes/apostrophes) directly
   into onclick attributes, which was corrupting row HTML and hiding titles. */
var songCache = {};
var songCacheSeq = 0;
function cacheSong(song) {
  var key = "s" + (songCacheSeq++);
  songCache[key] = song;
  return key;
}
function getCachedSong(key) {
  return songCache[key];
}

/* ---------------- INIT ---------------- */
function initApp() {
  audioEl = document.getElementById("audioPlayer");
  loadLiked();
  loadHist();
  loadPls();
  loadSession();
  bindAudioEvents();
  bindGlobalClicks();
  setVolumeUI(state.volume);
  checkBackend();
  renderHistList();
  renderLikedList();
  renderDlList();
  runSplash();

  if (!state.session) {
    setTimeout(openAuthModal, 1600);
  } else {
    greetSession();
    verifySession();
  }

  // Instant suggestions on open — nobody should land on an empty home screen
  loadTrending();
  loadHomeAiRecs();

  toast("Zeon Music ready");
}

function runSplash() {
  var el = document.getElementById("splash");
  if (!el) return;
  setTimeout(function () {
    el.className = "splash out";
    setTimeout(function () {
      el.style.display = "none";
    }, 500);
  }, 1100);
}

function checkBackend() {
  var el = document.getElementById("beStatus");
  if (!el) return;
  el.textContent = "connecting...";
  fetchJSON(API_BASE + "/api/health", function (ok, data) {
    if (ok) {
      el.textContent = "backend online";
    } else {
      el.textContent = "backend offline";
    }
  });
}

/* ---------------- FETCH HELPERS (ES5) ---------------- */
function fetchJSON(url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.timeout = 15000;
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      var ok = xhr.status >= 200 && xhr.status < 300;
      cb(ok, data);
    }
  };
  xhr.onerror = function () { cb(false, null); };
  xhr.ontimeout = function () { cb(false, null); };
  xhr.send();
}

function postJSON(url, body, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.timeout = 15000;
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      var ok = xhr.status >= 200 && xhr.status < 300;
      cb(ok, data);
    }
  };
  xhr.onerror = function () { cb(false, null); };
  xhr.ontimeout = function () { cb(false, null); };
  xhr.send(JSON.stringify(body));
}

/* ---------------- NAVIGATION ---------------- */
function nav(screen) {
  var screens = document.getElementsByClassName("screen");
  var i;
  for (i = 0; i < screens.length; i++) {
    screens[i].className = screens[i].className.replace(" on", "");
  }
  var target = document.getElementById("sc-" + screen);
  if (target) target.className = target.className + " on";

  var links = document.getElementsByClassName("sb-link");
  for (i = 0; i < links.length; i++) {
    links[i].className = links[i].className.replace(" on", "");
    if (links[i].getAttribute("data-screen") === screen) {
      links[i].className = links[i].className + " on";
    }
  }
  hideSb();
  closeCtxMenu();

  if (screen === "ai") loadAI();
  if (screen === "charts") loadChart("billboard", document.querySelector(".tab.on"));
  if (screen === "settings") renderSettingsScreen();
}

function showSb() {
  document.getElementById("plsb").className = "sidebar on";
  document.getElementById("sbOverlay").className = "sb-overlay on";
}
function hideSb() {
  document.getElementById("plsb").className = "sidebar";
  document.getElementById("sbOverlay").className = "sb-overlay";
}

/* ---------------- AUTH (real accounts — email + password + OTP) ---------------- */
function loadSession() {
  try {
    var raw = localStorage.getItem("zeon_session");
    state.session = raw ? JSON.parse(raw) : null;
  } catch (e) { state.session = null; }
}
function saveSessionToStorage() {
  try { localStorage.setItem("zeon_session", JSON.stringify(state.session)); } catch (e) {}
}
function clearSessionStorage() {
  try { localStorage.removeItem("zeon_session"); } catch (e) {}
}

function verifySession() {
  if (!state.session || !state.session.token) return;
  fetchJSON(API_BASE + "/api/user/me?token=" + encodeURIComponent(state.session.token), function (ok, data) {
    if (!ok || !data || !data.ok) {
      // token invalid (e.g. backend restarted) — ask them to log in again
      state.session = null;
      clearSessionStorage();
      setTimeout(openAuthModal, 500);
      return;
    }
    state.session.artists = data.artists || [];
    state.session.displayName = data.display_name || "";
    state.session.avatar = data.avatar || "🎧";
    saveSessionToStorage();
    greetSession();
    renderFavArtists();
    loadTrending();

    if (!state.session.displayName) {
      setTimeout(openProfileSetupModal, 400);
    } else if (state.session.artists.length < 3) {
      setTimeout(openOnboardModal, 400);
    } else {
      loadHomeAiRecs();
    }
  });
}

function getFavoriteArtistNames() {
  if (!state.session || !state.session.artists) return [];
  var names = [];
  for (var i = 0; i < state.session.artists.length; i++) {
    names.push(state.session.artists[i].artist);
  }
  return names;
}

function greetSession() {
  if (!state.session) return;
  var name = state.session.displayName || state.session.email.split("@")[0];
  var heroEl = document.getElementById("heroSub");
  if (heroEl) heroEl.textContent = "Welcome back, " + name;
  var sbName = document.getElementById("sbProfileName");
  if (sbName) sbName.textContent = name;
  var sbAvatar = document.getElementById("sbAvatar");
  if (sbAvatar) sbAvatar.textContent = state.session.avatar || "🎧";
}

/* ---------------- PROFILE SETUP (username + avatar, one-time after signup) ---------------- */
var pendingAvatar = "🎧";
function openProfileSetupModal() {
  var modal = document.getElementById("profileSetupModal");
  if (!modal) return;
  pendingAvatar = (state.session && state.session.avatar) || "🎧";
  modal.className = "modal-overlay on";
}
function closeProfileSetupModal() {
  var modal = document.getElementById("profileSetupModal");
  if (modal) modal.className = "modal-overlay";
}
function pickAvatar(emoji, el) {
  pendingAvatar = emoji;
  var chips = document.getElementById("avatarPicker").getElementsByClassName("avatar-chip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "avatar-chip";
  el.className = "avatar-chip selected";
}
function saveProfileSetup() {
  var username = document.getElementById("profileUsernameInput").value.replace(/^\s+|\s+$/g, "");
  var errEl = document.getElementById("profileSetupError");
  if (!username) { errEl.textContent = "Enter a username"; return; }
  errEl.textContent = "";

  postJSON(API_BASE + "/api/user/profile", { token: state.session.token, display_name: username, avatar: pendingAvatar }, function (ok, data) {
    if (!ok || !data || !data.ok) {
      errEl.textContent = (data && data.error) || "Could not save — check backend";
      return;
    }
    state.session.displayName = username;
    state.session.avatar = pendingAvatar;
    saveSessionToStorage();
    closeProfileSetupModal();
    greetSession();
    if (state.session.artists.length < 3) {
      setTimeout(openOnboardModal, 300);
    } else {
      loadHomeAiRecs();
    }
  });
}

function openAuthModal() {
  var modal = document.getElementById("authModal");
  if (!modal) return;
  document.getElementById("authStepChoice").style.display = "block";
  document.getElementById("authStepOtp").style.display = "none";
  modal.className = "modal-overlay on";
}
function closeAuthModal() {
  var modal = document.getElementById("authModal");
  if (modal) modal.className = "modal-overlay";
}
function showAuthError(msg) {
  document.getElementById("authError").textContent = msg || "";
}
function showOtpError(msg) {
  document.getElementById("authOtpError").textContent = msg || "";
}

function startSignup() {
  var email = document.getElementById("authEmail").value.replace(/^\s+|\s+$/g, "");
  var password = document.getElementById("authPassword").value;
  showAuthError("");
  if (!email || email.indexOf("@") === -1) { showAuthError("Enter a valid email"); return; }
  if (!password || password.length < 4) { showAuthError("Password must be at least 4 characters"); return; }

  state.pendingAuthEmail = email;
  postJSON(API_BASE + "/api/auth/signup", { email: email, password: password }, function (ok, data) {
    if (!ok || !data || !data.ok) {
      showAuthError((data && data.error) || "Signup failed — check backend");
      return;
    }
    document.getElementById("authStepChoice").style.display = "none";
    document.getElementById("authStepOtp").style.display = "block";
    document.getElementById("authOtpSub").textContent = "We sent a 6-digit code to " + email;
    showOtpError("");
  });
}

function startLogin() {
  var email = document.getElementById("authEmail").value.replace(/^\s+|\s+$/g, "");
  var password = document.getElementById("authPassword").value;
  showAuthError("");
  if (!email || !password) { showAuthError("Enter your email and password"); return; }

  postJSON(API_BASE + "/api/auth/login", { email: email, password: password }, function (ok, data) {
    if (!ok || !data || !data.ok) {
      showAuthError((data && data.error) || "Login failed — check backend");
      return;
    }
    state.session = { token: data.token, email: data.email, artists: [] };
    saveSessionToStorage();
    closeAuthModal();
    verifySession();
  });
}

function submitOtp() {
  var otp = document.getElementById("authOtpInput").value.replace(/^\s+|\s+$/g, "");
  showOtpError("");
  if (!otp) { showOtpError("Enter the OTP"); return; }

  postJSON(API_BASE + "/api/auth/verify-otp", { email: state.pendingAuthEmail, otp: otp }, function (ok, data) {
    if (!ok || !data || !data.ok) {
      showOtpError((data && data.error) || "Verification failed");
      return;
    }
    state.session = { token: data.token, email: data.email, artists: [], displayName: "", avatar: "🎧" };
    saveSessionToStorage();
    closeAuthModal();
    setTimeout(openProfileSetupModal, 300);
  });
}

function resendOtp() {
  postJSON(API_BASE + "/api/auth/resend-otp", { email: state.pendingAuthEmail }, function (ok, data) {
    if (ok && data && data.ok) {
      toast("New OTP sent");
    } else {
      showOtpError("Could not resend — try again in a bit");
    }
  });
}

function openAccountMenu() {
  if (!state.session) {
    openAuthModal();
    return;
  }
  nav("settings");
}

function logout() {
  state.session = null;
  clearSessionStorage();
  location.reload();
}

/* ---------------- FAVORITE ARTISTS DISPLAY (home + settings) ---------------- */
function artistCardHtml(a) {
  return (
    '<div class="artist-item selected">' +
      '<img src="' + (a.image || "") + '" alt="">' +
      '<span>' + escapeHtml(a.artist) + '</span>' +
    '</div>'
  );
}

function renderFavArtists() {
  var hasArtists = state.session && state.session.artists && state.session.artists.length > 0;
  var homeSec = document.getElementById("favArtistsSec");
  var homeRow = document.getElementById("favArtistsRow");
  if (homeSec && homeRow) {
    if (hasArtists) {
      var html = "";
      for (var i = 0; i < state.session.artists.length; i++) {
        html += artistCardHtml(state.session.artists[i]);
      }
      homeRow.innerHTML = html;
      homeSec.style.display = "block";
    } else {
      homeSec.style.display = "none";
    }
  }
}

function renderSettingsScreen() {
  if (!state.session) return;
  document.getElementById("settingsName").textContent = state.session.displayName || state.session.email.split("@")[0];
  document.getElementById("settingsEmail").textContent = state.session.email;
  document.getElementById("settingsAvatar").textContent = state.session.avatar || "🎧";

  var row = document.getElementById("settingsArtistsRow");
  if (state.session.artists && state.session.artists.length > 0) {
    var html = "";
    for (var i = 0; i < state.session.artists.length; i++) {
      html += artistCardHtml(state.session.artists[i]);
    }
    row.innerHTML = html;
  } else {
    row.innerHTML = '<span class="empty-hint">No favorite artists picked yet</span>';
  }
}

/* ---------------- LANGUAGE-AWARE TRENDING (Instagram/Spotify-feed style) ---------------- */
function getDominantLanguage() {
  if (!state.session || !state.session.artists || state.session.artists.length === 0) {
    return state.aiLang || "tamil";
  }
  var counts = {};
  for (var i = 0; i < state.session.artists.length; i++) {
    var lang = state.session.artists[i].language || "tamil";
    counts[lang] = (counts[lang] || 0) + 1;
  }
  var best = "tamil";
  var bestCount = -1;
  for (var lang2 in counts) {
    if (counts[lang2] > bestCount) {
      bestCount = counts[lang2];
      best = lang2;
    }
  }
  return best;
}

function languageToChart(lang) {
  if (lang === "english") return "billboard";
  if (lang === "hindi") return "india";
  return "tamil";
}

/* ---------------- ARTIST ONBOARDING (min 3, across languages) ---------------- */
function openOnboardModal() {
  var modal = document.getElementById("onboardModal");
  if (!modal) return;
  state.onboardLang = "tamil";
  state.onboardSelected = (state.session && state.session.artists) ? state.session.artists.slice() : [];
  renderOnboardSelected();
  modal.className = "modal-overlay on";
}
function closeOnboardModal() {
  var modal = document.getElementById("onboardModal");
  if (modal) modal.className = "modal-overlay";
}

function setOnboardLang(lang, el) {
  state.onboardLang = lang;
  var chips = document.getElementById("onboardLangTabs").getElementsByClassName("chip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "chip";
  el.className = "chip on";
  document.getElementById("onboardSearchResults").innerHTML = "";
  document.getElementById("onboardSearchInput").value = "";
}

var onboardSearchTimer = null;
function onOnboardSearch() {
  var q = document.getElementById("onboardSearchInput").value;
  if (onboardSearchTimer) clearTimeout(onboardSearchTimer);
  if (!q || q.length < 2) {
    document.getElementById("onboardSearchResults").innerHTML = "";
    return;
  }
  onboardSearchTimer = setTimeout(function () { doOnboardSearch(q); }, 350);
}

var artistSearchCache = {};
var artistSearchSeq = 0;

function doOnboardSearch(q) {
  var container = document.getElementById("onboardSearchResults");
  fetchJSON(API_BASE + "/api/search/artists?q=" + encodeURIComponent(q), function (ok, data) {
    if (!ok || !data || !data.results || data.results.length === 0) {
      container.innerHTML = '<span class="empty-hint">No artists found</span>';
      return;
    }
    var html = "";
    for (var i = 0; i < data.results.length; i++) {
      var a = data.results[i];
      var key = "art" + (artistSearchSeq++);
      artistSearchCache[key] = a;
      html +=
        '<div class="artist-item" data-key="' + key + '" onclick="addOnboardArtistByKey(this)">' +
          '<img src="' + (a.image || "") + '" alt="">' +
          '<span>' + escapeHtml(a.name) + '</span>' +
        '</div>';
    }
    container.innerHTML = html;
  });
}

function addOnboardArtistByKey(el) {
  var key = el.getAttribute("data-key");
  var a = artistSearchCache[key];
  if (!a) return;
  for (var i = 0; i < state.onboardSelected.length; i++) {
    if (state.onboardSelected[i].artist.toLowerCase() === a.name.toLowerCase()) {
      toast("Already added");
      return;
    }
  }
  state.onboardSelected.push({ artist: a.name, language: state.onboardLang, image: a.image || "" });
  renderOnboardSelected();
}

function removeOnboardArtist(idx) {
  state.onboardSelected.splice(idx, 1);
  renderOnboardSelected();
}

function renderOnboardSelected() {
  var el = document.getElementById("onboardSelected");
  var label = document.getElementById("onboardCountLabel");
  var html = "";
  for (var i = 0; i < state.onboardSelected.length; i++) {
    var a = state.onboardSelected[i];
    html +=
      '<div class="artist-item selected">' +
        '<img src="' + (a.image || "") + '" alt="">' +
        '<span>' + escapeHtml(a.artist) + '</span>' +
        '<button class="artist-remove" onclick="removeOnboardArtist(' + i + ')">&times;</button>' +
      '</div>';
  }
  el.innerHTML = html || '<span class="empty-hint">No artists picked yet</span>';
  label.textContent = "Selected: " + state.onboardSelected.length + " / 3 minimum";
}

function finishOnboarding() {
  var errEl = document.getElementById("onboardError");
  if (state.onboardSelected.length < 3) {
    errEl.textContent = "Pick at least 3 artists to continue";
    return;
  }
  errEl.textContent = "";
  postJSON(API_BASE + "/api/user/artists", { token: state.session.token, artists: state.onboardSelected }, function (ok, data) {
    if (!ok || !data || !data.ok) {
      errEl.textContent = "Could not save — check backend";
      return;
    }
    state.session.artists = state.onboardSelected;
    saveSessionToStorage();
    closeOnboardModal();
    toast("Your taste profile is ready!");
    renderFavArtists();
    loadTrending();
    loadHomeAiRecs();
    renderSettingsScreen();
  });
}

/* ---------------- MOOD / FILTER CHIPS ---------------- */
function quickMood(mood) {
  state.aiMood = mood;
  nav("ai");
  var chips = document.querySelectorAll("#aiMoodChips .chip");
  for (var i = 0; i < chips.length; i++) {
    if (chips[i].getAttribute("data-mood") === mood) {
      setAiMood(mood, chips[i]);
    }
  }
}

function setAiMood(mood, el) {
  state.aiMood = mood;
  var chips = document.getElementById("aiMoodChips").getElementsByClassName("chip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "chip";
  el.className = "chip on";
  loadAI();
}

function setLang(lang, el) {
  state.aiLang = lang;
  var chips = document.getElementById("langChips").getElementsByClassName("chip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "chip";
  el.className = "chip on";
  loadAI();
}

function setSrcFilter(v, el) {
  state.srcFilter = v;
  var chips = document.getElementById("srcFilter").getElementsByClassName("fchip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "fchip";
  el.className = "fchip on";
  onSearchInput();
}

function setTypeFilter(v, el) {
  state.typeFilter = v;
  var chips = document.getElementById("typeFilter").getElementsByClassName("fchip");
  for (var i = 0; i < chips.length; i++) chips[i].className = "fchip";
  el.className = "fchip on";
  onSearchInput();
}

/* ---------------- SEARCH (debounced) ---------------- */
var searchTimer = null;
function onSearchInput() {
  var q = document.getElementById("msearch").value;
  if (searchTimer) clearTimeout(searchTimer);
  if (!q || q.length < 2) {
    document.getElementById("sres").innerHTML = '<div class="empty-hint">Search for something to get started</div>';
    return;
  }
  searchTimer = setTimeout(function () { doSearch(q); }, 350);
}

function doSearch(q) {
  var container = document.getElementById("sres");
  container.innerHTML = '<div class="skeleton-row"></div>';
  var url = API_BASE + "/api/search?q=" + encodeURIComponent(q) + "&source=" + state.srcFilter + "&type=" + state.typeFilter + "&limit=20";
  fetchJSON(url, function (ok, data) {
    if (!ok) {
      container.innerHTML = '<div class="empty-hint">Backend not reachable — make sure py app.py is running</div>';
      return;
    }
    if (!data || !data.results || data.results.length === 0) {
      container.innerHTML = '<div class="empty-hint">No results found</div>';
      return;
    }
    renderSongList(container, data.results);
  });
}

/* ---------------- TRENDING (home + charts) ---------------- */
function loadTrending() {
  var container = document.getElementById("trendList");
  if (!container) return;

  var lang = getDominantLanguage();
  var chart = languageToChart(lang);
  var titleEl = document.getElementById("trendingTitle");
  if (titleEl) {
    var label = lang.charAt(0).toUpperCase() + lang.slice(1);
    titleEl.textContent = "Trending Today — " + label;
  }

  fetchJSON(API_BASE + "/api/trending?chart=" + chart + "&limit=20", function (ok, data) {
    if (!ok) {
      container.innerHTML = '<div class="empty-hint">Backend not reachable — make sure py app.py is running</div>';
      return;
    }
    if (!data || !data.results || data.results.length === 0) {
      container.innerHTML = '<div class="empty-hint">No trending songs found right now</div>';
      return;
    }
    renderSongList(container, data.results, true);
  });
}

function loadHomeAiRecs() {
  var container = document.getElementById("aiHomeRecs");
  if (!container) return;
  var body = {
    mood: state.aiMood,
    language: state.aiLang,
    liked: state.liked,
    history: state.history,
    favorite_artists: getFavoriteArtistNames()
  };
  postJSON(API_BASE + "/api/mood-mix", body, function (ok, data) {
    if (!ok) {
      container.innerHTML = '<div class="empty-hint">Backend not reachable — make sure py app.py is running</div>';
      return;
    }
    if (!data || !data.results || data.results.length === 0) {
      container.innerHTML = '<div class="empty-hint">Play a few songs so AI can learn your taste</div>';
      return;
    }
    renderCardRow(container, data.results.slice(0, 10));
  });
}

/* ---------------- AI MIX (screen) ---------------- */
function loadAI() {
  var container = document.getElementById("aiCards");
  container.innerHTML = '<div class="skeleton-row"></div>';
  var body = {
    mood: state.aiMood,
    language: state.aiLang,
    liked: state.liked,
    history: state.history,
    favorite_artists: getFavoriteArtistNames()
  };
  postJSON(API_BASE + "/api/mood-mix", body, function (ok, data) {
    if (!ok) {
      container.innerHTML = '<div class="empty-hint">Backend not reachable — make sure py app.py is running</div>';
      return;
    }
    if (!data || !data.results || data.results.length === 0) {
      container.innerHTML = '<div class="empty-hint">No songs found for this mood/language combo — try another</div>';
      return;
    }
    renderSongList(container, data.results);
  });
}

/* ---------------- CHARTS ---------------- */
function loadChart(kind, el) {
  if (el) {
    var tabs = document.getElementById("chartTabs").getElementsByClassName("tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].className = "tab";
    el.className = "tab on";
  }
  var container = document.getElementById("chartList");
  container.innerHTML = '<div class="skeleton-row"></div>';
  fetchJSON(API_BASE + "/api/trending?chart=" + kind, function (ok, data) {
    if (!ok) {
      container.innerHTML = '<div class="empty-hint">Backend not reachable — make sure py app.py is running</div>';
      return;
    }
    if (!data || !data.results || data.results.length === 0) {
      container.innerHTML = '<div class="empty-hint">No chart data found</div>';
      return;
    }
    renderSongList(container, data.results, true);
  });
}

/* ---------------- RENDER HELPERS ---------------- */
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rowH(song, idx, numbered) {
  var key = cacheSong(song);
  var num = numbered ? '<span class="sn">' + (idx + 1) + '</span>' : '<span class="sn"></span>';
  var src = song.src === "yt" ? '<span class="ssrc yt">YT</span>' : '<span class="ssrc sv">SAAVN</span>';
  var thumb = song.thumbnail ? song.thumbnail : "";
  var title = song.title ? song.title : "Untitled";
  var artist = song.artist ? song.artist : "Unknown artist";
  return (
    '<div class="sr" data-key="' + key + '" onclick="rowClick(event,this)">' +
      num +
      '<img class="sth" src="' + thumb + '" alt="">' +
      '<div class="si2">' +
        '<div class="stit">' + escapeHtml(title) + '</div>' +
        '<div class="sar">' + escapeHtml(artist) + '</div>' +
      '</div>' +
      src +
      '<span class="sdur">' + (song.duration || "") + '</span>' +
      '<button class="icon-btn smo" data-key="' + key + '" onclick="ctxMenuClick(event,this)">&#8942;</button>' +
    '</div>'
  );
}

function cardH(song) {
  var key = cacheSong(song);
  var thumb = song.thumbnail ? song.thumbnail : "";
  var title = song.title ? song.title : "Untitled";
  var artist = song.artist ? song.artist : "Unknown artist";
  return (
    '<div class="card" data-key="' + key + '" onclick="rowClick(event,this)">' +
      '<img src="' + thumb + '" alt="">' +
      '<div class="ctit">' + escapeHtml(title) + '</div>' +
      '<div class="cart">' + escapeHtml(artist) + '</div>' +
    '</div>'
  );
}

function renderSongList(container, songs, numbered) {
  var html = "";
  for (var i = 0; i < songs.length; i++) html += rowH(songs[i], i, numbered);
  container.innerHTML = html;
}

function renderCardRow(container, songs) {
  var html = "";
  for (var i = 0; i < songs.length; i++) html += cardH(songs[i]);
  container.innerHTML = html;
}

function rowClick(evt, el) {
  var key = el.getAttribute("data-key");
  var song = getCachedSong(key);
  if (song) playSong(song);
}

/* ---------------- PLAYER ---------------- */
function playSong(song) {
  state.currentSong = song;
  state.isPlaying = true;
  updatePlayerUI(song);
  addToHistory(song);

  var streamEndpoint = song.src === "yt"
    ? API_BASE + "/api/stream/yt/" + song.id
    : API_BASE + "/api/stream/saavn/" + song.id;

  fetchJSON(streamEndpoint, function (ok, data) {
    if (ok && data && data.stream_url) {
      audioEl.src = data.stream_url;
      audioEl.play();
    } else {
      toast("Could not load stream — check backend");
    }
  });

  loadSimilar(song);
}

function updatePlayerUI(song) {
  document.getElementById("ptit").textContent = song.title || "Untitled";
  document.getElementById("part").textContent = song.artist || "Unknown artist";
  document.getElementById("pth").src = song.thumbnail || "";

  document.getElementById("fspTitle").textContent = song.title || "Untitled";
  document.getElementById("fspArtist").textContent = song.artist || "Unknown artist";
  document.getElementById("fspArt").src = song.thumbnail || "";
  document.getElementById("fspSrcTag").textContent = song.src === "yt" ? "YOUTUBE" : "SAAVN";

  setPlayIcon(true);
  setLikeUI(isLiked(song));
}

function setPlayIcon(playing) {
  var playBtn = document.getElementById("playBtn");
  var fspPlay = document.getElementById("fspPlay");
  var icon = playing
    ? '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  playBtn.innerHTML = icon;
  fspPlay.innerHTML = icon.replace(/width="22" height="22"/g, 'width="28" height="28"');
  state.isPlaying = playing;
}

function togglePlay() {
  if (!state.currentSong) return;
  if (audioEl.paused) {
    audioEl.play();
    setPlayIcon(true);
  } else {
    audioEl.pause();
    setPlayIcon(false);
  }
}

function next() {
  if (state.queue.length === 0) {
    autoplayMore(function () { next(); });
    return;
  }
  if (state.shuffle) {
    state.queueIndex = Math.floor(Math.random() * state.queue.length);
  } else {
    state.queueIndex = state.queueIndex + 1;
    if (state.queueIndex >= state.queue.length) {
      // Reached the end — keep the feed going, Instagram/Spotify-radio style
      autoplayMore(function () {
        state.queueIndex = state.queue.length - 1 >= 0 ? state.queueIndex : 0;
        if (state.queue.length > 0) {
          state.queueIndex = state.queueIndex % state.queue.length;
          playSong(state.queue[state.queueIndex]);
        }
      });
      return;
    }
  }
  playSong(state.queue[state.queueIndex]);
}

function prev() {
  if (state.queue.length === 0) return;
  state.queueIndex = state.queueIndex - 1;
  if (state.queueIndex < 0) state.queueIndex = state.queue.length - 1;
  playSong(state.queue[state.queueIndex]);
}

/* Auto-continue the queue with personalized picks once it runs out —
   based on liked songs + history, same idea as an Instagram/Spotify feed. */
function autoplayMore(cb) {
  if (state.autoplayLoading) return;
  state.autoplayLoading = true;
  toast("Finding more songs for you...");
  var body = { history: state.history, liked: state.liked, favorite_artists: getFavoriteArtistNames() };
  postJSON(API_BASE + "/api/recommend", body, function (ok, data) {
    state.autoplayLoading = false;
    if (ok && data && data.results && data.results.length > 0) {
      for (var i = 0; i < data.results.length; i++) {
        state.queue.push(data.results[i]);
      }
      document.getElementById("qBadge").textContent = state.queue.length;
      document.getElementById("queueCount").textContent = state.queue.length;
      renderQ();
      if (cb) cb();
    } else {
      toast("Couldn't find more songs — pick a mood to keep going");
    }
  });
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  var btn = document.getElementById("shuf");
  var fspBtn = document.getElementById("fspShuf");
  if (state.shuffle) { btn.className = "icon-btn on"; fspBtn.className = "icon-btn on"; }
  else { btn.className = "icon-btn"; fspBtn.className = "icon-btn"; }
}

function toggleRepeat() {
  if (state.repeatMode === "off") state.repeatMode = "all";
  else if (state.repeatMode === "all") state.repeatMode = "one";
  else state.repeatMode = "off";
  var on = state.repeatMode !== "off";
  document.getElementById("rep").className = on ? "icon-btn on" : "icon-btn";
  document.getElementById("fspRep").className = on ? "icon-btn on" : "icon-btn";
  toast("Repeat: " + state.repeatMode);
}

function bindAudioEvents() {
  audioEl.addEventListener("timeupdate", function () {
    if (!audioEl.duration) return;
    var pct = (audioEl.currentTime / audioEl.duration) * 100;
    document.getElementById("pfill").style.width = pct + "%";
    document.getElementById("fspFill").style.width = pct + "%";
    document.getElementById("pct").textContent = fmtTime(audioEl.currentTime);
    document.getElementById("fspCt").textContent = fmtTime(audioEl.currentTime);
    document.getElementById("pdt").textContent = fmtTime(audioEl.duration);
    document.getElementById("fspDt").textContent = fmtTime(audioEl.duration);
  });
  audioEl.addEventListener("ended", function () {
    if (state.repeatMode === "one") {
      audioEl.currentTime = 0;
      audioEl.play();
    } else {
      next();
    }
  });
}

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" + s : s);
}

function seek(e) {
  seekOn(e, "progBar");
}
function seekFsp(e) {
  seekOn(e, "fspProg");
}
function seekOn(e, barId) {
  if (!audioEl.duration) return;
  var bar = document.getElementById(barId);
  var rect = bar.getBoundingClientRect();
  var pct = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * audioEl.duration;
}

function setVol(e) {
  var bar = document.getElementById("volBar");
  var rect = bar.getBoundingClientRect();
  var pct = (e.clientX - rect.left) / rect.width;
  if (pct < 0) pct = 0;
  if (pct > 1) pct = 1;
  state.volume = pct;
  audioEl.volume = pct;
  setVolumeUI(pct);
}

function setVolumeUI(pct) {
  document.getElementById("vfill").style.width = (pct * 100) + "%";
}

function toggleMute() {
  state.muted = !state.muted;
  audioEl.muted = state.muted;
}

/* ---------------- LIKE / HISTORY / PLAYLISTS (localStorage) ---------------- */
function isLiked(song) {
  for (var i = 0; i < state.liked.length; i++) {
    if (state.liked[i].id === song.id) return true;
  }
  return false;
}

function toggleLike() {
  if (!state.currentSong) return;
  likeSong(state.currentSong);
}

function likeSong(song) {
  if (isLiked(song)) {
    var next = [];
    for (var i = 0; i < state.liked.length; i++) {
      if (state.liked[i].id !== song.id) next.push(state.liked[i]);
    }
    state.liked = next;
  } else {
    state.liked.push(song);
  }
  saveLiked();
  if (state.currentSong && state.currentSong.id === song.id) {
    setLikeUI(isLiked(song));
  }
  renderLikedList();
}

function setLikeUI(liked) {
  var plk = document.getElementById("plk");
  var fspLike = document.getElementById("fspLike");
  plk.className = liked ? "icon-btn on" : "icon-btn";
  fspLike.className = liked ? "icon-btn on" : "icon-btn";
}

function saveLiked() {
  try { localStorage.setItem("zeon_liked", JSON.stringify(state.liked)); } catch (e) {}
}
function loadLiked() {
  try {
    var raw = localStorage.getItem("zeon_liked");
    state.liked = raw ? JSON.parse(raw) : [];
  } catch (e) { state.liked = []; }
}
function renderLikedList() {
  var el = document.getElementById("likedList");
  if (state.liked.length === 0) {
    el.innerHTML = '<div class="empty-hint">Songs you like will appear here</div>';
    return;
  }
  renderSongList(el, state.liked);
}

function addToHistory(song) {
  var next = [song];
  for (var i = 0; i < state.history.length; i++) {
    if (state.history[i].id !== song.id) next.push(state.history[i]);
  }
  state.history = next.slice(0, 50);
  saveHist();
  renderHistList();
}
function saveHist() {
  try { localStorage.setItem("zeon_history", JSON.stringify(state.history)); } catch (e) {}
}
function loadHist() {
  try {
    var raw = localStorage.getItem("zeon_history");
    state.history = raw ? JSON.parse(raw) : [];
  } catch (e) { state.history = []; }
}
function renderHistList() {
  var el = document.getElementById("histList");
  if (state.history.length === 0) {
    el.innerHTML = '<div class="empty-hint">Your recently played songs will show up here</div>';
  } else {
    renderSongList(el, state.history);
  }
  var recentEl = document.getElementById("recentCards");
  if (state.history.length === 0) {
    recentEl.innerHTML = '<div class="empty-hint">Play something to see it here</div>';
  } else {
    renderCardRow(recentEl, state.history.slice(0, 10));
  }
}

function savePls() {
  try { localStorage.setItem("zeon_playlists", JSON.stringify(state.playlists)); } catch (e) {}
}
function loadPls() {
  try {
    var raw = localStorage.getItem("zeon_playlists");
    state.playlists = raw ? JSON.parse(raw) : [];
  } catch (e) { state.playlists = []; }
}
function renderDlList() {
  var el = document.getElementById("dlList");
  if (state.downloads.length === 0) {
    el.innerHTML = '<div class="empty-hint">No downloads yet</div>';
  } else {
    renderSongList(el, state.downloads);
  }
}

function createPlaylist() {
  var name = prompt("Playlist name:");
  if (!name) return;
  state.playlists.push({ id: "pl_" + Date.now(), name: name, songs: [] });
  savePls();
  toast("Playlist created: " + name);
}

function addSongToPlaylistPrompt(song) {
  if (state.playlists.length === 0) {
    var name = prompt("No playlists yet. Create one now — enter a name:");
    if (!name) return;
    state.playlists.push({ id: "pl_" + Date.now(), name: name, songs: [song] });
    savePls();
    toast("Added to " + name);
    return;
  }
  var names = [];
  for (var i = 0; i < state.playlists.length; i++) names.push((i + 1) + ". " + state.playlists[i].name);
  var choice = prompt("Add to which playlist?\n" + names.join("\n") + "\n\n(type the number, or 0 for a new playlist)");
  if (choice === null) return;
  var idx = parseInt(choice, 10) - 1;
  if (idx === -1) {
    var newName = prompt("New playlist name:");
    if (!newName) return;
    state.playlists.push({ id: "pl_" + Date.now(), name: newName, songs: [song] });
    savePls();
    toast("Added to " + newName);
    return;
  }
  if (state.playlists[idx]) {
    state.playlists[idx].songs.push(song);
    savePls();
    toast("Added to " + state.playlists[idx].name);
  }
}

function playAllHero() {
  if (state.history.length > 0) {
    state.queue = state.history;
    state.queueIndex = 0;
    playSong(state.queue[0]);
  } else {
    toast("Nothing to play yet — search or pick a mood first");
  }
}

function playPlaylist() {
  toast("Playlist playback coming soon");
}

/* ---------------- QUEUE ---------------- */
function addQ(song) {
  state.queue.push(song);
  document.getElementById("qBadge").textContent = state.queue.length;
  document.getElementById("queueCount").textContent = state.queue.length;
  renderQ();
  toast("Added to queue");
}

function playNextInQueue(song) {
  var insertAt = state.queueIndex + 1;
  state.queue.splice(insertAt, 0, song);
  document.getElementById("qBadge").textContent = state.queue.length;
  document.getElementById("queueCount").textContent = state.queue.length;
  renderQ();
  toast("Will play next");
}

function renderQ() {
  var el = document.getElementById("queueList");
  if (state.queue.length === 0) {
    el.innerHTML = '<div class="empty-hint">Queue is empty</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < state.queue.length; i++) {
    var song = state.queue[i];
    var playing = i === state.queueIndex;
    html +=
      '<div class="queue-row' + (playing ? ' on' : '') + '">' +
        '<img src="' + (song.thumbnail || "") + '" onclick="playQueueItem(' + i + ')" alt="">' +
        '<div onclick="playQueueItem(' + i + ')">' +
          '<div class="qtit">' + escapeHtml(song.title || "Untitled") + '</div>' +
          '<div class="qart">' + escapeHtml(song.artist || "Unknown artist") + '</div>' +
        '</div>' +
        '<button class="queue-del" onclick="removeQueueItem(' + i + ')">&times;</button>' +
      '</div>';
  }
  el.innerHTML = html;
}

function playQueueItem(idx) {
  if (!state.queue[idx]) return;
  state.queueIndex = idx;
  playSong(state.queue[idx]);
  renderQ();
}

function removeQueueItem(idx) {
  state.queue.splice(idx, 1);
  if (idx < state.queueIndex) {
    state.queueIndex--;
  } else if (idx === state.queueIndex) {
    // removed the currently playing item — keep the index pointed at
    // what is now the "next" song without forcing playback to jump
    state.queueIndex = Math.min(state.queueIndex, state.queue.length - 1);
  }
  document.getElementById("qBadge").textContent = state.queue.length;
  document.getElementById("queueCount").textContent = state.queue.length;
  renderQ();
  toast("Removed from queue");
}

function toggleQueue() {
  document.getElementById("rpanelTitle").textContent = "Queue";
  showQueueTab();
  document.getElementById("rpanel").className = "rpanel on";
}

/* ---------------- DOWNLOADS (stub — marks song as available offline) ---------------- */
function markDownload(song) {
  for (var i = 0; i < state.downloads.length; i++) {
    if (state.downloads[i].id === song.id) {
      toast("Already downloaded");
      return;
    }
  }
  state.downloads.push(song);
  try { localStorage.setItem("zeon_downloads", JSON.stringify(state.downloads)); } catch (e) {}
  renderDlList();
  toast("Download started");
}

/* ---------------- SLEEP TIMER ---------------- */
var sleepTimerHandle = null;
function openSleepTimerPrompt() {
  var mins = prompt("Sleep timer — stop playback after how many minutes?", "30");
  if (!mins) return;
  var n = parseInt(mins, 10);
  if (isNaN(n) || n <= 0) return;
  if (sleepTimerHandle) clearTimeout(sleepTimerHandle);
  sleepTimerHandle = setTimeout(function () {
    audioEl.pause();
    setPlayIcon(false);
    toast("Sleep timer — playback stopped");
  }, n * 60 * 1000);
  toast("Sleep timer set for " + n + " min");
}

/* ---------------- LYRICS ---------------- */
function openLyrics() {
  document.getElementById("rpanelTitle").textContent = "Lyrics";
  showLyricsTab();
  document.getElementById("rpanel").className = "rpanel on";
  if (!state.currentSong) return;
  var url = API_BASE + "/api/lyrics?title=" + encodeURIComponent(state.currentSong.title) + "&artist=" + encodeURIComponent(state.currentSong.artist);
  var lbody = document.getElementById("lbody");
  lbody.innerHTML = '<div class="empty-hint">Loading lyrics...</div>';
  fetchJSON(url, function (ok, data) {
    if (ok && data && data.lyrics) {
      lbody.innerHTML = "<p>" + escapeHtml(data.lyrics).replace(/\n/g, "<br>") + "</p>";
    } else {
      lbody.innerHTML = '<div class="empty-hint">No lyrics available</div>';
    }
  });
}

function closeRpanel() {
  document.getElementById("rpanel").className = "rpanel";
}
function showLyricsTab() {
  document.getElementById("lbody").style.display = "block";
  document.getElementById("queueList").style.display = "none";
  var tabs = document.getElementById("rpanel").getElementsByClassName("rtab");
  tabs[0].className = "rtab on";
  tabs[1].className = "rtab";
}
function showQueueTab() {
  document.getElementById("lbody").style.display = "none";
  document.getElementById("queueList").style.display = "block";
  renderQ();
  var tabs = document.getElementById("rpanel").getElementsByClassName("rtab");
  tabs[0].className = "rtab";
  tabs[1].className = "rtab on";
}

/* ---------------- SIMILAR SONGS ---------------- */
function loadSimilar(song) {
  var el = document.getElementById("simList");
  el.innerHTML = '<div class="skeleton-row"></div>';
  fetchJSON(API_BASE + "/api/similar/" + encodeURIComponent(song.title) + "/" + encodeURIComponent(song.artist), function (ok, data) {
    if (ok && data && data.results && data.results.length > 0) {
      renderSongList(el, data.results);
    } else {
      el.innerHTML = '<div class="empty-hint">No similar songs found</div>';
    }
  });
}

/* ---------------- FULL SCREEN PLAYER ---------------- */
function closeFsp() {
  document.getElementById("fsp").className = "fsp";
}
function openFsp() {
  document.getElementById("fsp").className = "fsp on";
}

/* ---------------- CONTEXT MENU (three dots) ---------------- */
function ctxMenuClick(evt, btnEl) {
  evt.stopPropagation();
  var key = btnEl.getAttribute("data-key");
  var song = getCachedSong(key);
  if (!song) return;
  openCtxMenu(song, btnEl);
}

function openCtxMenu(song, anchorEl) {
  closeCtxMenu();
  var menu = document.getElementById("ctxMenu");
  if (!menu) return;

  var likedNow = isLiked(song);
  var likeLabel = likedNow ? "Remove from Liked Songs" : "Add to Liked Songs";

  menu.innerHTML =
    '<button class="ctx-item" onclick="ctxDownload()">Download</button>' +
    '<button class="ctx-item" onclick="ctxAddQueue()">Add to Queue</button>' +
    '<button class="ctx-item" onclick="ctxPlayNext()">Play Next</button>' +
    '<button class="ctx-item" onclick="ctxAddPlaylist()">Add to Playlist</button>' +
    '<button class="ctx-item" onclick="ctxLike()">' + likeLabel + '</button>' +
    '<button class="ctx-item" onclick="ctxSleepTimer()">Sleep Timer</button>';

  menu.__song = song;

  var rect = anchorEl.getBoundingClientRect();
  menu.style.top = (rect.bottom + window.scrollY + 4) + "px";
  var left = rect.left + window.scrollX - 150;
  if (left < 8) left = 8;
  menu.style.left = left + "px";
  menu.className = "ctx-menu on";
}

function closeCtxMenu() {
  var menu = document.getElementById("ctxMenu");
  if (!menu) return;
  menu.className = "ctx-menu";
  menu.__song = null;
}

function ctxDownload() {
  var menu = document.getElementById("ctxMenu");
  if (menu && menu.__song) markDownload(menu.__song);
  closeCtxMenu();
}
function ctxAddQueue() {
  var menu = document.getElementById("ctxMenu");
  if (menu && menu.__song) addQ(menu.__song);
  closeCtxMenu();
}
function ctxPlayNext() {
  var menu = document.getElementById("ctxMenu");
  if (menu && menu.__song) playNextInQueue(menu.__song);
  closeCtxMenu();
}
function ctxAddPlaylist() {
  var menu = document.getElementById("ctxMenu");
  var song = menu ? menu.__song : null;
  closeCtxMenu();
  if (song) addSongToPlaylistPrompt(song);
}
function ctxLike() {
  var menu = document.getElementById("ctxMenu");
  if (menu && menu.__song) likeSong(menu.__song);
  closeCtxMenu();
}
function ctxSleepTimer() {
  closeCtxMenu();
  openSleepTimerPrompt();
}

function bindGlobalClicks() {
  document.addEventListener("click", function (e) {
    var menu = document.getElementById("ctxMenu");
    if (!menu) return;
    if (menu.className.indexOf("on") === -1) return;
    if (e.target.className && String(e.target.className).indexOf("smo") !== -1) return;
    if (menu.contains(e.target)) return;
    closeCtxMenu();
  });
}

/* ---------------- TOAST ---------------- */
var toastTimer = null;
function toast(msg) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast on";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.className = "toast";
  }, 2200);
}

/* ---------------- BOOT ---------------- */
document.addEventListener("DOMContentLoaded", initApp);
