// The HUD: health, ammunition, money, round timer, score, kill feed, bomb state, the buy menu
// and the radar. It only reads state; the game passes it what changed.

export class Hud {
  constructor() {
    this.el = {
      health: document.getElementById('hud-health'),
      healthBar: document.getElementById('hud-health-bar'),
      armor: document.getElementById('hud-armor'),
      ammoMag: document.getElementById('ammo-mag'),
      ammoReserve: document.getElementById('ammo-reserve'),
      money: document.getElementById('hud-money'),
      timer: document.getElementById('hud-timer'),
      scoreAttack: document.getElementById('score-attack'),
      scoreDefend: document.getElementById('score-defend'),
      round: document.getElementById('hud-round'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerCopy: document.getElementById('banner-copy'),
      feed: document.getElementById('killfeed'),
      bomb: document.getElementById('bomb-state'),
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      damage: document.getElementById('damage-vignette'),
      weapons: document.getElementById('hud-weapons'),
      buy: document.getElementById('buy-menu'),
      buyList: document.getElementById('buy-list'),
      buyHint: document.getElementById('buy-hint'),
      radar: document.getElementById('radar'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayCopy: document.getElementById('overlay-copy'),
      play: document.getElementById('play'),
    };
    this.feedItems = [];
    this.radarCtx = this.el.radar?.getContext('2d') ?? null;
    this.hitTimer = 0;
    this.damageTimer = 0;
    this.lastBombBeep = 0;
  }

  showOverlay(title, copy, button = 'Click to play') {
    if (!this.el.overlay) return;
    this.el.overlay.hidden = false;
    this.el.overlayTitle.textContent = title;
    this.el.overlayCopy.textContent = copy;
    this.el.play.textContent = button;
  }

  hideOverlay() {
    if (this.el.overlay) this.el.overlay.hidden = true;
  }

  setBanner(title, copy, tone = 'neutral') {
    if (!this.el.banner) return;
    this.el.banner.hidden = !title;
    if (!title) return;
    this.el.bannerTitle.textContent = title;
    this.el.bannerCopy.textContent = copy ?? '';
    this.el.banner.dataset.tone = tone;
  }

  setHealth(health, armor) {
    if (this.el.health) this.el.health.textContent = String(Math.max(0, Math.round(health)));
    if (this.el.healthBar) this.el.healthBar.style.transform = `scaleX(${Math.max(0, Math.min(1, health / 100))})`;
    if (this.el.armor) this.el.armor.textContent = String(Math.round(armor));
  }

  setAmmo(weapon) {
    if (!this.el.ammoMag || !weapon) return;
    const melee = weapon.def.melee;
    this.el.ammoMag.textContent = melee ? '—' : String(weapon.mag);
    this.el.ammoReserve.textContent = melee ? '' : `/ ${weapon.reserve}`;
  }

  setMoney(money) {
    if (this.el.money) this.el.money.textContent = `$${money}`;
  }

  setTimer(seconds, phase) {
    if (!this.el.timer) return;
    const clamped = Math.max(0, seconds);
    const mm = Math.floor(clamped / 60);
    const ss = Math.floor(clamped % 60);
    this.el.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    this.el.timer.dataset.phase = phase;
  }

  setScore(attackers, defenders) {
    if (this.el.scoreAttack) this.el.scoreAttack.textContent = String(attackers);
    if (this.el.scoreDefend) this.el.scoreDefend.textContent = String(defenders);
  }

  setRound(round) {
    if (this.el.round) this.el.round.textContent = `ROUND ${round}`;
  }

  setBomb(bomb, playerTeam) {
    if (!this.el.bomb) return;
    if (bomb.state === 'planted') {
      this.el.bomb.hidden = false;
      this.el.bomb.textContent = `BOMB ${bomb.timer.toFixed(1)}s`;
      this.el.bomb.dataset.tone = 'hot';
    } else if (bomb.state === 'carried') {
      this.el.bomb.hidden = false;
      this.el.bomb.textContent = playerTeam === 'attackers' && bomb.carrier ? 'BOMB CARRIED' : 'BOMB LIVE';
      this.el.bomb.dataset.tone = 'warm';
    } else {
      this.el.bomb.hidden = true;
    }
  }

  setCrosshairSpread(spread) {
    if (!this.el.crosshair) return;
    const gap = 6 + Math.min(26, spread * 220);
    this.el.crosshair.style.setProperty('--gap', `${gap}px`);
  }

  hit(headshot) {
    this.hitTimer = headshot ? 0.26 : 0.16;
    if (this.el.hitmarker) {
      this.el.hitmarker.classList.toggle('head', Boolean(headshot));
      this.el.hitmarker.classList.add('on');
    }
  }

  hurt(amount) {
    this.damageTimer = Math.min(0.9, 0.2 + amount / 90);
    if (this.el.damage) this.el.damage.style.opacity = String(Math.min(0.85, 0.25 + amount / 70));
  }

  addFeed(text, tone = 'neutral') {
    if (!this.el.feed) return;
    const line = document.createElement('div');
    line.className = `feed-line ${tone}`;
    line.textContent = text;
    this.el.feed.prepend(line);
    this.feedItems.push({ line, life: 4.5 });
    while (this.feedItems.length > 5) {
      const old = this.feedItems.shift();
      old.line.remove();
    }
  }

  showBuyMenu(items, money, onPick, buyer) {
    if (!this.el.buy || !this.el.buyList) return;
    this.el.buy.hidden = false;
    this.el.buyList.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      const affordable = money >= item.price && (!item.defendersOnly || buyer.team === 'defenders');
      button.disabled = !affordable;
      const owned = (item.id === 'frag' && buyer.grenades > 0) || (item.id === 'armor' && buyer.armor >= 100) || (item.id === 'kit' && buyer.hasKit);
      if (owned) button.disabled = true;
      button.innerHTML = `<span class="buy-label">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      button.addEventListener('click', () => onPick(item.id));
      this.el.buyList.append(button);
    }
    if (this.el.buyHint) this.el.buyHint.textContent = `B · buy time · you hold $${money}`;
  }

  hideBuyMenu() {
    if (this.el.buy) this.el.buy.hidden = true;
  }

  drawRadar(player, bots, bomb) {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const size = 148;
    ctx.clearRect(0, 0, size, size);
    const scale = size / 40;
    const toScreen = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.fillStyle = 'rgba(10,12,15,0.62)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(240,168,48,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    if (bomb?.state === 'planted' && bomb.position) {
      const [bx, bz] = toScreen(bomb.position.x, bomb.position.z);
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath();
      ctx.arc(bx, bz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bot of bots) {
      if (!bot.alive) continue;
      const [x, z] = toScreen(bot.position.x, bot.position.z);
      ctx.fillStyle = bot.team === player.team ? '#6fb3a8' : '#c7604f';
      ctx.beginPath();
      ctx.arc(x, z, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const [px, pz] = toScreen(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#f0a830';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.4, 4);
    ctx.lineTo(-3.4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  update(dt) {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0 && this.el.hitmarker) this.el.hitmarker.classList.remove('on');
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0 && this.el.damage) this.el.damage.style.opacity = '0';
    }
    for (let i = this.feedItems.length - 1; i >= 0; i -= 1) {
      const item = this.feedItems[i];
      item.life -= dt;
      if (item.life <= 0) {
        item.line.remove();
        this.feedItems.splice(i, 1);
      }
    }
  }
}
