import './style.css';
import { Game } from './game';
import { CAMPAIGN } from './levels/campaign';
import { STRESS_LEVEL } from './levels/stress';

// URL flags: ?level=2 | ?level=stress, ?perf, ?debug, ?seed=123, ?dpr=1, ?shadows=0, ?autoq=0, ?bench (add &autoq to scale quality) (stress benchmark), ?warm=3&secs=10
const params = new URLSearchParams(location.search);
const levelParam = params.get('level');
const bench = params.has('bench');
let startLevel = -1;
if (bench || levelParam === 'stress') startLevel = CAMPAIGN.length;
else if (levelParam) startLevel = Math.max(0, Math.min(CAMPAIGN.length - 1, Number(levelParam) - 1 || 0));

const stage = document.getElementById('stage')!;
const game = new Game(stage, {
  levels: CAMPAIGN,
  stress: STRESS_LEVEL,
  startLevel,
  seed: params.has('seed') ? Number(params.get('seed')) : undefined,
  perf: params.has('perf') || bench,
  debug: params.has('debug'),
  maxDpr: params.has('dpr') ? Number(params.get('dpr')) : undefined,
  shadows: params.get('shadows') !== '0',
  hide: params.get('hide')?.split(','),
  autoQuality: bench ? params.has('autoq') : params.get('autoq') !== '0',
  bench: bench ? { warm: Number(params.get('warm') ?? 3), secs: Number(params.get('secs') ?? 10) } : null,
});
game.start();
