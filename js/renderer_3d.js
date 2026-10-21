/**
 * Volumetric 3D WebGL Renderer (Three.js)
 * Features:
 * - First-Person (1P) & Third-Person (3P) camera with animated 3D human character
 * - Vertex-displaced rolling terrain for Dreamcore Meadow matching physics heightmap
 * - Translucent animated water planes & volumetric light shafts for Poolrooms
 * - Distance-culled dynamic lighting, flickering fluorescent panels, and handheld flashlight
 * - Geometry & Material pooling + full scene cleanup between seed worlds
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.THREE || null);
  } else {
    root.LiminalRenderer3D = factory(root.THREE || null);
  }
})(typeof self !== 'undefined' ? self : this, function (THREE_GLOBAL) {
  'use strict';

  class Renderer3D {
    constructor(options = {}) {
      this.container = options.container || null;
      this.textureManager = options.textureManager || null;
      this.THREE = options.THREE || THREE_GLOBAL || (typeof window !== 'undefined' ? window.THREE : null);
      this.cameraView = '1P'; // '1P' or '3P'
      this.quality = options.quality || 'MEDIUM'; // 'RETRO', 'MEDIUM', 'HIGH'

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.worldGroup = null;
      this.playerAvatar = null;
      this.flashlight = null;
      this.flashlightTarget = null;

      this.doorMeshes = new Map();
      this.propMeshes = new Map();
      this.dynamicPropMeshes = new Map();
      this.lightNodes = [];
      this.skyMeshes = [];
      this.waterMeshes = [];
      this.portalMeshes = [];
      this.dustParticles = null;

      this.stats = {
        activeLights: 0,
        visibleMeshes: 0,
        disposedCount: 0
      };

      this._initThree();
    }

    _initThree() {
      const T = this.THREE;
      if (!T || !this.container || typeof document === 'undefined') {
        this._isHeadless = true;
        return;
      }

      try {
        this.scene = new T.Scene();
        this.camera = new T.PerspectiveCamera(72, 1, 0.1, 95);
        this.worldGroup = new T.Group();
        this.scene.add(this.worldGroup);

        this.renderer = new T.WebGLRenderer({
          antialias: this.quality === 'HIGH',
          powerPreference: 'high-performance'
        });
        this.renderer.domElement.className = 'canvas-3d';
        this.container.appendChild(this.renderer.domElement);

        // Build handheld/character flashlight
        this.flashlight = new T.SpotLight(0xfff9e6, 2.2, 24, Math.PI / 4.8, 0.45, 1.2);
        this.flashlightTarget = new T.Object3D();
        this.scene.add(this.flashlight);
        this.scene.add(this.flashlightTarget);
        this.flashlight.target = this.flashlightTarget;

        // Build 3D Human Explorer Avatar (visible in 3P mode)
        this._buildPlayerAvatar();

        this.applyQuality(this.quality);
        this.resize();
      } catch (_err) {
        this._isHeadless = true;
      }
    }

    _buildPlayerAvatar() {
      const T = this.THREE;
      if (!T) return;

      const group = new T.Group();

      const coatMat = new T.MeshLambertMaterial({ color: 0x3a4e6b });
      const skinMat = new T.MeshLambertMaterial({ color: 0xf0c8a0 });
      const pantsMat = new T.MeshLambertMaterial({ color: 0x222634 });
      const packMat = new T.MeshLambertMaterial({ color: 0x8f5b2e });

      // Head
      const head = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.34), skinMat);
      head.position.set(0, 1.52, 0);
      group.add(head);

      // Torso (hoodie)
      const torso = new T.Mesh(new T.BoxGeometry(0.46, 0.62, 0.26), coatMat);
      torso.position.set(0, 1.02, 0);
      group.add(torso);

      // Backpack
      const pack = new T.Mesh(new T.BoxGeometry(0.34, 0.44, 0.18), packMat);
      pack.position.set(0, 1.05, 0.2);
      group.add(pack);

      // Left & Right Legs
      const legGeo = new T.BoxGeometry(0.18, 0.68, 0.18);
      const leftLeg = new T.Mesh(legGeo, pantsMat);
      leftLeg.position.set(-0.12, 0.35, 0);
      const rightLeg = new T.Mesh(legGeo, pantsMat);
      rightLeg.position.set(0.12, 0.35, 0);
      group.add(leftLeg, rightLeg);

      // Left & Right Arms
      const armGeo = new T.BoxGeometry(0.14, 0.56, 0.14);
      const leftArm = new T.Mesh(armGeo, coatMat);
      leftArm.position.set(-0.31, 1.0, 0);
      const rightArm = new T.Mesh(armGeo, coatMat);
      rightArm.position.set(0.31, 1.0, 0);
      group.add(leftArm, rightArm);

      group.userData = { head, torso, pack, leftLeg, rightLeg, leftArm, rightArm };
      group.visible = this.cameraView === '3P';
      this.playerAvatar = group;
      this.scene.add(group);
    }

    setCameraView(viewMode) {
      this.cameraView = viewMode === '3P' ? '3P' : '1P';
      if (this.playerAvatar) {
        this.playerAvatar.visible = this.cameraView === '3P';
      }
      return this.cameraView;
    }

    toggleCameraView() {
      return this.setCameraView(this.cameraView === '1P' ? '3P' : '1P');
    }

    applyQuality(quality) {
      this.quality = quality;
      if (this.textureManager) {
        this.textureManager.setRetroFilter(quality === 'RETRO');
      }
      if (!this.renderer || typeof window === 'undefined') return;
      const dpr = window.devicePixelRatio || 1;
      const scale =
        quality === 'RETRO'
          ? 0.58
          : quality === 'MEDIUM'
          ? Math.min(1.25, dpr)
          : Math.min(2.0, dpr);
      this.renderer.setPixelRatio(scale);
      this.resize();
    }

    resize(width, height) {
      if (!this.renderer || !this.camera) return;
      const w = width || (this.container ? this.container.clientWidth : 800) || 800;
      const h = height || (this.container ? this.container.clientHeight : 600) || 600;
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    }

    clearWorldScene() {
      this.doorMeshes.clear();
      this.propMeshes.clear();
      this.dynamicPropMeshes.clear();
      this.lightNodes = [];
      this.skyMeshes = [];
      this.waterMeshes = [];
      this.portalMeshes = [];
      this.dustParticles = null;

      if (!this.worldGroup) return;
      while (this.worldGroup.children.length > 0) {
        const child = this.worldGroup.children[0];
        this.worldGroup.remove(child);
        if (child.geometry && typeof child.geometry.dispose === 'function') {
          child.geometry.dispose();
          this.stats.disposedCount++;
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m && m.dispose && m.dispose());
          } else if (typeof child.material.dispose === 'function') {
            child.material.dispose();
          }
        }
      }
    }

    buildWorld(world) {
      this.world = world;
      this.clearWorldScene();
      const T = this.THREE;
      if (!T || this._isHeadless || !this.scene) return;

      const biome = world.biome;
      this.scene.background = new T.Color(biome.skyColor);
      this.scene.fog = new T.FogExp2(biome.fogColor, biome.fogDensity);

      // Ambient & Hemisphere Lighting
      const amb = new T.AmbientLight(biome.ambientColor, biome.ambientIntensity);
      const hemi = new T.HemisphereLight(biome.ambientColor, 0x1a1a24, 0.38);
      this.worldGroup.add(amb, hemi);

      // 1. Floor / Terrain
      const size = world.worldHalfSize * 2;
      const floorTexName =
        biome.id === 'YELLOW_COMPLEX'
          ? 'carpet_damp'
          : biome.id === 'DREAMCORE_MEADOW'
          ? 'meadow_grass'
          : biome.id === 'POOLROOMS'
          ? 'pool_tile_cyan'
          : biome.id === 'DEAD_MALL'
          ? 'mall_checker'
          : 'asphalt_wet';

      const floorTex = this.textureManager.getTexture(floorTexName, {
        size: 128,
        repeatX: 24,
        repeatY: 24,
        seed: world.seed
      });
      const floorMat = new T.MeshLambertMaterial({ map: floorTex });

      if (biome.id === 'DREAMCORE_MEADOW') {
        const segs = 48;
        const floorGeo = new T.PlaneGeometry(size, size, segs, segs);
        floorGeo.rotateX(-Math.PI * 0.5);
        const pos = floorGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vz = pos.getZ(i);
          pos.setY(i, world.getTerrainHeight(vx, vz));
        }
        floorGeo.computeVertexNormals();
        const terrainMesh = new T.Mesh(floorGeo, floorMat);
        this.worldGroup.add(terrainMesh);
      } else {
        const floorGeo = new T.PlaneGeometry(size, size);
        floorGeo.rotateX(-Math.PI * 0.5);
        const floorMesh = new T.Mesh(floorGeo, floorMat);
        floorMesh.position.y = biome.id === 'POOLROOMS' ? -0.16 : 0;
        this.worldGroup.add(floorMesh);
      }

      // 2. Ceiling (for indoor biomes)
      if (world.ceilingHeight) {
        const ceilTexName =
          biome.id === 'POOLROOMS' ? 'pool_tile_white' : 'ceiling_tile';
        const ceilTex = this.textureManager.getTexture(ceilTexName, {
          size: 128,
          repeatX: 20,
          repeatY: 20,
          seed: world.seed
        });
        const ceilGeo = new T.PlaneGeometry(size, size);
        ceilGeo.rotateX(Math.PI * 0.5);
        const ceilMat = new T.MeshLambertMaterial({ map: ceilTex });
        const ceilMesh = new T.Mesh(ceilGeo, ceilMat);
        ceilMesh.position.y = world.ceilingHeight;
        this.worldGroup.add(ceilMesh);
      }

      // 3. Water Zones (Poolrooms & Dead Mall fountain)
      if (world.waterZones && world.waterZones.length > 0) {
        const waterTex = this.textureManager.getTexture('water_surface', {
          size: 128,
          repeatX: 8,
          repeatY: 8,
          seed: world.seed
        });
        const waterMat = new T.MeshLambertMaterial({
          map: waterTex,
          transparent: true,
          opacity: 0.72,
          emissive: new T.Color(0x145e5b),
          emissiveIntensity: 0.35
        });

        for (const wz of world.waterZones) {
          const ww = wz.maxX - wz.minX;
          const wd = wz.maxZ - wz.minZ;
          const wGeo = new T.PlaneGeometry(ww, wd, 12, 12);
          wGeo.rotateX(-Math.PI * 0.5);
          const wMesh = new T.Mesh(wGeo, waterMat);
          wMesh.position.set((wz.minX + wz.maxX) * 0.5, wz.surfaceY, (wz.minZ + wz.maxZ) * 0.5);
          wMesh.userData.baseY = wz.surfaceY;
          this.worldGroup.add(wMesh);
          this.waterMeshes.push(wMesh);
        }
      }

      // 4. Walls & Doors
      for (const w of world.walls) {
        const repeatX = Math.max(1, Math.round(Math.max(w.w, w.d) / 3));
        const tex = this.textureManager.getTexture(w.tex || 'wallpaper_yellow', {
          size: 128,
          repeatX,
          repeatY: 1,
          seed: world.seed
        });
        const mat = new T.MeshLambertMaterial({ map: tex });
        const geo = new T.BoxGeometry(w.w, w.h, w.d);
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(w.x, w.y, w.z);
        this.worldGroup.add(mesh);

        if (w.isDoor) {
          mesh.userData.closedPos = { x: w.x, y: w.y, z: w.z };
          mesh.userData.axis = w.axis;
          mesh.userData.doorWidth = Math.max(w.w, w.d);
          this.doorMeshes.set(w.id, mesh);
        }

        // Pitched cottage/suburban roof
        if (w.hasRoof) {
          const roofGeo = new T.ConeGeometry(Math.max(w.w, w.d) * 0.78, 2.2, 4);
          roofGeo.rotateY(Math.PI * 0.25);
          const roofMat = new T.MeshLambertMaterial({ color: w.roofColor || 0x8f333d });
          const roof = new T.Mesh(roofGeo, roofMat);
          roof.position.set(w.x, w.y + w.h * 0.5 + 1.1, w.z);
          this.worldGroup.add(roof);
        }
      }

      // 5. Static & Interactive Props
      for (const pr of world.props) {
        const mesh = this._createPropMesh(pr, world.seed);
        if (mesh) {
          this.worldGroup.add(mesh);
          this.propMeshes.set(pr.id, mesh);
        }
      }

      // 6. Dynamic Physics Props
      for (const dp of world.dynamicProps) {
        const mesh = this._createDynamicPropMesh(dp);
        if (mesh) {
          this.worldGroup.add(mesh);
          this.dynamicPropMeshes.set(dp.id, mesh);
        }
      }

      // 7. Sky Objects (Giant Dreamcore Eyes & Floating Frames)
      for (const sky of world.skyObjects) {
        const eyeTex = this.textureManager.getTexture('sky_eye', {
          size: 128,
          repeatX: 1,
          repeatY: 1,
          seed: world.seed
        });
        const eyeGroup = new T.Group();
        const sphere = new T.Mesh(
          new T.SphereGeometry(sky.scale, 16, 16),
          new T.MeshBasicMaterial({ map: eyeTex })
        );
        const ring = new T.Mesh(
          new T.TorusGeometry(sky.scale * 1.45, 0.18, 8, 24),
          new T.MeshBasicMaterial({ color: 0xfff099 })
        );
        eyeGroup.add(sphere, ring);
        eyeGroup.position.set(sky.x, sky.y, sky.z);
        eyeGroup.userData = sky;
        this.worldGroup.add(eyeGroup);
        this.skyMeshes.push(eyeGroup);
      }

      // 8. Sector Lights & Ceiling Diffuser Panels
      for (const l of world.lights) {
        const pt = new T.PointLight(l.color, l.intensity, l.distance);
        pt.position.set(l.x, l.y, l.z);
        this.worldGroup.add(pt);

        let panelMesh = null;
        if (world.ceilingHeight && Math.abs(l.y - world.ceilingHeight) < 0.6) {
          panelMesh = new T.Mesh(
            new T.BoxGeometry(1.4, 0.08, 0.65),
            new T.MeshBasicMaterial({ color: l.color })
          );
          panelMesh.position.set(l.x, world.ceilingHeight - 0.05, l.z);
          this.worldGroup.add(panelMesh);
        }

        this.lightNodes.push({ data: l, light: pt, panel: panelMesh });
      }

      // 9. Atmospheric Floating Dust / Dream Spores
      const particleCount = 180;
      const pGeo = new T.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 56;
        positions[i * 3 + 1] = Math.random() * 4.0 + 0.3;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 56;
      }
      pGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
      const pMat = new T.PointsMaterial({
        color: 0xffffff,
        size: 0.09,
        transparent: true,
        opacity: 0.55
      });
      this.dustParticles = new T.Points(pGeo, pMat);
      this.worldGroup.add(this.dustParticles);
    }

    _createPropMesh(pr, seed) {
      const T = this.THREE;
      const g = new T.Group();
      g.position.set(pr.x, pr.y, pr.z);
      g.rotation.y = pr.rotY || 0;

      if (pr.type === 'desk_crt' || pr.type === 'field_crt') {
        const deskMat = new T.MeshLambertMaterial({ color: 0x6e5236 });
        const desk = new T.Mesh(new T.BoxGeometry(pr.w, 0.75, pr.d), deskMat);
        desk.position.y = 0.375;
        const crtTex = this.textureManager.getTexture('crt_screen', { size: 128, seed });
        const crt = new T.Mesh(
          new T.BoxGeometry(0.55, 0.48, 0.48),
          new T.MeshBasicMaterial({ map: crtTex })
        );
        crt.position.y = 0.98;
        g.add(desk, crt);
      } else if (pr.type === 'vending_machine') {
        const vTex = this.textureManager.getTexture('vending_front', { size: 128, seed });
        const mesh = new T.Mesh(
          new T.BoxGeometry(pr.w, pr.h, pr.d),
          new T.MeshBasicMaterial({ map: vTex })
        );
        mesh.position.y = pr.h * 0.5;
        g.add(mesh);
      } else if (pr.type === 'dream_tree') {
        const trunk = new T.Mesh(
          new T.CylinderGeometry(0.18, 0.26, pr.h * 0.45, 8),
          new T.MeshLambertMaterial({ color: 0x6e472b })
        );
        trunk.position.y = pr.h * 0.22;
        const crown = new T.Mesh(
          new T.SphereGeometry(pr.h * 0.36, 10, 10),
          new T.MeshLambertMaterial({ color: 0x3ad15b })
        );
        crown.position.y = pr.h * 0.68;
        g.add(trunk, crown);
      } else if (pr.type === 'swing_set') {
        const barMat = new T.MeshLambertMaterial({ color: 0xe84a5f });
        const topBar = new T.Mesh(new T.BoxGeometry(pr.w, 0.12, 0.12), barMat);
        topBar.position.y = pr.h;
        const leftPost = new T.Mesh(new T.BoxGeometry(0.12, pr.h, 0.12), barMat);
        leftPost.position.set(-pr.w * 0.45, pr.h * 0.5, 0);
        const rightPost = new T.Mesh(new T.BoxGeometry(0.12, pr.h, 0.12), barMat);
        rightPost.position.set(pr.w * 0.45, pr.h * 0.5, 0);
        const seat = new T.Mesh(
          new T.BoxGeometry(0.55, 0.06, 0.26),
          new T.MeshLambertMaterial({ color: 0xffe156 })
        );
        seat.position.y = 0.62;
        g.add(topBar, leftPost, rightPost, seat);
      } else if (pr.type === 'vhs_tape') {
        const tape = new T.Mesh(
          new T.BoxGeometry(0.44, 0.12, 0.28),
          new T.MeshBasicMaterial({ color: 0xffdf4f })
        );
        const aura = new T.Mesh(
          new T.SphereGeometry(0.32, 8, 8),
          new T.MeshBasicMaterial({ color: 0xffe875, transparent: true, opacity: 0.38 })
        );
        g.add(tape, aura);
        g.userData.isFloatingVHS = true;
      } else if (pr.type === 'portal_rift') {
        const pTex = this.textureManager.getTexture('portal_rift', { size: 128, seed });
        const frame = new T.Mesh(
          new T.BoxGeometry(pr.w + 0.25, pr.h + 0.2, 0.28),
          new T.MeshBasicMaterial({ color: 0xd98aff })
        );
        frame.position.y = pr.h * 0.5;
        const core = new T.Mesh(
          new T.BoxGeometry(pr.w, pr.h, 0.34),
          new T.MeshBasicMaterial({ map: pTex })
        );
        core.position.y = pr.h * 0.5;
        g.add(frame, core);
        this.portalMeshes.push(core);
      } else if (pr.type === 'light_shaft') {
        const shaft = new T.Mesh(
          new T.CylinderGeometry(0.9, 1.65, pr.h, 12, 1, true),
          new T.MeshBasicMaterial({
            color: 0xd9ffff,
            transparent: true,
            opacity: 0.14,
            side: T.DoubleSide
          })
        );
        shaft.position.y = pr.h * 0.5;
        g.add(shaft);
      } else if (pr.type === 'streetlamp') {
        const pole = new T.Mesh(
          new T.CylinderGeometry(0.08, 0.11, pr.h, 8),
          new T.MeshLambertMaterial({ color: 0x2f3542 })
        );
        pole.position.y = pr.h * 0.5;
        const bulb = new T.Mesh(
          new T.SphereGeometry(0.24, 8, 8),
          new T.MeshBasicMaterial({ color: 0xffd275 })
        );
        bulb.position.y = pr.h;
        g.add(pole, bulb);
      } else {
        const box = new T.Mesh(
          new T.BoxGeometry(pr.w || 0.8, pr.h || 1.0, pr.d || 0.8),
          new T.MeshLambertMaterial({ color: 0x8a795d })
        );
        box.position.y = (pr.h || 1.0) * 0.5;
        g.add(box);
      }
      return g;
    }

    _createDynamicPropMesh(dp) {
      const T = this.THREE;
      if (dp.type === 'pool_ring') {
        return new T.Mesh(
          new T.TorusGeometry(dp.radius * 0.78, 0.15, 10, 20),
          new T.MeshLambertMaterial({ color: dp.color || 0xff6ad5 })
        );
      }
      if (dp.type === 'beach_ball') {
        return new T.Mesh(
          new T.SphereGeometry(dp.radius, 12, 12),
          new T.MeshLambertMaterial({ color: dp.color || 0x52f2ff })
        );
      }
      return new T.Mesh(
        new T.BoxGeometry(dp.radius * 1.4, dp.height, dp.radius * 1.4),
        new T.MeshLambertMaterial({ color: dp.color || 0x4599ff })
      );
    }

    render(physics, timeSec) {
      if (this._isHeadless || !this.renderer || !this.scene || !this.camera || !physics) {
        return;
      }

      const p = physics.player;
      const world = this.world;

      // 1. Update Player Avatar & Camera (1P vs 3P)
      const speed = Math.hypot(p.vx, p.vz);
      const bobY = p.onGround && speed > 0.25 ? Math.sin(p.headBobPhase) * 0.055 : 0;
      const bobX = p.onGround && speed > 0.25 ? Math.cos(p.headBobPhase * 0.5) * 0.03 : 0;

      if (this.playerAvatar) {
        this.playerAvatar.visible = this.cameraView === '3P';
        this.playerAvatar.position.set(p.x, p.y, p.z);
        this.playerAvatar.rotation.y = p.yaw;
        const scaleY = p.height / p.standingHeight;
        this.playerAvatar.scale.set(1, scaleY, 1);

        const parts = this.playerAvatar.userData;
        if (parts && parts.leftLeg) {
          const swing = speed > 0.2 ? Math.sin(p.headBobPhase) * 0.55 : 0;
          parts.leftLeg.rotation.x = swing;
          parts.rightLeg.rotation.x = -swing;
          parts.leftArm.rotation.x = -swing * 0.7;
          parts.rightArm.rotation.x = swing * 0.7;
        }
      }

      const forwardX = -Math.sin(p.yaw) * Math.cos(p.pitch);
      const forwardY = Math.sin(p.pitch);
      const forwardZ = -Math.cos(p.yaw) * Math.cos(p.pitch);

      if (this.cameraView === '1P') {
        this.camera.position.set(p.x + bobX, p.y + p.eyeHeight + bobY, p.z);
        this.camera.lookAt(
          this.camera.position.x + forwardX * 10,
          this.camera.position.y + forwardY * 10,
          this.camera.position.z + forwardZ * 10
        );
      } else {
        // 3P spring-arm camera behind player
        const camDist = 3.2;
        const cx = p.x - forwardX * camDist;
        const cy = Math.max(p.y + 0.5, p.y + p.eyeHeight + 0.65 - forwardY * 1.6);
        const cz = p.z - forwardZ * camDist;
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(p.x, p.y + p.eyeHeight * 0.85, p.z);
      }

      // 2. Flashlight update
      if (this.flashlight && this.flashlightTarget) {
        this.flashlight.visible = Boolean(p.flashlightOn);
        this.flashlight.position.set(p.x, p.y + p.eyeHeight * 0.88, p.z);
        this.flashlightTarget.position.set(
          p.x + forwardX * 12,
          p.y + p.eyeHeight * 0.88 + forwardY * 12,
          p.z + forwardZ * 12
        );
      }

      // 3. Update Door animations (swing around hinge edge so doorway opens completely)
      if (world && world.walls) {
        for (const w of world.walls) {
          if (!w.isDoor) continue;
          const mesh = this.doorMeshes.get(w.id);
          if (!mesh) continue;
          const targetRot = w.isOpen ? Math.PI * 0.48 : 0;
          mesh.rotation.y += (targetRot - mesh.rotation.y) * 0.18;
          const cp = mesh.userData.closedPos;
          const halfSpan = (mesh.userData.doorWidth || 1.6) * 0.46;
          const ang = mesh.rotation.y;
          if (cp) {
            if (mesh.userData.axis === 'X') {
              const hingeX = cp.x - halfSpan;
              mesh.position.x = hingeX + Math.cos(ang) * halfSpan;
              mesh.position.z = cp.z - Math.sin(ang) * halfSpan;
            } else {
              const hingeZ = cp.z - halfSpan;
              mesh.position.z = hingeZ + Math.cos(ang) * halfSpan;
              mesh.position.x = cp.x + Math.sin(ang) * halfSpan;
            }
          }
        }
      }

      // 4. Update Props (VHS spin, hidden state) & Dynamic Props
      if (world && world.props) {
        for (const pr of world.props) {
          const mesh = this.propMeshes.get(pr.id);
          if (!mesh) continue;
          mesh.visible = !pr.hidden;
          if (mesh.userData.isFloatingVHS && !pr.hidden) {
            mesh.rotation.y = timeSec * 1.8;
            mesh.position.y = pr.y + Math.sin(timeSec * 3.0) * 0.1;
          }
        }
      }

      if (world && world.dynamicProps) {
        for (const dp of world.dynamicProps) {
          const mesh = this.dynamicPropMeshes.get(dp.id);
          if (!mesh) continue;
          if (dp.type === 'pool_ring') {
            mesh.rotation.x = Math.PI * 0.5 + Math.sin(timeSec * 2 + dp.x) * 0.08;
            mesh.position.set(dp.x, dp.y + 0.12, dp.z);
          } else {
            mesh.position.set(dp.x, dp.y + dp.radius, dp.z);
            mesh.rotation.x += dp.vz * 0.03;
            mesh.rotation.z -= dp.vx * 0.03;
          }
        }
      }

      // 5. Sky Eyes look at player & Water ripple animation
      for (const eye of this.skyMeshes) {
        const s = eye.userData;
        eye.position.y = s.y + Math.sin(timeSec * 1.2 + s.phase) * 0.65;
        eye.lookAt(p.x, p.y + 1.5, p.z);
      }
      for (const wm of this.waterMeshes) {
        wm.position.y = wm.userData.baseY + Math.sin(timeSec * 2.1) * 0.025;
      }

      // 6. Distance Culling & Flickering for Point Lights (Optimization)
      let activeLights = 0;
      const maxActiveDistance = this.quality === 'RETRO' ? 20 : 28;
      for (let i = 0; i < this.lightNodes.length; i++) {
        const ln = this.lightNodes[i];
        const d = Math.hypot(ln.data.x - p.x, ln.data.z - p.z);
        const visible = ln.data.isOn && d < maxActiveDistance;
        ln.light.visible = visible;
        if (ln.panel) {
          ln.panel.material.color.setHex(ln.data.isOn ? ln.data.color : 0x2a2a2a);
        }
        if (visible) {
          activeLights++;
          if (ln.data.flicker) {
            const flick = Math.sin(timeSec * 23 + i * 5) > -0.65 ? 1.0 : 0.25;
            ln.light.intensity = ln.data.intensity * flick;
          } else {
            ln.light.intensity = ln.data.intensity;
          }
        }
      }
      this.stats.activeLights = activeLights;

      this.renderer.render(this.scene, this.camera);
    }
  }

  return { Renderer3D };
});
