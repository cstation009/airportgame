import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BagData, CameraStation, PassengerAppearance } from '../sim/types';
import { createLuggageMesh } from './LuggageFactory';
import { PassengerRig } from './PassengerRig';
import {
  createBrushedSteelTextures,
  createConveyorBeltTextures,
  createTerminalSignTexture,
  createTerrazzoFloorTextures,
  createXRayDecalTexture,
} from './textures';

interface CameraPreset {
  pos: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

const CAMERA_PRESETS: Record<CameraStation, CameraPreset> = {
  overview: {
    pos: new THREE.Vector3(-0.08, 1.62, 2.72),
    lookAt: new THREE.Vector3(0.05, 1.32, -0.45),
    fov: 50,
  },
  documents: {
    pos: new THREE.Vector3(-0.55, 1.56, 1.48),
    lookAt: new THREE.Vector3(-0.55, 1.38, -0.25),
    fov: 42,
  },
  xray: {
    pos: new THREE.Vector3(0.45, 1.58, 2.45),
    lookAt: new THREE.Vector3(1.38, 1.25, 0.05),
    fov: 45,
  },
};

export class CheckpointScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pmremGenerator: THREE.PMREMGenerator;

  private currentStation: CameraStation = 'overview';
  private currentLookAt = new THREE.Vector3(0.05, 1.26, -0.35);
  private pointerNorm = { x: 0, y: 0 };

  // Dynamic 3D elements
  private beltTexture!: THREE.CanvasTexture;
  private xrayScreenTexture: THREE.CanvasTexture | null = null;
  private xrayScreenMesh!: THREE.Mesh;
  private uvDeskLight!: THREE.PointLight;
  private statusBeaconMat!: THREE.MeshStandardMaterial;
  private archLedMat!: THREE.MeshStandardMaterial;
  private xrayActiveMat!: THREE.MeshStandardMaterial;
  private jetBeaconMat!: THREE.MeshStandardMaterial;
  private curtainsIn: THREE.Mesh[] = [];
  private curtainsOut: THREE.Mesh[] = [];

  // Active & exiting passenger rigs + luggage
  private activePassenger: PassengerRig | null = null;
  private activePaxTarget = new THREE.Vector3(-0.55, 0, -0.22);
  private exitingPassengers: Array<{
    rig: PassengerRig;
    waypoints: THREE.Vector3[];
    wpIdx: number;
    speed: number;
  }> = [];
  private queueRigs: PassengerRig[] = [];

  private activeLuggage: THREE.Group | null = null;
  private luggageZ = -1.35; // -1.35 entry, 0.35 inside tunnel, 1.75 exit
  private targetLuggageZ = 0.35;
  private beaconTimer = 0;
  private clockTime = 0;
  private xrayUploadCounter = 0;

  constructor(container: HTMLElement, xraySourceCanvas: HTMLCanvasElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c5d4e2');
    this.scene.fog = new THREE.Fog('#c8d6e4', 14, 42);

    this.camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.08,
      90,
    );
    this.camera.position.copy(CAMERA_PRESETS.overview.pos);
    this.camera.lookAt(CAMERA_PRESETS.overview.lookAt);

    // Physically based studio/terminal reflection environment
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTex = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.72;

