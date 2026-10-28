import type { LevelConfig } from '../sim/levelTypes';

/**
 * Handcrafted campaign, levels 1-15. One new mechanic per level, introduced on its own before it is combined:
 *
 *  1 x gate            6 / gate (avoid it)        11 breather after the boss
 *  2 gate choice       7 - toll gate              12 flip gates
 *  3 Brute (champion)  8 moving gates             13 limited-use gates
 *  4 + pulse gate      9 swarms                   14 gauntlet: everything so far
 *  5 shields          10 BOSS (shockwave)         15 siege: mixed waves + armoured boss
 *
 * Gate choices are real decisions: the bigger multiplier is narrower, further away, guarded by a toll, or flips.
 * Lane space: x in [-6, 6], launcher at y = 0, enemy base at y = 44.
 */
export const CAMPAIGN: LevelConfig[] = [
  {
    id: 'c01', name: 'First Push', seed: 101, baseHp: 200, fireRate: 8, champion: false, reward: 30,
    intro: { title: 'Fire and multiply', text: 'Hold to fire, drag to aim. Send your crowd through the × gate to double it.' },
    gates: [{ op: 'mul', value: 2, x: 0, y: 14, width: 4.5 }],
    waves: [
      { t: 3, type: 'grunt', count: 10, spread: 4 },
      { t: 10, type: 'grunt', count: 16, spread: 6 },
      { t: 17, type: 'grunt', count: 24, spread: 7, burst: 8, interval: 1.5 },
    ],
  },
  {
    id: 'c02', name: 'Pick a Door', seed: 102, baseHp: 340, fireRate: 8, champion: false, reward: 35,
    intro: { title: 'Choose your gate', text: 'Bigger multipliers hide behind narrower doors. Thread the ×3.' },
    gates: [
      { op: 'mul', value: 2, x: -3, y: 12, width: 4.5 },
      { op: 'mul', value: 3, x: 3.4, y: 12, width: 2.6 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 18, x: -2, spread: 5 },
      { t: 10, type: 'grunt', count: 26, x: 2, spread: 6 },
      { t: 17, type: 'grunt', count: 45, spread: 9, burst: 15, interval: 2 },
    ],
  },
  {
    id: 'c03', name: 'Brute Force', seed: 103, baseHp: 420, fireRate: 8, reward: 40,
    intro: { title: 'The Brute', text: 'Firing charges your BRUTE. Tap it (or press E) to launch a 40-HP champion that smashes through crowds.' },
    gates: [
      { op: 'mul', value: 2, x: -3, y: 11, width: 4 },
      { op: 'mul', value: 2, x: 3, y: 11, width: 4 },
      { op: 'mul', value: 2, x: 0, y: 20, width: 3.5 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 30, spread: 7 },
      { t: 11, type: 'grunt', count: 70, spread: 10, burst: 35, interval: 1.2 },
      { t: 20, type: 'grunt', count: 60, spread: 8, burst: 20, interval: 2 },
    ],
  },
  {
    id: 'c04', name: 'Plus Side', seed: 104, baseHp: 650, fireRate: 8, reward: 45,
    intro: { title: '+ gates', text: '+ gates add a burst of units, then recharge. They shine when your stream is thin; × gates win when it is thick.' },
    gates: [
      { op: 'add', value: 6, x: -3.2, y: 9, width: 3.5, recharge: 0.5 },
      { op: 'mul', value: 2, x: 3.2, y: 9, width: 3.5 },
      { op: 'mul', value: 2, x: -1.5, y: 19, width: 4 },
      { op: 'add', value: 20, x: 3.5, y: 22, width: 2.5, recharge: 1.2 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 30, x: 2, spread: 6 },
      { t: 11, type: 'grunt', count: 60, spread: 9, burst: 20, interval: 2 },
      { t: 20, type: 'grunt', count: 80, spread: 10, burst: 20, interval: 1.6 },
    ],
  },
  {
    id: 'c05', name: 'Shield Wall', seed: 105, baseHp: 800, fireRate: 9, reward: 50,
    intro: { title: 'Shields', text: 'Shield bearers take 3 hits each. Multiply first, then meet them.' },
    gates: [
      { op: 'mul', value: 3, x: -3.2, y: 10, width: 3.2 },
      { op: 'mul', value: 2, x: 3, y: 10, width: 4 },
      { op: 'mul', value: 2, x: -3, y: 19, width: 4 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 30, spread: 8 },
      { t: 9, type: 'shield', count: 18, spread: 8 },
      { t: 17, type: 'shield', count: 30, spread: 10, burst: 10, interval: 2.2 },
      { t: 24, type: 'grunt', count: 80, spread: 10, burst: 20, interval: 1.5 },
    ],
  },
  {
    id: 'c06', name: 'The Squeeze', seed: 106, baseHp: 950, fireRate: 9, reward: 55,
    intro: { title: '÷ gates', text: '÷ gates cut your crowd down. Steer around them, even if the good gate is off to the side.' },
    gates: [
      { op: 'div', value: 2, x: 0, y: 10, width: 4 },
      { op: 'mul', value: 3, x: -4.2, y: 10, width: 3.2 },
      { op: 'mul', value: 3, x: 4.2, y: 10, width: 3.2 },
      { op: 'div', value: 3, x: 0, y: 22, width: 3 },
      { op: 'mul', value: 2, x: -3.5, y: 22, width: 4 },
      { op: 'mul', value: 2, x: 3.5, y: 22, width: 4 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 40, spread: 9 },
      { t: 10, type: 'shield', count: 24, spread: 9, burst: 12, interval: 2 },
      { t: 18, type: 'grunt', count: 120, spread: 11, burst: 30, interval: 1.8 },
    ],
  },
  {
    id: 'c07', name: 'Toll Road', seed: 107, baseHp: 800, fireRate: 9, reward: 60,
    intro: { title: '− toll gates', text: '− gates swallow units until paid off, then fall. Paying the toll can unlock a much bigger gate.' },
    gates: [
      { op: 'sub', value: 25, x: -3, y: 8, width: 4.5 },
      { op: 'mul', value: 4, x: -3, y: 14, width: 4.5 },
      { op: 'mul', value: 2, x: 3, y: 11, width: 4.5 },
      { op: 'add', value: 15, x: 0, y: 24, width: 3, recharge: 0.9 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 40, x: 2, spread: 7 },
      { t: 10, type: 'shield', count: 30, spread: 10, burst: 10, interval: 2 },
      { t: 18, type: 'grunt', count: 140, spread: 11, burst: 35, interval: 1.8 },
    ],
  },
  {
    id: 'c08', name: 'Moving Target', seed: 108, baseHp: 1350, fireRate: 9, reward: 65,
    intro: { title: 'Moving gates', text: 'Some gates slide side to side. Track them to keep your stream inside.' },
    gates: [
      { op: 'mul', value: 3, x: 0, y: 11, width: 3, move: { amp: 3.6, speed: 0.9 } },
      { op: 'mul', value: 2, x: 0, y: 16, width: 12 },
      { op: 'mul', value: 2, x: 0, y: 22, width: 3.5, move: { amp: 3.5, speed: 1.3, phase: 1.5 } },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 50, spread: 9 },
      { t: 10, type: 'shield', count: 36, spread: 10, burst: 12, interval: 2 },
      { t: 18, type: 'grunt', count: 160, spread: 11, burst: 40, interval: 1.8 },
    ],
  },
  {
    id: 'c09', name: 'Swarm', seed: 109, baseHp: 1250, fireRate: 10, reward: 70,
    intro: { title: 'Swarms', text: 'Swarm bugs are fast and weave across the lane. Keep a wide front, or they slip past.' },
    gates: [
      { op: 'mul', value: 2, x: -3, y: 10, width: 5 },
      { op: 'mul', value: 3, x: 3.2, y: 10, width: 3 },
      { op: 'add', value: 25, x: 0, y: 20, width: 3, recharge: 1 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 40, spread: 9 },
      { t: 9, type: 'swarm', count: 45, spread: 10, burst: 15, interval: 1.2 },
      { t: 17, type: 'shield', count: 30, spread: 10, burst: 10, interval: 2 },
      { t: 24, type: 'swarm', count: 80, spread: 11, burst: 20, interval: 1.3 },
    ],
  },
  {
    id: 'c10', name: 'The Warden', seed: 110, baseHp: 1000, fireRate: 10, reward: 140, boss: true,
    intro: { title: 'Boss: the Warden', text: 'The Warden stomps out shockwaves that flatten everything they touch. Push between stomps, and save your Brute for it.' },
    gates: [
      { op: 'mul', value: 3, x: -3.6, y: 9, width: 3 },
      { op: 'mul', value: 2, x: 3.4, y: 9, width: 3.5 },
      { op: 'div', value: 2, x: 0, y: 13, width: 3.4 },
      { op: 'add', value: 30, x: 3.5, y: 18, width: 3, recharge: 1 },
    ],
    waves: [
      { t: 2, type: 'boss', count: 1, hp: 450 },
      { t: 4, type: 'grunt', count: 40, spread: 9, burst: 20, interval: 3 },
      { t: 14, type: 'shield', count: 30, spread: 9, burst: 10, interval: 3 },
      { t: 24, type: 'grunt', count: 90, spread: 10, burst: 30, interval: 3 },
    ],
  },
  {
    id: 'c11', name: 'Breather', seed: 111, baseHp: 1100, fireRate: 10, reward: 60,
    gates: [
      { op: 'mul', value: 3, x: 0, y: 9, width: 6 },
      { op: 'mul', value: 2, x: -3, y: 18, width: 5 },
      { op: 'add', value: 30, x: 3.5, y: 18, width: 3, recharge: 0.8 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 50, spread: 9 },
      { t: 12, type: 'shield', count: 30, spread: 10, burst: 15, interval: 2 },
      { t: 20, type: 'grunt', count: 100, spread: 11, burst: 25, interval: 2 },
    ],
  },
  {
    id: 'c12', name: 'Flip Side', seed: 112, baseHp: 1900, fireRate: 10, reward: 80,
    intro: { title: 'Flip gates', text: 'Flip gates turn bad after enough units pass. Watch the counter and switch lanes before they flip.' },
    gates: [
      { op: 'mul', value: 4, x: -3, y: 10, width: 4, flip: { after: 220, op: 'div', value: 2 } },
      { op: 'mul', value: 2, x: 3, y: 10, width: 4.5 },
      { op: 'mul', value: 3, x: 3, y: 20, width: 3.5, flip: { after: 400, op: 'div', value: 3 } },
      { op: 'mul', value: 2, x: -3, y: 20, width: 4 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 60, spread: 10 },
      { t: 10, type: 'shield', count: 40, spread: 10, burst: 10, interval: 1.8 },
      { t: 18, type: 'swarm', count: 100, spread: 11, burst: 25, interval: 1.4 },
      { t: 26, type: 'grunt', count: 160, spread: 11, burst: 40, interval: 2 },
    ],
  },
  {
    id: 'c13', name: 'One Shot', seed: 113, baseHp: 1000, fireRate: 10, reward: 85,
    intro: { title: 'Limited gates', text: 'Some gates break after a set number of crossings. Spend them when it counts.' },
    gates: [
      { op: 'mul', value: 5, x: 0, y: 9, width: 3, uses: 40 },
      { op: 'mul', value: 2, x: -4, y: 9, width: 3.5 },
      { op: 'mul', value: 2, x: 4, y: 9, width: 3.5 },
      { op: 'add', value: 120, x: -3, y: 21, width: 2.5, uses: 3 },
      { op: 'mul', value: 2, x: 2.5, y: 20, width: 4 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 60, spread: 10 },
      { t: 10, type: 'shield', count: 45, spread: 10, burst: 15, interval: 2 },
      { t: 18, type: 'grunt', count: 150, spread: 11, burst: 30, interval: 1.8 },
      { t: 28, type: 'swarm', count: 90, spread: 11, burst: 30, interval: 1.4 },
    ],
  },
  {
    id: 'c14', name: 'Gauntlet', seed: 114, baseHp: 1400, fireRate: 11, reward: 95,
    intro: { title: 'Gauntlet', text: 'Everything at once. Plan a route: toll, multiply, then dodge the divider.' },
    gates: [
      { op: 'sub', value: 30, x: 3, y: 7, width: 4, regen: 3 },
      { op: 'mul', value: 4, x: 3, y: 12, width: 4 },
      { op: 'mul', value: 2, x: -3, y: 9, width: 4.5 },
      { op: 'div', value: 2, x: 0, y: 20, width: 3.5, move: { amp: 3, speed: 0.8 } },
      { op: 'mul', value: 3, x: -3.5, y: 26, width: 3, flip: { after: 600, op: 'div', value: 2 } },
      { op: 'add', value: 40, x: 3.5, y: 26, width: 3, recharge: 1 },
    ],
    waves: [
      { t: 3, type: 'grunt', count: 50, spread: 10, burst: 25, interval: 2 },
      { t: 12, type: 'shield', count: 36, spread: 11, burst: 12, interval: 2 },
      { t: 21, type: 'swarm', count: 90, spread: 11, burst: 30, interval: 1.6 },
      { t: 30, type: 'grunt', count: 160, spread: 11, burst: 40, interval: 2 },
    ],
  },
  {
    id: 'c15', name: 'Siege', seed: 115, baseHp: 1300, fireRate: 11, reward: 110,
    intro: { title: 'Siege', text: 'An armoured Warden leads the final push. Hold the line, then break the gate.' },
    gates: [
      { op: 'mul', value: 3, x: -3.5, y: 8, width: 3.5 },
      { op: 'mul', value: 2, x: 3, y: 8, width: 4.5 },
      { op: 'sub', value: 40, x: 0, y: 15, width: 4, regen: 4 },
      { op: 'mul', value: 5, x: 0, y: 20, width: 3 },
      { op: 'mul', value: 2, x: -4, y: 22, width: 3.5, move: { amp: 1.5, speed: 1.2 } },
    ],
    waves: [
      { t: 2, type: 'grunt', count: 50, spread: 10, burst: 25, interval: 2 },
      { t: 8, type: 'boss', count: 1, hp: 550 },
      { t: 13, type: 'shield', count: 40, spread: 11, burst: 10, interval: 2 },
      { t: 23, type: 'swarm', count: 100, spread: 11, burst: 25, interval: 1.5 },
      { t: 32, type: 'grunt', count: 180, spread: 11, burst: 45, interval: 2 },
    ],
  },
];
