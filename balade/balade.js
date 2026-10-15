/*
Balade libre dans l'appartement : on charge le maillage 3D texture de la visite Matterport
(les tuiles de detail maximal, niveau 3) et on s'y promene a hauteur d'yeux, comme dans un jeu.

Les murs et les meubles ne sont pas connus en tant que tels : on calcule au chargement un plan
de la hauteur des hanches (grille de 5 cm) a partir des triangles du scan.
- une case est « sol » si un triangle horizontal la couvre pres de y = 0 ;
- une case est « obstacle » si un triangle la traverse entre 30 cm et 1,50 m de haut.
On peut marcher sur le sol, a plus d'un rayon d'epaule de tout obstacle.

Reperes : le maillage est en metres, y vers le haut. Les points de vue Matterport (z vers le haut)
se convertissent par (x, y, z) -> (x, z, -y).
*/
import * as THREE from "three";
import { GLTFLoader } from "/balade/vendor/loaders/GLTFLoader.js";
import { DRACOLoader } from "/balade/vendor/loaders/DRACOLoader.js";
import { KTX2Loader } from "/balade/vendor/loaders/KTX2Loader.js";

const DOSSIER_MAILLAGE = "/models/7b65e66514b54366b3a13fe422755cf4/assets/mesh_tiles/~/3/";
const MORCEAUX = [
	"lod3_room0_chunk262144.glb",
	"lod3_room0_chunk262145.glb",
	"lod3_room0_chunk262146.glb",
];

// depart : point de vue 0 (piece « entrance »), face a l'appartement
const DEPART = { x: 0.07, z: -0.05, cap: 0 };

const YEUX = 1.6;
const MARCHE = 1.5; // m/s
const COURSE = 3.0;
const RAYON = 0.2; // distance minimale aux obstacles
const SENSIBILITE = 0.0022;

const GRILLE = { pas: 0.05, xMin: -9.5, xMax: 7.5, zMin: -7.5, zMax: 1.5 };
GRILLE.nx = Math.round((GRILLE.xMax - GRILLE.xMin) / GRILLE.pas);
GRILLE.nz = Math.round((GRILLE.zMax - GRILLE.zMin) / GRILLE.pas);

const tactile = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 && !window.matchMedia("(pointer: fine)").matches;
if (tactile)
	document.documentElement.classList.add("bl-tactile");

const $ = (id) => document.getElementById(id);
const canvas = $("bl-scene");
const accueil = $("bl-accueil");
const boutonEntrer = $("bl-entrer");
const aide = $("bl-aide");

// ---------- rendu ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe8ee);

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
camera.rotation.order = "YXZ";

function redimensionner() {
	const l = window.innerWidth, h = window.innerHeight;
	renderer.setSize(l, h, false);
	camera.aspect = l / h;
	// au moins 75 degres de champ horizontal, meme en portrait
	const horizontal = THREE.MathUtils.degToRad(75);
	const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / camera.aspect);
	camera.fov = Math.min(Math.max(THREE.MathUtils.radToDeg(vertical), 65), 100);
	camera.updateProjectionMatrix();
}
window.addEventListener("resize", redimensionner);
redimensionner();

// ---------- chargement du maillage ----------

const draco = new DRACOLoader().setDecoderPath("/balade/vendor/libs/draco/");
const ktx2 = new KTX2Loader().setTranscoderPath("/balade/vendor/libs/basis/").detectSupport(renderer);
const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);

const progression = MORCEAUX.map(() => 0);
function majProgression() {
	const p = progression.reduce((a, b) => a + b, 0) / MORCEAUX.length;
	$("bl-barre-progression").style.width = Math.round(p * 100) + "%";
}

function chargerMorceau(nom, i) {
	return new Promise((resoudre, rejeter) => {
		loader.load(DOSSIER_MAILLAGE + nom, resoudre, (e) => {
			if (e.lengthComputable) {
				// la texture se charge apres le .glb : on garde 20 % pour elle
				progression[i] = 0.8 * e.loaded / e.total;
				majProgression();
			}
		}, rejeter);
	}).then((gltf) => {
		progression[i] = 1;
		majProgression();
		return gltf.scene;
	});
}

