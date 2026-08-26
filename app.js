/* =============================================================
   חפש את המטמון — לוגיקת המשחק
   אין שרת, אין בנייה. הכל רץ בדפדפן.

   מסלול המסכים:
   ברכה  ->  ספירה לאחור עד 17:00  ->  סרטון פתיחה  ->
   [ הזנת קוד  ->  סרטון  ->  התחנה הבאה ] × 5  ->  סיום
   ============================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'omri40.progress.v1';
  var stops = CONFIG.stops || [];

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    title: $('title'), subtitle: $('subtitle'), progress: $('progress'),
    musicBtn: $('music-btn'),
    screenGreeting: $('screen-greeting'), confetti: $('confetti'),
    gHello: $('g-hello'), gBig: $('g-big'),
    gLine1: $('g-line1'), gLine2: $('g-line2'), gLine3: $('g-line3'),
    screenCountdown: $('screen-countdown'), cdLabel: $('cd-label'),
    cdGrid: $('cd-grid'), cdOpen: $('cd-open'), cdSkip: $('cd-skip'),
    screenTravel: $('screen-travel'), trTitle: $('tr-title'), trBody: $('tr-body'),
    trStatus: $('tr-status'), trOpen: $('tr-open'), trManual: $('tr-manual'),
    screenCode: $('screen-code'), form: $('code-form'), input: $('code-input'),
    submit: $('submit-btn'), error: $('error'),
    screenVideo: $('screen-video'), villainTag: $('villain-tag'), stage: $('stage'),
    video: $('video'), playBtn: $('play-btn'), fallback: $('fallback'),
    videoCaption: $('video-caption'), skipBtn: $('skip-btn'),
    screenNext: $('screen-next'), nextLabel: $('next-label'), place: $('place'),
    speech: $('speech'), hint: $('hint'), continueBtn: $('continue-btn'),
    screenFinale: $('screen-finale'), finalePlace: $('finale-place'),
    finaleSpeech: $('finale-speech'), finaleHint: $('finale-hint'),
    gift: $('gift'), giftHeadline: $('gift-headline'), giftBody: $('gift-body'),
    giftImage: $('gift-image'),
    replayBtn: $('replay-btn'), mapLink: $('map-link'), foot: $('foot'),
    sheetTitle: $('sheet-title'),
    sheet: $('sheet'), sheetList: $('sheet-list'), sheetClose: $('sheet-close')
  };

  /* ── התאמת קוד סלחנית ────────────────────────────────────────
     אנחנו לא רוצים שעומרי ייכשל בגלל רווח, גרש או אות סופית
     בשמונה בערב באמצע הנמל.                                     */
  var FINALS = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };

  function normalize(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (FINALS[c]) c = FINALS[c];
      // מסננים ניקוד, רווחים, גרשיים ומקפים
      if (/[\s'"׳״\-_.,!?]/.test(c)) continue;
      if (c >= '֑' && c <= 'ׇ') continue; // ניקוד וטעמים
      out += c;
    }
    return out;
  }

  function digitsOnly(s) { return String(s).replace(/\D/g, ''); }

  /* ברקוד ארוך שהוקלד בטלפון — מספיק שארבע הספרות האחרונות תואמות.
     חל רק על קוד שהוא ספרות בלבד. קוד כמו "שרדר2018" הוא שם נבל ושנה,
     לא ברקוד: בלי התנאי הזה "שרדר2018" היה פותח גם את "אגמן2018",
     כי שתי השנים זהות. */
  function barcodeMatch(input, code) {
    var a = digitsOnly(input), b = String(code);
    if (!/^\d+$/.test(b)) return false;      // הקוד אינו ברקוד
    if (!/^\d+$/.test(input.trim())) return false; // גם הקלט חייב להיות ספרות
    if (a.length < 4 || b.length < 4) return false;
    return a.slice(-4) === b.slice(-4);
  }

  function stopMatchesInput(stop, input) {
    var n = normalize(input);
    if (!n) return false;
    for (var i = 0; i < stop.codes.length; i++) {
      var code = stop.codes[i];
      if (normalize(code) === n) return true;
      if (barcodeMatch(input, code)) return true;
    }
    return false;
  }

  /* ── מצב ─────────────────────────────────────────────────── */
  // unlocked = מספר התחנות שכבר נפתחו = האינדקס של התחנה הבאה בתור
  // greeted  = הברכה של הבוקר כבר רצה, אין צורך להריץ שוב
  var state = { unlocked: 0, greeted: false, route: null };
  var strikes = 0;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw) || {};
      var n = parseInt(parsed.unlocked, 10);
      if (!isNaN(n)) state.unlocked = Math.max(0, Math.min(n, stops.length));
      state.greeted = !!parsed.greeted;
      state.route = typeof parsed.route === 'string' ? parsed.route : null;
    } catch (e) { /* מצב פרטי / אחסון חסום — פשוט מתחילים מאפס */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ── מסכים ───────────────────────────────────────────────── */
  var SCREENS = ['screenGreeting', 'screenCountdown', 'screenTravel', 'screenCode',
                 'screenVideo', 'screenNext', 'screenFinale'];

  var PRE_GAME = { screenGreeting: 1, screenCountdown: 1 };

  /* ── מוזיקת רקע ──────────────────────────────────────────────
     רצה בדיוק על המסכים שלפני המשחק, ונעצרת ברגע שיש וידאו —
     שני מקורות קול במקביל זה בלגן. */
  var music = null, musicWanted = false, gestureArmed = false;

  function musicEl() {
    if (music) return music;
    var m = CONFIG.music;
    if (!m || !m.src) return null;
    music = new Audio(m.src);
    music.loop = true;
    music.preload = 'auto';
    music.volume = typeof m.volume === 'number' ? m.volume : 1;
    return music;
  }

  /* iOS לא מנגן קול בלי מחווה של המשתמש. play() מחזיר Promise
     שנדחה במקרה כזה — ואז נתלים על הנגיעה הבאה, איפה שתהיה. */
  function musicTry() {
    var a = musicEl();
    if (!a || !musicWanted) return;
    var p = a.play();
    if (p && p.catch) p.catch(armGesture);
  }

  function armGesture() {
    if (!musicWanted) return;
    el.musicBtn.classList.remove('hidden');
    if (gestureArmed) return;
    gestureArmed = true;
    var once = function () {
      document.removeEventListener('pointerdown', once, true);
      gestureArmed = false;
      if (!musicWanted || !music || !music.paused) return;
      var p = music.play();
      if (p && p.then) p.then(hideMusicBtn, armGesture);
      else hideMusicBtn();
    };
    document.addEventListener('pointerdown', once, true);
  }

  function hideMusicBtn() { el.musicBtn.classList.add('hidden'); }

  function musicOn() {
    if (musicWanted) return;   // כבר מנגן — לא לאתחל מחדש במעבר מסך
    musicWanted = true;
    musicTry();
  }

  function musicOff() {
    musicWanted = false;
    hideMusicBtn();
    if (music) music.pause();
  }

  function show(name) {
    SCREENS.forEach(function (k) { el[k].classList.toggle('hidden', k !== name); });
    // לפני שהמשחק מתחיל אין טעם להראות כמה תחנות יש — זה מספר לו יותר מדי
    el.progress.classList.toggle('hidden', !!PRE_GAME[name]);
    // הכלים בתחתית שייכים למשחק עצמו, לא לברכה ולספירה
    el.foot.classList.toggle('hidden', !!PRE_GAME[name]);
    if (name !== 'screenVideo') stopVideo();
    if (name !== 'screenCountdown') stopCountdown();
    if (name !== 'screenTravel') stopWatching();
    if (PRE_GAME[name]) musicOn(); else musicOff();
    window.scrollTo(0, 0);
  }

  function renderProgress() {
    el.progress.textContent = '';
    for (var i = 0; i < stops.length; i++) {
      var pip = document.createElement('span');
      pip.className = 'pip' +
        (i < state.unlocked ? ' done' : (i === state.unlocked ? ' current' : ''));
      el.progress.appendChild(pip);
    }
    el.replayBtn.hidden = state.unlocked === 0;
  }

  /* ── ברכת הבוקר ──────────────────────────────────────────── */
  var CONFETTI_COLORS = ['#ffc94d', '#ff3b5c', '#7cff5c', '#c9a6ff', '#fff'];

  function buildConfetti() {
    el.confetti.textContent = '';
    for (var i = 0; i < 30; i++) {
      var bit = document.createElement('i');
      bit.style.left = (Math.random() * 100).toFixed(2) + '%';
      bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      bit.style.animationDuration = (2.6 + Math.random() * 2.4).toFixed(2) + 's';
      bit.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
      el.confetti.appendChild(bit);
    }
  }

  var greetTimer = null;

  function runGreeting() {
    if (greetTimer) { clearTimeout(greetTimer); greetTimer = null; }
    var g = CONFIG.greeting;
    el.gHello.textContent = g.name;
    el.gBig.textContent = g.big;
    el.gLine1.textContent = g.line1;
    el.gLine2.textContent = g.line2;
    el.gLine3.textContent = g.line3;
    buildConfetti();
    show('screenGreeting');

    var done = function () {
      if (!greetTimer) return;
      clearTimeout(greetTimer);
      greetTimer = null;
      el.screenGreeting.removeEventListener('click', done);
      state.greeted = true;
      save();
      go(resumeRoute(), true);
    };
    // נגיעה במסך מדלגת קדימה, אחרת ממשיכים לבד
    el.screenGreeting.addEventListener('click', done);
    greetTimer = setTimeout(done, (g.seconds || 6) * 1000);
  }

  /* ── ספירה לאחור ─────────────────────────────────────────── */
  var cdTimer = null;

  // נקרא בכל טיק ולא פעם אחת באתחול, כדי שאפשר יהיה לשנות את שעת
  // ההתחלה ב-config.js (או בשטח) בלי לגעת בקוד
  function startsAt() { return new Date(CONFIG.countdown.startsAt).getTime(); }

  function stopCountdown() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  }

  function cell(value, unit, pad) {
    var box = document.createElement('div');
    box.className = 'cd-cell';
    var num = document.createElement('div');
    num.className = 'cd-num';
    num.textContent = pad && value < 10 ? '0' + value : String(value);
    var lab = document.createElement('div');
    lab.className = 'cd-unit';
    lab.textContent = unit;
    box.appendChild(num);
    box.appendChild(lab);
    return box;
  }

  function renderCountdown() {
    var u = CONFIG.countdown.units;
    var left = startsAt() - Date.now();

    if (left <= 0) {
      stopCountdown();
      el.cdLabel.textContent = CONFIG.countdown.ready;
      el.cdGrid.textContent = '';
      el.cdGrid.classList.add('cd-ready');
      el.cdOpen.textContent = CONFIG.countdown.open;
      el.cdOpen.classList.remove('hidden');
      el.cdSkip.classList.add('hidden');   // כבר אין על מה לדלג
      return;
    }

    var total = Math.floor(left / 1000);
    var days = Math.floor(total / 86400);
    var hours = Math.floor(total % 86400 / 3600);
    var mins = Math.floor(total % 3600 / 60);
    var secs = total % 60;

    el.cdGrid.textContent = '';
    if (days > 0) el.cdGrid.appendChild(cell(days, u.days, false));
    el.cdGrid.appendChild(cell(hours, u.hours, true));
    el.cdGrid.appendChild(cell(mins, u.minutes, true));
    el.cdGrid.appendChild(cell(secs, u.seconds, true));
  }

  function runCountdown() {
    el.cdLabel.textContent = CONFIG.countdown.label;
    el.cdGrid.classList.remove('cd-ready');
    el.cdOpen.classList.add('hidden');
    // ⚠️ זמני: כפתור דילוג גלוי לבדיקות. נשלט מ-CONFIG.countdown.showSkipButton
    el.cdSkip.textContent = CONFIG.countdown.skipLabel || 'דלג';
    el.cdSkip.classList.toggle('hidden', !CONFIG.testMode);
    show('screenCountdown');
    renderCountdown();
    stopCountdown();
    cdTimer = setInterval(renderCountdown, 1000);
  }

  /* ── שער ההגעה לפארק ─────────────────────────────────────────
     השער היחיד שלא נפתח בקוד. עומרי צופה בסרטון הראשון מהבית,
     נוסע, וכשהוא בתוך הרדיוס הסרטון השני נפתח.

     כלל ברזל: הגיאו הוא תוספת, לא תנאי. אם ההרשאה נדחתה, אם אין
     קליטה, או אם פשוט עברו manualAfterSeconds — מופיע כפתור ידני.
     עומרי לא אמור להיתקע ברחוב בגלל GPS.                        */
  var watchId = null, manualTimer = null;

  function stopWatching() {
    if (watchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
    }
    watchId = null;
    if (manualTimer) { clearTimeout(manualTimer); manualTimer = null; }
  }

  /* מרחק בין שתי נקודות על פני כדור הארץ, במטרים */
  function metersBetween(lat1, lng1, lat2, lng2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function humanDistance(m) {
    return m >= 1000 ? (m / 1000).toFixed(1) + ' ק\"מ' : Math.round(m) + ' מטר';
  }

  function showManual() {
    el.trManual.classList.remove('hidden');
  }

  function arrivedAtPark(stop) {
    stopWatching();
    var a = CONFIG.arrival;
    el.trStatus.textContent = a.arrived;
    el.trStatus.classList.add('close');
    el.trOpen.classList.remove('hidden');
    el.trManual.classList.add('hidden');
    // הפתיחה דורשת נגיעה — גם לדרמה וגם כדי שהדפדפן ירשה קול
    el.trOpen.onclick = function () {
      var i = stops.indexOf(stop);
      if (i === state.unlocked) { state.unlocked = i + 1; save(); renderProgress(); }
      go('#/stop/' + (i + 1));
    };
  }

  function runTravel(stop) {
    var a = CONFIG.arrival;
    el.trTitle.textContent = a.title;
    el.trBody.textContent = a.body;
    el.trStatus.textContent = a.searching;
    el.trStatus.classList.remove('close');
    el.trOpen.textContent = a.open;
    el.trOpen.classList.add('hidden');
    el.trManual.textContent = a.manualLabel;
    el.trManual.classList.add('hidden');
    el.trManual.onclick = function () { arrivedAtPark(stop); };
    show('screenTravel');

    stopWatching();
    if (CONFIG.testMode) showManual();
    else manualTimer = setTimeout(showManual, (a.manualAfterSeconds || 45) * 1000);

    if (!navigator.geolocation) {
      el.trStatus.textContent = a.denied;
      showManual();
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var d = metersBetween(pos.coords.latitude, pos.coords.longitude, a.lat, a.lng);
        if (d <= a.radiusMeters) { arrivedAtPark(stop); return; }
        el.trStatus.textContent = a.distance + ' ' + humanDistance(d);
      },
      function () {
        el.trStatus.textContent = a.denied;
        showManual();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  /* ── סרטון ───────────────────────────────────────────────── */
  var skipTimer = null;

  function stopVideo() {
    // מנתקים את המאזינים לפני ניקוי ה-src, אחרת ניקוי מקור
    // יכול להצית onerror מיותר ולהקפיץ את מסך הגיבוי
    el.video.onended = null;
    el.video.onerror = null;
    el.video.onloadedmetadata = null;
    try { el.video.pause(); } catch (e) {}
    el.video.removeAttribute('src');
    try { el.video.load(); } catch (e) {}
    if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }
  }

  /* נגן אחד משרת גם סרטוני נבלים וגם את סרטון "הקוד שגוי".
     opts: {src, villain, caption, poster, transcript, onDone, doneLabel} */
  function playClip(opts) {
    stopVideo();

    el.villainTag.textContent = opts.villain || '';
    el.videoCaption.textContent = opts.caption || '';
    el.videoCaption.classList.toggle('hidden', !opts.caption);
    el.fallback.textContent = CONFIG.ui.videoMissing + ' ' + (opts.transcript || '');
    el.fallback.classList.add('hidden'); // מופיע רק אם הניגון נכשל
    el.skipBtn.classList.add('hidden');
    el.playBtn.classList.remove('hidden');
    el.playBtn.querySelector('.play-label').textContent = CONFIG.ui.play;
    el.stage.style.backgroundImage = opts.poster ? 'url("' + opts.poster + '")' : '';
    el.stage.style.aspectRatio = '';

    el.video.src = opts.src;
    el.video.load();

    // הסרטונים לא בהכרח באותו יחס — מתאימים את הבמה למה שנטען בפועל
    el.video.onloadedmetadata = function () {
      if (el.video.videoWidth && el.video.videoHeight) {
        el.stage.style.aspectRatio = el.video.videoWidth + ' / ' + el.video.videoHeight;
      }
    };

    el.video.onended = opts.onDone;

    // אם הסרטון לא קיים או לא מתנגן — לא נותנים למשחק להיתקע
    el.video.onerror = function () {
      el.playBtn.classList.add('hidden');
      if (opts.transcript) el.fallback.classList.remove('hidden');
      el.skipBtn.classList.remove('hidden');
      el.skipBtn.textContent = opts.doneLabel;
    };

    el.playBtn.onclick = function () {
      el.playBtn.classList.add('hidden');
      var p = el.video.play();
      if (p && p.catch) p.catch(function () { el.video.onerror(); });
      // רשת ביטחון: אחרי 3 שניות מופיע כפתור דילוג במקרה של תקיעה
      skipTimer = setTimeout(function () {
        el.skipBtn.classList.remove('hidden');
        el.skipBtn.textContent = 'דלג';
      }, 3000);
    };

    el.skipBtn.onclick = opts.onDone;

    show('screenVideo');
  }

  function openVideo(stop) {
    var i = stops.indexOf(stop);
    playClip({
      src: stop.video,
      villain: stop.villain,
      poster: stop.poster,
      transcript: stop.next.text,
      doneLabel: CONFIG.ui.nextLabel,
      onDone: function () {
        go(stop.finale ? '#/finale' : '#/next/' + (i + 1));
      }
    });
  }

  /* סרטון האחיין שנפתח אחרי 3 טעויות ברצף */
  function openStrikeVideo() {
    var s = CONFIG.strikes;
    var stop = stops[Math.min(state.unlocked, stops.length - 1)];
    playClip({
      src: (stop && stop.wrongVideo) || s.video,
      caption: s.caption,
      doneLabel: s.back,
      onDone: function () { go('#/code', true); }
    });
  }

  /* ── חשיפת התחנה הבאה ──────────────────────────────────────
     שתי הפונקציות האלה רק מציירות. הניווט נעשה ב-go(). */
  function renderFinale(stop) {
      setMapLink(stop.next.mapUrl);
      el.finalePlace.textContent = stop.next.place;
      el.finaleSpeech.textContent = stop.next.text;
      el.finaleHint.textContent = stop.next.hint || '';
      if (CONFIG.revealGiftInApp) {
        el.giftHeadline.textContent = CONFIG.gift.headline;
        el.giftBody.textContent = CONFIG.gift.body;
        if (CONFIG.gift.image) {
          el.giftImage.src = CONFIG.gift.image;
          el.giftImage.classList.remove('hidden');
        }
        el.gift.classList.remove('hidden');
      } else {
        el.gift.classList.add('hidden');
      }
      show('screenFinale');
  }

  /* מפה: ברירת מחדל מ-CONFIG.map, אבל תחנה יכולה לגבור עם next.mapUrl —
     בסוף המסלול זו כבר לא מפת הפארק אלא הדרך למסעדה. */
  function setMapLink(url) {
    var map = CONFIG.map || {};
    var href = url || map.url;
    if (!href) { el.mapLink.hidden = true; return; }
    el.mapLink.href = href;
    el.mapLink.textContent = map.label || 'מפה';
    el.mapLink.hidden = false;
  }

  function renderNext(stop) {
    setMapLink(stop.next.mapUrl);
    el.nextLabel.textContent = CONFIG.ui.nextLabel;
    el.place.textContent = stop.next.place;
    el.speech.textContent = stop.next.text;
    el.hint.textContent = stop.next.hint || '';
    el.continueBtn.textContent = stop.next.continueLabel || CONFIG.ui.continueDefault;
    show('screenNext');
  }

  /* ── שליחת קוד ───────────────────────────────────────────── */
  function fail(message) {
    el.error.textContent = message;
    el.screenCode.classList.remove('shake');
    void el.screenCode.offsetWidth; // מאלץ הפעלה מחדש של האנימציה
    el.screenCode.classList.add('shake');
  }

  function handleSubmit(event) {
    event.preventDefault();
    var value = el.input.value;
    el.error.textContent = '';

    if (!normalize(value)) { fail(CONFIG.ui.empty); return; }

    // מותר לפתוח רק את התחנה הנוכחית, או לחזור על תחנה שכבר נפתחה.
    // ניחוש של קוד עתידי נכשל — אי אפשר לקפוץ לסוף.
    for (var i = 0; i <= state.unlocked && i < stops.length; i++) {
      // הפתיחה נפתחת לפי שעון וההגעה לפי מיקום — לא בהקלדה
      if (stops[i].auto || stops[i].geo) continue;
      if (stopMatchesInput(stops[i], value)) {
        if (i === state.unlocked) {
          state.unlocked = i + 1;
          save();
          renderProgress();
        }
        strikes = 0;
        el.input.value = '';
        el.input.blur();
        go('#/stop/' + (i + 1));
        return;
      }
    }

    // טעות. אחרי 3 ברצף — האחיין נכנס לתמונה.
    strikes++;
    el.input.value = '';
    // Math.max(1,...) — הגדרה של 0 עדיין אומרת "מיד", לא "אף פעם"
    if (strikes >= Math.max(1, CONFIG.strikes.mistakesForVideo || 1)) {
      strikes = 0;
      go('#/wrong');
      return;
    }
    fail(CONFIG.ui.wrong);
  }

  /* ── ניתוב ומשמרות ─────────────────────────────────────────
     הכתובות קיימות בשביל נוחות בדיקה ובשביל שכפתור "אחורה" יעבוד
     כמו "המסך הקודם" ולא כמו "צא מהאתר".

     המשמר: אף כתובת לא יכולה לקחת את עומרי קדימה. מקור האמת נשאר
     state.unlocked; הכתובת רק מבקשת, והמשמר מאשר או מחזיר אותו
     למסך הנוכחי. הקלדת #/stop/6 באמצע המשחק לא תעבוד.

       #/greeting     הברכה
       #/countdown    הספירה לאחור
       #/code         הזנת קוד
       #/stop/N       הסרטון של תחנה N   (1-based)
       #/next/N       הרמז לתחנה הבאה
       #/wrong        סרטון "הקוד שגוי"
       #/finale       מסך הסיום
  */

  function parseRoute(hash) {
    var m;
    if (hash === '#/greeting')  return { kind: 'greeting' };
    if (hash === '#/countdown') return { kind: 'countdown' };
    if (hash === '#/code')      return { kind: 'code' };
    if (hash === '#/travel')    return { kind: 'travel' };
    if (hash === '#/wrong')     return { kind: 'wrong' };
    if (hash === '#/finale')    return { kind: 'finale' };
    if ((m = /^#\/stop\/(\d+)$/.exec(hash))) return { kind: 'stop', i: +m[1] - 1 };
    if ((m = /^#\/next\/(\d+)$/.exec(hash))) return { kind: 'next', i: +m[1] - 1 };
    return null;
  }

  function seen(i) { return i >= 0 && i < state.unlocked; }

  /* האם התחנה שבתור נפתחת לפי מיקום */
  function waitingOnGeo() {
    var nextStop = stops[state.unlocked];
    return !!(nextStop && nextStop.geo);
  }

  function allowed(route) {
    if (!route) return false;
    switch (route.kind) {
      case 'greeting':  return true;
      case 'countdown': return state.greeted;
      // מסך הקוד שייך רק לתחנה שנפתחת בקוד. בזמן שהוא בדרך לפארק
      // אין שם מה לעשות, ולתת לו לנחות שם רק יבלבל אותו.
      case 'code':      return state.unlocked > 0 && !waitingOnGeo();
      // השער נגיש רק כשהתחנה שבתור היא באמת תחנת-מיקום
      case 'travel':    return waitingOnGeo();
      case 'wrong':     return state.unlocked > 0 && !waitingOnGeo();
      case 'stop':      return seen(route.i);
      case 'next':      return seen(route.i) && !stops[route.i].finale;
      case 'finale':    return state.unlocked >= stops.length;
      default:          return false;
    }
  }

  /* המסך שעומרי אמור להיות בו עכשיו. חייב להיות תמיד מאושר,
     אחרת הפנייה-מחדש הייתה נכנסת ללולאה. */
  function currentRoute() {
    if (!state.greeted) return '#/greeting';
    if (state.unlocked === 0) return '#/countdown';
    var nextStop = stops[state.unlocked];
    if (nextStop && nextStop.geo) return '#/travel';
    return '#/code';
  }

  /* לאן לחזור אחרי הברכה: למסך המדויק שהוא היה בו לאחרונה, אם הוא
     עדיין מותר. ככה פתיחה של הלינק העירום באמצע המשחק לא מאבדת את
     המקום — הוא רואה את הברכה וחוזר בדיוק לאן שהיה. */
  function resumeRoute() {
    var saved = parseRoute(state.route);
    return saved && allowed(saved) ? state.route : currentRoute();
  }

  /* המסכים שלא שווה לחזור אליהם: הברכה היא נקודת כניסה, ו"הקוד שגוי"
     הוא רגע חולף שאין טעם לשחזר אותו בפתיחה מחדש. */
  var NOT_RESUMABLE = { greeting: 1, wrong: 1 };

  function render(route) {
    switch (route.kind) {
      case 'greeting':  runGreeting(); break;
      case 'countdown': runCountdown(); break;
      case 'code':      setMapLink(null); show('screenCode'); break;
      case 'travel':    setMapLink(null); runTravel(stops[state.unlocked]); break;
      case 'stop':      setMapLink(null); openVideo(stops[route.i]); break;
      case 'next':      renderNext(stops[route.i]); break;
      case 'finale':    renderFinale(stops[stops.length - 1]); break;
      case 'wrong':     openStrikeVideo(); break;
    }
  }

  /* דפדפנים יורים גם popstate וגם hashchange על אותו ניווט, ו-render
     שרץ פעמיים היה מאתחל מחדש סרטון או ברכה באמצע. לכן זוכרים מה כבר
     צויר ומדלגים על ציור כפול. ניווט יזום מעביר force ומצייר בכל מקרה. */
  var renderedHash = null;

  function applyRoute(depth, force) {
    var hash = location.hash;

    // כתובת עירומה (בלי hash) תמיד נכנסת דרך הברכה
    if (!hash || hash === '#' || hash === '#/') {
      history.replaceState(null, '', location.pathname + location.search + '#/greeting');
      applyRoute((depth || 0) + 1, force);
      return;
    }

    var route = parseRoute(hash);
    if (!allowed(route)) {
      if (depth > 1) return; // רשת ביטחון; currentRoute תמיד מאושר
      history.replaceState(null, '', location.pathname + location.search + currentRoute());
      applyRoute((depth || 0) + 1, force);
      return;
    }
    if (!NOT_RESUMABLE[route.kind] && state.route !== location.hash) {
      state.route = location.hash;
      save();
    }

    if (!force && location.hash === renderedHash) return;
    renderedHash = location.hash;
    render(route);
  }

  function go(hash, replace) {
    if (location.hash !== hash) {
      var url = location.pathname + location.search + hash;
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    }
    applyRoute(0, true);
  }

  /* ── תפריטים ─────────────────────────────────────────────── */
  /* שני תפריטים, אותו ארגז:
     'replay'   — לעומרי. רק הודעות שהוא כבר ראה, בלי לגלות כלום קדימה.
     'operator' — לנו. כל התחנות, קפיצה לכל אחת, ואיפוס. לחיצה ארוכה על הכותרת.
     ההפרדה חשובה: תפריט אחד משותף היה מדפיס לעומרי את כל המסלול. */
  function buildSheet(mode) {
    var operator = mode === 'operator';
    el.sheetTitle.textContent = operator ? 'תפריט מפעיל' : CONFIG.ui.replay;
    el.sheetList.textContent = '';

    var count = 0;
    stops.forEach(function (stop, i) {
      if (!operator && i >= state.unlocked) return; // עדיין לא ראה — לא מציגים
      count++;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-item' + (operator && i > state.unlocked ? ' locked' : '');
      b.textContent = (i + 1) + '. ' + (stop.villain || stop.id) +
                      (operator ? ' → ' + stop.next.place : '');
      b.onclick = function () {
        if (operator) {
          state.unlocked = Math.max(state.unlocked, i + 1);
          state.greeted = true;
          save();
          renderProgress();
        }
        closeSheet();
        go('#/stop/' + (i + 1));
      };
      el.sheetList.appendChild(b);
    });

    if (!count) {
      var empty = document.createElement('p');
      empty.className = 'sheet-empty';
      empty.textContent = 'עוד אין הודעות.';
      el.sheetList.appendChild(empty);
    }

    if (operator) {
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'sheet-item danger';
      reset.textContent = CONFIG.ui.reset;
      reset.onclick = function () {
        state.unlocked = 0;
        state.greeted = false;
        state.route = null;
        strikes = 0;
        save();
        renderProgress();
        el.input.value = '';
        closeSheet();
        go('#/greeting', true);
      };
      el.sheetList.appendChild(reset);
    }
  }

  function openSheet(mode) { buildSheet(mode); el.sheet.classList.remove('hidden'); }
  function closeSheet() { el.sheet.classList.add('hidden'); }

  function wireLongPress(node, onLongPress) {
    var timer = null;
    var start = function () {
      clearTimeout(timer);
      timer = setTimeout(onLongPress, 900);
    };
    var cancel = function () { clearTimeout(timer); };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('mousedown', start);
    ['touchend', 'touchmove', 'touchcancel', 'mouseup', 'mouseleave']
      .forEach(function (e) { node.addEventListener(e, cancel); });
  }

  /* ── אתחול ───────────────────────────────────────────────── */
  function init() {
    document.title = CONFIG.title;
    el.title.textContent = CONFIG.title;
    el.subtitle.textContent = CONFIG.subtitle;
    el.input.placeholder = CONFIG.ui.codePlaceholder;
    el.submit.textContent = CONFIG.ui.submit;
    el.replayBtn.textContent = CONFIG.ui.replay;

    setMapLink(null);

    /* ?skip=1 מקדים את שעת ההתחלה, כך שהספירה כבר "בשלה" והכפתור
       מופיע מיד. לבדיקות בלבד. הפרמטר נשאר בכתובת בכוונה, כדי
       שרענון וניווט בין מסכים ימשיכו לדלג. */
    if (/[?&]skip=1(&|$)/.test(location.search)) {
      CONFIG.countdown.startsAt = '1970-01-01T00:00:00+03:00';
    }

    /* ?reset=1 מאפס הכל וחוזר לברכה — קיצור לבדיקות.
       מנקים את הכתובת מיד אחרי, כדי שרענון לא יאפס שוב באמצע המשחק. */
    if (/[?&]reset=1(&|$)/.test(location.search)) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      // מסירים רק את reset ומשאירים פרמטרים אחרים (למשל skip=1),
      // אחרת רענון היה מאבד את הדילוג על הספירה
      var rest = location.search.replace(/([?&])reset=1(&|$)/, '$1').replace(/[?&]$/, '');
      if (rest === '?') rest = '';
      if (history.replaceState) history.replaceState(null, '', location.pathname + rest);
    }

    load();
    renderProgress();

    el.form.addEventListener('submit', handleSubmit);
    el.input.addEventListener('input', function () { el.error.textContent = ''; });

    el.cdSkip.addEventListener('click', function () {
      CONFIG.countdown.startsAt = '1970-01-01T00:00:00+03:00';
      renderCountdown();
    });

    el.cdOpen.addEventListener('click', function () {
      if (state.unlocked === 0) {
        state.unlocked = 1;
        save();
        renderProgress();
      }
      go('#/stop/1');
    });

    el.continueBtn.addEventListener('click', function () {
      var nextStop = stops[state.unlocked];
      if (nextStop && nextStop.geo) { go('#/travel'); return; }
      go('#/code');
      el.input.focus();
    });

    el.musicBtn.title = (CONFIG.music && CONFIG.music.hint) || '';
    el.musicBtn.addEventListener('click', function (e) {
      // הכפתור יושב מחוץ לכרטיס הברכה, אבל עדיין עוצרים —
      // נגיעה כאן היא בקשה למוזיקה, לא דילוג קדימה.
      e.stopPropagation();
      musicWanted = true;
      var a = musicEl();
      if (!a) return;
      var p = a.play();
      if (p && p.then) p.then(hideMusicBtn, function () {}); else hideMusicBtn();
    });

    el.replayBtn.addEventListener('click', function () { openSheet('replay'); });
    el.sheetClose.addEventListener('click', closeSheet);
    el.sheet.addEventListener('click', function (e) {
      if (e.target === el.sheet) closeSheet();
    });

    wireLongPress(el.title, function () { openSheet('operator'); });

    window.addEventListener('popstate', function () { applyRoute(0, false); });
    window.addEventListener('hashchange', function () { applyRoute(0, false); });
    applyRoute(0, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
