/*
Projection des photos 360 sur le maillage (comme le fait le lecteur Matterport).

Le maillage du scan est grossier et sa texture est une seule image pour tout l'appartement : de pres,
c'est flou. Les photos 360 des points de vue, elles, sont nettes (6 faces de cube en 2048 px, ou 1024 px sur
ecran tactile : c'est deja la finesse de l'ecran, et la memoire graphique d'un telephone est limitee).

Chaque pixel melange les photos des 4 points de vue les plus proches. Une photo compte d'autant plus
que la direction dans laquelle elle a vu ce pixel est proche de la direction du regard (rendu « selon
le point de vue ») : debout sur un point de vue, on voit exactement sa photo ; en marchant, l'image glisse
continument vers la photo suivante. Quand la liste des 4 points change, la photo qui sort s'efface et
celle qui entre apparait en fondu.

Ce qu'une photo ne voit pas (derriere un meuble) ne doit pas recevoir sa couleur : pour chaque point
de vue, on calcule une carte de distances (cube, rendu du maillage depuis le centre de la photo).
Un pixel plus loin que la distance stockee est cache pour cette photo. Si aucune photo ne le voit,
on garde la texture du maillage.

Orientation des faces (mesuree en comparant les faces aux rendus du maillage, identique pour tous
les points) : dans le repere de la photo (z vers le haut), la direction L se lit dans le cube a
(-L.y, L.z, L.x), avec les faces skybox 2, 4, 0, 5, 1, 3 dans l'ordre +x, -x, +y, -y, +z, -z.
*/
import * as THREE from "three";

const DOSSIER_PANOS = "/models/7b65e66514b54366b3a13fe422755cf4/assets/pan/";
const POINTS_DE_VUE = "/_mp_api/mp/models/graph_GetShowcaseSweeps.json";
const ORDRE_FACES = [2, 4, 0, 5, 1, 3];
const DMAX = 20; // metres, portee de la carte de distances (version 8 bits)
const TAILLE_PROF = 512;
const NB_SLOTS = 4; // photos melangees dans chaque pixel
const DUREE_FONDU = 0.5;

const SOMMETS = /* glsl */ `
varying vec2 vUv;
varying vec3 vMonde;
void main() {
	vUv = uv;
	vec4 m = modelMatrix * vec4(position, 1.0);
	vMonde = m.xyz;
	gl_Position = projectionMatrix * viewMatrix * m;
}`;

// distance stockee : en flottant (filtree, bords doux) si la carte graphique sait la rendre, sinon sur 16 bits
function lireDistance(flottant) {
	return flottant ? /* glsl */ `
float distanceStockee(samplerCube prof, vec3 d) {
	return textureCube(prof, d).r;
}` : /* glsl */ `
float distanceStockee(samplerCube prof, vec3 d) {
	vec4 t = textureCube(prof, d);
	return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0 * ${DMAX.toFixed(1)};
}`;
}

function pixels(flottant) {
	let declarations = "", melange = "";
	for (let i = 0; i < NB_SLOTS; i++) {
		declarations += `
uniform samplerCube pano${i};
uniform samplerCube prof${i};
uniform vec3 centre${i};
uniform mat3 orient${i};
uniform float gain${i};`;
		melange += `
	if (gain${i} > 0.001) {
		vec3 d = vMonde - centre${i};
		float l = length(d);
		float v = gain${i} * visibilite(distanceStockee(prof${i}, d), l);
		if (v > 0.001) {
			// 0 quand la photo a vu ce pixel exactement dans la direction du regard
			float ecart = 1.0 - dot(d / l, regard);
			float w = v / ((ecart + 0.002) * (ecart + 0.002) * (0.3 + l));
			somme += w * textureCube(pano${i}, orient${i} * d).rgb;
			poids += w;
			couverture = max(couverture, v);
		}
	}`;
	}
	return /* glsl */ `
uniform sampler2D carte;
${declarations}
varying vec2 vUv;
varying vec3 vMonde;
${lireDistance(flottant)}

float visibilite(float stockee, float l) {
	float marge = ${flottant ? "0.03 + 0.02 * l" : "0.04 + 0.03 * l"};
	return 1.0 - smoothstep(stockee + marge, stockee + 2.5 * marge, l);
}

void main() {
	vec3 maillage = texture2D(carte, vUv).rgb;
	vec3 regard = normalize(vMonde - cameraPosition);
	vec3 somme = vec3(0.0);
	float poids = 0.0;
	float couverture = 0.0;
	${melange}
	vec3 couleur = poids > 0.0 ? somme / poids : maillage;
	gl_FragColor = vec4(mix(maillage, couleur, couverture), 1.0);
	#include <colorspace_fragment>
}`;
}