const anisotropie = renderer.capabilities.getMaxAnisotropy();

function preparer(racine) {
	racine.traverse((o) => {
		if (!o.isMesh)
			return;
		const carte = o.material.map;
		if (carte)
			carte.anisotropy = anisotropie;
		// les textures du scan contiennent deja la lumiere : on les affiche telles quelles
		const nom = o.material.name;
		o.material = new THREE.MeshBasicMaterial({ map: carte, side: THREE.DoubleSide });
		o.material.userData.jpg = nom;
	});
	scene.add(racine);
}

// Les .glb pointent vers des textures KTX2 en 2048 px. La meme texture existe en JPG 4096 px
// (nommee comme le materiau) : on la charge ensuite, sur ordinateur seulement (memoire graphique).
function passerEnHD() {
	if (tactile || renderer.capabilities.maxTextureSize < 4096)
		return;
	const chargeur = new THREE.TextureLoader();
	const parNom = new Map();
	scene.traverse((o) => {
		const nom = o.isMesh && o.material.userData.jpg;
		if (!nom)
			return;
		if (!parNom.has(nom))
			parNom.set(nom, []);
		parNom.get(nom).push(o.material);
	});
	for (const [nom, materiaux] of parNom) {
		chargeur.load(DOSSIER_MAILLAGE + nom, (texture) => {
			texture.flipY = false;
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = anisotropie;
			const ancienne = materiaux[0].map;
			for (const m of materiaux) {
				m.map = texture;
				m.needsUpdate = true;
			}
			if (ancienne)
				ancienne.dispose();
		});
	}
}

// ---------- plan de collision ----------

const sol = new Uint8Array(GRILLE.nx * GRILLE.nz);
const obstacle = new Uint8Array(GRILLE.nx * GRILLE.nz);
let marchable = new Uint8Array(GRILLE.nx * GRILLE.nz);

function caseDe(x, z) {
	const i = Math.floor((x - GRILLE.xMin) / GRILLE.pas);
	const k = Math.floor((z - GRILLE.zMin) / GRILLE.pas);
	if (i < 0 || k < 0 || i >= GRILLE.nx || k >= GRILLE.nz)
		return -1;
	return k * GRILLE.nx + i;
}

function rasteriser(racine) {
	const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
	const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
	const p = new THREE.Vector3();
	racine.updateMatrixWorld(true);
	racine.traverse((o) => {
		if (!o.isMesh)
			return;
		const pos = o.geometry.attributes.position;
		const index = o.geometry.index;
		const nb = index ? index.count : pos.count;
		const m = o.matrixWorld;
		for (let t = 0; t < nb; t += 3) {
			const ia = index ? index.getX(t) : t;
			const ib = index ? index.getX(t + 1) : t + 1;
			const ic = index ? index.getX(t + 2) : t + 2;
			a.fromBufferAttribute(pos, ia).applyMatrix4(m);
			b.fromBufferAttribute(pos, ib).applyMatrix4(m);
			c.fromBufferAttribute(pos, ic).applyMatrix4(m);
			const yMin = Math.min(a.y, b.y, c.y), yMax = Math.max(a.y, b.y, c.y);
			const estSol = yMax < 0.15;
			const traverse = yMax > 0.3 && yMin < 1.5;
			if (!estSol && !traverse)
				continue;
			if (estSol) {
				n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
				if (Math.abs(n.y) < 0.8 * n.length())
					continue;
			}
			// echantillonnage du triangle plus fin que la grille
			const cote = Math.max(a.distanceTo(b), a.distanceTo(c), b.distanceTo(c));
			const s = Math.max(1, Math.ceil(cote / (GRILLE.pas * 0.5)));
			for (let u = 0; u <= s; u++) {
				for (let v = 0; u + v <= s; v++) {
					const w = s - u - v;
					p.set(0, 0, 0).addScaledVector(a, u / s).addScaledVector(b, v / s).addScaledVector(c, w / s);
					const k = caseDe(p.x, p.z);
					if (k < 0)
						continue;
					if (estSol)
						sol[k] = 1;
					else if (p.y > 0.3 && p.y < 1.5)
						obstacle[k] = 1;
				}
			}
		}
	});
}

