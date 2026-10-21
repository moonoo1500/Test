/**
 * World Interaction System
 * Handles detection and execution of player interactions with the liminal environment:
 * - Doors (open/close + dynamic physics collider update)
 * - Light switches (toggle sector illumination)
 * - Vending machines (Almond Water / Dream Soda sanity & stamina restoration)
 * - Terminals, CRT TVs, Arcade cabinets & Payphones (dreamcore lore & signals)
 * - Collectible VHS Memory Tapes (persistent Journal entries)
 * - Reality Portals (seamless warp to new seed worlds)
 * - Dynamic Physics Props (push / kick interaction)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalInteraction = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class InteractionSystem {
    constructor(options = {}) {
      this.world = options.world || null;
      this.physics = options.physics || null;
      this.sound = options.sound || null;
      this.onPortalEnter = options.onPortalEnter || null;
      this.onMessage = options.onMessage || null;
      this.onJournalUpdate = options.onJournalUpdate || null;
      this.journal = [];
      this.collectedTapeIds = new Set();
      this.focusedTarget = null;
    }

    bindWorld(world, physics) {
      this.world = world;
      this.physics = physics;
      this.focusedTarget = null;
    }

    /**
     * Find the best interactable object in range of the player
     */
    updateFocus() {
      if (!this.world || !this.physics) {
        this.focusedTarget = null;
        return null;
      }

      const p = this.physics.player;
      const lookX = -Math.sin(p.yaw);
      const lookZ = -Math.cos(p.yaw);

      let bestTarget = null;
      let bestScore = Infinity;

      const list = this.world.interactables || [];
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.type === 'VHS_TAPE' && it.collected) continue;

        const dx = it.x - p.x;
        const dz = it.z - p.z;
        const dist = Math.hypot(dx, dz);
        const maxR = it.radius || 2.5;
        if (dist > maxR) continue;

        // Direction alignment bonus (prefer objects in front of player)
        let dot = 1;
        if (dist > 0.05) {
          dot = (dx / dist) * lookX + (dz / dist) * lookZ;
        }
        // Allow interaction if within facing cone or very close
        if (dot < -0.35 && dist > 1.35) continue;

        const score = dist - dot * 0.85;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = it;
        }
      }

      // If no static interactable is focused, check if a dynamic prop is right in front
      if (!bestTarget && this.world.dynamicProps) {
        for (let i = 0; i < this.world.dynamicProps.length; i++) {
          const dp = this.world.dynamicProps[i];
          const dx = dp.x - p.x;
          const dz = dp.z - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 2.2) {
            const dot = dist > 0.05 ? (dx / dist) * lookX + (dz / dist) * lookZ : 1;
            if (dot > -0.1) {
              bestTarget = {
                id: dp.id,
                type: 'DYNAMIC_PROP',
                propRef: dp,
                x: dp.x,
                y: dp.y,
                z: dp.z,
                prompt: 'Толкнуть объект [E]'
              };
              break;
            }
          }
        }
      }

      this.focusedTarget = bestTarget;
      return bestTarget;
    }

    /**
     * Trigger interaction on the currently focused target (or nearest valid target)
     */
    interact() {
      const target = this.updateFocus();
      if (!target) return { triggered: false, reason: 'NO_TARGET' };

      const p = this.physics ? this.physics.player : null;

      switch (target.type) {
        case 'DOOR': {
          target.isOpen = !target.isOpen;
          if (this.world && this.world.walls) {
            const w = this.world.walls.find((item) => item.id === target.doorWallId);
            if (w) w.isOpen = target.isOpen;
          }
          if (this.physics && this.physics.grid) {
            this.physics.grid.setColliderActive(target.doorWallId, !target.isOpen);
          }
          if (this.sound) this.sound.playSFX('door');
          const msg = target.isOpen ? 'Дверь открыта' : 'Дверь закрыта';
          if (this.onMessage) this.onMessage(msg, 'info');
          return { triggered: true, type: 'DOOR', isOpen: target.isOpen, message: msg };
        }

        case 'SWITCH': {
          target.isOn = !target.isOn;
          let toggledCount = 0;
          if (this.world && this.world.lights) {
            for (const l of this.world.lights) {
              if (l.sectorId === target.sectorId || Math.hypot(l.x - target.x, l.z - target.z) < 15) {
                l.isOn = target.isOn;
                toggledCount++;
              }
            }
          }
          if (this.sound) this.sound.playSFX('switch');
          const msg = target.isOn
            ? `Освещение сектора включено (ламп: ${toggledCount})`
            : `Освещение сектора выключено (ламп: ${toggledCount})`;
          if (this.onMessage) this.onMessage(msg, 'info');
          return { triggered: true, type: 'SWITCH', isOn: target.isOn, toggledCount, message: msg };
        }

        case 'VENDING': {
          if (target.usesLeft <= 0) {
            const emptyMsg = 'Автомат пуст: слышно лишь тихое гудение компрессора.';
            if (this.onMessage) this.onMessage(emptyMsg, 'warn');
            return { triggered: false, type: 'VENDING', reason: 'EMPTY', message: emptyMsg };
          }
          target.usesLeft--;
          if (p) {
            p.sanity = Math.min(100, p.sanity + 30);
            p.stamina = Math.min(100, p.stamina + 45);
          }
          if (this.sound) this.sound.playSFX('vending');
          const msg = `Выпита Миндальная вода (+30 Рассудок, +45 Бодрость). Осталось: ${target.usesLeft}`;
          target.prompt =
            target.usesLeft > 0
              ? `Взять Миндальную воду (осталось ${target.usesLeft}) [E]`
              : 'Автомат пуст';
          if (this.onMessage) this.onMessage(msg, 'good');
          return { triggered: true, type: 'VENDING', usesLeft: target.usesLeft, message: msg };
        }

        case 'TERMINAL': {
          if (p) {
            p.sanity = Math.min(100, p.sanity + 8);
          }
          if (this.sound) this.sound.playSFX('switch');
          const msg = `${target.title}: ${target.message}`;
          if (this.onMessage) this.onMessage(msg, 'lore');
          return { triggered: true, type: 'TERMINAL', title: target.title, message: msg };
        }

        case 'VHS_TAPE': {
          target.collected = true;
          this.collectedTapeIds.add(target.tapeId);
          if (this.world && this.world.props) {
            const prop = this.world.props.find((pr) => pr.id === target.propId);
            if (prop) prop.hidden = true;
          }
          if (p) {
            p.sanity = Math.min(100, p.sanity + 22);
          }
          const entry = {
            id: target.tapeId,
            seed: this.world ? this.world.seed : 'UNKNOWN',
            biomeName: this.world ? this.world.biome.name : '',
            title: target.title,
            text: target.loreText,
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          };
          this.journal.unshift(entry);
          if (this.sound) this.sound.playSFX('vhs');
          const msg = `Найдена VHS-кассета: ${target.title}`;
          if (this.onMessage) this.onMessage(`${msg} — ${target.loreText}`, 'lore');
          if (this.onJournalUpdate) this.onJournalUpdate(this.journal);
          return { triggered: true, type: 'VHS_TAPE', entry, message: msg };
        }

        case 'PORTAL': {
          if (this.sound) this.sound.playSFX('portal');
          const msg = `Переход сквозь разлом в мир [${target.targetSeed}]...`;
          if (this.onMessage) this.onMessage(msg, 'portal');
          if (this.onPortalEnter) {
            this.onPortalEnter(target.targetSeed, target.targetBiomeId);
          }
          return {
            triggered: true,
            type: 'PORTAL',
            targetSeed: target.targetSeed,
            targetBiomeId: target.targetBiomeId,
            message: msg
          };
        }

        case 'DYNAMIC_PROP': {
          const kicked = this.physics ? this.physics.kickNearestProp(7.2) : null;
          const msg = 'Вы толкнули предмет вперёд';
          if (this.onMessage) this.onMessage(msg, 'info');
          return { triggered: Boolean(kicked), type: 'DYNAMIC_PROP', message: msg };
        }

        default:
          return { triggered: false, reason: 'UNKNOWN_TYPE' };
      }
    }
  }

  return { InteractionSystem };
});