    this.buildLighting();
    this.buildTerminalArchitecture();
    this.buildOutdoorTarmacAndJetliner();
    this.buildPodiumDesk();
    this.buildMetalDetectorArch();
    this.buildXRayScannerAndConveyor(xraySourceCanvas);
    this.buildStanchionsAndQueue();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.pointerNorm.x = (e.clientX / w) * 2 - 1;
    this.pointerNorm.y = (e.clientY / h) * 2 - 1;
  };

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight('#eef6ff', '#7b8794', 0.85);
    this.scene.add(hemi);

    // Warm afternoon sunlight streaming through the tarmac curtain wall
    const sun = new THREE.DirectionalLight('#fff2dc', 2.0);
    sun.position.set(6, 9, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 32;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Overhead cool-white recessed terminal fluorescent fixtures
    for (const lx of [-2.4, 0.2, 2.8]) {
      const pLight = new THREE.PointLight('#f1f7ff', 5.2, 11, 1.5);
      pLight.position.set(lx, 3.65, 0.4);
      this.scene.add(pLight);
    }

    // Soft key light directly illuminating the passenger's face at the podium
    const faceFill = new THREE.SpotLight('#ffffff', 4.5, 6, Math.PI * 0.32, 0.65, 1.2);
    faceFill.position.set(-0.4, 2.35, 1.4);
    faceFill.target.position.set(-0.55, 1.55, -0.2);
    this.scene.add(faceFill);
    this.scene.add(faceFill.target);

    // Interactive UV desk lamp point light (toggled when player turns on UV blacklight)
    this.uvDeskLight = new THREE.PointLight('#6366f1', 0, 2.2, 1.8);
    this.uvDeskLight.position.set(-0.55, 1.28, 0.72);
    this.scene.add(this.uvDeskLight);
  }

  private buildTerminalArchitecture(): void {
    const floorTex = createTerrazzoFloorTextures();
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex.map,
      roughnessMap: floorTex.roughnessMap,
      roughness: 0.34,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 20), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Yellow tactile floor safety line in front of podium
    const stripeMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.6 });
    const waitLine = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.004, 0.09), stripeMat);
    waitLine.position.set(-0.55, 0.003, -0.58);
    this.scene.add(waitLine);

    // Acoustic slatted ceiling + glowing fluorescent troffers
    const ceilingMat = new THREE.MeshStandardMaterial({ color: '#dde3ea', roughness: 0.85 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.1, -1);
    this.scene.add(ceiling);

    const trofferMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#f4f9ff',
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    for (const tz of [-2.8, 0.3, 3.0]) {
      for (const tx of [-3.2, -0.4, 2.4]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.55), trofferMat);
        panel.position.set(tx, 4.06, tz);
        this.scene.add(panel);
      }
    }

    // Structural brushed aluminum columns
    const steelTex = createBrushedSteelTextures();
    const colMat = new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.004,
      metalness: 0.72,
      roughness: 0.3,
    });
    for (const cx of [-5.2, 5.2]) {
      for (const cz of [-5.4, 0.6]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.1, 20), colMat);
        col.position.set(cx, 2.05, cz);
        col.castShadow = true;
        this.scene.add(col);
      }
    }

    // Side terminal walls
    const wallMat = new THREE.MeshStandardMaterial({ color: '#cfd7df', roughness: 0.75 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 16), wallMat);
    leftWall.position.set(-5.6, 2.1, -1);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 16), wallMat);
    rightWall.position.set(5.6, 2.1, -1);
    this.scene.add(rightWall);

    // Floor-to-ceiling tinted glass curtain wall overlooking the tarmac
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#cfe2f2',
      transparent: true,
      opacity: 0.22,
      roughness: 0.06,
      metalness: 0.1,
      reflectivity: 0.9,
    });
    const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 4.0), glassMat);
    glassWall.position.set(0, 2.0, -5.45);
    this.scene.add(glassWall);

    // Dark anodized aluminum window mullions
    const mullionMat = new THREE.MeshStandardMaterial({
      color: '#252e3a',
      metalness: 0.78,
      roughness: 0.28,
    });
    for (let mx = -4.8; mx <= 4.8; mx += 1.6) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.1, 0.12), mullionMat);
      bar.position.set(mx, 2.05, -5.42);
      this.scene.add(bar);
    }
    const transom = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.08, 0.12), mullionMat);
    transom.position.set(0, 2.75, -5.42);
    this.scene.add(transom);

    // Backlit overhead Concourse Security sign suspended by steel rods
    const signTex = createTerminalSignTexture(
      'SECURITY CHECKPOINT • LANE 04',
      'HAVE PHOTO ID & BOARDING PASS READY',
      '#f59e0b',
    );
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: '#ffffff',
      emissiveIntensity: 0.45,
      roughness: 0.35,
    });
    const signBody = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.74, 0.12), [
      mullionMat,
      mullionMat,
      mullionMat,
      mullionMat,
      signMat,
      mullionMat,
    ]);
    signBody.position.set(-0.2, 3.32, -1.6);
    this.scene.add(signBody);

    for (const rx of [-1.45, 1.05]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8), colMat);
      rod.position.set(rx, 3.8, -1.6);
      this.scene.add(rod);
    }
  }

  private buildOutdoorTarmacAndJetliner(): void {
    // Concrete airport apron tarmac outside the glass wall
    const tarmacMat = new THREE.MeshStandardMaterial({ color: '#6b747e', roughness: 0.92 });
    const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), tarmacMat);
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, -0.04, -30);
    this.scene.add(tarmac);

    // Taxiway yellow centerline
    const lineMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.7 });
    const taxiLine = new THREE.Mesh(new THREE.PlaneGeometry(45, 0.25), lineMat);
    taxiLine.rotation.x = -Math.PI / 2;
    taxiLine.position.set(0, -0.02, -14.5);
    this.scene.add(taxiLine);

    // Parked 3D Commercial Jetliner outside the terminal window!
    const jet = new THREE.Group();
    jet.position.set(2.8, 0, -16.5);
    jet.rotation.y = -0.32;

    const fuseMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.24, metalness: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ color: '#14335a', roughness: 0.35, metalness: 0.2 });
    const wingMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.32, metalness: 0.45 });
    const engineMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.35, metalness: 0.7 });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 11.5, 10, 20), fuseMat);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.position.y = 2.35;
    jet.add(fuselage);

    // Swept wings
    for (const sz of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 8.2), wingMat);
      wing.position.set(-0.4, 2.0, sz * 4.4);
      wing.rotation.y = sz * -0.28;
      jet.add(wing);

      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 1.9, 16), engineMat);
      engine.rotation.z = Math.PI / 2;
      engine.position.set(0.3, 1.45, sz * 3.1);
      jet.add(engine);
    }

    // Vertical tail stabilizer
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.1, 0.24), tailMat);
    tail.position.set(-5.7, 4.1, 0);
    tail.rotation.z = 0.25;
    jet.add(tail);

    // Blinking red anti-collision beacon on fuselage crown
    this.jetBeaconMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#ef4444',
      emissiveIntensity: 3,
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), this.jetBeaconMat);
    beacon.position.set(0.5, 3.55, 0);
    jet.add(beacon);

    // Jetway boarding bridge connecting terminal toward plane nose
    const bridgeMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6, metalness: 0.25 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 9.5), bridgeMat);
    bridge.position.set(4.5, 2.3, -10.5);
    bridge.rotation.y = 0.35;
    this.scene.add(bridge);

    this.scene.add(jet);
  }

  private buildPodiumDesk(): void {
    const steelTex = createBrushedSteelTextures();
    const darkPanelMat = new THREE.MeshStandardMaterial({
      color: '#1e2733',
      roughness: 0.48,
      metalness: 0.25,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      map: steelTex.map,
      metalness: 0.75,
      roughness: 0.28,
    });
    const counterTopMat = new THREE.MeshStandardMaterial({
      color: '#2c3644',
      roughness: 0.36,
      metalness: 0.15,
    });

    const podium = new THREE.Group();
    podium.position.set(-0.55, 0, 0.72);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.96, 0.72), darkPanelMat);
    base.position.y = 0.48;
    base.castShadow = true;
    base.receiveShadow = true;
    podium.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.06, 0.8), counterTopMat);
    top.position.y = 0.99;
    top.castShadow = true;
    top.receiveShadow = true;
    podium.add(top);

    // Illuminated Credential Authentication Technology (CAT) ID reader pad on the podium
    const padFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.32), steelMat);
    padFrame.position.set(-0.18, 1.04, 0.04);
    podium.add(padFrame);

    const padGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.01, 0.26),
      new THREE.MeshStandardMaterial({
        color: '#dbeafe',
        emissive: '#38bdf8',
        emissiveIntensity: 0.45,
        roughness: 0.15,
      }),
    );
    padGlass.position.set(-0.18, 1.062, 0.04);
    podium.add(padGlass);

    // Clear protective acrylic sneeze guard shield with stainless clamps
    const shieldMat = new THREE.MeshPhysicalMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.05,
    });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.68, 0.016), shieldMat);
    shield.position.set(0, 1.38, -0.35);
    podium.add(shield);

    for (const sx of [-0.52, 0.52]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 10), steelMat);
      post.position.set(sx, 1.36, -0.35);
      podium.add(post);
    }

    // Status LED strip along top of podium front
    this.statusBeaconMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#38bdf8',
      emissiveIntensity: 1.5,
    });
    const ledBar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.035, 0.04), this.statusBeaconMat);
    ledBar.position.set(0, 0.92, -0.37);
    podium.add(ledBar);

    this.scene.add(podium);
  }

  private buildMetalDetectorArch(): void {
    const archGroup = new THREE.Group();
    archGroup.position.set(-1.95, 0, -0.2);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#d4dae0',
      roughness: 0.48,
      metalness: 0.22,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.45,
      metalness: 0.5,
    });

    for (const sx of [-0.52, 0.52]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.62), bodyMat);
      panel.position.set(sx, 1.1, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      archGroup.add(panel);
    }

    const header = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.24, 0.64), trimMat);
    header.position.set(0, 2.26, 0);
    header.castShadow = true;
    archGroup.add(header);

    // Top pass/alarm LED bar
    this.archLedMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#22c55e',
      emissiveIntensity: 1.6,
    });
    const archLed = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.04), this.archLedMat);
    archLed.position.set(0, 2.26, 0.33);
    archGroup.add(archLed);

    this.scene.add(archGroup);
  }

  private buildXRayScannerAndConveyor(xraySourceCanvas: HTMLCanvasElement): void {
    const steelTex = createBrushedSteelTextures();
    const beltTex = createConveyorBeltTextures();
    this.beltTexture = beltTex.map;

    const steelMat = new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.005,
      metalness: 0.78,
      roughness: 0.28,
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: '#dde2e8',
      roughness: 0.42,
      metalness: 0.18,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: '#1b2430',
      roughness: 0.4,
      metalness: 0.65,
    });
    const beltMat = new THREE.MeshStandardMaterial({
      map: beltTex.map,
      bumpMap: beltTex.bumpMap,
      bumpScale: 0.012,
      roughness: 0.85,
      metalness: 0.06,
    });

    const xrayGroup = new THREE.Group();
    xrayGroup.position.set(1.52, 0, 0.05);

    // Long conveyor bed running along Z axis (-1.85 to +1.85)
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 3.85), steelMat);
    bedFrame.position.set(0, 0.76, 0);
    bedFrame.castShadow = true;
    bedFrame.receiveShadow = true;
    xrayGroup.add(bedFrame);

    // Moving rubber belt surface (rotated so texture scrolls along Z)
    const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 3.75), beltMat);
    beltMesh.position.set(0, 0.83, 0);
    beltMesh.receiveShadow = true;
    xrayGroup.add(beltMesh);

    // Support legs
    for (const lx of [-0.42, 0.42]) {
      for (const lz of [-1.65, -0.55, 0.55, 1.65]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.76, 10), darkMetalMat);
        leg.position.set(lx, 0.38, lz);
        leg.castShadow = true;
        xrayGroup.add(leg);
      }
    }

    // Central X-Ray Tunnel Housing (hollow tunnel so 3D luggage genuinely enters & passes through!)
    const decalTex = createXRayDecalTexture();
    const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, roughness: 0.38, metalness: 0.12 });
    const leftSideMaterials = [housingMat, decalMat, housingMat, housingMat, housingMat, housingMat];

    // Left and right tunnel walls
    for (const sx of [-0.52, 0.52]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.05, 1.52),
        sx < 0 ? leftSideMaterials : housingMat,
      );
      sideWall.position.set(sx, 1.28, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      xrayGroup.add(sideWall);
    }

    // Tunnel roof & radiation shielding hood
    const tunnelRoof = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.24, 1.54), housingMat);
    tunnelRoof.position.set(0, 1.72, 0);
    tunnelRoof.castShadow = true;
    xrayGroup.add(tunnelRoof);

    // Amber X-RAY ON indicator beacon on top of scanner
    this.xrayActiveMat = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#f59e0b',
      emissiveIntensity: 2.2,
    });
    const beaconDome = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 16), this.xrayActiveMat);
    beaconDome.position.set(0, 1.89, 0.55);
    xrayGroup.add(beaconDome);

    // Hanging dark lead-vinyl radiation curtain strips at both tunnel portals
    const curtainMat = new THREE.MeshStandardMaterial({
      color: '#1e242b',
      roughness: 0.72,
      metalness: 0.15,
    });
    for (let i = 0; i < 7; i++) {
      const stripX = -0.36 + i * 0.12;
      const slatIn = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.66, 0.015), curtainMat);
      slatIn.position.set(stripX, 1.24, -0.76);
      xrayGroup.add(slatIn);
      this.curtainsIn.push(slatIn);

      const slatOut = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.66, 0.015), curtainMat);
      slatOut.position.set(stripX, 1.24, 0.76);
      xrayGroup.add(slatOut);
      this.curtainsOut.push(slatOut);
    }

    // Articulated Dual-Energy Live Monitor mounted at operator eye level!
    const armPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 10), darkMetalMat);
    armPole.position.set(-0.42, 1.88, 0.42);
    xrayGroup.add(armPole);

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(-0.48, 1.92, 0.54);
    monitorGroup.rotation.y = -0.45;
    monitorGroup.rotation.x = 0.06;

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.54, 0.05), darkMetalMat);
    bezel.castShadow = true;
    monitorGroup.add(bezel);

    this.xrayScreenTexture = new THREE.CanvasTexture(xraySourceCanvas);
    this.xrayScreenTexture.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshStandardMaterial({
      map: this.xrayScreenTexture,
      emissiveMap: this.xrayScreenTexture,
      emissive: '#ffffff',
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    this.xrayScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.48), screenMat);
    this.xrayScreenMesh.position.z = 0.028;
    monitorGroup.add(this.xrayScreenMesh);

    xrayGroup.add(monitorGroup);
    this.scene.add(xrayGroup);
  }

  private buildStanchionsAndQueue(): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: '#202630',
      metalness: 0.75,
      roughness: 0.28,
    });
    const beltRibbonMat = new THREE.MeshStandardMaterial({
      color: '#183a66',
      roughness: 0.85,
    });

    const posts: Array<[number, number]> = [
      [-1.35, -1.1],
      [-1.35, -2.5],
      [-1.35, -3.9],
      [0.25, -1.1],
      [0.25, -2.5],
      [0.25, -3.9],
    ];

    for (const [px, pz] of posts) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.03, 18), postMat);
      base.position.set(px, 0.015, pz);
      this.scene.add(base);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.92, 12), postMat);
      pole.position.set(px, 0.46, pz);
      pole.castShadow = true;
      this.scene.add(pole);
    }

    // Retractable queue ribbons
    for (const rx of [-1.35, 0.25]) {
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 2.8), beltRibbonMat);
      ribbon.position.set(rx, 0.84, -2.5);
      this.scene.add(ribbon);
    }

    // Background waiting passengers in the queue for rich airport life
    const sampleQueueAppearances: PassengerAppearance[] = [
      {
        skinTone: '#d69f76',
        hairStyle: 'short',
        hairColor: '#251a14',
        facialHair: 'none',
        glasses: 'rectangular',
        jacketStyle: 'blazer',
        jacketColor: '#2c3a4c',
        shirtColor: '#e2e8f0',
        hatColor: '#2c3a4c',
        eyeColor: '#2d2219',
        heightScale: 1.0,
        buildScale: 1.0,
        genderPresentation: 'M',
      },
      {
        skinTone: '#f4d3bd',
        hairStyle: 'long',
        hairColor: '#6c492d',
        facialHair: 'none',
        glasses: 'none',
        jacketStyle: 'coat',
        jacketColor: '#5c2c2c',
        shirtColor: '#f8fafc',
        hatColor: '#5c2c2c',
        eyeColor: '#35506b',
        heightScale: 0.96,
        buildScale: 0.94,
        genderPresentation: 'F',
      },
    ];

    sampleQueueAppearances.forEach((app, idx) => {
      const rig = new PassengerRig(app, 0.1);
      rig.root.position.set(-0.55, 0, -2.05 - idx * 1.25);
      this.scene.add(rig.root);
      this.queueRigs.push(rig);
    });
  }

  public setCameraStation(station: CameraStation): void {
    this.currentStation = station;
  }

  public setUvLightActive(active: boolean): void {
    this.uvDeskLight.intensity = active ? 3.8 : 0;
  }

  public spawnPassenger(appearance: PassengerAppearance, nervousness: number, bag: BagData): void {
    // Remove old active luggage if still present
    if (this.activeLuggage) {
      this.scene.remove(this.activeLuggage);
      this.activeLuggage = null;
    }

    // Create new 3D passenger walking up from the queue to the podium
    const rig = new PassengerRig(appearance, nervousness);
    rig.root.position.set(-0.55, 0, -1.65);
    this.scene.add(rig.root);
    this.activePassenger = rig;
    this.activePaxTarget.set(-0.55, 0, -0.22);

    // Create matching 3D suitcase in TSA gray bin entering the conveyor
    this.activeLuggage = createLuggageMesh(bag);
    this.luggageZ = -1.65;
    this.targetLuggageZ = 0.05;
    this.activeLuggage.position.set(1.52, 0.84, this.luggageZ);
    this.scene.add(this.activeLuggage);
  }

  public dismissCurrentPassenger(cleared: boolean): void {
    if (this.activePassenger) {
      const rig = this.activePassenger;
      this.activePassenger = null;

      const waypoints = cleared
        ? [
            new THREE.Vector3(-1.95, 0, -0.22),
            new THREE.Vector3(-1.95, 0, 2.2),
            new THREE.Vector3(-3.6, 0, 3.6),
          ]
        : [
            new THREE.Vector3(0.15, 0, -0.8),
            new THREE.Vector3(2.8, 0, -2.6),
            new THREE.Vector3(4.5, 0, -3.5),
          ];

      this.exitingPassengers.push({
        rig,
        waypoints,
        wpIdx: 0,
        speed: cleared ? 1.55 : 1.85,
      });
    }

    // Flash checkpoint LED beacons green or red
    const hex = cleared ? '#22c55e' : '#ef4444';
    this.statusBeaconMat.color.set(hex);
    this.statusBeaconMat.emissive.set(hex);
    this.archLedMat.color.set(hex);
    this.archLedMat.emissive.set(hex);
    this.beaconTimer = 2.2;
  }

  /**
   * Synchronize 3D luggage position & belt animation with the X-ray scanner belt offset.
   * bagOffsetX = 0 means centered right inside the X-ray tunnel (z = 0.35).
   */
  public syncConveyor(bagOffsetX: number, beltVelocity: number): void {
    // Map X-ray screen horizontal offset (-280..+280 px) to 3D Z axis (-1.45..+1.55)
    this.targetLuggageZ = 0.05 - (bagOffsetX / 260) * 1.45;

    // Scroll ribbed belt texture smoothly
    if (this.beltTexture && Math.abs(beltVelocity) > 0.01) {
      this.beltTexture.offset.x -= beltVelocity * 0.0022;
    }

    if (this.xrayScreenTexture) {
      this.xrayUploadCounter = (this.xrayUploadCounter + 1) % 4;
      if (this.xrayUploadCounter === 0) {
        this.xrayScreenTexture.needsUpdate = true;
      }
    }
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.clockTime += safeDt;

    // 1. Smoothly interpolate camera toward selected station + subtle organic mouse look
    const preset = CAMERA_PRESETS[this.currentStation];
    const parallaxScale = this.currentStation === 'overview' ? 0.08 : 0.03;
    const desiredPos = preset.pos.clone().add(
      new THREE.Vector3(
        this.pointerNorm.x * parallaxScale,
        -this.pointerNorm.y * parallaxScale * 0.55,
        0,
      ),
    );
    const desiredLook = preset.lookAt.clone().add(
      new THREE.Vector3(
        this.pointerNorm.x * parallaxScale * 0.7,
        -this.pointerNorm.y * parallaxScale * 0.4,
        0,
      ),
    );

    const lerpFactor = 1 - Math.exp(-safeDt * 6.5);
    this.camera.position.lerp(desiredPos, lerpFactor);
    this.currentLookAt.lerp(desiredLook, lerpFactor);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, preset.fov, lerpFactor);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.currentLookAt);

    // 2. Active passenger stepping up to podium
    if (this.activePassenger) {
      const pos = this.activePassenger.root.position;
      const dist = pos.distanceTo(this.activePaxTarget);
      if (dist > 0.03) {
        const dir = this.activePaxTarget.clone().sub(pos).normalize();
        pos.addScaledVector(dir, Math.min(dist, safeDt * 1.45));
        this.activePassenger.root.rotation.y = Math.atan2(dir.x, dir.z);
        this.activePassenger.update(safeDt, true);
      } else {
        // Face directly toward the security officer
        this.activePassenger.root.rotation.y = THREE.MathUtils.lerp(
          this.activePassenger.root.rotation.y,
          0.08,
          safeDt * 6,
        );
        this.activePassenger.update(safeDt, false);
      }
    }

    // 3. Exiting passengers walking through metal detector or escorted away
    for (let i = this.exitingPassengers.length - 1; i >= 0; i--) {
      const entry = this.exitingPassengers[i];
      const wp = entry.waypoints[entry.wpIdx];
      const pos = entry.rig.root.position;
      const dist = pos.distanceTo(wp);
      if (dist < 0.08) {
        entry.wpIdx++;
        if (entry.wpIdx >= entry.waypoints.length) {
          this.scene.remove(entry.rig.root);
          this.exitingPassengers.splice(i, 1);
          continue;
        }
      } else {
        const dir = wp.clone().sub(pos).normalize();
        pos.addScaledVector(dir, Math.min(dist, safeDt * entry.speed));
        entry.rig.root.rotation.y = Math.atan2(dir.x, dir.z);
        entry.rig.update(safeDt, true);
      }
    }

    // 4. Waiting queue idle animations
    for (const q of this.queueRigs) {
      q.update(safeDt, false);
    }

    // 5. Luggage movement & realistic lead-curtain sway when suitcase brushes through portals
    if (this.activeLuggage) {
      this.luggageZ = THREE.MathUtils.lerp(this.luggageZ, this.targetLuggageZ, 1 - Math.exp(-safeDt * 9));
      this.activeLuggage.position.z = this.luggageZ;

      const distIn = Math.abs(this.luggageZ - (0.35 - 0.76));
      const distOut = Math.abs(this.luggageZ - (0.35 + 0.76));
      const swayIn = distIn < 0.42 ? (1 - distIn / 0.42) * 0.48 : 0;
      const swayOut = distOut < 0.42 ? (1 - distOut / 0.42) * 0.48 : 0;

      for (const s of this.curtainsIn) {
        s.rotation.x = THREE.MathUtils.lerp(s.rotation.x, swayIn, safeDt * 10);
      }
      for (const s of this.curtainsOut) {
        s.rotation.x = THREE.MathUtils.lerp(s.rotation.x, -swayOut, safeDt * 10);
      }
    }

    // 6. Beacon pulse & jetliner anti-collision strobe
    this.jetBeaconMat.emissiveIntensity = Math.sin(this.clockTime * 4.5) > 0.75 ? 4.5 : 0.2;
    this.xrayActiveMat.emissiveIntensity = 1.6 + Math.sin(this.clockTime * 3.2) * 0.6;

    if (this.beaconTimer > 0) {
      this.beaconTimer -= safeDt;
      if (this.beaconTimer <= 0) {
        this.statusBeaconMat.color.set('#38bdf8');
        this.statusBeaconMat.emissive.set('#38bdf8');
        this.archLedMat.color.set('#22c55e');
        this.archLedMat.emissive.set('#22c55e');
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.pmremGenerator.dispose();
    this.renderer.dispose();
  }
}