function dilater(source, rayon) {
	const r = Math.ceil(rayon / GRILLE.pas);
	const offsets = [];
	for (let di = -r; di <= r; di++)
		for (let dk = -r; dk <= r; dk++)
			if (di * di + dk * dk <= r * r)
				offsets.push([di, dk]);
	const dest = new Uint8Array(source.length);
	for (let k = 0; k < GRILLE.nz; k++) {
		for (let i = 0; i < GRILLE.nx; i++) {
			if (!source[k * GRILLE.nx + i])
				continue;
			for (const [di, dk] of offsets) {
				const ii = i + di, kk = k + dk;
				if (ii >= 0 && kk >= 0 && ii < GRILLE.nx && kk < GRILLE.nz)
					dest[kk * GRILLE.nx + ii] = 1;
			}
		}
	}
	return dest;
}

function calculerMarchable() {
	// petits trous du scan dans le sol bouches, obstacles grossis du rayon d'epaule
	const solPlein = dilater(sol, 0.15);
	const bloque = dilater(obstacle, RAYON);
	for (let k = 0; k < marchable.length; k++)
		marchable[k] = solPlein[k] && !bloque[k] ? 1 : 0;
}

function peutMarcher(x, z) {
	const k = caseDe(x, z);
	return k >= 0 && marchable[k] === 1;
}

function plusProcheMarchable(x, z) {
	if (peutMarcher(x, z))
		return { x, z };
	for (let r = GRILLE.pas; r < 3; r += GRILLE.pas) {
		for (let a = 0; a < 32; a++) {
			const xx = x + r * Math.cos(a / 32 * Math.PI * 2);
			const zz = z + r * Math.sin(a / 32 * Math.PI * 2);
			if (peutMarcher(xx, zz))
				return { x: xx, z: zz };
		}
	}
	return { x, z };
}

// ---------- plan (mini-carte) ----------

const plan = $("bl-plan");
const ctxPlan = plan.getContext("2d");
const fondPlan = document.createElement("canvas");

function dessinerFondPlan() {
	fondPlan.width = GRILLE.nx;
	fondPlan.height = GRILLE.nz;
	const ctx = fondPlan.getContext("2d");
	const img = ctx.createImageData(GRILLE.nx, GRILLE.nz);
	for (let k = 0; k < marchable.length; k++) {
		let r = 0, g = 0, b = 0, alpha = 0;
		if (marchable[k]) {
			r = 233; g = 227; b = 216; alpha = 235;
		} else if (obstacle[k]) {
			r = 138; g = 90; b = 54; alpha = 210;
		} else if (sol[k]) {
			r = 190; g = 175; b = 150; alpha = 160;
		}
		img.data.set([r, g, b, alpha], k * 4);
	}
	ctx.putImageData(img, 0, 0);
}

// cadrage du plan sur la zone utile
let cadre = { i0: 0, k0: 0, i1: GRILLE.nx, k1: GRILLE.nz };
function cadrerPlan() {
	let i0 = GRILLE.nx, k0 = GRILLE.nz, i1 = 0, k1 = 0;
	for (let k = 0; k < GRILLE.nz; k++)
		for (let i = 0; i < GRILLE.nx; i++)
			if (sol[k * GRILLE.nx + i] || obstacle[k * GRILLE.nx + i]) {
				i0 = Math.min(i0, i); i1 = Math.max(i1, i + 1);
				k0 = Math.min(k0, k); k1 = Math.max(k1, k + 1);
			}
	if (i1 > i0)
		cadre = { i0: i0 - 4, k0: k0 - 4, i1: i1 + 4, k1: k1 + 4 };
}

