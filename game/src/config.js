// Tunables for the whole game, in one place: the simulation reads this and nothing else.
// Units are metres and seconds; the fixed step is 1/240 s so hit tests stay tight at 60 fps.

export const STEP = 1 / 240;
export const MAX_FRAME = 0.25;

export const PLAYER = {
  radius: 0.34,
  standHeight: 1.78,
  crouchHeight: 1.18,
  standEye: 1.64,
  crouchEye: 1.02,
  walkSpeed: 5.4,
  crouchSpeed: 2.5,
  accel: 62,
  airAccel: 9,
  friction: 11,
  gravity: 19,
  jumpSpeed: 5.1,
  stepUp: 0.42,
};

export const ROUND = {
  freezeTime: 3.0,
  buyTime: 18.0,
  roundTime: 115.0,
  bombTimer: 40.0,
  plantTime: 3.4,
  defuseTime: 7.0,
  defuseKitTime: 4.5,
  endDelay: 4.2,
  roundsToWin: 13,
  botCount: 4,
};

export const MONEY = {
  start: 900,
  max: 16000,
  kill: 300,
  headshotBonus: 100,
  winElimination: 3250,
  winBomb: 3500,
  winDefuse: 3500,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantReward: 300,
  defuseReward: 300,
  plantTeamReward: 800,
};

export const BOTS = {
  viewDistance: 36,
  fov: Math.PI * 0.62,
  reactionMin: 0.16,
  reactionMax: 0.34,
  aimSpeed: 3.6,
  aimErrorMove: 0.075,
  aimErrorStill: 0.022,
  refire: 0.16,
  burst: 4,
  burstPause: 0.42,
  hearRadius: 22,
  repathEvery: 1.6,
  aggression: 0.62,
};

export const HIT = {
  head: 4.0,
  chest: 1.0,
  stomach: 1.25,
  legs: 0.72,
};
