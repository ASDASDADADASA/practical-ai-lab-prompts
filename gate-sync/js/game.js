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
    wall: '#3a3f4b',
    blank: null,
    bg: '#0f1219',
    rail: '#1c2230',
    light: '#f8f7f4',
    finish: '#7bdff2'
  };

  const LEVELS = [
    {
      id: 1,
      name: 'Warm-up',
      rails: 2,
      speed: 220,
      // segments along track: type gate|wall|blank|finish, railIndex for gates, color
      // y positions as distance from start (px along scroll)
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
        { d: 260, type: 'gate', rail: 1, color: 'amber' },
        { d: 420, type: 'gate', rail: 0, color: 'cyan' },
        { d: 560, type: 'blank' },
        { d: 700, type: 'gate', rail: 2, color: 'magenta' },
        { d: 840, type: 'wall', rail: 1 },
        { d: 980, type: 'gate', rail: 0, color: 'cyan' },
        { d: 1120, type: 'gate', rail: 2, color: 'amber' },
        { d: 1260, type: 'blank' },
        { d: 1400, type: 'wall', rail: 0 },
        { d: 1540, type: 'gate', rail: 1, color: 'magenta' },
        { d: 1680, type: 'gate', rail: 2, color: 'cyan' },
        { d: 1820, type: 'gate', rail: 0, color: 'amber' },
        { d: 1960, type: 'gate', rail: 1, color: 'magenta' },
        { d: 2100, type: 'gate', rail: 2, color: 'cyan' },
        { d: 2300, type: 'finish' }
      ]
    },
    {
      id: 3,
      name: 'Twin Gates',
      rails: 3,
      speed: 220 * 1.2 * 1.15,
      twinWindow: 0.45,
      items: [
        { d: 280, type: 'gate', rail: 0, color: 'cyan' },
        { d: 440, type: 'gate', rail: 2, color: 'magenta' },
        { d: 600, type: 'twin', rails: [0, 1], colors: ['cyan', 'amber'], correct: 1 },
        { d: 780, type: 'blank' },
        { d: 920, type: 'wall', rail: 2 },
        { d: 1060, type: 'gate', rail: 1, color: 'amber' },
        { d: 1220, type: 'twin', rails: [1, 2], colors: ['magenta', 'cyan'], correct: 0 },
        { d: 1400, type: 'gate', rail: 0, color: 'cyan' },
        { d: 1560, type: 'wall', rail: 1 },
        { d: 1700, type: 'twin', rails: [0, 2], colors: ['amber', 'magenta'], correct: 1 },
        { d: 1880, type: 'gate', rail: 1, color: 'amber' },
        { d: 2040, type: 'gate', rail: 2, color: 'magenta' },
        { d: 2240, type: 'finish' }
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
  let twinActive = null; // { itemIdx, locked, correctRail }
  let twinLocked = false;
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
    // items approach from top; light fixed near bottom
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
    twinLocked = false;
    flashFail = 0;
    flashOk = 0;
    moveBeat = 0;
    if (!soft) missCount = 0;
    attemptCount += 1;
    running = false;
    overlayMode = soft ? 'fail' : (levelIndex === 0 && attemptCount <= 1 ? 'start' : 'none');
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

  function onTap() {
    unlockAudioOnce();
    if (overlayMode === 'start') {
      startRun();
      return;
    }
    if (overlayMode === 'fail') {
      // soft retry same level — keep missCount
      const L = level();
      rail = Math.floor((L.rails - 1) / 2);
      dist = 0;
      hitFlags = {};
      twinActive = null;
      twinLocked = false;
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
        return;
      }
      missCount = 0;
      attemptCount = 0;
      resetLevel(false);
      startRun();
      return;
    }
    if (overlayMode === 'allclear') {
      levelIndex = 0;
      missCount = 0;
      attemptCount = 0;
      resetLevel(false);
      startRun();
      return;
    }
    if (!running) return;

    // Twin lock: if in window and on correct rail, second tap locks
    if (twinActive && !twinLocked) {
      const L = level();
      const item = L.items[twinActive.itemIdx];
      if (rail === item.rails[item.correct]) {
        twinLocked = true;
        if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-lock');
        updateTwinHint('Locked ✓');
        return;
      }
    }

    // Switch rail
    const n = level().rails;
    rail = (rail + 1) % n;
    if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-tap');
  }

  function fail(reason) {
    running = false;
    missCount += 1;
    flashFail = 0.35;
    if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-fail');
    overlayMode = 'fail';
    $('overlay-sub').textContent = reason || 'Miss — tap to retry';
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

      // Twin window activation before arrival
      if (it.type === 'twin' && L.twinWindow) {
        const winDist = L.speed * L.twinWindow;
        const ahead = it.d - dist;
        if (ahead > 0 && ahead <= winDist && !twinActive) {
          twinActive = { itemIdx: i };
          twinLocked = false;
          updateTwinHint('Twin gate — align & tap to lock');
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
          // wrong rail at gate row — only fail if we're on a different rail when gate spans that rail
          // Gates only occupy one rail; passing on wrong rail means missing the gate color match
          // Brief: light must match gate color = be on that rail
          hitFlags[i] = true;
          fail('Wrong color gate');
          return;
        }
        continue;
      }

      if (it.type === 'twin') {
        const need = it.rails[it.correct];
        const ok = twinLocked && rail === need;
        // Also allow: if player is on correct rail in window without explicit lock, accept if on correct
        const softOk = rail === need;
        hitFlags[i] = true;
        twinActive = null;
        updateTwinHint('');
        if (ok || softOk) {
          flashOk = 0.2;
          if (window.GateSyncAudio) window.GateSyncAudio.play('sfx-gate-ok');
          twinLocked = false;
        } else {
          fail('Missed twin gate window');
          return;
        }
      }
    }

    // Clear twin hint after passing
    if (twinActive) {
      const it = L.items[twinActive.itemIdx];
      if (dist > it.d + 20) {
        twinActive = null;
        twinLocked = false;
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

    // bg
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // soft vignette lanes
    for (let r = 0; r < n; r++) {
      const x = railX(r, n);
      ctx.strokeStyle = COLORS.rail;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      // soft glow on active rail
      if (r === rail) {
        ctx.strokeStyle = 'rgba(248,247,244,0.12)';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }

    // items
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
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(28, sy);
        ctx.lineTo(W - 28, sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
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
        ctx.fillStyle = '#9aa3b5';
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
        // stacked twin gates across two rails
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
            ctx.strokeStyle = twinLocked ? '#fff' : 'rgba(255,255,255,0.7)';
            ctx.lineWidth = twinLocked ? 3 : 2;
            drawRoundedRect(x - 34, sy - 22, 68, 36, 12);
            ctx.stroke();
          }
        }
        // window bar
        if (twinActive && twinActive.itemIdx === i) {
          ctx.fillStyle = twinLocked ? 'rgba(46,196,182,0.25)' : 'rgba(244,162,97,0.2)';
          ctx.fillRect(20, sy - 40, W - 40, 6);
        }
      }
    }

    // light
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

    // flash overlays
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
    if (levelIndex === 2 || stars > 0) {
      starEl.classList.remove('hidden');
      starEl.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '★ ★ ★';
    } else {
      starEl.classList.add('hidden');
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
      sub.textContent = 'Tap to switch rails. Match every gate color. Level 1 — Warm-up.';
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

  function bind() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    const tap = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      onTap();
    };
    canvas.addEventListener('pointerdown', tap);
    $('overlay-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onTap();
    });
    $('overlay').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'overlay-btn') return;
      onTap();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onTap();
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

    // sound tip tap
    $('sound-tip').addEventListener('click', (e) => {
      e.stopPropagation();
      unlockAudioOnce();
    });

    resetLevel(false);
    overlayMode = 'start';
    showOverlay();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
