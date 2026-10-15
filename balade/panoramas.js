/*
Projection des photos 360 sur le maillage (comme le fait le lecteur Matterport).

Le maillage du scan est grossier et sa texture est une seule image pour tout l'appartement : de pres,
c'est flou. Les photos 360 des points de vue, elles, sont nettes (6 faces de cube en 2048 px, ou 1024 px sur
ecran tactile : c'est deja la finesse de l'ecran, et la memoire graphique d'un telephone est limitee).
Chaque pixel du maillage prend donc la couleur de la photo du point de vue actif, vue dans la
direction (pixel - centre de la photo). On passe d'un point de vue au suivant par un fondu.

Ce qu'une photo ne voit pas (derriere un meuble) ne doit pas recevoir sa couleur : pour chaque point
de vue, on calcule une carte de distances (cube, rendu du maillage depuis le centre de la photo).
Un pixel plus loin que la distance stockee est cache : on y garde le point de vue precedent, sinon
la texture du maillage.

Orientation des faces (mesuree en comparant les faces aux rendus du maillage, identique pour tous
les points) : dans le repere de la photo (z vers le haut), la direction L se lit dans le cube a
(-L.y, L.z, L.x), avec les faces skybox 2, 4, 0, 5, 1, 3 dans l'ordre +x, -x, +y, -y, +z, -z.
*/
import * as THREE from "three";

const DOSSIER_PANOS = "/models/7b65e66514b54366b3a13fe422755cf4/assets/pan/";
const POINTS_DE_VUE = "/_mp_api/mp/models/graph_GetShowcaseSweeps.json";
const ORDRE_FACES = [2, 4, 0, 5, 1, 3];
const DMAX = 20; // metres, portee de la carte de distances
const TAILLE_PROF = 512;
const DUREE_FONDU = 0.6;
const HYSTERESIS = 0.3; // metres d'avance qu'il faut a un autre point pour devenir actif

const SOMMETS = /* glsl */ `
varying vec2 vUv;
varying vec3 vMonde;
void main() {
	vUv = uv;
	vec4 m = modelMatrix * vec4(position, 1.0);
	vMonde = m.xyz;
	gl_Position = projectionMatrix * viewMatrix * m;
}`;

const PIXELS = /* glsl */ `
uniform sampler2D carte;
uniform samplerCube panoA;
uniform samplerCube panoB;
uniform samplerCube profA;
uniform samplerCube profB;
uniform vec3 centreA;
uniform vec3 centreB;
uniform mat3 orientA;
uniform mat3 orientB;
uniform float actifA;
uniform float actifB;
uniform float fondu;
varying vec2 vUv;
varying vec3 vMonde;

float distanceStockee(samplerCube prof, vec3 d) {
	vec4 t = textureCube(prof, d);
	return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0 * ${DMAX.toFixed(1)};
}

float visibilite(samplerCube prof, vec3 centre, float actif) {
	if (actif < 0.5)
		return 0.0;
	vec3 d = vMonde - centre;
	float l = length(d);
	float s = distanceStockee(prof, d);
	float marge = 0.04 + 0.03 * l;
	return 1.0 - smoothstep(s + marge, s + 2.0 * marge, l);
}

void main() {
	vec3 couleur = texture2D(carte, vUv).rgb;
	float vB = visibilite(profB, centreB, actifB);
	if (vB > 0.0)
		couleur = mix(couleur, textureCube(panoB, orientB * (vMonde - centreB)).rgb, vB);
	float vA = visibilite(profA, centreA, actifA) * fondu;
	if (vA > 0.0)
		couleur = mix(couleur, textureCube(panoA, orientA * (vMonde - centreA)).rgb, vA);
	gl_FragColor = vec4(couleur, 1.0);
	#include <colorspace_fragment>
}`;