// la ou le scan n'a rien (vue par une fenetre ouverte) : les photos vues a l'infini
function fondPixels() {
	let declarations = "", melange = "";
	for (let i = 0; i < NB_SLOTS; i++) {
		declarations += `
uniform samplerCube pano${i};
uniform vec3 centre${i};
uniform mat3 orient${i};
uniform float gain${i};`;
		melange += `
	if (gain${i} > 0.001) {
		float l = length(cameraPosition - centre${i});
		float w = gain${i} / ((0.2 + l) * (0.2 + l));
		somme += w * textureCube(pano${i}, orient${i} * regard).rgb;
		poids += w;
	}`;
	}
	return /* glsl */ `
${declarations}
varying vec3 vMonde;
void main() {
	vec3 regard = normalize(vMonde - cameraPosition);
	vec3 somme = vec3(0.0);
	float poids = 0.0;
	${melange}
	gl_FragColor = vec4(poids > 0.0 ? somme / poids : vec3(0.87, 0.91, 0.93), 1.0);
	#include <colorspace_fragment>
}`;
}

function profPixels(flottant) {
	return /* glsl */ `
uniform vec3 centre;
varying vec3 vMonde;
void main() {
	float l = length(vMonde - centre);
	${flottant ? `gl_FragColor = vec4(l, 0.0, 0.0, 1.0);` : `
	float d = floor(clamp(l / ${DMAX.toFixed(1)}, 0.0, 1.0) * 65535.0 + 0.5);
	float haut = floor(d / 256.0);
	gl_FragColor = vec4(haut / 255.0, (d - haut * 256.0) / 255.0, 0.0, 1.0);`}
}`;
}

// repere des points de vue (z vers le haut) -> repere du maillage (y vers le haut)
const versMaillage = (v) => new THREE.Vector3(v.x, v.z, -v.y);

// matrice : direction dans le maillage -> direction de lecture dans le cube de la photo
function orientation(q) {
	const inverse = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
	const colonne = (x, y, z) => {
		const l = new THREE.Vector3(x, -z, y).applyQuaternion(inverse);
		return new THREE.Vector3(-l.y, l.z, l.x);
	};
	return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeBasis(colonne(1, 0, 0), colonne(0, 1, 0), colonne(0, 0, 1)));
}

