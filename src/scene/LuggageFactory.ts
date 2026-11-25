import * as THREE from 'three';
import type { BagData } from '../sim/types';

export function createLuggageMesh(bag: BagData): THREE.Group {
  const group = new THREE.Group();

  // Molded gray TSA plastic security tray underneath
  const trayMat = new THREE.MeshStandardMaterial({
    color: '#6b7582',
    roughness: 0.62,
    metalness: 0.05,
  });
  const trayBase = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.04, 0.52), trayMat);
  trayBase.position.y = 0.02;
  trayBase.castShadow = true;
  trayBase.receiveShadow = true;
  group.add(trayBase);

  // Tray side walls
  const longWallGeo = new THREE.BoxGeometry(0.76, 0.11, 0.025);
  const shortWallGeo = new THREE.BoxGeometry(0.025, 0.11, 0.52);
  for (const sz of [-0.248, 0.248]) {
    const w = new THREE.Mesh(longWallGeo, trayMat);
    w.position.set(0, 0.065, sz);
    group.add(w);
  }
  for (const sx of [-0.368, 0.368]) {
    const w = new THREE.Mesh(shortWallGeo, trayMat);
    w.position.set(sx, 0.065, 0);
    group.add(w);
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bag.color,
    roughness: bag.type === 'hardshell' ? 0.34 : 0.78,
    metalness: bag.type === 'hardshell' ? 0.22 : 0.04,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: bag.accentColor,
    roughness: 0.38,
    metalness: 0.55,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#12151a',
    roughness: 0.5,
  });

  if (bag.type === 'hardshell') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.4), bodyMat);
    shell.position.y = 0.16;
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);

    // Molded structural polycarbonate ridges
    for (let i = -2; i <= 2; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.016, 0.022), accentMat);
      rib.position.set(0, 0.282, i * 0.072);
      group.add(rib);
    }

    // Telescopic aluminum handle & wheels
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.16), accentMat);
    handle.position.set(-0.34, 0.17, 0);
    group.add(handle);

    for (const wz of [-0.15, 0.15]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 12), darkMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0.32, 0.09, wz);
      group.add(wheel);
    }
  } else if (bag.type === 'duffel') {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 16), bodyMat);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.y = 0.21;
    cyl.castShadow = true;
    group.add(cyl);

    for (const sx of [-0.14, 0.14]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.015, 8, 20), darkMat);
      strap.rotation.y = Math.PI / 2;
      strap.position.set(sx, 0.21, 0);
      group.add(strap);
    }
  } else if (bag.type === 'briefcase') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.15, 0.38), bodyMat);
    box.position.y = 0.12;
    box.castShadow = true;
    group.add(box);
    for (const sx of [-0.14, 0.14]) {
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), accentMat);
      latch.position.set(sx, 0.16, 0.195);
      group.add(latch);
    }
  } else {
    // Backpack
    const main = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.36), bodyMat);
    main.position.y = 0.15;
    main.castShadow = true;
    group.add(main);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.26), accentMat);
    pocket.position.set(0.02, 0.26, 0);
    group.add(pocket);
  }

  return group;
}
