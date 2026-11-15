// Round direction: freeze time, live play, the bomb, the economy and the score. It holds no
// three.js objects and draws nothing, so the rules can be read (and changed) on their own.

import { ROUND, MONEY } from './config.js';
import { BUY_MENU, WEAPONS, GRENADE } from './weapons.js';

export const EVENTS = {
  ROUND_START: 'round_start',
  FREEZE_END: 'freeze_end',
  ROUND_END: 'round_end',
  BOMB_PLANTED: 'bomb_planted',
  BOMB_DEFUSED: 'bomb_defused',
  BOMB_EXPLODED: 'bomb_exploded',
  MATCH_END: 'match_end',
  PURCHASE: 'purchase',
};

export class Round {
  constructor() {
    this.round = 1;
    this.scores = { attackers: 0, defenders: 0 };
    this.phase = 'freeze';
    this.timeLeft = ROUND.freezeTime;
    this.bomb = { state: 'carried', position: null, timer: 0, carrier: null, defuser: null };
    this.winner = null;
    this.reason = '';
    this.lossStreak = { attackers: 0, defenders: 0 };
    this.events = [];
    this.matchOver = false;
    this.attackingSite = 0;
  }

  begin() {
    this.phase = 'freeze';
    this.timeLeft = ROUND.freezeTime;
    this.bomb = { state: 'carried', position: null, timer: 0, carrier: null, defuser: null };
    this.winner = null;
    this.reason = '';
    this.events.push({ type: EVENTS.ROUND_START, round: this.round });
  }

  startLive() {
    this.phase = 'live';
    this.timeLeft = ROUND.roundTime;
    this.events.push({ type: EVENTS.FREEZE_END, round: this.round });
  }

  get buyOpen() {
    return this.phase === 'freeze' || (this.timeLeft > ROUND.roundTime - ROUND.buyTime && this.phase === 'live');
  }

  // A round ends when a team is wiped out, the bomb goes off, or the clock runs out: the clock
  // running out is a defender win unless the bomb is down and ticking.
  endRound(winner, reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winner;
    this.reason = reason;
    this.timeLeft = ROUND.endDelay;
    this.scores[winner] += 1;
    const loser = winner === 'attackers' ? 'defenders' : 'attackers';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    this.lastReward = { winner, loser, amount: 0 };
    if (this.scores[winner] >= ROUND.roundsToWin) this.matchOver = true;
    this.events.push({ type: EVENTS.ROUND_END, winner, reason, round: this.round });
    if (this.matchOver) this.events.push({ type: EVENTS.MATCH_END, winner });
  }

  // The economy: winners take a bigger purse, losers get a consolation that grows with the streak.
  roundReward(winner, reason) {
    const loser = winner === 'attackers' ? 'defenders' : 'attackers';
    const win = reason === 'elimination' ? MONEY.winElimination : MONEY.winBomb;
    const loss = Math.min(MONEY.lossMax, MONEY.lossBase + (this.lossStreak[loser] - 1) * MONEY.lossStep);
    this.lastReward = { winner, loser, win, loss };
    return this.lastReward;
  }

  plant(position, owner, team) {
    this.bomb.state = 'planted';
    this.bomb.position = { x: position.x, z: position.z };
    this.bomb.timer = ROUND.bombTimer;
    this.bomb.carrier = owner;
    this.timeLeft = Math.max(this.timeLeft, 0);
    this.events.push({ type: EVENTS.BOMB_PLANTED, position: this.bomb.position, by: owner?.name ?? 'you' });
    return MONEY.plantReward;
  }

  defuse(owner) {
    this.bomb.state = 'defused';
    this.bomb.defuser = owner;
    this.events.push({ type: EVENTS.BOMB_DEFUSED, by: owner?.name ?? 'you' });
    this.endRound('defenders', 'defuse');
    return MONEY.defuseReward;
  }

  update(dt, state) {
    if (this.phase === 'freeze') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.startLive();
      return;
    }
    if (this.phase === 'ended') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        if (this.matchOver) return;
        this.round += 1;
        // Sites alternate each round so the map is read from both ends.
        this.attackingSite = this.round % 2;
        this.begin();
      }
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.bomb.state === 'planted') {
      this.bomb.timer -= dt;
      if (this.bomb.timer <= 0) {
        this.bomb.state = 'exploded';
        this.events.push({ type: EVENTS.BOMB_EXPLODED, position: this.bomb.position });
        this.endRound('attackers', 'bomb');
        return;
      }
    }
    if (this.timeLeft <= 0) {
      // A live bomb outlives the clock: the round is decided by the fuse, not the timer.
      if (this.bomb.state === 'planted') return;
      this.endRound('defenders', 'time');
      return;
    }
    if (state.attackersAlive === 0 && this.bomb.state !== 'planted') {
      this.endRound('defenders', 'elimination');
    } else if (state.defendersAlive === 0) {
      if (this.bomb.state === 'planted') return;
      this.endRound('attackers', 'elimination');
    }
  }

  // Buying: one place that knows what a thing costs and who may have it.
  priceOf(id) {
    if (id === 'armor') return 650;
    if (id === 'kit') return 400;
    if (id === 'frag') return GRENADE.price;
    const weapon = WEAPONS[id];
    return weapon ? weapon.price : Infinity;
  }

  canBuy(id, buyer) {
    if (!this.buyOpen) return { ok: false, why: 'Buy time is over' };
    const item = BUY_MENU.find((entry) => entry.id === id);
    if (!item) return { ok: false, why: 'Unknown item' };
    if (item.defendersOnly && buyer.team !== 'defenders') return { ok: false, why: 'Defenders only' };
    const price = this.priceOf(id);
    if (buyer.money < price) return { ok: false, why: 'Not enough money' };
    if (id === 'frag' && (buyer.grenades ?? 0) >= GRENADE.carry) return { ok: false, why: 'You carry one already' };
    if (id === 'armor' && buyer.armor >= 100) return { ok: false, why: 'Armour is already full' };
    if (id === 'kit' && buyer.hasKit) return { ok: false, why: 'Kit already carried' };
    return { ok: true, price };
  }

  buy(id, buyer) {
    const check = this.canBuy(id, buyer);
    if (!check.ok) return check;
    buyer.money -= check.price;
    this.events.push({ type: EVENTS.PURCHASE, id, price: check.price });
    return { ok: true, price: check.price, apply: id };
  }
}