function transformPlan() {
	const l = plan.width, h = plan.height;
	const ci = cadre.i1 - cadre.i0, ck = cadre.k1 - cadre.k0;
	const e = Math.min(l / ci, h / ck);
	return { e, ox: (l - ci * e) / 2 - cadre.i0 * e, oy: (h - ck * e) / 2 - cadre.k0 * e };
}

function dessinerPlan() {
	if (document.documentElement.classList.contains("bl-sans-plan"))
		return;
	const t = transformPlan();
	ctxPlan.clearRect(0, 0, plan.width, plan.height);
	ctxPlan.imageSmoothingEnabled = false;
	ctxPlan.drawImage(fondPlan, t.ox, t.oy, GRILLE.nx * t.e, GRILLE.nz * t.e);
	const px = t.ox + (joueur.x - GRILLE.xMin) / GRILLE.pas * t.e;
	const py = t.oy + (joueur.z - GRILLE.zMin) / GRILLE.pas * t.e;
	// cone de vision
	const dirX = -Math.sin(joueur.cap), dirY = -Math.cos(joueur.cap);
	const ang = Math.atan2(dirY, dirX);
	ctxPlan.fillStyle = "rgba(242, 193, 78, 0.35)";
	ctxPlan.beginPath();
	ctxPlan.moveTo(px, py);
	ctxPlan.arc(px, py, 26, ang - 0.6, ang + 0.6);
	ctxPlan.closePath();
	ctxPlan.fill();
	ctxPlan.fillStyle = "#f2c14e";
	ctxPlan.strokeStyle = "#1b1b1b";
	ctxPlan.lineWidth = 2;
	ctxPlan.beginPath();
	ctxPlan.arc(px, py, 5, 0, Math.PI * 2);
	ctxPlan.fill();
	ctxPlan.stroke();
}

function redimensionnerPlan() {
	const r = plan.getBoundingClientRect();
	const d = Math.min(window.devicePixelRatio, 2);
	plan.width = Math.max(1, Math.round(r.width * d));
	plan.height = Math.max(1, Math.round(r.height * d));
}
window.addEventListener("resize", redimensionnerPlan);

// toucher le plan : s'y rendre
plan.addEventListener("pointerdown", (e) => {
	e.stopPropagation();
	const r = plan.getBoundingClientRect();
	const t = transformPlan();
	const sx = (e.clientX - r.left) * plan.width / r.width;
	const sy = (e.clientY - r.top) * plan.height / r.height;
	const x = GRILLE.xMin + (sx - t.ox) / t.e * GRILLE.pas;
	const z = GRILLE.zMin + (sy - t.oy) / t.e * GRILLE.pas;
	const cible = plusProcheMarchable(x, z);
	if (peutMarcher(cible.x, cible.z)) {
		// on regarde dans la direction du deplacement
		joueur.cap = Math.atan2(-(cible.x - joueur.x), -(cible.z - joueur.z));
		joueur.x = cible.x;
		joueur.z = cible.z;
	}
});

// ---------- joueur et commandes ----------

const joueur = { x: DEPART.x, z: DEPART.z, cap: DEPART.cap, tangage: -0.05, vx: 0, vz: 0, pas: 0 };
const touches = new Set();
let actif = false;

const CODES = {
	avant: ["KeyW", "ArrowUp"],
	arriere: ["KeyS", "ArrowDown"],
	gauche: ["KeyA", "ArrowLeft"],
	droite: ["KeyD", "ArrowRight"],
};
const appuye = (nom) => CODES[nom].some((c) => touches.has(c));

window.addEventListener("keydown", (e) => {
	// la touche marquee M, quelle que soit la disposition du clavier
	if (e.key === "m" || e.key === "M") {
		basculerPlan();
		return;
	}
	if (e.key === "l" || e.key === "L") {
		basculerAmbiance();
		return;
	}
	touches.add(e.code);
	if (e.code.startsWith("Arrow"))
		e.preventDefault();
});
window.addEventListener("keyup", (e) => touches.delete(e.code));
window.addEventListener("blur", () => touches.clear());

