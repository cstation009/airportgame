import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PassengerRig } from '../scene/PassengerRig';
import { createBrushedSteelTextures } from '../scene/textures';
import { CABIN_BOUNDS } from './flightLogic';
import type { CabinPerson, CoverObstacle, FlightProjectile } from './flightTypes';

interface PersonVisual {
  rig: PassengerRig;
  overheadMarker: THREE.Mesh;
  overheadMat: THREE.MeshBasicMaterial;
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

  // First-person held Tactical Taser X2 viewmodel attached to camera
  private readonly taserGroup: THREE.Group;
  private readonly taserMuzzleRef: THREE.Object3D;
  private readonly muzzleLight: THREE.PointLight;
  private taserRecoil = 0;
  private eyeHeight = 1.58;
  private walkBob = 0;

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
    this.renderer.toneMappingExposure = 1.18;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#284b7a');
    this.scene.fog = new THREE.Fog('#1f3858', 18, 45);

    this.camera = new THREE.PerspectiveCamera(
      66,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.06,
      80,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.58, 9.8);
    this.scene.add(this.camera);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.72;

    this.buildLighting();
    this.buildSkyAndClouds();
    this.buildAircraftCabin(obstacles);

    // Build First-Person Held Tactical Taser X2 Viewmodel
    const { group, muzzleRef } = this.buildFirstPersonTaser();
    this.taserGroup = group;
    this.taserMuzzleRef = muzzleRef;
    this.camera.add(this.taserGroup);

    this.muzzleLight = new THREE.PointLight('#38bdf8', 0, 5.5, 1.8);
    this.camera.add(this.muzzleLight);
    this.muzzleLight.position.set(0.24, -0.18, -0.65);

