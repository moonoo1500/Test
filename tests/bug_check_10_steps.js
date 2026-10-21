#!/usr/bin/env node
/**
 * Automated 10-Step Bug Verification Runner
 * Executes the 10-step engine diagnostic suite + HTML/DOM integrity & 50-seed stress tests.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Diagnostics = require('../js/diagnostics.js');
const PRNG = require('../js/prng.js');
const WorldGen = require('../js/world_gen.js');
const Physics = require('../js/physics.js');
const Renderer3DMod = require('../js/renderer_3d.js');
const Renderer2DMod = require('../js/renderer_2d.js');

console.log('======================================================================');
console.log(' 🛠  ЗАПУСК 10-ШАГОВОЙ ПРОВЕРКИ НА БАГИ (LIMINAL // DREAMCORE EXPLORER)');
console.log('======================================================================\n');

const report = Diagnostics.runTenStepBugCheck();

for (const step of report.steps) {
  const icon = step.passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} Шаг ${step.step}: ${step.name} (${step.durationMs} мс)`);
  console.log(`   └─ ${step.detail}\n`);
}

// Additional deep verification: 50 random seeds stress test + HTML binding check
console.log('----------------------------------------------------------------------');
console.log(' 🔬 ДОПОЛНИТЕЛЬНЫЙ СТРЕСС-ТЕСТ (50 случайных сидов + проверка DOM ID)');
console.log('----------------------------------------------------------------------');

for (let i = 0; i < 50; i++) {
  const seed = PRNG.generateRandomSeedCode();
  const w = WorldGen.WorldGenerator.generate(seed);
  const phys = new Physics.PhysicsEngine(w);
  phys.update(0.016, { moveX: 0.5, moveZ: -0.8, sprint: true, jump: i % 2 === 0 });
  if (Number.isNaN(phys.player.x) || Number.isNaN(phys.player.y) || Number.isNaN(phys.player.z)) {
    throw new Error(`NaN position detected on seed ${seed}`);
  }
}
console.log('✅ [PASS] 50 случайных сидов сгенерированы и просимулированы без ошибок NaN/коллизий.');

// Check index.html required IDs
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const requiredIds = [
  'viewport-container',
  'touch-joystick-zone',
  'touch-joystick-knob',
  'touch-look-zone',
  'mob-btn-interact',
  'mob-btn-jump',
  'mob-btn-flashlight',
  'mob-btn-sprint',
  'mob-btn-crouch',
  'mob-btn-random-warp',
  'seed-input',
  'biome-select',
  'quality-select',
  'btn-start-world',
  'btn-hud-mode',
  'btn-hud-cam',
  'btn-hud-seed',
  'btn-hud-journal',
  'btn-hud-bugcheck'
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) {
    throw new Error(`Missing required DOM element id="${id}" in index.html`);
  }
}
console.log(`✅ [PASS] Все ${requiredIds.length} обязательных элементов мобильного управления и HUD присутствуют в index.html.`);

// Test headless instantiation of Renderer3D & Renderer2D
const r3d = new Renderer3DMod.Renderer3D();
const r2d = new Renderer2DMod.Renderer2D();
const testWorld = WorldGen.WorldGenerator.generate('LIMINAL-1997');
const testPhys = new Physics.PhysicsEngine(testWorld);
r3d.buildWorld(testWorld);
r3d.render(testPhys, 1.0);
r2d.buildWorld(testWorld);
r2d.render(testPhys, null, 1.0);
console.log('✅ [PASS] Оба рендерера (3D Объёмный и 2D Пиксельная Аркада) инициализируются без ошибок.');

console.log('\n======================================================================');
console.log(` ИТОГ: ПРОЙДЕНО ${report.passedCount}/${report.totalSteps} ШАГОВ (${report.totalDurationMs} мс)`);
console.log('======================================================================');

if (!report.allPassed) {
  process.exit(1);
}