function regarder(dx, dy) {
	joueur.cap -= dx * SENSIBILITE;
	joueur.tangage = THREE.MathUtils.clamp(joueur.tangage - dy * SENSIBILITE, -1.35, 1.35);
}

// souris verrouillee (ordinateur)
document.addEventListener("mousemove", (e) => {
	if (document.pointerLockElement === canvas)
		regarder(e.movementX, e.movementY);
});
canvas.addEventListener("click", () => {
	if (actif && !tactile && document.pointerLockElement !== canvas)
		verrouiller();
});
document.addEventListener("pointerlockchange", () => {
	if (!tactile && actif && document.pointerLockElement !== canvas)
		montrerAide("Cliquer dans l'image pour reprendre la souris", 4000);
});

function verrouiller() {
	try {
		const r = canvas.requestPointerLock({ unadjustedMovement: true });
		if (r && r.catch)
			r.catch(() => canvas.requestPointerLock());
	} catch (e) {
		canvas.requestPointerLock();
	}
}

// glisser pour regarder (tactile, ou souris non verrouillee)
let glisse = null;
canvas.addEventListener("pointerdown", (e) => {
	if (!actif || (!tactile && e.pointerType === "mouse"))
		return;
	if (glisse)
		return;
	glisse = { id: e.pointerId, x: e.clientX, y: e.clientY };
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
	if (!glisse || e.pointerId !== glisse.id)
		return;
	regarder((e.clientX - glisse.x) * 1.6, (e.clientY - glisse.y) * 1.6);
	glisse.x = e.clientX;
	glisse.y = e.clientY;
});
const finGlisse = (e) => {
	if (glisse && e.pointerId === glisse.id)
		glisse = null;
};
canvas.addEventListener("pointerup", finGlisse);
canvas.addEventListener("pointercancel", finGlisse);

// joystick
const joystick = $("bl-joystick");
const manche = joystick.querySelector(".bl-manche");
const stick = { id: null, x: 0, y: 0 };
function bougerStick(e) {
	const r = joystick.getBoundingClientRect();
	const rayon = r.width / 2;
	let dx = e.clientX - (r.left + rayon), dy = e.clientY - (r.top + rayon);
	const d = Math.hypot(dx, dy);
	if (d > rayon) {
		dx *= rayon / d;
		dy *= rayon / d;
	}
	stick.x = dx / rayon;
	stick.y = dy / rayon;
	manche.style.transform = `translate(${dx}px, ${dy}px)`;
}
joystick.addEventListener("pointerdown", (e) => {
	stick.id = e.pointerId;
	joystick.setPointerCapture(e.pointerId);
	bougerStick(e);
});
joystick.addEventListener("pointermove", (e) => {
	if (e.pointerId === stick.id)
		bougerStick(e);
});
const finStick = (e) => {
	if (e.pointerId !== stick.id)
		return;
	stick.id = null;
	stick.x = stick.y = 0;
	manche.style.transform = "";
};
joystick.addEventListener("pointerup", finStick);
joystick.addEventListener("pointercancel", finStick);

// ---------- boutons ----------

function basculerPlan() {
	const sans = document.documentElement.classList.toggle("bl-sans-plan");
	$("bl-bouton-plan").setAttribute("aria-pressed", String(!sans));
	if (!sans)
		redimensionnerPlan();
}
$("bl-bouton-plan").addEventListener("click", basculerPlan);

function basculerAmbiance() {
	const chaud = document.documentElement.classList.toggle("bl-chaud");
	$("bl-bouton-ambiance").setAttribute("aria-pressed", String(chaud));
}
$("bl-bouton-ambiance").addEventListener("click", basculerAmbiance);

let minuterieAide = 0;
function montrerAide(texte, duree) {
	aide.textContent = texte;
	aide.classList.add("bl-visible");
	clearTimeout(minuterieAide);
	minuterieAide = setTimeout(() => aide.classList.remove("bl-visible"), duree);
}

boutonEntrer.addEventListener("click", () => {
	actif = true;
	accueil.classList.add("bl-cache");
	if (!tactile)
		verrouiller();
	montrerAide(tactile
		? "Joystick pour marcher · glisser pour regarder · toucher le plan pour s'y rendre"
		: "ZQSD pour marcher · Maj pour courir · M : plan · L : lumière · Échap pour libérer la souris", 7000);
});