    window.addEventListener('resize', this.handleResize);
  }

  public getDomElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private buildFirstPersonTaser(): { group: THREE.Group; muzzleRef: THREE.Object3D } {
    const group = new THREE.Group();
    group.position.set(0.27, -0.24, -0.46);

    const yellowMat = new THREE.MeshStandardMaterial({
      color: '#eab308',
      roughness: 0.34,
      metalness: 0.22,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#181e28',
      roughness: 0.42,
      metalness: 0.45,
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.75,
    });
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: '#161f2c',
      roughness: 0.8,
    });

    // Main yellow tactical Taser X2 housing
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.088, 0.24), yellowMat);
    group.add(body);

    // Top dark sight rail & status LED screen
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.2), darkMat);
    rail.position.set(0, 0.05, 0.01);
    group.add(rail);

    const ledMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const rearLed = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.006), ledMat);
    rearLed.position.set(0, 0.018, 0.122);
    group.add(rearLed);

    // Dual front cartridge bay + cyan laser diode emitter
    const frontCart = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.072, 0.055), darkMat);
    frontCart.position.set(0, -0.004, -0.14);
    group.add(frontCart);

    const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), ledMat);
    laserDot.position.set(0, -0.024, -0.17);
    group.add(laserDot);

    // Angled grip & Marshal's gloved hand / suit cuff
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.065), darkMat);
    grip.position.set(0, -0.085, 0.055);
    grip.rotation.x = 0.24;
    group.add(grip);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.09), gloveMat);
    hand.position.set(0, -0.085, 0.06);
    group.add(hand);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.24, 12), sleeveMat);
    cuff.rotation.x = Math.PI * 0.42;
    cuff.position.set(0.02, -0.14, 0.22);
    group.add(cuff);

    const muzzleRef = new THREE.Object3D();
    muzzleRef.position.set(0, 0.01, -0.18);
    group.add(muzzleRef);

    return { group, muzzleRef };
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight('#e8f4ff', '#334155', 1.25);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff5e4', 1.55);
    sun.position.set(-8, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 32;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.scene.add(sun);

    const cabinFill = new THREE.DirectionalLight('#dbeafe', 0.9);
    cabinFill.position.set(4, 6, 12);
    this.scene.add(cabinFill);

    this.alertLight = new THREE.PointLight('#ef4444', 0, 14, 1.4);
    this.alertLight.position.set(0, 2.35, -11.5);
    this.scene.add(this.alertLight);
  }

  private buildSkyAndClouds(): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#eef5fc',
      roughness: 0.95,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 20; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(2.4 + (i % 4) * 0.9, 10, 8),
        cloudMat,
      );
      puff.scale.set(1.8, 0.45, 2.6);
      puff.position.set(
        side * (6.8 + (i % 4) * 2.2),
        -1.2 - (i % 3) * 1.1,
        -28 + i * 3.1,
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
      color: '#e2e8f0',
      roughness: 0.44,
      metalness: 0.12,
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: '#cfd8e3',
      roughness: 0.55,
      metalness: 0.08,
    });
    const binMat = new THREE.MeshStandardMaterial({
      color: '#d8e0ea',
      roughness: 0.38,
      metalness: 0.14,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      map: steelTex.map,
      metalness: 0.8,
      roughness: 0.28,
    });
    const windowGlassMat = new THREE.MeshStandardMaterial({
      color: '#93c5fd',
      emissive: '#60a5fa',
      emissiveIntensity: 0.85,
      roughness: 0.1,
    });

    // Main cabin deck floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 26.8), floorMat);
    floor.position.set(0, -0.1, -1.0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Enclosed curved cabin ceiling vault for true First-Person immersion!
    const ceilingCenter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 26.8), ceilingMat);
    ceilingCenter.position.set(0, 2.68, -1.0);
    this.scene.add(ceilingCenter);

    // Glowing overhead indirect cabin LED cove strips running the full length of the plane
    const coveLedMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      emissive: '#bae6fd',
      emissiveIntensity: 1.9,
    });
    for (const sx of [-0.95, 0.95]) {
      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 25.2), coveLedMat);
      ledStrip.position.set(sx, 2.58, -1.0);
      this.scene.add(ledStrip);
    }

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

    // Left & Right pressurized fuselage walls + sculpted overhead luggage stowage bins!
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.7, 26.8), fuselageMat);
      wall.position.set(side * 2.72, 1.35, -1.0);
      wall.receiveShadow = true;
      this.scene.add(wall);

      // Overhead luggage bins sloping over seat rows
      const bin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.52, 25.4), binMat);
      bin.position.set(side * 1.82, 2.24, -1.0);
      bin.rotation.z = side * 0.24;
      this.scene.add(bin);

      // Metallic bin latch trim strip
      const latchStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.05, 25.4),
        new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.7, roughness: 0.3 }),
      );
      latchStrip.position.set(side * 1.04, 2.02, -1.0);
      this.scene.add(latchStrip);

      // Illuminated oval aircraft windows
      for (let wz = -11.4; wz <= 10.2; wz += 1.65) {
        const winFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.56, 0.4),
          new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4 }),
        );
        winFrame.position.set(side * 2.57, 1.24, wz);
        this.scene.add(winFrame);

        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.3), windowGlassMat);
        pane.position.set(side * 2.56, 1.24, wz);
        this.scene.add(pane);
      }
    }

    // Overhead glowing green EXIT / Fasten Seatbelt gantry arches
    const exitMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#ef4444',
      emissiveIntensity: 1.8,
    });
    for (const gz of [-6.4, 1.8]) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.14, 0.08),
        new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 }),
      );
      box.position.set(0, 2.46, gz);
      this.scene.add(box);

      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.09), exitMat);
      glow.position.set(0, 2.46, gz);
      this.scene.add(glow);
    }

    // Rear Galley Wall
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.7, 0.35), fuselageMat);
    rearWall.position.set(0, 1.35, 12.2);
    this.scene.add(rearWall);

    // Armored Flight Deck / Cockpit Wall & Door
    const cockpitWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.75, 0.4), fuselageMat);
    cockpitWall.position.set(0, 1.35, -13.8);
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

    const signTex = createCockpitSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: '#ffffff',
      emissiveIntensity: 0.8,
    });
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.08), signMat);
    signMesh.position.set(0, 2.26, CABIN_BOUNDS.cockpitDoorZ - 0.3);
    this.scene.add(signMesh);

    this.cockpitLedMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#22c55e',
      emissiveIntensity: 2.2,
    });
    const cockpitLed = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.08), this.cockpitLedMat);
    cockpitLed.position.set(0, 2.04, CABIN_BOUNDS.cockpitDoorZ - 0.28);
    this.scene.add(cockpitLed);

    // Airline seats, bulkheads, and galley carts matching CoverObstacle bounds
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

        const baseBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.1, 0.24), armrestMat);
        baseBar.position.set(cx, 0.22, cz);
        this.scene.add(baseBar);

        for (let i = 0; i < seatCount; i++) {
          const sx = obs.minX + seatW * (i + 0.5) + 0.04;

          const cushion = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.06, 0.14, d * 0.78), mat);
          cushion.position.set(sx, 0.42, cz - 0.04);
          cushion.castShadow = true;
          cushion.receiveShadow = true;
          this.scene.add(cushion);

          const back = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.06, 0.72, 0.14), mat);
          back.position.set(sx, 0.78, cz + d * 0.34);
          back.rotation.x = 0.12;
          back.castShadow = true;
          back.receiveShadow = true;
          this.scene.add(back);

          const cover = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.14, 0.2, 0.16), headrestMat);
          cover.position.set(sx, 1.04, cz + d * 0.36);
          cover.rotation.x = 0.12;
          this.scene.add(cover);

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
    for (const vis of this.personVisuals.values()) {
      this.scene.remove(vis.rig.root);
      this.scene.remove(vis.overheadMarker);
      this.scene.remove(vis.stunArc);
    }
    this.personVisuals.clear();

    for (const p of people) {
      const rig = new PassengerRig(p.appearance, p.role === 'hijacker' ? 0.95 : 0.1);
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.facingAngle;
      this.scene.add(rig.root);

      const weaponMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.07, 0.26),
        new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.85, roughness: 0.2 }),
      );
      weaponMesh.position.set(0.24, 1.15, 0.28);
      weaponMesh.visible = false;
      rig.root.add(weaponMesh);

      // Crisp floating 3D diamond beacon above head so targets pop clearly in First-Person!
      const overheadMat = new THREE.MeshBasicMaterial({
        color: '#f59e0b',
        transparent: true,
        opacity: 0,
      });
      const overheadMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), overheadMat);
      overheadMarker.position.set(p.x, 1.95, p.z);
      this.scene.add(overheadMarker);

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

      this.personVisuals.set(p.id, { rig, overheadMarker, overheadMat, stunArc, weaponMesh });
    }
  }

  public spawnTaserBeamTo(targetX: number, targetY: number, targetZ: number): void {
    const start = new THREE.Vector3();
    this.taserMuzzleRef.getWorldPosition(start);

    const end = new THREE.Vector3(targetX, targetY, targetZ);
    const pts: THREE.Vector3[] = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const jitter = i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 0.1;
      pts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(start.x, end.x, t) + jitter,
          THREE.MathUtils.lerp(start.y, end.y, t) + jitter * 0.7,
          THREE.MathUtils.lerp(start.z, end.z, t) + jitter,
        ),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#7dd3fc' });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.taserBeams.push({ line, life: 0.2 });

    this.muzzleLight.intensity = 7.5;
    this.taserRecoil = 1;
    this.shakeAmount = Math.max(this.shakeAmount, 0.035);
  }

  public triggerShake(amount = 0.08): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Cast a ray from center crosshair (or screen coordinates) for First-Person aiming */
  public getAimRay(ndcX = 0, ndcY = 0): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return {
      origin: raycaster.ray.origin.clone(),
      dir: raycaster.ray.direction.clone().normalize(),
    };
  }

  public update(
    dt: number,
    player: {
      x: number;
      z: number;
      yaw: number;
      pitch: number;
      isMoving: boolean;
      inCover: boolean;
      crouching: boolean;
    },
    people: CabinPerson[],
    projectiles: FlightProjectile[],
    cockpitUnderAttack: boolean,
  ): void {
    const safeDt = Math.max(0.001, Math.min(dt, 0.05));
    this.clockTime += safeDt;

    // 1. Scroll sunlit clouds outside the oval cabin windows
    for (const cloud of this.clouds) {
      cloud.position.z += safeDt * 15;
      if (cloud.position.z > 28) cloud.position.z = -38;
    }

    // 2. Smooth First-Person eye height, walk bob, and Taser X2 viewmodel animation
    const targetEyeY = player.crouching ? 0.94 : 1.58;
    this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, targetEyeY, 1 - Math.exp(-safeDt * 10));

    if (player.isMoving) {
      this.walkBob += safeDt * (player.crouching ? 6.5 : 10.2);
    }
    const bobY = player.isMoving ? Math.sin(this.walkBob) * 0.028 : Math.sin(this.clockTime * 1.8) * 0.004;
    const bobX = player.isMoving ? Math.cos(this.walkBob * 0.5) * 0.016 : 0;

    this.shakeAmount = Math.max(0, this.shakeAmount - safeDt * 0.55);
    const sx = (Math.random() - 0.5) * this.shakeAmount;
    const sy = (Math.random() - 0.5) * this.shakeAmount;

    this.camera.position.set(player.x + sx, this.eyeHeight + bobY + sy, player.z);
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;

    // First-person Taser recoil & smooth sway
    this.taserRecoil = Math.max(0, this.taserRecoil - safeDt * 6.5);
    this.taserGroup.position.set(
      0.27 + bobX * 0.6,
      -0.24 - Math.abs(bobY) * 0.5 + this.taserRecoil * 0.025,
      -0.46 + this.taserRecoil * 0.065,
    );
    this.taserGroup.rotation.x = this.taserRecoil * 0.22;
    this.taserGroup.rotation.z = player.inCover ? 0.18 : 0;

    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - safeDt * 42);

    // 3. Update cabin passengers & clear overhead 3D threat beacons
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
      if (isSeated) yOffset = p.ducked ? -0.58 : -0.36;
      else if (isSubdued) yOffset = -0.52;
      else if (p.state === 'taking_cover') yOffset = -0.32;

      vis.rig.root.position.set(p.x, yOffset, p.z);
      vis.rig.root.rotation.y = p.facingAngle;
      vis.rig.root.rotation.x = isSubdued ? 0.48 : isStunned ? Math.sin(this.clockTime * 35) * 0.14 : 0;
      vis.rig.update(safeDt, p.state === 'exposed_advancing');

      vis.weaponMesh.visible = isActive;
      vis.stunArc.visible = isStunned;
      if (isStunned) {
        vis.stunArc.position.set(p.x, 1.0, p.z);
        vis.stunArc.rotation.y += safeDt * 12;
      }

      // Floating 3D diamond beacon above head (spins gently & clearly marks threats in FPS view!)
      const bobMarker = Math.sin(this.clockTime * 4.5) * 0.05;
      vis.overheadMarker.position.set(p.x, (isSeated ? 1.56 : 1.98) + bobMarker, p.z);
      vis.overheadMarker.rotation.y += safeDt * 2.4;

      const distToPlayer = Math.hypot(p.x - player.x, p.z - player.z);
      if (isSubdued) {
        vis.overheadMat.color.set('#22c55e');
        vis.overheadMat.opacity = 0.78;
      } else if (isActive || isStunned) {
        vis.overheadMat.color.set('#ef4444');
        vis.overheadMat.opacity = 0.92;
      } else if (p.scanned) {
        vis.overheadMat.color.set(p.role === 'hijacker' ? '#ef4444' : '#22c55e');
        vis.overheadMat.opacity = p.role === 'hijacker' ? 0.9 : 0.35;
      } else if (p.role === 'hijacker' && distToPlayer < 8.5) {
        // Helpful golden/amber nervous tell beacon when approaching a disguised hijacker!
        vis.overheadMat.color.set('#f59e0b');
        vis.overheadMat.opacity = 0.55 + Math.sin(this.clockTime * 6) * 0.3;
      } else {
        vis.overheadMat.opacity = 0;
      }
    }

    // 4. Sync hostile projectiles
    const aliveProjIds = new Set<string>();
    for (const proj of projectiles) {
      aliveProjIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshBasicMaterial({ color: '#f97316' }),
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }
      mesh.position.set(proj.x, 1.18, proj.z);
    }
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!aliveProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }

    // 5. Fade electric cyan taser beams
    for (let i = this.taserBeams.length - 1; i >= 0; i--) {
      this.taserBeams[i].life -= safeDt;
      if (this.taserBeams[i].life <= 0) {
        this.scene.remove(this.taserBeams[i].line);
        this.taserBeams[i].line.geometry.dispose();
        this.taserBeams.splice(i, 1);
      }
    }

    // 6. Cockpit alarm red strobe if breached
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

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
