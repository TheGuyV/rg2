// Run and Gun 2 Online - the hero: a night arena in WebGL (three.js). The ball dribbles, goes up, swishes through the
// net and bounces away; the LED board counts the score and the shot clock. Every texture is drawn here (no image files).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('court');
const root = document.documentElement;
const FREEZE = parseFloat(new URLSearchParams(location.search).get('t'));   // ?t=3.3: one still frame of the loop (checking)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || !isNaN(FREEZE);
const STILL = isNaN(FREEZE) ? 3.25 : FREEZE;

let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { root.classList.add('no-webgl'); }

// ------------------------------------------------------------------------------------------------ helpers
function mulberry32(a) { return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function dotTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, inner); gr.addColorStop(.35, inner.replace(/[\d.]+\)$/, '.45)')); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// the court: maple strips, the paint, the lines. World x -10..10, z -3..17 (the baseline at z = -1.2, the basket at x 2.2,
// the half-court line at z = 12.8)
function courtCanvas() {
  const PX = 96, W = 20 * PX, H = 20 * PX;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = mulberry32(7);
  const X = x => (x + 10) * PX, Y = z => (z + 3) * PX;
  const PW = 0.07 * PX;
  for (let x = 0; x < W; x += PW) {
    let y = -rnd() * 2.5 * PX;
    while (y < H) {
      const len = (1.2 + rnd() * 2.4) * PX;
      g.fillStyle = `hsl(${26 + rnd() * 7}, ${50 + rnd() * 12}%, ${45 + rnd() * 12}%)`;
      g.fillRect(x, y, PW + .6, len);
      g.fillStyle = 'rgba(60,28,8,.4)'; g.fillRect(x, y, PW, 1.2);
      y += len;
    }
    g.fillStyle = 'rgba(70,32,10,.32)'; g.fillRect(x, 0, 1, H);
  }
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = rnd() < .5 ? `rgba(90,42,12,${.04 + rnd() * .06})` : `rgba(255,222,170,${.03 + rnd() * .05})`;
    g.fillRect(rnd() * W, rnd() * H, 1, 6 + rnd() * 46);
  }
  const cx0 = X(-5.3), cx1 = X(9.7), cz0 = Y(-1.2), bx = X(2.2), bz = Y(.42);
  g.fillStyle = 'rgba(14,8,4,.66)';                         // out of bounds: darker
  g.fillRect(0, 0, W, cz0); g.fillRect(0, cz0, cx0, H - cz0); g.fillRect(cx1, cz0, W - cx1, H - cz0);
  g.fillStyle = 'rgba(178,38,20,.88)';                      // the paint
  g.fillRect(X(2.2 - 2.45), cz0, 4.9 * PX, 5.8 * PX);
  g.strokeStyle = 'rgba(255,255,255,.93)'; g.lineWidth = .05 * PX;
  g.strokeRect(cx0, cz0, cx1 - cx0, H * 2);
  g.strokeRect(X(2.2 - 2.45), cz0, 4.9 * PX, 5.8 * PX);
  g.beginPath(); g.arc(bx, Y(4.6), 1.8 * PX, 0, Math.PI * 2); g.stroke();
  const r3 = 6.75 * PX, a = Math.atan2(Math.sqrt(6.75 ** 2 - 6.6 ** 2), 6.6);
  g.beginPath(); g.moveTo(X(2.2 - 6.6), cz0); g.lineTo(X(2.2 - 6.6), bz + Math.sin(a) * r3);
  g.arc(bx, bz, r3, Math.PI - a, a, true); g.lineTo(X(2.2 + 6.6), cz0); g.stroke();
  g.beginPath(); g.arc(bx, bz, 1.25 * PX, 0, Math.PI); g.stroke();
  g.beginPath(); g.moveTo(cx0, Y(12.8)); g.lineTo(cx1, Y(12.8)); g.stroke();          // half court + centre circle
  g.fillStyle = 'rgba(255,106,26,.28)'; g.beginPath(); g.arc(bx, Y(12.8), 1.8 * PX, 0, Math.PI * 2); g.fill(); g.stroke();
  return c;
}

// the ball: orange pebbled leather and black seams. As on a real ball: two great circles at right angles (planes y = 0 and
// x = 0) and two small circles (planes x = ±0.55) that cross only the y = 0 one - eight panels
function ballCanvases() {
  const W = 1024, H = 512, rnd = mulberry32(11);
  const col = document.createElement('canvas'), bmp = document.createElement('canvas');
  col.width = bmp.width = W; col.height = bmp.height = H;
  const gc = col.getContext('2d'), gb = bmp.getContext('2d');
  const ic = gc.createImageData(W, H), ib = gb.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = (.5 - (y + .5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + .5) / W) * 2 * Math.PI;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      // distances along the surface (a small circle's plane distance grows slower than the arc)
      const s = Math.min(Math.abs(sl), Math.abs(px), Math.abs(Math.abs(px) - .55) / .835);
      const seam = 1 - smooth(.011, .021, s), peb = rnd(), k = .9 + peb * .14, i = (y * W + x) * 4;
      ic.data[i] = 226 * k * (1 - seam) + 24 * seam;
      ic.data[i + 1] = 98 * k * (1 - seam) + 13 * seam;
      ic.data[i + 2] = 30 * k * (1 - seam) + 8 * seam;
      ic.data[i + 3] = 255;
      const b = 150 + peb * 80 - seam * 150;
      ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = b; ib.data[i + 3] = 255;
    }
  }
  gc.putImageData(ic, 0, 0); gb.putImageData(ib, 0, 0);
  return [col, bmp];
}