export function creerPanoramas({ renderer, scene, tactile, voit }) {
	const flottant = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
	// photos gardees en memoire graphique (une photo 2k : environ 100 Mo, 1k : 25 Mo)
	const dossier = DOSSIER_PANOS + (tactile ? "high" : "2k") + "/~/";
	const enMemoire = NB_SLOTS + 2;

	const uniformes = {};
	const slots = [];
	for (let i = 0; i < NB_SLOTS; i++) {
		uniformes["pano" + i] = { value: null };
		uniformes["prof" + i] = { value: null };
		uniformes["centre" + i] = { value: new THREE.Vector3() };
		uniformes["orient" + i] = { value: new THREE.Matrix3() };
		uniformes["gain" + i] = { value: 0 };
		slots.push({ point: null, gain: 0, sortie: false });
	}

	const fragmentShader = pixels(flottant);
	const matProf = new THREE.ShaderMaterial({
		vertexShader: SOMMETS,
		fragmentShader: profPixels(flottant),
		uniforms: { centre: { value: new THREE.Vector3() } },
		side: THREE.DoubleSide,
	});
	// decodage des photos hors du fil principal : pas d'a-coup quand une photo arrive
	const chargeurImages = new THREE.ImageBitmapLoader();

	let points = [];
	let horloge = Infinity;

	// sphere de fond, centree sur la camera ; calque 1 : absente des cartes de distances
	const fond = new THREE.Mesh(
		new THREE.SphereGeometry(40, 32, 16),
		new THREE.ShaderMaterial({
			vertexShader: SOMMETS,
			fragmentShader: fondPixels(),
			uniforms: uniformes,
			side: THREE.BackSide,
			depthWrite: false,
		}),
	);
	fond.renderOrder = -1;
	fond.frustumCulled = false;
	fond.layers.set(1);
	fond.onBeforeRender = (r, s, camera) => fond.position.copy(camera.position);

	function materiau(carte) {
		return new THREE.ShaderMaterial({
			vertexShader: SOMMETS,
			fragmentShader,
			uniforms: { carte: { value: carte }, ...uniformes },
			side: THREE.DoubleSide,
		});
	}

	async function initialiser() {
		const reponse = await fetch(POINTS_DE_VUE);
		const donnees = await reponse.json();
		points = donnees.data.model.locations
			// les photos ajoutees a la main sont placees approximativement : on ne garde que le scan
			.filter((l) => l.pano && l.pano.placement === "auto")
			.map((l) => ({
				index: l.index,
				uuid: l.pano.sweepUuid,
				centre: versMaillage(l.pano.position),
				sol: versMaillage(l.position),
				orient: orientation(l.pano.rotation),
				pano: null, images: null, prof: null, pret: null, charge: false, utilise: 0,
			}));
		return points;
	}

	function calculerProfondeur(p) {
		const cibleRendu = new THREE.WebGLCubeRenderTarget(TAILLE_PROF, flottant ? {
			type: THREE.HalfFloatType,
			format: THREE.RedFormat,
			generateMipmaps: false,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
		} : {
			generateMipmaps: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
		});
		const cam = new THREE.CubeCamera(0.05, 60, cibleRendu);
		cam.position.copy(p.centre);
		matProf.uniforms.centre.value.copy(p.centre);
		const fond = scene.background;
		const couleur = renderer.getClearColor(new THREE.Color());
		const alpha = renderer.getClearAlpha();
		scene.background = null;
		scene.overrideMaterial = matProf;
		// pas de geometrie (fenetre) : distance maximale
		renderer.setClearColor(flottant ? new THREE.Color(1000, 1000, 1000) : new THREE.Color(1, 1, 1), 1);
		cam.update(renderer, scene);
		renderer.setClearColor(couleur, alpha);
		scene.overrideMaterial = null;
		scene.background = fond;
		return cibleRendu;
	}

	const dansUnSlot = (p) => slots.some((s) => s.point === p);

	function liberer(p) {
		if (p.pano)
			p.pano.dispose();
		if (p.images)
			for (const im of p.images)
				im.close && im.close();
		if (p.prof)
			p.prof.dispose();
		p.pano = p.images = p.prof = p.pret = null;
		p.charge = false;
	}

	function charger(p) {
		p.utilise = performance.now();
		if (p.pret)
			return p.pret;
		// place en memoire : on oublie les photos les moins recemment utilisees
		const liberables = points.filter((q) => q.pret && q !== p && !dansUnSlot(q))
			.sort((a, b) => a.utilise - b.utilise);
		let total = points.filter((q) => q.pret).length;
		while (total >= enMemoire && liberables.length) {
			liberer(liberables.shift());
			total--;
		}
		const urls = ORDRE_FACES.map((f) => `${dossier}${p.uuid}_skybox${f}.jpg`);
		p.pret = Promise.all(urls.map((u) => chargeurImages.loadAsync(u))).then((images) => {
			if (!p.pret)
				return p; // libere entre-temps
			const texture = new THREE.CubeTexture(images);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.generateMipmaps = false;
			texture.minFilter = THREE.LinearFilter;
			texture.needsUpdate = true;
			// envoi a la carte graphique tout de suite, pas au moment ou la photo devient visible
			renderer.initTexture(texture);
			p.images = images;
			p.pano = texture;
			p.prof = calculerProfondeur(p);
			p.charge = true;
			return p;
		});
		p.pret.catch(() => liberer(p));
		return p.pret;
	}

	function classer(pos) {
		return points
			.map((p) => {
				const d = Math.hypot(p.sol.x - pos.x, p.sol.z - pos.z);
				// un point de vue derriere un mur aide peu : on prefere ceux qu'on voit
				return { p, score: d + (voit(pos.x, pos.z, p.sol.x, p.sol.z) ? 0 : 2.5) };
			})
			.sort((a, b) => a.score - b.score)
			.map((x) => x.p);
	}

	function remplirSlot(i) {
		const p = slots[i].point;
		uniformes["pano" + i].value = p ? p.pano : null;
		uniformes["prof" + i].value = p ? p.prof.texture : null;
		if (p) {
			uniformes["centre" + i].value.copy(p.centre);
			uniformes["orient" + i].value.copy(p.orient);
		}
	}

	function placer(p, gain) {
		const i = slots.findIndex((s) => !s.point);
		if (i < 0)
			return false;
		slots[i].point = p;
		slots[i].gain = gain;
		slots[i].sortie = false;
		remplirSlot(i);
		return true;
	}

	// avant d'entrer : la photo du point de depart, visible tout de suite
	async function demarrer(pos) {
		const [premier] = classer(pos);
		if (!premier)
			return;
		await charger(premier);
		placer(premier, 1);
		horloge = Infinity;
	}

	function choisir(pos) {
		const classes = classer(pos);
		const voulus = classes.slice(0, NB_SLOTS);
		for (const s of slots)
			if (s.point)
				s.sortie = !voulus.includes(s.point);
		for (const p of voulus) {
			if (dansUnSlot(p))
				continue;
			if (p.charge)
				placer(p, 0);
			else
				charger(p).catch(() => {});
		}
		// les suivants probables se chargent d'avance
		for (const p of classes.slice(NB_SLOTS, enMemoire))
			if (!p.pret && points.filter((q) => q.pret).length < enMemoire)
				charger(p).catch(() => {});
	}

	function mettreAJour(pos, dt) {
		if (!points.length)
			return;
		horloge += dt;
		if (horloge > 0.12) {
			horloge = 0;
			choisir(pos);
		}
		const pas = dt / DUREE_FONDU;
		slots.forEach((s, i) => {
			if (!s.point)
				return;
			if (s.sortie) {
				s.gain -= pas;
				if (s.gain <= 0) {
					s.point = null;
					s.gain = 0;
					remplirSlot(i);
				}
			} else {
				s.gain = Math.min(1, s.gain + pas);
			}
			uniformes["gain" + i].value = s.point ? s.gain : 0;
		});
	}

	return {
		fond,
		materiau,
		initialiser,
		demarrer,
		mettreAJour,
		get points() {
			return points;
		},
	};
}
