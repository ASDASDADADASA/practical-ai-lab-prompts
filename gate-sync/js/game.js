/**
 * Gate Sync — core gameplay
 * Light moves forward; tap switches rail; match gate colors.
 */
(function () {
  'use strict';

  const COLORS = {
    cyan: '#2ec4b6',
    magenta: '#e85d75',
    amber: '#f4a261',
    wall: '#e8edf7',
    blank: null,
    bg: '#0f1219',
    rail: '#2a3344',
    light: '#f8f7f4',
    finish: '#7bdff2'
  };

  // L2 speed 264 → 0.75s = 198px min for 2-rail jumps
  // L3 speed ~303.6 → 0.75s ≈ 228px; twinWindow ≥ 0.9s
  const LEVELS = [
    {
      id: 1,
      name: 'Warm-up',
      rails: 2,
      speed: 220,
      items: [
        { d: 280, type: 'gate', rail: 0, color: 'cyan' },
        { d: 480, type: 'gate', rail: 1, color: 'magenta' },
        { d: 680, type: 'gate', rail: 0, color: 'cyan' },
        { d: 880, type: 'gate', rail: 1, color: 'magenta' },
        { d: 1080, type: 'gate', rail: 0, color: 'cyan' },
        { d: 1280, type: 'gate', rail: 1, color: 'magenta' },
        { d: 1500, type: 'finish' }
      ]
    },
    {
      id: 2,
      name: 'Split Path',
      rails: 3,
      speed: 220 * 1.2,
      items: [
        { d: 280, type: 'gate', rail: 1, color: 'amber' },
        { d: 500, type: 'gate', rail: 0, color: 'cyan' },
        { d: 720, type: 'blank' },
        { d: 940, type: 'gate', rail: 2, color: 'magenta' },
        { d: 1160, type: 'wall', rail: 1 },
        { d: 1400, type: 'gate', rail: 0, color: 'cyan' },
        { d: 1640, type: 'gate', rail: 2, color: 'amber' },
        { d: 1860, type: 'blank' },
        { d: 2080, type: 'wall', rail: 0 },
        { d: 2300, type: 'gate', rail: 1, color: 'magenta' },
        { d: 2520, type: 'gate', rail: 2, color: 'cyan' },
        { d: 2760, type: 'gate', rail: 0, color: 'amber' },
        { d: 2980, type: 'gate', rail: 1, color: 'magenta' },
        { d: 3200, type: 'gate', rail: 2, color: 'cyan' },
        { d: 3450, type: 'finish' }
      ]
    },
    {
      id: 3,
      name: 'Twin Gates',
      rails: 3,
      speed: 220 * 1.2 * 1.15,
      twinWindow: 0.9,
      items: [
        { d: 300, type: 'gate', rail: 0, color: 'cyan' },
        { d: 560, type: 'gate', rail: 2, color: 'magenta' },
        { d: 860, type: 'twin', rails: [0, 1], colors: ['cyan', 'amber'], correct: 1 },
        { d: 1120, type: 'blank' },
        { d: 1380, type: 'wall', rail: 2 },
        { d: 1660, type: 'gate', rail: 1, color: 'amber' },
        { d: 1960, type: 'twin', rails: [1, 2], colors: ['magenta', 'cyan'], correct: 0 },
        { d: 2240, type: 'gate', rail: 0, color: 'cyan' },
        { d: 2500, type: 'wall', rail: 1 },
        // hint @ 2740 - 0.9*speed ≈ 2467, before wall @ 2500
        { d: 2740, type: 'twin', rails: [0, 2], colors: ['amber', 'magenta'], correct: 1 },
        { d: 3020, type: 'gate', rail: 1, color: 'amber' },
        { d: 3280, type: 'gate', rail: 2, color: 'magenta' },
        { d: 3550, type: 'finish' }
      ]
    }
  ];

  // State
  let canvas, ctx;
  let W = 390, H = 700;
  let levelIndex = 0;
  let rail = 0;
  let dist = 0;
  let running = false;
  let paused = false;
  let missCount = 0;
  let attemptCount = 0;
  let lastTs = 0;
  let hitFlags = {};
  let twinActive = null; // { itemIdx }
  let flashFail = 0;
  let flashOk = 0;
  let moveBeat = 0;
  let overlayMode = 'start'; // start | fail | clear | allclear | none
  let stars = 0;

  const $ = (id) => document.getElementById(id);

  function level() {
    return LEVELS[levelIndex];
  }

  function railX(r, n) {
    const pad = 36;
    const usable = W - pad * 2;
    const step = usable / (n + 1);
    return pad + step * (r + 1);
  }

  function lightY() {
    return H * 0.72;
  }

  function worldToScreen(d) {
    return lightY() - (d - dist);
  }

  function resize() {
    const wrap = $('game-wrap');
    const rect = wrap.getBoundingClientRect();
    const maxW = Math.min(420, rect.width || 390);
    const maxH = Math.min(844, window.innerHeight - 120);
    W = Math.floor(maxW);
    H = Math.floor(Math.max(520, maxH));
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function resetLevel(soft) {
    const L = level();
    rail = Math.floor((L.rails - 1) / 2);
    dist = 0;
    hitFlags = {};
    twinActive = null;
    flashFail = 0;
    flashOk = 0;
    moveBeat = 0;
    if (!soft) missCount = 0;
    attemptCount += 1;
    running = false;
    overlayMode = soft ? 'fail' : (levelIndex === 0 && attemptCount <= 1 ? 'start' : 'none');
    updateTwinHint('');
    updateHUD();
    if (!soft && overlayMode === 'none') {
      running = true;
    }
    showOverlay();
  }

  function startRun() {
    unlockAudioOnce();
    overlayMode = 'none';
    running = true;
    lastTs = 0;
    showOverlay();
    updateHUD();
  }

  function unlockAudioOnce() {
    if (window.GateSyncAudio) {
      window.GateSyncAudio.unlock();
      const tip = $('sound-tip');
      if (tip) tip.classList.add('hidden');
    }
  }

  /** @param {number} [dir] 1 = next rail, -1 = previous; default 1 (Space / overlay) */
  function onTap(dir) {
    unlockAudioOnce();
    if (overlayMode === 'start') {
      startRun();
      return;
    }
    if (overlayMode === 'fail') {
      const L = level();
      rail = Math.floor((L.rails - 1) / 2);
      dist = 0;
      hitFlags = {};
      twinActive = null;
      flashFail = 0;
      flashOk = 0;
      moveBeat = 0;
      attemptCount += 1;
      updateTwinHint('');
      startRun();
      return;
    }
    if (overlayMode === 'clear') {
      levelIndex += 1;
      if (levelIndex >= LEVELS.length) {
        overlayMode = 'allclear';
        showOverlay();
        updateHUD();
        return;
      }
      missCount = 0;
      attemptCount = 0;
      if (levelIndex === 0) stars = 0;
      resetLevel(false);
      startRun();
      return;
    }
    if (overlayMode === 'allclear') {
      levelIndex = 0;
      missCount = 0;
      attemptCount = 0;
      stars = 0;
      resetLevel(false);
      startRun();
      return;
    }
    if (!running) return;

    const step = dir == null ? 1 : dir;
    const n = level().rails;
    rail = (rail + step + n) % n;
    if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-tap');
  }

  function fail(reason) {
    running = false;
    missCount += 1;
    flashFail = 0.35;
    if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-fail');
    overlayMode = 'fail';
    $('overlay-sub').textContent = reason || 'Miss — tap to retry';
    twinActive = null;
    updateTwinHint('');
    showOverlay();
    updateHUD();
  }

  function clearLevel() {
    running = false;
    if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-clear');
    if (levelIndex === 2) {
      if (missCount === 0) stars = 3;
      else if (missCount <= 2) stars = 2;
      else stars = 1;
    } else {
      stars = 0;
    }
    overlayMode = 'clear';
    twinActive = null;
    updateTwinHint('');
    showOverlay();
    updateHUD();
  }

  function checkCollisions() {
    const L = level();
    const ly = lightY();
    const hitBand = 14;

    for (let i = 0; i < L.items.length; i++) {
      if (hitFlags[i]) continue;
      const it = L.items[i];
      const sy = worldToScreen(it.d);
      const delta = Math.abs(sy - ly);

      // Twin window: early hint with target color name
      if (it.type === 'twin' && L.twinWindow) {
        const winDist = L.speed * L.twinWindow;
        const ahead = it.d - dist;
        if (ahead > 0 && ahead <= winDist && !twinActive) {
          twinActive = { itemIdx: i };
          const colName = (it.colors[it.correct] || '').toUpperCase();
          updateTwinHint('Aim ' + colName);
        }
      }

      if (delta > hitBand) continue;

      if (it.type === 'finish') {
        hitFlags[i] = true;
        clearLevel();
        return;
      }

      if (it.type === 'blank') {
        hitFlags[i] = true;
        continue;
      }

      if (it.type === 'wall') {
        if (rail === it.rail) {
          hitFlags[i] = true;
          fail('Hit a wall');
          return;
        }
        hitFlags[i] = true;
        continue;
      }

      if (it.type === 'gate') {
        if (rail === it.rail) {
          hitFlags[i] = true;
          flashOk = 0.2;
          if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-gate-ok');
        } else {
          hitFlags[i] = true;
          fail('Wrong color gate');
          return;
        }
        continue;
      }

      if (it.type === 'twin') {
        const need = it.rails[it.correct];
        const softOk = rail === need;
        hitFlags[i] = true;
        twinActive = null;
        updateTwinHint('');
        if (softOk) {
          flashOk = 0.2;
          if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-gate-ok');
        } else {
          fail('Missed twin gate window');
          return;
        }
      }
    }

    if (twinActive) {
      const it = L.items[twinActive.itemIdx];
      if (dist > it.d + 20) {
        twinActive = null;
        updateTwinHint('');
      }
    }
  }

  function update(dt) {
    if (!running) return;
    const L = level();
    dist += L.speed * dt;
    moveBeat += dt;
    if (moveBeat >= 0.5) {
      moveBeat = 0;
      if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-move');
    }
    if (flashFail > 0) flashFail -= dt;
    if (flashOk > 0) flashOk -= dt;
    checkCollisions();
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function draw() {
    const L = level();
    const n = L.rails;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    for (let r = 0; r < n; r++) {
      const x = railX(r, n);
      ctx.strokeStyle = COLORS.rail;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (r === rail) {
        ctx.strokeStyle = 'rgba(248,247,244,0.14)';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }

    for (let i = 0; i < L.items.length; i++) {
      const it = L.items[i];
      const sy = worldToScreen(it.d);
      if (sy < -80 || sy > H + 80) continue;

      if (it.type === 'finish') {
        ctx.fillStyle = COLORS.finish;
        ctx.globalAlpha = 0.85;
        drawRoundedRect(24, sy - 8, W - 48, 16, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0f1219';
        ctx.font = '600 12px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH', W / 2, sy + 4);
        continue;
      }

      if (it.type === 'blank') {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(28, sy);
        ctx.lineTo(W - 28, sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(232,237,247,0.85)';
        ctx.font = '11px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('safe gap', W / 2, sy - 8);
        continue;
      }

      if (it.type === 'wall') {
        const x = railX(it.rail, n);
        ctx.fillStyle = COLORS.wall;
        drawRoundedRect(x - 28, sy - 14, 56, 28, 8);
        ctx.fill();
        ctx.strokeStyle = '#f4a261';
        ctx.lineWidth = 3;
        drawRoundedRect(x - 28, sy - 14, 56, 28, 8);
        ctx.stroke();
        ctx.fillStyle = '#1a1f2a';
        ctx.font = '700 10px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WALL', x, sy + 4);
        continue;
      }

      if (it.type === 'gate') {
        const x = railX(it.rail, n);
        const col = COLORS[it.color];
        ctx.fillStyle = col;
        ctx.globalAlpha = hitFlags[i] ? 0.35 : 0.95;
        drawRoundedRect(x - 32, sy - 12, 64, 24, 12);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        drawRoundedRect(x - 32, sy - 12, 64, 24, 12);
        ctx.stroke();
        continue;
      }

      if (it.type === 'twin') {
        for (let k = 0; k < 2; k++) {
          const rr = it.rails[k];
          const x = railX(rr, n);
          const col = COLORS[it.colors[k]];
          const isCorrect = k === it.correct;
          ctx.fillStyle = col;
          ctx.globalAlpha = hitFlags[i] ? 0.3 : 0.95;
          drawRoundedRect(x - 30, sy - 18 + k * 4, 60, 22, 10);
          ctx.fill();
          ctx.globalAlpha = 1;
          if (twinActive && twinActive.itemIdx === i && isCorrect) {
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2;
            drawRoundedRect(x - 34, sy - 22, 68, 36, 12);
            ctx.stroke();
          }
        }
        // shrinking amber window bar
        if (twinActive && twinActive.itemIdx === i && L.twinWindow) {
          const winDist = L.speed * L.twinWindow;
          const ahead = Math.max(0, it.d - dist);
          const progress = Math.max(0, Math.min(1, ahead / winDist));
          ctx.fillStyle = 'rgba(244,162,97,0.25)';
          ctx.fillRect(20, sy - 40, W - 40, 6);
          ctx.fillStyle = 'rgba(244,162,97,0.95)';
          ctx.fillRect(20, sy - 40, (W - 40) * progress, 6);
        }
      }
    }

    const lx = railX(rail, n);
    const ly = lightY();
    const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 28);
    glow.addColorStop(0, '#fff');
    glow.addColorStop(0.4, 'rgba(248,247,244,0.9)');
    glow.addColorStop(1, 'rgba(248,247,244,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.light;
    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.fill();

    if (flashFail > 0) {
      ctx.fillStyle = 'rgba(232,93,117,' + (flashFail * 1.2) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (flashOk > 0) {
      ctx.fillStyle = 'rgba(46,196,182,' + (flashOk * 0.8) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function updateHUD() {
    const L = level();
    $('hud-level').textContent = 'L' + L.id + ' · ' + L.name;
    $('hud-miss').textContent = 'Miss ' + missCount;
    const starEl = $('hud-stars');
    // Only show stars after L3 clear / allclear (stars > 0)
    if (stars > 0) {
      starEl.classList.remove('hidden');
      starEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    } else {
      starEl.classList.add('hidden');
      starEl.textContent = '';
    }
  }

  function updateTwinHint(msg) {
    const el = $('twin-hint');
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
    } else {
      el.classList.remove('hidden');
      el.textContent = msg;
    }
  }

  function showOverlay() {
    const ov = $('overlay');
    const title = $('overlay-title');
    const sub = $('overlay-sub');
    const btn = $('overlay-btn');
    if (overlayMode === 'none') {
      ov.classList.add('hidden');
      return;
    }
    ov.classList.remove('hidden');
    if (overlayMode === 'start') {
      title.textContent = 'Gate Sync';
      sub.textContent = 'Left half = previous rail, right half = next. Match every gate color. Sound unlocks on Play.';
      btn.textContent = 'Play';
    } else if (overlayMode === 'fail') {
      title.textContent = 'Retry';
      if (!sub.textContent || sub.textContent === '') sub.textContent = 'Tap to retry this level';
      btn.textContent = 'Retry';
    } else if (overlayMode === 'clear') {
      title.textContent = 'Level clear';
      let msg = 'Nice sync. Tap for next level.';
      if (levelIndex === 2 && stars) msg = 'Stars: ' + '★'.repeat(stars) + ' (misses: ' + missCount + ')';
      sub.textContent = msg;
      btn.textContent = levelIndex >= LEVELS.length - 1 ? 'Finish' : 'Next';
    } else if (overlayMode === 'allclear') {
      title.textContent = 'All levels clear';
      sub.textContent = 'Gate Sync v1 complete. Tap to play again from Level 1.';
      btn.textContent = 'Replay';
    }
  }

  function pointerDir(e, el) {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX != null ? e.clientX : 0) - rect.left;
    return x < rect.width / 2 ? -1 : 1;
  }

  function bind() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('pointerdown', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (overlayMode !== 'none') {
        onTap(1);
        return;
      }
      onTap(pointerDir(e, canvas));
    });
    $('overlay-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onTap(1);
    });
    $('overlay').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'overlay-btn') return;
      onTap(1);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onTap(1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (overlayMode === 'none' && running) onTap(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (overlayMode === 'none' && running) onTap(1);
      }
    });

    $('btn-mute').addEventListener('click', (e) => {
      e.stopPropagation();
      unlockAudioOnce();
      const a = window.GateSyncAudio;
      if (!a) return;
      a.setMuted(!a.isMuted());
      $('btn-mute').textContent = a.isMuted() ? 'Unmute' : 'Mute';
      $('btn-mute').setAttribute('aria-pressed', a.isMuted() ? 'true' : 'false');
    });

    const tip = $('sound-tip');
    if (tip) tip.classList.add('hidden');

    stars = 0;
    resetLevel(false);
    overlayMode = 'start';
    showOverlay();
    updateHUD();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
