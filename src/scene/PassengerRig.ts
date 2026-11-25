import * as THREE from 'three';
import type { PassengerAppearance } from '../sim/types';

export class PassengerRig {
  public readonly root: THREE.Group;
  private readonly headGroup: THREE.Group;
  private readonly torsoGroup: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private walkPhase = 0;
  private idlePhase = Math.random() * Math.PI * 2;
  private nervousness: number;

  constructor(app: PassengerAppearance, nervousness = 0.2) {
    this.root = new THREE.Group();
    this.nervousness = nervousness;

    const skinMat = new THREE.MeshStandardMaterial({
      color: app.skinTone,
      roughness: 0.56,
      metalness: 0.02,
    });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: app.jacketColor,
      roughness: 0.78,
      metalness: 0.04,
    });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: app.shirtColor,
      roughness: 0.72,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: '#1f252e',
      roughness: 0.82,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: '#14171c',
      roughness: 0.45,
      metalness: 0.1,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: app.hairColor,
      roughness: 0.75,
    });

    // Legs (pivoted at hips y = 0.92)
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.11, 0.92, 0);
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.11, 0.92, 0);

    for (const leg of [this.leftLeg, this.rightLeg]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.68, 6, 12), pantsMat);
      thigh.position.y = -0.42;
      thigh.castShadow = true;
      leg.add(thigh);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.23), shoeMat);
      shoe.position.set(0, -0.88, 0.04);
      shoe.castShadow = true;
      leg.add(shoe);
      this.root.add(leg);
    }

    // Torso (anatomically tapered upper chest + waist)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.94, 0);
    this.root.add(this.torsoGroup);

    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19 * app.buildScale, 0.155 * app.buildScale, 0.52, 16),
      jacketMat,
    );
    chest.scale.set(1.22, 1, 0.68);
    chest.position.y = 0.28;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torsoGroup.add(chest);

    // Sculpted shoulder slope & deltoid caps
    const shoulderBridge = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.088, 0.32 * app.buildScale, 8, 12),
      jacketMat,
    );
    shoulderBridge.rotation.z = Math.PI / 2;
    shoulderBridge.scale.set(1, 1, 0.85);
    shoulderBridge.position.set(0, 0.5, 0);
    shoulderBridge.castShadow = true;
    this.torsoGroup.add(shoulderBridge);

    // Tailored V-neck inner shirt & jacket lapels
    const collarGeo = new THREE.ConeGeometry(0.085, 0.24, 3);
    const shirtV = new THREE.Mesh(collarGeo, shirtMat);
    shirtV.rotation.x = Math.PI;
    shirtV.scale.set(1.1, 1, 0.3);
    shirtV.position.set(0, 0.43, 0.12);
    this.torsoGroup.add(shirtV);

    const lapelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(app.jacketColor).multiplyScalar(0.82),
      roughness: 0.72,
    });
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.24, 0.025), lapelMat);
      lapel.position.set(sx * 0.065, 0.42, 0.125);
      lapel.rotation.z = sx * -0.22;
      this.torsoGroup.add(lapel);
    }

    // Arms (pivoted at natural shoulder joints)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.23 * app.buildScale, 0.49, 0);
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.23 * app.buildScale, 0.49, 0);

    for (const arm of [this.leftArm, this.rightArm]) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.42, 6, 12), jacketMat);
      sleeve.position.y = -0.24;
      sleeve.castShadow = true;
      arm.add(sleeve);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.04, 10), shirtMat);
      cuff.position.y = -0.47;
      arm.add(cuff);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), skinMat);
      hand.scale.set(0.85, 1.15, 0.75);
      hand.position.y = -0.52;
      arm.add(hand);
      this.torsoGroup.add(arm);
    }

    // Neck & Head Group
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.12, 12), skinMat);
    neck.position.set(0, 0.57, 0);
    this.torsoGroup.add(neck);

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.72, 0);
    this.torsoGroup.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.128, 18, 16), skinMat);
    head.scale.set(0.92, 1.08, 0.96);
    head.castShadow = true;
    this.headGroup.add(head);

    // Ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skinMat);
      ear.scale.set(0.55, 1.2, 0.8);
      ear.position.set(sx * 0.118, 0.0, 0);
      this.headGroup.add(ear);
    }

    // Eyes & eyebrows
    const scleraMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: app.eyeColor, roughness: 0.15 });
    for (const sx of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), scleraMat);
      sclera.position.set(sx * 0.044, 0.02, 0.108);
      this.headGroup.add(sclera);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), pupilMat);
      pupil.position.set(sx * 0.044, 0.02, 0.121);
      this.headGroup.add(pupil);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.01, 0.014), hairMat);
      brow.position.set(sx * 0.044, 0.048, 0.114);
      this.headGroup.add(brow);
    }

    // Nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.044, 8), skinMat);
    nose.rotation.x = Math.PI * 0.42;
    nose.position.set(0, -0.006, 0.126);
    this.headGroup.add(nose);

    // Facial hair matching ID portrait
    if (app.facialHair === 'beard') {
      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(0.118, 14, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
        hairMat,
      );
      beard.scale.set(0.95, 1.08, 1.02);
      beard.position.set(0, -0.015, 0.012);
      this.headGroup.add(beard);
    } else if (app.facialHair === 'stubble') {
      const stubbleMat = new THREE.MeshStandardMaterial({
        color: '#25201c',
        transparent: true,
        opacity: 0.35,
        roughness: 0.9,
      });
      const stubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 12, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.4),
        stubbleMat,
      );
      stubble.scale.set(0.94, 1.06, 1.01);
      stubble.position.set(0, -0.012, 0.008);
      this.headGroup.add(stubble);
    }
    if (app.facialHair === 'mustache' || app.facialHair === 'beard') {
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.016, 0.022), hairMat);
      stache.position.set(0, -0.036, 0.118);
      this.headGroup.add(stache);
    }

    // Glasses matching ID portrait
    if (app.glasses !== 'none') {
      const frameMat = new THREE.MeshStandardMaterial({
        color: '#18202c',
        metalness: 0.7,
        roughness: 0.25,
      });
      const lensMat = new THREE.MeshPhysicalMaterial({
        color: app.glasses === 'aviator' ? '#0f172a' : '#dbeafe',
        transparent: true,
        opacity: app.glasses === 'aviator' ? 0.72 : 0.32,
        roughness: 0.08,
        metalness: 0.2,
      });

      for (const sx of [-1, 1]) {
        const lens =
          app.glasses === 'round'
            ? new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16), lensMat)
            : new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.036, 0.006), lensMat);
        if (app.glasses === 'round') lens.rotation.x = Math.PI / 2;
        lens.position.set(sx * 0.045, 0.02, 0.132);
        this.headGroup.add(lens);

        const rim =
          app.glasses === 'round'
            ? new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.004, 8, 18), frameMat)
            : new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.042, 0.004), frameMat);
        rim.position.set(sx * 0.045, 0.02, 0.13);
        if (app.glasses !== 'round') {
          rim.scale.set(1, 1, 0.5);
        }
        this.headGroup.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.006), frameMat);
      bridge.position.set(0, 0.024, 0.133);
      this.headGroup.add(bridge);
    }

    // Hair / Headwear matching ID portrait
    const hatMat = new THREE.MeshStandardMaterial({ color: app.hatColor, roughness: 0.8 });
    if (app.hairStyle === 'short' || app.hairStyle === 'parted') {
      const capHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hairMat,
      );
      capHair.scale.set(0.95, 1.06, 1.02);
      capHair.position.set(0, 0.015, -0.006);
      this.headGroup.add(capHair);
    } else if (app.hairStyle === 'buzz') {
      const buzz = new THREE.Mesh(
        new THREE.SphereGeometry(0.131, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        hairMat,
      );
      buzz.scale.set(0.93, 1.04, 0.98);
      buzz.position.set(0, 0.01, -0.004);
      this.headGroup.add(buzz);
    } else if (app.hairStyle === 'curly') {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), hairMat);
        puff.position.set(Math.cos(ang) * 0.095, 0.085 + (i % 2) * 0.024, Math.sin(ang) * 0.095);
        this.headGroup.add(puff);
      }
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), hairMat);
      crown.position.set(0, 0.105, 0);
      this.headGroup.add(crown);
    } else if (app.hairStyle === 'long') {
      const topHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
        hairMat,
      );
      topHair.position.set(0, 0.016, -0.006);
      this.headGroup.add(topHair);
      const backHair = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.22, 8, 12), hairMat);
      backHair.scale.set(1.15, 1, 0.72);
      backHair.position.set(0, -0.09, -0.055);
      this.headGroup.add(backHair);
    } else if (app.hairStyle === 'beanie') {
      const beanie = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
        hatMat,
      );
      beanie.position.set(0, 0.025, 0);
      this.headGroup.add(beanie);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.024, 8, 20), hatMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, 0.048, 0);
      this.headGroup.add(cuff);
    } else if (app.hairStyle === 'cap') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hatMat,
      );
      dome.position.set(0, 0.025, 0);
      this.headGroup.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.014, 0.14), hatMat);
      brim.position.set(0, 0.052, 0.115);
      brim.rotation.x = 0.08;
      this.headGroup.add(brim);
    }

    this.root.scale.setScalar(app.heightScale);
  }

  public update(dt: number, isWalking: boolean): void {
    this.idlePhase += dt;

    if (isWalking) {
      this.walkPhase += dt * 7.2;
      const swing = Math.sin(this.walkPhase) * 0.45;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.65;
      this.rightArm.rotation.x = swing * 0.65;
      this.torsoGroup.position.y = 0.94 + Math.abs(Math.sin(this.walkPhase)) * 0.025;
      this.headGroup.rotation.y *= 0.85;
    } else {
      // Smoothly return to standing posture + realistic breathing & subtle nervous micro-glances
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
      this.leftArm.rotation.x *= 0.85;
      this.rightArm.rotation.x *= 0.85;

      const breath = Math.sin(this.idlePhase * 1.9) * 0.008;
      this.torsoGroup.position.y = 0.94 + breath;

      const glanceAmp = 0.08 + this.nervousness * 0.24;
      const glanceSpeed = 0.7 + this.nervousness * 1.1;
      this.headGroup.rotation.y = Math.sin(this.idlePhase * glanceSpeed) * glanceAmp;
      this.headGroup.rotation.x = Math.sin(this.idlePhase * 0.9) * 0.04;
    }
  }
}
