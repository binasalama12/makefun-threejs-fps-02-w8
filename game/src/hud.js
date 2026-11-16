// The heads-up display: health, money, ammunition, round clock, team scores and
// alive counts across the top and bottom edges, a dynamic crosshair that widens
// with the weapon's true spread, a hit marker, a kill feed, round banners, the
// buy panel and the end-of-round scoreboard. This module only paints what main.js
// tells it; it holds no game state of its own.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const hpFill = el('hp-fill');
  const hpText = el('hp-text');
  const moneyText = el('money-text');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const weaponName = el('weapon-name');
  const grenadeText = el('grenade-text');
  const timerText = el('timer-text');
  const roundText = el('round-text');
  const scoreW = el('score-warden');
  const scoreA = el('score-ashen');
  const aliveW = el('alive-warden');
  const aliveA = el('alive-ashen');
  const objectiveText = el('objective-text');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const feed = el('killfeed');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const buyPanel = el('buy-panel');
  const buyRows = el('buy-rows');
  const board = el('board');
  const boardBody = el('board-body');
  const boardTitle = el('board-title');
  const vignette = el('vignette');
  const plantBar = el('plant-bar');
  const plantFill = el('plant-fill');

  let hitTimer = 0;
  let bannerTimer = 0;
  let vigTimer = 0;
  const cache = {};

  function set(key, node, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    node.textContent = value;
  }

  return {
    setHealth(hp) {
      const v = Math.max(0, Math.ceil(hp));
      set('hp', hpText, `${v}`);
      hpFill.style.width = `${v}%`;
      hpFill.style.background = v > 50 ? 'var(--gold)' : v > 25 ? '#d08a3e' : 'var(--blood)';
    },
    setMoney(m) { set('money', moneyText, `$${m}`); },
    setAmmo(mag, reserve, name, grenades, smokes = 0) {
      set('mag', ammoMag, `${mag}`);
      set('res', ammoReserve, `/ ${reserve}`);
      set('wname', weaponName, name);
      const kit = [];
      if (grenades > 0) kit.push(`Mossfire × ${grenades} — G`);
      if (smokes > 0) kit.push(`Smoke × ${smokes} — H`);
      set('nade', grenadeText, kit.join(' · '));
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, urgent) {
      const s = Math.max(0, Math.ceil(seconds));
      set('timer', timerText, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerText.classList.toggle('urgent', !!urgent);
    },
    setRound(r, of) { set('round', roundText, `ROUND ${r} / ${of}`); },
    setScore(w, a) { set('sw', scoreW, `${w}`); set('sa', scoreA, `${a}`); },
    setAlive(w, a) { set('aw', aliveW, `${w} standing`); set('aa', aliveA, `${a} standing`); },
    setObjective(text) { set('obj', objectiveText, text); },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, headshot = false) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      hitmarker.classList.toggle('headshot', !!headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), headshot ? 260 : killed ? 220 : 110);
    },
    hurtFlash() {
      vignette.classList.add('on');
      clearTimeout(vigTimer);
      vigTimer = setTimeout(() => vignette.classList.remove('on'), 160);
    },
    showBanner(title, sub, holdMs = 2400) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    feed(message, gold, headshot = false) {
      const row = document.createElement('div');
      row.className = `feed-row${gold ? ' gold' : ''}${headshot ? ' headshot' : ''}`;
      row.textContent = message;
      feed.appendChild(row);
      while (feed.children.length > 5) feed.removeChild(feed.firstChild);
      // Rows fade out over their last half-second instead of vanishing.
      setTimeout(() => { row.style.opacity = '0'; }, 4700);
      setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 5250);
    },
    // The buy panel doubles as the start overlay's loadout view in screenshot mode.
    showBuy({ money, rows, phaseText }) {
      buyPanel.hidden = false;
      el('buy-money').textContent = `$${money}`;
      el('buy-phase').textContent = phaseText;
      buyRows.innerHTML = '';
      for (const row of rows) {
        const div = document.createElement('div');
        div.className = `buy-row${row.owned ? ' owned' : ''}${row.affordable ? '' : ' poor'}`;
        div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-name"></span><span class="buy-price"></span>`;
        div.querySelector('.buy-name').textContent = row.label;
        div.querySelector('.buy-price').textContent = row.owned ? 'OWNED' : `$${row.price}`;
        buyRows.appendChild(div);
      }
    },
    hideBuy() { buyPanel.hidden = true; },
    showOverlay(mode, data = {}) {
      overlay.hidden = false;
      if (mode === 'start') {
        overlayTitle.textContent = 'Citadel Heights';
        overlayCopy.textContent = 'The Gilded Wardens must plant the gate-charge at the main gate. The Ashen Covenant hold the walls. Click to take the courtyard.';
      } else if (mode === 'paused') {
        overlayTitle.textContent = 'Held';
        overlayCopy.textContent = 'The fight waits. Click to return to the courtyard.';
      } else if (mode === 'matchEnd') {
        overlayTitle.textContent = data.title ?? 'Match over';
        overlayCopy.textContent = data.copy ?? '';
      }
      el('play-label').textContent = mode === 'start' ? 'Enter the citadel' : mode === 'paused' ? 'Resume' : 'Play again';
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { el('play').addEventListener('click', handler); },
    showBoard({ title, lines }) {
      boardTitle.textContent = title;
      boardBody.innerHTML = '';
      for (const line of lines) {
        const div = document.createElement('div');
        div.className = `board-line${line.head ? ' head' : ''}`;
        div.textContent = line.text;
        boardBody.appendChild(div);
      }
      board.hidden = false;
    },
    hideBoard() { board.hidden = true; },
    setPlantProgress(frac, label) {
      if (frac === null) { plantBar.hidden = true; return; }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
      el('plant-label').textContent = label;
    },
  };
}