const PROF_PIXELS = /* glsl */ `
uniform vec3 centre;
varying vec3 vMonde;
void main() {
	float d = floor(clamp(length(vMonde - centre) / ${DMAX.toFixed(1)}, 0.0, 1.0) * 65535.0 + 0.5);
	float haut = floor(d / 256.0);
	gl_FragColor = vec4(haut / 255.0, (d - haut * 256.0) / 255.0, 0.0, 1.0);
}`;

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
	const uniformes = {
		panoA: { value: null }, panoB: { value: null },
		profA: { value: null }, profB: { value: null },
		centreA: { value: new THREE.Vector3() }, centreB: { value: new THREE.Vector3() },
		orientA: { value: new THREE.Matrix3() }, orientB: { value: new THREE.Matrix3() },
		actifA: { value: 0 }, actifB: { value: 0 },
		fondu: { value: 1 },
	};
	// photos gardees en memoire graphique (une photo 2k : environ 100 Mo, 1k : 25 Mo)
	const dossier = DOSSIER_PANOS + (tactile ? "high" : "2k") + "/~/";
	const enMemoire = tactile ? 3 : 5;

	const matProf = new THREE.ShaderMaterial({
		vertexShader: SOMMETS,
		fragmentShader: PROF_PIXELS,
		uniforms: { centre: { value: new THREE.Vector3() } },
		side: THREE.DoubleSide,
	});

	let points = [];
	let slotA = null, slotB = null, cible = null;
	let horloge = 0;

	function materiau(carte) {
		return new THREE.ShaderMaterial({
			vertexShader: SOMMETS,
			fragmentShader: PIXELS,
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
				pano: null, prof: null, pret: null, utilise: 0,
			}));
		return points;
	}

	function calculerProfondeur(p) {
		const cibleRendu = new THREE.WebGLCubeRenderTarget(TAILLE_PROF, {
			generateMipmaps: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
		});
		const cam = new THREE.CubeCamera(0.05, DMAX * 2, cibleRendu);
		cam.position.copy(p.centre);
		matProf.uniforms.centre.value.copy(p.centre);
		const fond = scene.background;
		const couleur = renderer.getClearColor(new THREE.Color());
		const alpha = renderer.getClearAlpha();
		scene.background = null;
		scene.overrideMaterial = matProf;
		// pas de geometrie (fenetre) : distance maximale
		renderer.setClearColor(0xffffff, 1);
		cam.update(renderer, scene);
		renderer.setClearColor(couleur, alpha);
		scene.overrideMaterial = null;
		scene.background = fond;
		return cibleRendu;
	}

	function liberer(p) {
		if (p.pano)
			p.pano.dispose();
		if (p.prof)
			p.prof.dispose();
		p.pano = p.prof = p.pret = null;
	}

	function charger(p) {
		p.utilise = performance.now();
		if (p.pret)
			return p.pret;
		// place en memoire : on oublie les photos les moins recemment utilisees
		const charges = points.filter((q) => q.pret && q !== slotA && q !== slotB && q !== p)
			.sort((a, b) => a.utilise - b.utilise);
		let total = points.filter((q) => q.pret).length;
		while (total >= enMemoire && charges.length) {
			liberer(charges.shift());
			total--;
		}
		p.pret = new Promise((resoudre, rejeter) => {
			const urls = ORDRE_FACES.map((f) => `${dossier}${p.uuid}_skybox${f}.jpg`);
			const texture = new THREE.CubeTextureLoader().load(urls, () => {
				p.prof = calculerProfondeur(p);
				resoudre(p);
			}, undefined, rejeter);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.generateMipmaps = false;
			texture.minFilter = THREE.LinearFilter;
			p.pano = texture;
		});
		p.pret.catch(() => liberer(p));
		return p.pret;
	}

	function plusProches(pos, n) {
		return points
			.map((p) => {
				const d = Math.hypot(p.sol.x - pos.x, p.sol.z - pos.z);
				// un point de vue derriere un mur ne sert a rien
				return { p, score: d + (voit(pos.x, pos.z, p.sol.x, p.sol.z) ? 0 : 100) };
			})
			.sort((a, b) => a.score - b.score)
			.slice(0, n);
	}

	function remplirSlot(lettre, p) {
		uniformes["pano" + lettre].value = p ? p.pano : null;
		uniformes["prof" + lettre].value = p ? p.prof.texture : null;
		uniformes["actif" + lettre].value = p ? 1 : 0;
		if (p) {
			uniformes["centre" + lettre].value.copy(p.centre);
			uniformes["orient" + lettre].value.copy(p.orient);
		}
	}

	function activer(p, avecFondu) {
		if (p === slotA)
			return;
		slotB = avecFondu ? slotA : null;
		slotA = p;
		remplirSlot("A", slotA);
		remplirSlot("B", slotB);
		uniformes.fondu.value = avecFondu ? 0 : 1;
	}

	// premier point de vue, avant d'entrer
	async function demarrer(pos) {
		const [premier] = plusProches(pos, 1);
		if (!premier)
			return;
		cible = premier.p;
		await charger(cible);
		activer(cible, false);
	}

	function mettreAJour(pos, dt) {
		if (!points.length)
			return;
		horloge += dt;
		if (horloge > 0.15) {
			horloge = 0;
			const proches = plusProches(pos, 2);
			const meilleur = proches[0];
			const actuel = cible && proches.find((x) => x.p === cible);
			const scoreActuel = actuel ? actuel.score : Infinity;
			if (meilleur && meilleur.p !== cible && meilleur.score + HYSTERESIS < scoreActuel)
				cible = meilleur.p;
			if (cible) {
				const c = cible;
				charger(c).then(() => {
					if (c === cible)
						activer(c, true);
				}, () => {});
			}
			// le suivant probable se charge d'avance
			if (proches[1] && proches[1].p.pret === null && points.filter((q) => q.pret).length < enMemoire)
				charger(proches[1].p).catch(() => {});
		}
		if (uniformes.fondu.value < 1)
			uniformes.fondu.value = Math.min(1, uniformes.fondu.value + dt / DUREE_FONDU);
	}

	return {
		materiau,
		initialiser,
		demarrer,
		mettreAJour,
		get points() {
			return points;
		},
	};
}
