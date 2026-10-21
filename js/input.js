/**
 * Mobile Touch Controls & Desktop Input Controller
 * Features:
 * - Multi-touch Virtual Analog Joystick (left zone) with deadzone & outer-ring auto-sprint
 * - Multi-touch Camera Look Swipe Pad (right zone) with smooth sensitivity & pitch clamp
 * - Dedicated Mobile Action Buttons: ПРЫЖОК, ДЕЙСТВИЕ [E], ФОНАРИК [F], ПРИСЕСТЬ [C], БЕГ [Shift], 3D/2D, КАМЕРА
 * - Full Desktop Keyboard (WASD/Arrows) + Mouse (PointerLock or drag) support
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalInput = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class InputController {
    constructor(options = {}) {
      this.onInteract = options.onInteract || null;
      this.onToggleFlashlight = options.onToggleFlashlight || null;
      this.onToggleRenderMode = options.onToggleRenderMode || null;
      this.onToggleCameraView = options.onToggleCameraView || null;

      this.keys = new Set();
      this.joystick = {
        active: false,
        touchId: null,
        originX: 0,
        originY: 0,
        currentX: 0,
        currentY: 0,
        maxRadius: 54,
        deadzone: 0.12,
        x: 0, // -1 .. 1
        y: 0  // -1 .. 1 (negative = forward/up on screen)
      };

      this.lookPad = {
        active: false,
        touchId: null,
        lastX: 0,
        lastY: 0,
        sensitivity: 0.0048,
        deltaYaw: 0,
        deltaPitch: 0
      };

      this.mobileButtons = {
        jump: false,
        sprintToggle: false,
        crouchToggle: false
      };

      this._jumpOneShot = false;
      this._mouseDragging = false;
      this._bound = false;
    }

    bindDOM(elements = {}) {
      if (this._bound || typeof window === 'undefined') return;
      this._bound = true;

      this.els = elements;

      // Keyboard events
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
          return;
        }
        const code = e.code;
        this.keys.add(code);

        if (code === 'KeyE' || code === 'Enter') {
          if (this.onInteract) this.onInteract();
        } else if (code === 'KeyF') {
          if (this.onToggleFlashlight) this.onToggleFlashlight();
        } else if (code === 'KeyV') {
          if (this.onToggleCameraView) this.onToggleCameraView();
        } else if (code === 'KeyM') {
          if (this.onToggleRenderMode) this.onToggleRenderMode();
        } else if (code === 'KeyC') {
          this.mobileButtons.crouchToggle = !this.mobileButtons.crouchToggle;
        } else if (code === 'Space') {
          this._jumpOneShot = true;
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
      });

      // Virtual Joystick Touch Zone
      const joyZone = elements.joystickZone;
      const joyKnob = elements.joystickKnob;
      if (joyZone) {
        joyZone.addEventListener(
          'touchstart',
          (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (this.joystick.touchId === null) {
                const rect = joyZone.getBoundingClientRect();
                this.joystick.touchId = t.identifier;
                this.joystick.active = true;
                this.joystick.originX = rect.left + rect.width * 0.5;
                this.joystick.originY = rect.top + rect.height * 0.5;
                this._updateJoystickFromPoint(t.clientX, t.clientY, joyKnob);
                break;
              }
            }
          },
          { passive: false }
        );

        joyZone.addEventListener(
          'touchmove',
          (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === this.joystick.touchId) {
                this._updateJoystickFromPoint(t.clientX, t.clientY, joyKnob);
                break;
              }
            }
          },
          { passive: false }
        );

        const endJoy = (e) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.joystick.touchId) {
              this.resetJoystick(joyKnob);
              break;
            }
          }
        };
        joyZone.addEventListener('touchend', endJoy, { passive: false });
        joyZone.addEventListener('touchcancel', endJoy, { passive: false });
      }

      // Camera Look Touch Pad (Right side of screen)
      const lookZone = elements.lookZone;
      if (lookZone) {
        lookZone.addEventListener(
          'touchstart',
          (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (this.lookPad.touchId === null) {
                this.lookPad.touchId = t.identifier;
                this.lookPad.active = true;
                this.lookPad.lastX = t.clientX;
                this.lookPad.lastY = t.clientY;
                break;
              }
            }
          },
          { passive: false }
        );

        lookZone.addEventListener(
          'touchmove',
          (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
              const t = e.changedTouches[i];
              if (t.identifier === this.lookPad.touchId) {
                const dx = t.clientX - this.lookPad.lastX;
                const dy = t.clientY - this.lookPad.lastY;
                this.lookPad.lastX = t.clientX;
                this.lookPad.lastY = t.clientY;
                this.lookPad.deltaYaw -= dx * this.lookPad.sensitivity;
                this.lookPad.deltaPitch -= dy * this.lookPad.sensitivity;
                break;
              }
            }
          },
          { passive: false }
        );

        const endLook = (e) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.lookPad.touchId) {
              this.lookPad.touchId = null;
              this.lookPad.active = false;
              break;
            }
          }
        };
        lookZone.addEventListener('touchend', endLook, { passive: false });
        lookZone.addEventListener('touchcancel', endLook, { passive: false });

        // Desktop mouse drag or pointer-lock look on viewport
        lookZone.addEventListener('mousedown', (e) => {
          if (e.button === 0) {
            this._mouseDragging = true;
            this.lookPad.lastX = e.clientX;
            this.lookPad.lastY = e.clientY;
          }
        });
      }

      window.addEventListener('mousemove', (e) => {
        if (typeof document !== 'undefined' && document.pointerLockElement) {
          this.lookPad.deltaYaw -= e.movementX * 0.0026;
          this.lookPad.deltaPitch -= e.movementY * 0.0026;
        } else if (this._mouseDragging) {
          const dx = e.clientX - this.lookPad.lastX;
          const dy = e.clientY - this.lookPad.lastY;
          this.lookPad.lastX = e.clientX;
          this.lookPad.lastY = e.clientY;
          this.lookPad.deltaYaw -= dx * 0.0038;
          this.lookPad.deltaPitch -= dy * 0.0038;
        }
      });

      window.addEventListener('mouseup', () => {
        this._mouseDragging = false;
      });
    }

    _updateJoystickFromPoint(clientX, clientY, knobEl = null) {
      const dx = clientX - this.joystick.originX;
      const dy = clientY - this.joystick.originY;
      const maxR = this.joystick.maxRadius;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);

      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      let nx = kx / maxR;
      let ny = ky / maxR;
      const mag = Math.hypot(nx, ny);
      if (mag < this.joystick.deadzone) {
        nx = 0;
        ny = 0;
      }

      this.joystick.x = nx;
      this.joystick.y = ny;

      if (knobEl && knobEl.style) {
        knobEl.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
      }
    }

    resetJoystick(knobEl = null) {
      this.joystick.active = false;
      this.joystick.touchId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      if (knobEl && knobEl.style) {
        knobEl.style.transform = 'translate(0px, 0px)';
      }
    }

    /**
     * Programmatic helper for automated 10-step bug testing & mobile buttons
     */
    setVirtualJoystick(nx, ny) {
      this.joystick.active = Math.hypot(nx, ny) > 0.01;
      this.joystick.x = Math.max(-1, Math.min(1, nx));
      this.joystick.y = Math.max(-1, Math.min(1, ny));
    }

    addLookDelta(dYaw, dPitch) {
      this.lookPad.deltaYaw += dYaw;
      this.lookPad.deltaPitch += dPitch;
    }

    triggerJump() {
      this._jumpOneShot = true;
    }

    toggleSprintButton() {
      this.mobileButtons.sprintToggle = !this.mobileButtons.sprintToggle;
      return this.mobileButtons.sprintToggle;
    }

    toggleCrouchButton() {
      this.mobileButtons.crouchToggle = !this.mobileButtons.crouchToggle;
      return this.mobileButtons.crouchToggle;
    }

    /**
     * Consume current frame's movement, look deltas, and action states
     */
    sampleFrameInput(player) {
      // Apply accumulated look deltas to player yaw/pitch
      if (player) {
        player.yaw += this.lookPad.deltaYaw;
        player.pitch = Math.max(
          -Math.PI * 0.44,
          Math.min(Math.PI * 0.44, player.pitch + this.lookPad.deltaPitch)
        );
      }
      this.lookPad.deltaYaw = 0;
      this.lookPad.deltaPitch = 0;

      // Keyboard movement vector
      let moveX = 0;
      let moveZ = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;

      // Combine with Mobile Virtual Joystick
      if (this.joystick.active || Math.hypot(this.joystick.x, this.joystick.y) > 0.01) {
        moveX += this.joystick.x;
        moveZ += this.joystick.y;
      }

      moveX = Math.max(-1, Math.min(1, moveX));
      moveZ = Math.max(-1, Math.min(1, moveZ));

      const joyDeflection = Math.hypot(this.joystick.x, this.joystick.y);
      const sprint =
        this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this.mobileButtons.sprintToggle ||
        joyDeflection > 0.88;

      const crouch =
        this.keys.has('ControlLeft') ||
        this.mobileButtons.crouchToggle;

      const jump = this._jumpOneShot || this.keys.has('Space') || this.mobileButtons.jump;
      this._jumpOneShot = false;

      return {
        moveX,
        moveZ,
        sprint,
        crouch,
        jump
      };
    }
  }

  return { InputController };
});