// the LED ribbon board behind the baseline
function ribbonCanvas(c) {
  c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0503'; g.fillRect(0, 0, c.width, c.height);
  g.font = '400 42px Anton, Impact, "Arial Narrow", sans-serif'; g.textBaseline = 'middle';
  const words = ['RUN AND GUN 2', 'ONLINE', '1 VS 1', '2 VS 2', 'NETPLAY', 'TIP-OFF'];
  let x = 20, i = 0;
  while (x < c.width) {
    const w = words[i % words.length];
    g.fillStyle = i % 2 ? '#ffb340' : '#ff5a1f'; g.fillText(w, x, 34);
    x += g.measureText(w).width + 26;
    g.fillStyle = '#ffffff'; g.fillText('•', x, 34); x += 40; i++;
  }
  g.fillStyle = 'rgba(0,0,0,.55)';                           // the LED pitch
  for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
  for (let xx = 0; xx < c.width; xx += 4) g.fillRect(xx, 0, 1, c.height);
}

// ------------------------------------------------------------------------------------------------ the scene
function start() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const BG = 0x090a0f;
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 11, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture;

  const BR = .12;                                          // ball radius (m)
  const RIM = new THREE.Vector3(2.2, 3.05, .42), RIM_R = .2286;
  const DRIB = new THREE.Vector3(1.85, 0, 5.3);             // just behind the free-throw line
  const HAND = 1.05;

  // floor
  const floorTex = new THREE.CanvasTexture(courtCanvas());
  floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: .33, metalness: 0, envMapIntensity: .3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 7); floor.receiveShadow = true;
  scene.add(floor);

  // lights: warm key spot over the play, a spot on the backboard, a cool rim light from behind
  scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x2a1608, .42));
  const key = new THREE.SpotLight(0xfff0da, 3.0, 0, .5, .75, 0);
  key.position.set(1.6, 10, 4.2); key.target.position.set(1.8, 0, 3.0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0004; key.shadow.camera.near = 4; key.shadow.camera.far = 16;
  scene.add(key, key.target);
  const boardLight = new THREE.SpotLight(0xffe2c0, 1.6, 0, .35, .8, 0);
  boardLight.position.set(2.2, 9, 2.5); boardLight.target.position.copy(RIM);
  scene.add(boardLight, boardLight.target);
  const rimLight = new THREE.DirectionalLight(0x6f9dff, 1.5);
  rimLight.position.set(-6, 5, -7); scene.add(rimLight);

  // light beams + dust in them
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffe6c4) }, height: { value: 10 } },
    vertexShader: 'varying float h; void main(){ h = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float height; varying float h; void main(){ float t = clamp(h / height + .5, 0., 1.); gl_FragColor = vec4(color, .085 * pow(t, 1.7)); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.3, 10, 48, 1, true), beamMat);
  beam.position.set(1.6, 5, 4.2); scene.add(beam);
  const beam2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 9, 40, 1, true), beamMat);
  beam2.position.set(2.2, 4.5, 1.6); scene.add(beam2);

  const rnd = mulberry32(3);
  const DUST = 520, dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 2.1;
    dustPos[i * 3] = 1.6 + Math.cos(a) * r; dustPos[i * 3 + 1] = rnd() * 8; dustPos[i * 3 + 2] = 4.2 + Math.sin(a) * r;
    dustSeed[i] = rnd() * 100;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: .03, map: dotTexture(), color: 0xffd9a8, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // the stands: tiers of little lights rising into the dark, some phone flashes
  const CROWD = 3800, crowdPos = new Float32Array(CROWD * 3), crowdCol = new Float32Array(CROWD * 3), crowdBase = new Float32Array(CROWD * 3);
  for (let i = 0; i < CROWD; i++) {
    const far = i >= 2400, z = far ? 18 + rnd() * 11 : -4.2 - rnd() * 11, rise = far ? z - 18 : -z - 4.2;
    crowdPos[i * 3] = -16 + rnd() * 36; crowdPos[i * 3 + 1] = .8 + rise * .62 + rnd() * .5; crowdPos[i * 3 + 2] = z;
    const warm = rnd(), v = .08 + rnd() * .22;
    const c = warm < .7 ? [v * 1.0, v * .78, v * .55] : warm < .9 ? [v * .6, v * .75, v * 1.1] : [v * 1.2, v * .45, v * .25];
    crowdBase.set(c, i * 3); crowdCol.set(c, i * 3);
  }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3));
  crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdCol, 3));
  const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: .09, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(crowd);
  const flashes = [];

  // big soft arena lights high up (bokeh)
  const bokehTex = dotTexture('rgba(255,236,210,1)');
  [[-7, 9.5, -9, 3.2], [-2.5, 10.5, -11, 2.6], [3.5, 10, -10, 3], [8.5, 9.4, -9, 3.4], [12, 8.5, -6, 2.4], [-11, 8.4, -6, 2.2]].forEach(([x, y, z, s]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bokehTex, transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.position.set(x, y, z); sp.scale.set(s, s, 1); scene.add(sp);
  });

  // LED ribbon behind the baseline
  const ribC = document.createElement('canvas'); ribbonCanvas(ribC);
  const ribTex = new THREE.CanvasTexture(ribC); ribTex.colorSpace = THREE.SRGBColorSpace; ribTex.wrapS = THREE.RepeatWrapping; ribTex.repeat.x = .75;
  // only on the right: the headline sits over the left of the picture
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(15, .62), new THREE.MeshBasicMaterial({ map: ribTex, toneMapped: false }));
  ribbon.position.set(10, .95, -3.6); scene.add(ribbon);
  const ribFrame = new THREE.Mesh(new THREE.BoxGeometry(15.2, .9, .3), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: .6 }));
  ribFrame.position.set(10, .95, -3.78); scene.add(ribFrame);
  const ribbon2 = ribbon.clone(), ribFrame2 = ribFrame.clone();            // the far end, facing the court
  ribbon2.position.set(2.2, .95, 17.7); ribbon2.rotation.y = Math.PI; ribFrame2.position.set(2.2, .95, 17.88); scene.add(ribbon2, ribFrame2);
  if (document.fonts) document.fonts.load('42px Anton').then(() => { ribbonCanvas(ribC); ribTex.needsUpdate = true; }).catch(() => {});

  // the basket: glass board with its frame and square, rim, bracket, arm and padded post
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4, emissive: 0x333333 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, .03),
    new THREE.MeshPhysicalMaterial({ color: 0xdfeaff, roughness: .04, metalness: 0, transparent: true, opacity: .16, envMapIntensity: 1.4, clearcoat: 1 }));
  glass.position.set(RIM.x, 2.9 + .535, 0); scene.add(glass);
  function frameRect(w, h, cx, cy, t, z) {
    [[w, t, cx, cy + h / 2 - t / 2], [w, t, cx, cy - h / 2 + t / 2], [t, h, cx - w / 2 + t / 2, cy], [t, h, cx + w / 2 - t / 2, cy]].forEach(([bw, bh, x, y]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, .036), white); m.position.set(x, y, z); scene.add(m);
    });
  }
  frameRect(1.83, 1.07, RIM.x, 2.9 + .535, .05, 0);
  frameRect(.59, .45, RIM.x, 3.05 + .225 + .02, .05, .005);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: .45, metalness: .7 });
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, .011, 12, 72),
    new THREE.MeshStandardMaterial({ color: 0xff4d10, roughness: .32, metalness: .55, emissive: 0x2a0800 }));
  rimMesh.rotation.x = Math.PI / 2; rimMesh.position.copy(RIM); rimMesh.castShadow = true; scene.add(rimMesh);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(.16, .05, RIM.z - RIM_R), rimMesh.material);
  bracket.position.set(RIM.x, RIM.y - .02, (RIM.z - RIM_R) / 2); scene.add(bracket);
  // the stanchion stays dark and far back, behind the baseline
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 2.5), metal); arm.position.set(RIM.x, 3.3, -1.25); scene.add(arm);
  const pad = new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: .85 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(.24, 3.4, .24), pad); post.position.set(RIM.x, 1.7, -2.5); post.castShadow = true; scene.add(post);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, .4, 1.0), pad); base.position.set(RIM.x, .2, -2.6); scene.add(base);

  // the net: rings of diamonds, pushed out by the ball and swinging after a swish
  const NN = 14, NL = 6, ND = .44, NB = .135;
  const netPos = new Float32Array((NL + 1) * NN * 3), netIdx = [];
  for (let k = 0; k < NL; k++) for (let i = 0; i < NN; i++) {
    const a = k * NN + i, b = (k + 1) * NN + i, c = (k + 1) * NN + (k % 2 === 0 ? (i - 1 + NN) % NN : (i + 1) % NN);
    netIdx.push(a, b, a, c);
  }
  const netGeo = new THREE.BufferGeometry(); netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3)); netGeo.setIndex(netIdx);
  scene.add(new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: .9 })));
  let swishAt = -99;
  function updateNet(now, bp) {
    const w = now - swishAt, wob = w > 0 ? Math.exp(-w * 3.2) : 0;
    for (let k = 0; k <= NL; k++) {
      const f = k / NL;
      const y = RIM.y - ND * f - wob * .07 * f * Math.abs(Math.sin(w * 12 + 1));
      let r = (RIM_R + (NB - RIM_R) * f + .018 * Math.sin(Math.PI * f)) * (1 + wob * .12 * Math.sin(w * 17 - f * 3) * f);
      const dy = bp.y - y, hx = Math.hypot(bp.x - RIM.x, bp.z - RIM.z), reach = BR * 1.3;
      if (hx < RIM_R && Math.abs(dy) < reach) r = Math.max(r, Math.sqrt(reach * reach - dy * dy) * .95 + .01);
      const off = (k % 2) * Math.PI / NN + wob * .16 * Math.sin(w * 9) * f;
      for (let i = 0; i < NN; i++) {
        const a = i * 2 * Math.PI / NN + off, j = (k * NN + i) * 3;
        netPos[j] = RIM.x + Math.cos(a) * r; netPos[j + 1] = y; netPos[j + 2] = RIM.z + Math.sin(a) * r;
      }
    }
    netGeo.attributes.position.needsUpdate = true;
  }

  // the ball + a soft contact shadow
  const [bc, bb] = ballCanvases();
  const bMap = new THREE.CanvasTexture(bc); bMap.colorSpace = THREE.SRGBColorSpace; bMap.anisotropy = 4;
  const bBump = new THREE.CanvasTexture(bb);
  const ballMat = new THREE.MeshStandardMaterial({ map: bMap, bumpMap: bBump, bumpScale: 1.4, roughness: .6, metalness: 0, envMapIntensity: .55, transparent: true });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 64, 40), ballMat);
  ball.castShadow = true; scene.add(ball);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dotTexture('rgba(0,0,0,1)'), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; scene.add(blob);

  // ---------------------------------------------------------------------------------------------- the play (7 s loop)
  const T = { rise: 2.4, release: 2.75, fly: 1.05, net: .26, fadeOut: 6.35, loop: 7.0 };
  T.in = T.release + T.fly; T.out = T.in + T.net;
  const UP = new THREE.Vector3(0, 1, 0);
  const MAN = new THREE.Vector3(DRIB.x - .18, 0, DRIB.z + .02);                 // where the shooter stands
  const FWD = new THREE.Vector3(RIM.x - MAN.x, 0, RIM.z - MAN.z).normalize();   // facing the basket
  const RIGHT = new THREE.Vector3().crossVectors(FWD, UP);                      // his right hand side (the ball side)
  const Q = MAN.clone().addScaledVector(FWD, .3).addScaledVector(RIGHT, .1).setY(2.28), ARC = 1.35;   // the release: above, in front of his face
  const ROLL = [];                                         // after the net: a little physics, sampled at 120 Hz
  {
    const p = new THREE.Vector3(RIM.x, RIM.y - .43, RIM.z), v = new THREE.Vector3(-.75, -2.4, 1.15);
    for (let i = 0; i <= (T.loop - T.out) * 120 + 2; i++) {
      ROLL.push(p.clone());
      v.y -= 9.8 / 120; p.addScaledVector(v, 1 / 120);
      if (p.y < BR) { p.y = BR; v.y = Math.abs(v.y) < .5 ? 0 : -v.y * .62; v.x *= .93; v.z *= .93; }
    }
  }
  const tmp = new THREE.Vector3(), prev = new THREE.Vector3(), omega = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let squash = 1, opacity = 1;
  function play(t) {                                       // sets ball position, squash, opacity, spin for loop time t
    const p = ball.position; squash = 1; opacity = 1;
    if (t < T.rise) {                                      // dribble
      const s = (t % .6) / .6, y = BR + (HAND - BR) * Math.abs(Math.cos(Math.PI * s));
      p.set(DRIB.x + .04 * Math.sin(t * 2.1), y, DRIB.z);
      squash = 1 - .16 * smooth(BR + .05, BR, y);
      opacity = smooth(0, .35, t);
      omega.set(-6, 0, 0);
    } else if (t < T.release) {                            // gather and rise
      const s = easeInOut((t - T.rise) / (T.release - T.rise));
      tmp.set(DRIB.x, HAND, DRIB.z); p.lerpVectors(tmp, Q, s);
      omega.set(-3, 0, 0);
    } else if (t < T.in) {                                 // the shot
      const u = (t - T.release) / T.fly;
      tmp.copy(RIM); tmp.y += .02;
      p.lerpVectors(Q, tmp, u); p.y += 4 * ARC * u * (1 - u);
      const dir = tmp.clone().sub(Q).setY(0).normalize();
      omega.crossVectors(dir, up).multiplyScalar(-2 * Math.PI * 2.2);   // backspin
    } else if (t < T.out) {                                // through the net
      const s = (t - T.in) / T.net;
      p.set(RIM.x, RIM.y - .43 * (1 - (1 - s) * (1 - s)), RIM.z);
      omega.multiplyScalar(.97);
    } else {                                               // bounce away and roll
      const i = Math.min(ROLL.length - 1, Math.floor((t - T.out) * 120));
      p.copy(ROLL[i]);
      if (p.y <= BR + .001 && i > 0) { tmp.copy(ROLL[i]).sub(ROLL[i - 1]).multiplyScalar(120); omega.crossVectors(up, tmp).divideScalar(BR); }
      opacity = 1 - smooth(T.fadeOut, T.loop - .1, t);
    }
  }

  // ---------------------------------------------------------------------------------------------- the shooter: a stick man
  // A plain stick figure (round head, line limbs - the "졸라맨" look) dribbles, jumps, shoots and cheers in step with the
  // ball. White, so it reads in the dark arena; arms and legs bend with two-bone IK.
  const SM = { r: .034, head: .15, upper: .34, fore: .34, thigh: .47, shin: .47, torso: .56 };
  const smMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: .45, emissive: 0x2c2c2c });
  const limbGeo = new THREE.CylinderGeometry(SM.r, SM.r, 1, 14), jointGeo = new THREE.SphereGeometry(SM.r, 14, 10);
  function limb() { const m = new THREE.Mesh(limbGeo, smMat); m.castShadow = true; scene.add(m); return m; }
  function joint(r = SM.r) { const m = new THREE.Mesh(jointGeo, smMat); m.scale.setScalar(r / SM.r); m.castShadow = true; scene.add(m); return m; }
  const LB = { torso: limb(), ua: [limb(), limb()], fa: [limb(), limb()], th: [limb(), limb()], sh: [limb(), limb()], ft: [limb(), limb()] };
  const JN = { sho: joint(), hip: joint(), neck: joint(), el: [joint(), joint()], ha: [joint(.052), joint(.052)], kn: [joint(), joint()], an: [joint(), joint()], toe: [joint(), joint()] };
  const head = new THREE.Mesh(new THREE.SphereGeometry(SM.head, 32, 20), smMat); head.castShadow = true; scene.add(head);

  const tv = new THREE.Vector3(), dv = new THREE.Vector3(), sv = new THREE.Vector3();
  function place(m, a, b) {                                // a cylinder of length 1 stretched from a to b
    tv.subVectors(b, a); const len = tv.length();
    m.position.addVectors(a, b).multiplyScalar(.5); m.scale.set(1, Math.max(len, 1e-4), 1);
    if (len > 1e-6) m.quaternion.setFromUnitVectors(UP, tv.divideScalar(len));
  }
  // two-bone IK: from a towards target with lengths l1, l2; the middle joint bends towards hint
  function ik(a, target, l1, l2, hint, outMid, outEnd) {
    dv.subVectors(target, a); let dist = dv.length(); dv.divideScalar(dist || 1);
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    outEnd.copy(a).addScaledVector(dv, dist);
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    sv.copy(hint).addScaledVector(dv, -hint.dot(dv)).normalize();
    outMid.copy(a).addScaledVector(dv, x).addScaledVector(sv, h);
  }

  const V3 = () => new THREE.Vector3();
  const M = { pel: V3(), neck: V3(), sho: V3(), hd: V3(), axis: V3(), rh: V3(), lh: V3(), rh2: V3(), lh2: V3(), el: [V3(), V3()], ha: [V3(), V3()], kn: [V3(), V3()], an: [V3(), V3()], ft: [V3(), V3()], toe: [V3(), V3()], hip: [V3(), V3()] };
  function keyed(keys, t) {
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + (v1 - v0) * easeInOut(clamp((t - t0) / (t1 - t0), 0, 1));
    }
    return keys[keys.length - 1][1];
  }
  const CROUCH = [[0, .1], [2.3, .1], [2.58, .24], [2.66, .02], [3.2, .02], [3.32, .17], [3.62, .04], [3.95, .12], [4.02, .02], [4.4, .12], [4.62, .03], [6.6, .03], [7, .1]];
  const LEAN = [[0, .13], [2.3, .13], [2.6, .06], [2.78, -.03], [3.3, .05], [3.9, 0], [4.6, .02], [6.6, .04], [7, .13]];
  function jumpAt(t) {
    if (t > 2.62 && t < 3.22) return .42 * Math.sin(Math.PI * (t - 2.62) / .6);   // the jump shot
    if (t > 4.02 && t < 4.38) return .2 * Math.sin(Math.PI * (t - 4.02) / .36);   // a little hop for the basket
    return 0;
  }
  // hand poses (right = shooting hand, left = guide hand), written as world points
  const POSE = {
    dribble: (t, r, l) => {
      const b = ball.position; r.set(b.x, Math.max(b.y + BR * .92, .8), b.z);
      l.copy(M.sho).addScaledVector(RIGHT, -.3).addScaledVector(UP, -.46).addScaledVector(FWD, .14);
    },
    gather: (t, r, l) => {
      const b = t <= T.release ? ball.position : Q;
      r.copy(b).addScaledVector(FWD, -.09).addScaledVector(UP, -.08);
      l.copy(b).addScaledVector(RIGHT, -.13);
    },
    follow: (t, r, l) => {
      r.copy(M.sho).addScaledVector(tv.copy(FWD).multiplyScalar(.42).addScaledVector(UP, .58).normalize(), .66).addScaledVector(RIGHT, .05);
      l.copy(M.sho).addScaledVector(RIGHT, -.22).addScaledVector(UP, .2).addScaledVector(FWD, .25);
    },
    down: (t, r, l) => {
      const sw = Math.sin(t * 2.2) * .04;
      r.copy(M.sho).addScaledVector(RIGHT, .17).addScaledVector(UP, -.6).addScaledVector(FWD, .05 + sw);
      l.copy(M.sho).addScaledVector(RIGHT, -.17).addScaledVector(UP, -.6).addScaledVector(FWD, .05 - sw);
    },
    cheer: (t, r, l) => {
      const w = Math.sin(t * 11) * .05;
      r.copy(M.sho).addScaledVector(RIGHT, .34 + w).addScaledVector(UP, .58).addScaledVector(FWD, .04);
      l.copy(M.sho).addScaledVector(RIGHT, -.34 - w).addScaledVector(UP, .58).addScaledVector(FWD, .04);
    },
    ready: (t, r, l) => {
      r.set(DRIB.x, HAND + BR * .92, DRIB.z);
      l.copy(M.sho).addScaledVector(RIGHT, -.3).addScaledVector(UP, -.46).addScaledVector(FWD, .14);
    },
  };
  const HANDS = [[0, 'dribble'], [2.3, 'dribble'], [2.45, 'gather'], [2.78, 'gather'], [2.95, 'follow'], [3.45, 'follow'], [3.75, 'down'],
                 [3.9, 'down'], [4.04, 'cheer'], [4.7, 'cheer'], [5.1, 'down'], [6.5, 'down'], [6.95, 'ready'], [7.0, 'dribble']];
  const hintR = new THREE.Vector3(), hintL = new THREE.Vector3();
  function poseMan(t) {
    const crouch = keyed(CROUCH, t), lean = keyed(LEAN, t), jump = jumpAt(t);
    M.pel.copy(MAN).addScaledVector(FWD, -lean * .25); M.pel.y = SM.thigh + SM.shin - .03 - crouch + jump;
    M.axis.copy(UP).multiplyScalar(SM.torso).addScaledVector(FWD, lean * SM.torso * 1.4).setLength(SM.torso);
    M.neck.copy(M.pel).add(M.axis);
    M.sho.copy(M.pel).addScaledVector(M.axis, .88);
    M.hd.copy(M.neck).addScaledVector(M.axis, (.06 + SM.head) / SM.torso);
    // hands: the two poses around t, blended
    let i = 1; while (i < HANDS.length - 1 && t > HANDS[i][0]) i++;
    const [t0, p0] = HANDS[i - 1], [t1, p1] = HANDS[i];
    POSE[p0](t, M.rh, M.lh);
    if (p1 !== p0) { POSE[p1](t, M.rh2, M.lh2); const k = easeInOut(clamp((t - t0) / (t1 - t0), 0, 1)); M.rh.lerp(M.rh2, k); M.lh.lerp(M.lh2, k); }
    hintR.copy(RIGHT).multiplyScalar(.7).addScaledVector(UP, -.6).addScaledVector(FWD, -.25);
    hintL.copy(RIGHT).multiplyScalar(-.7).addScaledVector(UP, -.6).addScaledVector(FWD, -.25);
    ik(M.sho, M.rh, SM.upper, SM.fore, hintR, M.el[0], M.ha[0]);
    ik(M.sho, M.lh, SM.upper, SM.fore, hintL, M.el[1], M.ha[1]);
    // legs: feet planted (staggered, the right one back), lifted in the jumps
    const lift = Math.max(0, jump - .03);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      M.hip[s].copy(M.pel).addScaledVector(RIGHT, side * .05);
      M.an[s].copy(MAN).addScaledVector(RIGHT, side * .17).addScaledVector(FWD, s === 0 ? -.05 : .1);
      M.an[s].y = .05 + lift * (s === 0 ? .85 : 1);
      if (lift > 0) M.an[s].addScaledVector(FWD, -lift * .35);
      ik(M.hip[s], M.an[s], SM.thigh, SM.shin, FWD, M.kn[s], M.ft[s]);
      M.toe[s].copy(M.ft[s]).addScaledVector(FWD, .13); M.toe[s].y = Math.max(.035, M.ft[s].y - .03);
    }
    // the meshes
    place(LB.torso, M.pel, M.neck); JN.hip.position.copy(M.pel); JN.neck.position.copy(M.neck); JN.sho.position.copy(M.sho);
    head.position.copy(M.hd);
    for (let s = 0; s < 2; s++) {
      place(LB.ua[s], M.sho, M.el[s]); place(LB.fa[s], M.el[s], M.ha[s]);
      JN.el[s].position.copy(M.el[s]); JN.ha[s].position.copy(M.ha[s]);
      place(LB.th[s], M.pel, M.kn[s]); place(LB.sh[s], M.kn[s], M.ft[s]); place(LB.ft[s], M.ft[s], M.toe[s]);
      JN.kn[s].position.copy(M.kn[s]); JN.an[s].position.copy(M.ft[s]); JN.toe[s].position.copy(M.toe[s]);
    }
  }

  // ---------------------------------------------------------------------------------------------- cameras: a broadcast
  // Every loop is filmed another way, with hard cuts like on TV: wide / behind the shooter, then a rim cam / low behind
  // the baseline / slow motion around the rim. A lens shift keeps the subject off-centre, so the headline (on the left,
  // or below it on a phone) never covers the play.
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 90);
  const cv = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 34 };
  const bp = ball.position;
  const CAMS = {
    wide:     () => { cv.pos.set(-4.2, 2.5, 11.8); cv.look.set(1.6, 2.0, 2.6).lerp(bp, .1); cv.fov = 29; },
    behind:   () => { cv.pos.set(2.75, 2.45, 8.9); cv.look.set(2.0, 1.4, 1.6).lerp(bp, .22); cv.fov = 42; },   // over his right shoulder
    rimTop:   () => { cv.pos.set(RIM.x + .95, 5.5, RIM.z + 1.5); cv.look.set(RIM.x, 2.7, RIM.z).lerp(bp, .25); cv.fov = 38; },
    baseline: () => { cv.pos.set(RIM.x + .9, 1.8, -1.8); cv.look.set(2.0, 3.55, 3.0).lerp(bp, .15); cv.fov = 54; },   // under the board, looking up the court
    ball:     () => { cv.pos.set(bp.x + .45, bp.y + .12, bp.z + .55); cv.look.copy(bp); cv.fov = 30; },   // checking only (?cam=ball)
    side:     () => { cv.pos.set(-3.2, .95, 4.8); cv.look.set(1.4, .9, 2.4).lerp(bp, .55); cv.fov = 34; },
    orbit:    t => {
      const a = .45 + (t - 2.95) * .85;
      cv.pos.set(RIM.x + Math.sin(a) * 3.4, 3.75, RIM.z + Math.cos(a) * 3.4); cv.look.set(RIM.x, 2.85, RIM.z).lerp(bp, .5); cv.fov = 38;
    },
  };
  // cuts: [loop time, camera]; slow: [from, to, speed] in loop time
  const PLANS = [
    { cuts: [[0, 'wide']] },
    { cuts: [[0, 'behind'], [3.45, 'rimTop'], [4.4, 'wide']] },
    { cuts: [[0, 'baseline'], [4.25, 'side']] },
    { cuts: [[0, 'wide'], [2.95, 'orbit'], [4.6, 'side']], slow: [3.0, 4.35, .3] },
  ];
  const qs = new URLSearchParams(location.search);
  const FORCE_CAM = qs.get('cam'), FORCE_PLAN = parseInt(qs.get('plan'), 10);   // checking: ?plan=2 / ?cam=orbit
  let planIdx = isNaN(FORCE_PLAN) ? 0 : FORCE_PLAN % PLANS.length;
  function shotFor(t) {
    if (FORCE_CAM && CAMS[FORCE_CAM]) return FORCE_CAM;
    let id = 'wide';
    for (const [from, c] of PLANS[planIdx].cuts) if (t >= from) id = c;
    return id;
  }
  function rateFor(t) { const s = PLANS[planIdx].slow; return s && t >= s[0] && t < s[1] ? s[2] : 1; }

  // per screen: where the subject sits (lens shift), and how much more a narrow screen takes in
  let shiftX = 0, shiftY = 0, fovK = 1, dolly = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const a = w / h;
    if (a >= 1.25) { shiftX = .17; shiftY = 0; }
    else if (a >= .85) { shiftX = .08; shiftY = .02; }
    else { shiftX = 0; shiftY = .19; }                       // phone: the play in the top part, the headline below it
    const narrow = Math.max(1, 1.78 / a);
    fovK = Math.pow(narrow, .42); dolly = Math.pow(narrow, .22);
    camera.aspect = a;
    camera.setViewOffset(w, h, -shiftX * w, shiftY * h, w, h);
    if (reduce) render(STILL, STILL, 0);
  }
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  // ---------------------------------------------------------------------------------------------- the board (DOM)
  const scoreEl = document.getElementById('score'), clockEl = document.getElementById('clock');
  let score = 0, clockReset = 0, shownClock = -1;
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  // ---------------------------------------------------------------------------------------------- render
  const q = new THREE.Quaternion(), cpos = new THREE.Vector3();
  let curShot = '';
  function render(now, t, dt) {
    play(t);
    poseMan(t);
    if (dt > 0 && omega.lengthSq() > 0) { q.setFromAxisAngle(tmp.copy(omega).normalize(), omega.length() * dt); ball.quaternion.premultiply(q); }
    else if (dt === 0) ball.rotation.set(t * 1.7, t * 2.3, t * .6);         // a still frame: some turn, so stills differ
    ball.scale.set(1 + (1 - squash) * .5, squash, 1 + (1 - squash) * .5);
    ballMat.opacity = opacity; ball.castShadow = opacity > .5;
    const hgt = ball.position.y;
    blob.position.set(ball.position.x, .003, ball.position.z);
    const bs = .32 + hgt * .16; blob.scale.set(bs, bs, 1);
    blob.material.opacity = .62 * opacity * (1 - smooth(0, 3.2, hgt));
    updateNet(now, ball.position);

    const id = shotFor(t);
    CAMS[id](t);
    if (id !== curShot) { curShot = id; pointer.sx = pointer.x; pointer.sy = pointer.y; }   // a cut: no drift into it
    pointer.sx += (pointer.x - pointer.sx) * .04; pointer.sy += (pointer.y - pointer.sy) * .04;
    cpos.copy(cv.pos).sub(cv.look).multiplyScalar(dolly).add(cv.look);
    const d = cpos.distanceTo(cv.look);                      // parallax and sway in proportion to the distance
    cpos.x += (pointer.sx * .035 + Math.sin(now * .13) * .02) * d;
    cpos.y += (-pointer.sy * .016 + Math.sin(now * .21) * .005) * d;
    camera.position.copy(cpos);
    camera.fov = Math.min(72, 2 * Math.atan(Math.tan(cv.fov * Math.PI / 360) * fovK) * 180 / Math.PI);
    camera.updateProjectionMatrix();
    camera.lookAt(cv.look);
    renderer.render(scene, camera);
  }

  // the clock of the play: it runs slower in slow motion (the ball, the net and the shot clock with it)
  let running = false, visible = true, last = 0, sim = 0, loopStart = 0, swished = false;
  function tick() {
    if (!running) return;
    const nowS = performance.now() / 1000, dtw = Math.min(.1, nowS - last); last = nowS;
    const dt = dtw * rateFor(sim - loopStart);
    sim += dt;
    let t = sim - loopStart;
    if (t >= T.loop) {
      loopStart += T.loop; t -= T.loop; swished = false;
      if (isNaN(FORCE_PLAN)) planIdx = (planIdx + 1) % PLANS.length;
    }
    // a made basket: score + 2, the shot clock back to 24, the net swings
    if (!swished && t >= T.in) {
      swished = true; swishAt = sim - (t - T.in);
      score = (score + 2) % 100; scoreEl.textContent = String(score).padStart(2, '0'); flash(scoreEl);
      clockReset = sim; shownClock = -1;
    }
    const c = Math.max(0, 24 - Math.floor(sim - clockReset));
    if (c !== shownClock) { shownClock = c; clockEl.textContent = String(c).padStart(2, '0'); if (c === 24 && sim > 1) flash(clockEl); }
    // the stands, the dust and the ribbons
    ribTex.offset.x = (ribTex.offset.x + dtw * .035) % 1;
    for (let i = 0; i < DUST; i++) {
      const j = i * 3 + 1; dustPos[j] += dt * (.05 + (dustSeed[i] % 1) * .06);
      if (dustPos[j] > 8) dustPos[j] = 0;
      dustPos[i * 3] += Math.sin(sim * .6 + dustSeed[i]) * dt * .03;
    }
    dustGeo.attributes.position.needsUpdate = true;
    if (Math.random() < dtw * 12) flashes.push({ i: Math.floor(Math.random() * CROWD), until: nowS + .09 });
    for (let n = flashes.length - 1; n >= 0; n--) {
      const f = flashes[n], j = f.i * 3;
      if (nowS > f.until) { crowdCol.set(crowdBase.subarray(j, j + 3), j); flashes.splice(n, 1); }
      else crowdCol.set([2.2, 2.2, 2.4], j);
    }
    crowdGeo.attributes.color.needsUpdate = true;
    render(sim, t, dt);
    requestAnimationFrame(tick);
  }
  function setRunning(on) {
    if (reduce) return;
    if (on && !running) { running = true; last = performance.now() / 1000; requestAnimationFrame(tick); }
    if (!on) running = false;
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  if (reduce) { render(STILL, STILL, 0); return; }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; setRunning(visible && !document.hidden); }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  setRunning(true);
}

if (renderer) start();            // at the end: the helpers above are consts
