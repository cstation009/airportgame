import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PassengerRig } from '../scene/PassengerRig';
import { createBrushedSteelTextures } from '../scene/textures';
import { CABIN_BOUNDS } from './flightLogic';
import type { CabinPerson, CoverObstacle, FlightProjectile } from './flightTypes';

interface PersonVisual {
  rig: PassengerRig;
  markerRing: THREE.Mesh;
  markerMat: THREE.MeshBasicMaterial;
  stunArc: THREE.Mesh;
  weaponMesh: THREE.Mesh;
}

interface TaserBeamFx {
  line: THREE.Line;
  life: number;
}

function createCarpetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#182436';
  ctx.fillRect(0, 0, 256, 256);

  // Fine commercial aircraft woven carpet grain
  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 6) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.fillRect(x, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 20);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCockpitSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 110;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 110);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 96, 512, 14);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 34px "Inter", sans-serif';
  ctx.fillText('FLIGHT DECK • LOCKED', 46, 52);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText('AUTHORIZED CREW ONLY', 112, 82);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FlightCabinScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pmrem: THREE.PMREMGenerator;

  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);

  // Player visuals
  private readonly marshalRig: PassengerRig;
  private readonly coverRing: THREE.Mesh;
  private readonly coverRingMat: THREE.MeshBasicMaterial;
  private readonly laserLine: THREE.Line;
  private readonly laserMat: THREE.LineBasicMaterial;
  private readonly muzzleLight: THREE.PointLight;

  // Dynamic cabin lighting & scenery
  private readonly clouds: THREE.Mesh[] = [];
  private cockpitLedMat!: THREE.MeshStandardMaterial;
  private alertLight!: THREE.PointLight;
  private personVisuals = new Map<string, PersonVisual>();
  private projectileMeshes = new Map<string, THREE.Mesh>();
  private taserBeams: TaserBeamFx[] = [];

  private shakeAmount = 0;
  private clockTime = 0;

  constructor(container: HTMLElement, obstacles: CoverObstacle[]) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#284b7a');
    this.scene.fog = new THREE.Fog('#2a4e7c', 26, 62);

    this.camera = new THREE.PerspectiveCamera(
      48,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.2,
      100,
    );
    this.camera.position.set(0, 9.8, 14.5);
    this.camera.lookAt(0, 0.8, 8.0);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.65;

    this.buildLighting();
    this.buildSkyAndClouds();
    this.buildAircraftCabin(obstacles);

    // Undercover Federal Air Marshal character
    this.marshalRig = new PassengerRig(
      {
        skinTone: '#e8be9e',
        hairStyle: 'short',
        hairColor: '#231b16',
        facialHair: 'stubble',
        glasses: 'aviator',
        jacketStyle: 'blazer',
        jacketColor: '#1a2330',
        shirtColor: '#e2e8f0',
        hatColor: '#1a2330',
        eyeColor: '#25211c',
        heightScale: 1.04,
        buildScale: 1.06,
        genderPresentation: 'M',
      },
      0,
    );
    this.marshalRig.root.position.set(0, 0, 9.8);
    this.scene.add(this.marshalRig.root);

    // Tactical Taser X2 yellow/black body in Marshal's right hand
    const taserMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.24),
      new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.35, metalness: 0.3 }),
    );
    taserMesh.position.set(0.24, 1.16, 0.3);
    this.marshalRig.root.add(taserMesh);

    // Subtle ground indicator ring (brightens cyan when safely crouched in Cover!)
    this.coverRingMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    this.coverRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 28), this.coverRingMat);
    this.coverRing.rotation.x = -Math.PI / 2;
    this.coverRing.position.set(0, 0.03, 9.8);
    this.scene.add(this.coverRing);

    // Live 3D Taser Laser Sightline
    this.laserMat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.72,
    });
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.12, 9.8),
      new THREE.Vector3(0, 1.12, 5.0),
    ]);
    this.laserLine = new THREE.Line(laserGeo, this.laserMat);
    this.scene.add(this.laserLine);

    this.muzzleLight = new THREE.PointLight('#38bdf8', 0, 5.5, 1.8);
    this.scene.add(this.muzzleLight);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight('#e2f1ff', '#334155', 1.1);
    this.scene.add(hemi);

    // Bright high-altitude sunlight streaming in from port windows
    const sun = new THREE.DirectionalLight('#fff5e4', 1.9);
    sun.position.set(-9, 14, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 36;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    this.scene.add(sun);

    // Cool recessed cabin overhead aisle fill
    const cabinFill = new THREE.DirectionalLight('#dbeafe', 0.85);
    cabinFill.position.set(4, 12, 8);
    this.scene.add(cabinFill);

    // Dynamic emergency alert strobe near cockpit
    this.alertLight = new THREE.PointLight('#ef4444', 0, 14, 1.4);
    this.alertLight.position.set(0, 2.7, -11.5);
    this.scene.add(this.alertLight);
  }

  private buildSkyAndClouds(): void {
    // Sunlit high-altitude cloud deck rushing past outside the fuselage
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#e8f1fb',
      roughness: 0.95,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(2.4 + (i % 4) * 0.9, 10, 8),
        cloudMat,
      );
      puff.scale.set(1.8, 0.45, 2.6);
      puff.position.set(
        side * (7.2 + (i % 5) * 2.4),
        -3.2 - (i % 3) * 1.4,
        -32 + i * 3.1,
      );
      this.scene.add(puff);
      this.clouds.push(puff);
    }
  }

  private buildAircraftCabin(obstacles: CoverObstacle[]): void {
    const carpetTex = createCarpetTexture();
    const steelTex = createBrushedSteelTextures();

    const floorMat = new THREE.MeshStandardMaterial({
      map: carpetTex,
      roughness: 0.88,
      metalness: 0.04,
    });
    const fuselageMat = new THREE.MeshStandardMaterial({
      color: '#dfe5ec',
      roughness: 0.42,
      metalness: 0.14,
    });
    const outerSkinMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.28,
      metalness: 0.42,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      map: steelTex.map,
      metalness: 0.8,
      roughness: 0.28,
    });
    const windowGlassMat = new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      emissive: '#38bdf8',
      emissiveIntensity: 0.55,
      roughness: 0.12,
      metalness: 0.2,
    });

    // Main cabin deck floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 26.8), floorMat);
    floor.position.set(0, -0.1, -1.0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Photoluminescent emerald emergency aisle floor guide strips
    const stripMat = new THREE.MeshStandardMaterial({
      color: '#34d399',
      emissive: '#10b981',
      emissiveIntensity: 1.6,
    });
    for (const sx of [-0.66, 0.66]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 23.6), stripMat);
      strip.position.set(sx, 0.008, -1.2);
      this.scene.add(strip);
    }

    // Left & Right pressurized fuselage walls (cutaway at y = 2.15 so top-down view is unobstructed)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.15, 26.8), fuselageMat);
      wall.position.set(side * 2.72, 1.07, -1.0);
      wall.receiveShadow = true;
      wall.castShadow = true;
      this.scene.add(wall);

      // Exterior metallic wing roots visible outside windows!
      const wing = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 6.2), outerSkinMat);
      wing.position.set(side * 6.4, 0.1, 0.8);
      wing.rotation.y = side * -0.25;
      this.scene.add(wing);

      // Oval glowing aircraft windows along cabin wall
      for (let wz = -11.4; wz <= 10.2; wz += 1.65) {
        const winFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.52, 0.38),
          new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4 }),
        );
        winFrame.position.set(side * 2.57, 1.24, wz);
        this.scene.add(winFrame);

        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.28), windowGlassMat);
        pane.position.set(side * 2.56, 1.24, wz);
        this.scene.add(pane);
      }
    }

    // Rear Galley Wall (z = +12.2)
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.25, 0.35), fuselageMat);
    rearWall.position.set(0, 1.12, 12.2);
    this.scene.add(rearWall);

    // Reinforced Armored Flight Deck / Cockpit Wall & Door (z = -13.6)
    const cockpitWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.45, 0.4), fuselageMat);
    cockpitWall.position.set(0, 1.22, -13.8);
    this.scene.add(cockpitWall);

    const doorMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      metalness: 0.65,
      roughness: 0.34,
    });
    const cockpitDoor = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.05, 0.14), doorMat);
    cockpitDoor.position.set(0, 1.03, CABIN_BOUNDS.cockpitDoorZ - 0.36);
    cockpitDoor.castShadow = true;
    this.scene.add(cockpitDoor);

    // Backlit FLIGHT DECK sign above cockpit door
    const signTex = createCockpitSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: '#ffffff',
      emissiveIntensity: 0.7,
    });
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.08), signMat);
    signMesh.position.set(0, 2.22, CABIN_BOUNDS.cockpitDoorZ - 0.3);
    this.scene.add(signMesh);

    this.cockpitLedMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#22c55e',
      emissiveIntensity: 2.2,
    });
    const cockpitLed = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.08), this.cockpitLedMat);
    cockpitLed.position.set(0, 2.0, CABIN_BOUNDS.cockpitDoorZ - 0.28);
    this.scene.add(cockpitLed);

    // Build physical 3D airline seats, bulkheads, and galley service carts matching CoverObstacle bounds!
    const econSeatMat = new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.78 });
    const firstSeatMat = new THREE.MeshStandardMaterial({ color: '#3b2b26', roughness: 0.52, metalness: 0.08 });
    const headrestMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.85 });
    const armrestMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.4, metalness: 0.35 });

    for (const obs of obstacles) {
      const cx = (obs.minX + obs.maxX) * 0.5;
      const cz = (obs.minZ + obs.maxZ) * 0.5;
      const w = obs.maxX - obs.minX;
      const d = obs.maxZ - obs.minZ;

      if (obs.kind === 'seat_bank') {
        const isFirstClass = cz < -6.5;
        const mat = isFirstClass ? firstSeatMat : econSeatMat;
        const seatCount = isFirstClass ? 2 : 3;
        const seatW = (w - 0.08) / seatCount;

        // Metal under-frame bar
        const baseBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.1, 0.24), armrestMat);
        baseBar.position.set(cx, 0.22, cz);
        this.scene.add(baseBar);

        for (let i = 0; i < seatCount; i++) {
          const sx = obs.minX + seatW * (i + 0.5) + 0.04;

          // Seat cushion
          const cushion = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.06, 0.14, d * 0.78), mat);
          cushion.position.set(sx, 0.42, cz - 0.04);
          cushion.castShadow = true;
          cushion.receiveShadow = true;
          this.scene.add(cushion);

          // Upright sculpted seatback (facing forward toward -Z)
          const back = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.06, 0.72, 0.14), mat);
          back.position.set(sx, 0.78, cz + d * 0.34);
          back.rotation.x = 0.12;
          back.castShadow = true;
          back.receiveShadow = true;
          this.scene.add(back);

          // Crisp white airline headrest cover (antimacassar)
          const cover = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.14, 0.2, 0.16), headrestMat);
          cover.position.set(sx, 1.04, cz + d * 0.36);
          cover.rotation.x = 0.12;
          this.scene.add(cover);

          // Side armrests
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, d * 0.65), armrestMat);
          arm.position.set(sx + seatW * 0.46, 0.58, cz);
          this.scene.add(arm);
        }
      } else if (obs.kind === 'bulkhead') {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w, obs.height, d), fuselageMat);
        panel.position.set(cx, obs.height * 0.5, cz);
        panel.castShadow = true;
        panel.receiveShadow = true;
        this.scene.add(panel);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d + 0.02), steelMat);
        trim.position.set(cx, obs.height + 0.02, cz);
        this.scene.add(trim);
      } else if (obs.kind === 'galley_cart') {
        // Brushed stainless airline beverage cart in aisle (waist-high tactical cover!)
        const cart = new THREE.Mesh(new THREE.BoxGeometry(w, obs.height, d), steelMat);
        cart.position.set(cx, obs.height * 0.5, cz);
        cart.castShadow = true;
        cart.receiveShadow = true;
        this.scene.add(cart);

        const topLip = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04),
          new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 }),
        );
        topLip.position.set(cx, obs.height + 0.02, cz);
        this.scene.add(topLip);

        // Coffee carafe & tray detail on cart top
        const carafe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.08, 0.18, 12),
          new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7, roughness: 0.25 }),
        );
        carafe.position.set(cx, obs.height + 0.12, cz - 0.18);
        this.scene.add(carafe);
      }
    }
  }

  public syncManifest(people: CabinPerson[]): void {
    // Remove old people meshes
    for (const vis of this.personVisuals.values()) {
      this.scene.remove(vis.rig.root);
      this.scene.remove(vis.markerRing);
      this.scene.remove(vis.stunArc);
    }
    this.personVisuals.clear();

    for (const p of people) {
      const rig = new PassengerRig(p.appearance, p.role === 'hijacker' ? 0.95 : 0.1);
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.facingAngle;
      this.scene.add(rig.root);

      // Concealed hostile weapon (shown only once hijacker exposes themselves!)
      const weaponMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.07, 0.26),
        new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.85, roughness: 0.2 }),
      );
      weaponMesh.position.set(0.24, 1.15, 0.28);
      weaponMesh.visible = false;
      rig.root.add(weaponMesh);

      // Tactical overhead / floor status ring
      const markerMat = new THREE.MeshBasicMaterial({
        color: '#94a3b8',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const markerRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 24), markerMat);
      markerRing.rotation.x = -Math.PI / 2;
      markerRing.position.set(p.x, 0.04, p.z);
      this.scene.add(markerRing);

      // Crackling electric cyan stun aura around shocked hijackers
      const stunArc = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 10),
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
          wireframe: true,
          transparent: true,
          opacity: 0.78,
        }),
      );
      stunArc.visible = false;
      this.scene.add(stunArc);

      this.personVisuals.set(p.id, { rig, markerRing, markerMat, stunArc, weaponMesh });
    }
  }

  public spawnTaserBeam(x1: number, z1: number, x2: number, z2: number): void {
    // Jagged electric cyan bolt between Marshal and target/cover impact
    const pts: THREE.Vector3[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const jitter = i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 0.16;
      pts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(x1, x2, t) + jitter,
          1.1 + (Math.random() - 0.5) * 0.12,
          THREE.MathUtils.lerp(z1, z2, t) + jitter,
        ),
      );
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#7dd3fc' });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.taserBeams.push({ line, life: 0.18 });

    this.muzzleLight.position.set(x1, 1.2, z1);
    this.muzzleLight.intensity = 6.5;
    this.shakeAmount = Math.max(this.shakeAmount, 0.08);
  }

  public triggerShake(amount = 0.14): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  public screenToCabinFloor(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) {
      return { x: hit.x, z: hit.z };
    }
    return null;
  }

  public update(
    dt: number,
    player: {
      x: number;
      z: number;
      facingAngle: number;
      isMoving: boolean;
      inCover: boolean;
      aimEndX: number;
      aimEndZ: number;
    },
    people: CabinPerson[],
    projectiles: FlightProjectile[],
    cockpitUnderAttack: boolean,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    this.clockTime += safeDt;

    // 1. Scroll sunlit high-altitude clouds outside aircraft windows
    for (const cloud of this.clouds) {
      cloud.position.z += safeDt * 15;
      if (cloud.position.z > 28) {
        cloud.position.z = -38;
      }
    }

    // 2. Update Air Marshal rig, cover crouch posture, and live 3D laser sightline
    this.marshalRig.root.position.set(player.x, player.inCover ? -0.34 : 0, player.z);
    this.marshalRig.root.rotation.y = player.facingAngle;
    this.marshalRig.update(safeDt, player.isMoving);

    this.coverRing.position.set(player.x, 0.03, player.z);
    this.coverRingMat.color.set(player.inCover ? '#22d3ee' : '#94a3b8');
    this.coverRingMat.opacity = player.inCover ? 0.85 : 0.38;

    const laserPos = this.laserLine.geometry.attributes.position as THREE.BufferAttribute;
    const beamY = player.inCover ? 0.78 : 1.12;
    laserPos.setXYZ(0, player.x, beamY, player.z);
    laserPos.setXYZ(1, player.aimEndX, beamY, player.aimEndZ);
    laserPos.needsUpdate = true;
    this.laserMat.color.set(player.inCover ? '#38bdf8' : '#22d3ee');

    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - safeDt * 38);

    // 3. Update every cabin passenger / hijacker rig
    for (const p of people) {
      const vis = this.personVisuals.get(p.id);
      if (!vis) continue;

      const isSeated = p.state === 'seated_hidden' || p.state === 'suspicious_tell';
      const isActive =
        p.state === 'exposed_advancing' ||
        p.state === 'taking_cover' ||
        p.state === 'breaching_cockpit';
      const isSubdued = p.state === 'subdued';
      const isStunned = p.state === 'stunned';

      let yOffset = 0;
      if (isSeated) {
        yOffset = p.ducked ? -0.58 : -0.36;
      } else if (isSubdued) {
        yOffset = -0.52;
      } else if (p.state === 'taking_cover') {
        yOffset = -0.32;
      }

      vis.rig.root.position.set(p.x, yOffset, p.z);
      vis.rig.root.rotation.y = p.facingAngle;
      vis.rig.root.rotation.x = isSubdued ? 0.45 : isStunned ? Math.sin(this.clockTime * 35) * 0.14 : 0;
      vis.rig.update(safeDt, p.state === 'exposed_advancing');

      vis.weaponMesh.visible = isActive;
      vis.stunArc.visible = isStunned;
      if (isStunned) {
        vis.stunArc.position.set(p.x, 1.0, p.z);
        vis.stunArc.rotation.y += safeDt * 12;
      }

      // Status indicator rings on cabin carpet
      vis.markerRing.position.set(p.x, 0.04, p.z);
      if (isSubdued) {
        vis.markerMat.color.set('#22c55e');
        vis.markerMat.opacity = 0.85;
      } else if (isActive || isStunned) {
        vis.markerMat.color.set('#ef4444');
        vis.markerMat.opacity = 0.72 + Math.sin(this.clockTime * 9) * 0.25;
      } else if (p.scanned) {
        vis.markerMat.color.set(p.role === 'hijacker' ? '#ef4444' : '#22c55e');
        vis.markerMat.opacity = 0.65;
      } else if (p.role === 'hijacker' && Math.hypot(p.x - player.x, p.z - player.z) < 4.4) {
        // Subtle nervous tell shimmer when Marshal gets close enough to observe them!
        vis.markerMat.color.set('#f59e0b');
        vis.markerMat.opacity = 0.28 + Math.sin(this.clockTime * 5) * 0.18;
      } else {
        vis.markerMat.opacity = 0;
      }
    }

    // 4. Sync active projectiles
    const aliveProjIds = new Set<string>();
    for (const proj of projectiles) {
      aliveProjIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(proj.fromPlayer ? 0.07 : 0.085, 8, 8),
          new THREE.MeshBasicMaterial({ color: proj.fromPlayer ? '#38bdf8' : '#f97316' }),
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }
      mesh.position.set(proj.x, 1.08, proj.z);
    }
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!aliveProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }

    // 5. Fade electric taser beams
    for (let i = this.taserBeams.length - 1; i >= 0; i--) {
      this.taserBeams[i].life -= safeDt;
      if (this.taserBeams[i].life <= 0) {
        this.scene.remove(this.taserBeams[i].line);
        this.taserBeams[i].line.geometry.dispose();
        this.taserBeams.splice(i, 1);
      }
    }

    // 6. Cockpit alarm red strobe if any hijacker is breaching
    if (cockpitUnderAttack) {
      const pulse = Math.sin(this.clockTime * 14) > 0;
      this.cockpitLedMat.color.set('#ef4444');
      this.cockpitLedMat.emissive.set('#ef4444');
      this.alertLight.intensity = pulse ? 8.5 : 1.2;
    } else {
      this.cockpitLedMat.color.set('#22c55e');
      this.cockpitLedMat.emissive.set('#22c55e');
      this.alertLight.intensity = 0;
    }

    // 7. Smooth top-down angled tactical follow camera tracking the Air Marshal
    this.shakeAmount = Math.max(0, this.shakeAmount - safeDt * 0.75);
    const sx = (Math.random() - 0.5) * this.shakeAmount;
    const sz = (Math.random() - 0.5) * this.shakeAmount;

    const targetCamX = player.x * 0.35 + sx;
    const targetCamZ = THREE.MathUtils.clamp(player.z + 4.9, -9.2, 15.2) + sz;
    const targetLookZ = THREE.MathUtils.clamp(player.z - 2.1, -13.5, 9.2);

    const k = 1 - Math.exp(-safeDt * 7);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, k);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 9.4, k);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, k);
    this.camera.lookAt(player.x * 0.25, 0.7, targetLookZ);

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