// ---------- boucle ----------

const direction = new THREE.Vector3();
let precedent = performance.now();

function avancer(dt) {
	let av = 0, lat = 0;
	if (appuye("avant")) av += 1;
	if (appuye("arriere")) av -= 1;
	if (appuye("droite")) lat += 1;
	if (appuye("gauche")) lat -= 1;
	if (stick.id !== null) {
		av -= stick.y;
		lat += stick.x;
	}
	const norme = Math.hypot(av, lat);
	if (norme > 1) {
		av /= norme;
		lat /= norme;
	}
	const vitesse = touches.has("ShiftLeft") || touches.has("ShiftRight") ? COURSE : MARCHE;
	const s = Math.sin(joueur.cap), c = Math.cos(joueur.cap);
	// vers l'avant : -z tourne du cap
	const cibleVx = (-s * av + c * lat) * vitesse;
	const cibleVz = (-c * av - s * lat) * vitesse;
	const lissage = 1 - Math.exp(-dt * 10);
	joueur.vx += (cibleVx - joueur.vx) * lissage;
	joueur.vz += (cibleVz - joueur.vz) * lissage;

	const dx = joueur.vx * dt, dz = joueur.vz * dt;
	if (Math.abs(dx) + Math.abs(dz) < 1e-5)
		return 0;
	// si on est deja hors zone (scan troue), on laisse sortir
	const libre = !peutMarcher(joueur.x, joueur.z);
	if (libre || peutMarcher(joueur.x + dx, joueur.z + dz)) {
		joueur.x += dx;
		joueur.z += dz;
	} else if (peutMarcher(joueur.x + dx, joueur.z)) {
		// on glisse le long du mur
		joueur.x += dx;
		joueur.vz = 0;
	} else if (peutMarcher(joueur.x, joueur.z + dz)) {
		joueur.z += dz;
		joueur.vx = 0;
	} else {
		joueur.vx = joueur.vz = 0;
	}
	return Math.hypot(joueur.vx, joueur.vz);
}

function boucle(maintenant) {
	const dt = Math.min((maintenant - precedent) / 1000, 0.1);
	precedent = maintenant;
	let v = 0;
	if (actif) {
		// petits pas, pour ne jamais sauter par-dessus un mur quand l'image saccade
		const n = Math.ceil(dt / 0.02);
		for (let i = 0; i < n; i++)
			v = avancer(dt / n);
	}
	// leger balancement de la marche
	joueur.pas += dt * v * 5.5;
	const balance = Math.min(v / MARCHE, 1.5);
	camera.position.set(joueur.x, YEUX + Math.sin(joueur.pas * 2) * 0.018 * balance, joueur.z);
	camera.rotation.set(joueur.tangage, joueur.cap, Math.sin(joueur.pas) * 0.004 * balance);
	renderer.render(scene, camera);
	dessinerPlan();
	requestAnimationFrame(boucle);
}

// ---------- demarrage ----------

Promise.all(MORCEAUX.map(chargerMorceau)).then((racines) => {
	for (const r of racines) {
		preparer(r);
		rasteriser(r);
	}
	calculerMarchable();
	cadrerPlan();
	dessinerFondPlan();
	redimensionnerPlan();
	const depart = plusProcheMarchable(DEPART.x, DEPART.z);
	joueur.x = depart.x;
	joueur.z = depart.z;
	accueil.classList.add("bl-pret");
	boutonEntrer.disabled = false;
	boutonEntrer.textContent = "Entrer";
	passerEnHD();
	if (new URLSearchParams(location.search).has("debug"))
		window.__balade = { joueur, peutMarcher, sol, obstacle, marchable, GRILLE };
}).catch((err) => {
	console.error(err);
	document.documentElement.classList.add("bl-erreur");
	boutonEntrer.textContent = "Échec du chargement";
});

requestAnimationFrame(boucle);
