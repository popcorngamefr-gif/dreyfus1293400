/*
Ajouts « Souvenir depuis Pierre Dreyfus » par-dessus le lecteur Matterport.

- Mode souvenir (par defaut) : animation de la porte d'entree, arrivee dans l'entree,
  bouton « Mode jeu » (deplacements au clavier + souris, joystick sur mobile),
  bouton « Navigation classique ».
- Mode classique (?m=...&classique=1) : le lecteur tel qu'il etait, seul le logo change.

Rien ici ne touche aux donnees de la visite. Le lecteur est pilote uniquement avec
des evenements clavier / pointeur, comme le ferait un utilisateur.
*/
(function () {
	"use strict";

	var MODELE = "JgaZQe7xn5N";
	// point de vue 0 (piece « entrance »), face a l'appartement ; ss commence a 1
	var DEPART = "&ss=1&sr=0,0&play=1";

	var recherche = window.location.search;
	// index.html redirige d'abord vers ?m=<modele> : on attend d'y etre
	if (!recherche.startsWith("?m=" + MODELE))
		return;

	var params = new URLSearchParams(recherche);
	var classique = params.has("classique");
	var lienClassique = "?m=" + MODELE + "&classique=1";
	var lienSouvenir = "?m=" + MODELE;

	document.documentElement.classList.add(classique ? "sv-mode-classique" : "sv-mode-souvenir");

	// le lecteur lit le point de depart dans l'adresse, avant que ses scripts demarrent
	var avecIntro = false;
	if (!classique && !params.has("ss") && !params.has("start") && !params.has("sp")) {
		history.replaceState(history.state, "", recherche + DEPART + window.location.hash);
		avecIntro = true;
	}

	function quandPret(fn) {
		if (document.readyState === "loading")
			document.addEventListener("DOMContentLoaded", fn);
		else
			fn();
	}

	function el(tag, attrs, html) {
		var e = document.createElement(tag);
		for (var k in attrs || {})
			e.setAttribute(k, attrs[k]);
		if (html)
			e.innerHTML = html;
		return e;
	}

	// ---------- detection de fin de chargement du lecteur ----------

	function lecteurPret() {
		var g = document.getElementById("loading-gui");
		return !!g && g.classList.contains("faded-out") && !!document.querySelector(".webgl-canvas");
	}

	function attendreLecteur(fn, delaiMax) {
		var debut = Date.now();
		(function verifier() {
			if (lecteurPret() || Date.now() - debut > delaiMax)
				fn();
			else
				setTimeout(verifier, 200);
		})();
	}

	// ---------- evenements envoyes au lecteur ----------

	function canvas() {
		return document.querySelector(".webgl-canvas");
	}

	// le lecteur lit e.which / e.keyCode
	function envoyerTouche(type, code) {
		var c = canvas();
		if (!c)
			return;
		var e = new KeyboardEvent(type, { bubbles: true, cancelable: true });
		Object.defineProperty(e, "keyCode", { get: function () { return code; } });
		Object.defineProperty(e, "which", { get: function () { return code; } });
		c.dispatchEvent(e);
	}

	// button vaut -1 pour un simple deplacement (sinon le lecteur l'ignore)
	function envoyerPointeur(type, x, y, bouton, boutons) {
		var c = canvas();
		if (!c)
			return;
		c.dispatchEvent(new PointerEvent(type, {
			bubbles: true, cancelable: true, composed: true, view: window,
			clientX: x, clientY: y, screenX: x, screenY: y,
			pointerId: 1, pointerType: "mouse", isPrimary: true,
			button: bouton, buttons: boutons
		}));
	}

	// ---------- barre de boutons ----------

	var boutonJeu = null;

	function creerBarre() {
		var barre = el("div", { id: "sv-barre" });
		if (classique) {
			barre.appendChild(el("a", { href: lienSouvenir, title: "Revenir à la visite souvenir" }, '<span class="sv-long">Visite souvenir</span><span class="sv-court">Souvenir</span>'));
		} else {
			boutonJeu = el("button", { type: "button", "aria-pressed": "false", title: "Se déplacer comme dans un jeu vidéo" }, '&#127918; <span class="sv-long">Mode jeu</span><span class="sv-court">Jeu</span>');
			boutonJeu.addEventListener("click", function () {
				if (jeu.actif)
					jeu.arreter();
				else
					jeu.demarrer();
			});
			barre.appendChild(boutonJeu);
			barre.appendChild(el("a", { href: lienClassique, title: "La visite Matterport d'origine" }, '<span class="sv-long">Navigation classique</span><span class="sv-court">Classique</span>'));
		}
		document.body.appendChild(barre);
	}

	// ---------- intro : la porte ----------

	var CHAT = '<svg class="sv-chat" viewBox="0 0 60 80" aria-hidden="true"><path fill="#1c2340" d="M14 22 L12 6 L22 16 Q30 13 38 16 L48 6 L46 22 Q52 30 48 40 Q54 50 52 64 Q58 70 56 76 Q50 80 40 76 L22 76 Q10 78 8 68 Q6 54 14 42 Q8 32 14 22 Z"/><circle cx="23" cy="26" r="5" fill="#fff"/><circle cx="37" cy="26" r="5" fill="#fff"/><circle cx="24" cy="27" r="2.2" fill="#1c2340"/><circle cx="36" cy="27" r="2.2" fill="#1c2340"/><path d="M30 31 l-2 2 h4 z" fill="#f2a6a6"/></svg>';

	function lancerIntro() {
		var intro = el("div", { id: "sv-intro", role: "dialog", "aria-label": "Entrée de la visite" },
			'<div class="sv-scene">' +
				'<div class="sv-cadre"><div class="sv-porte">' +
					'<div class="sv-panneau sv-haut"></div><div class="sv-panneau sv-bas"></div>' +
					'<div class="sv-judas"></div><div class="sv-numero">16</div>' + CHAT +
					'<div class="sv-poignee"></div>' +
				'</div></div>' +
				// apres le cadre, sinon le mur (ombre du cadre) le recouvre
				'<div class="sv-sol"><div class="sv-paillasson">Bienvenue</div></div>' +
			'</div>' +
			'<div class="sv-legende"><h1>Souvenir depuis Pierre Dreyfus</h1><p>16 rue Pierre Dreyfus</p></div>' +
			'<div class="sv-actions">' +
				'<button type="button" class="sv-entrer" disabled>Chargement…</button>' +
				'<a class="sv-lien-classique" href="' + lienClassique + '">Navigation classique</a>' +
			'</div>');
		document.body.appendChild(intro);

		var entrer = intro.querySelector(".sv-entrer");
		var lance = false;

		function ouvrir() {
			if (lance || entrer.disabled)
				return;
			lance = true;
			document.removeEventListener("keydown", clavier, true);
			intro.classList.add("sv-ouverte");
			setTimeout(function () { intro.classList.add("sv-entree"); }, 1100);
			setTimeout(function () { intro.classList.add("sv-fini"); }, 2300);
			setTimeout(function () {
				intro.remove();
				var c = canvas();
				if (c)
					c.focus({ preventScroll: true });
			}, 3100);
		}

		function clavier(e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				ouvrir();
			}
		}

		entrer.addEventListener("click", ouvrir);
		document.addEventListener("keydown", clavier, true);

		attendreLecteur(function () {
			entrer.disabled = false;
			entrer.textContent = "Entrer";
			entrer.focus({ preventScroll: true });
		}, 25000);
	}

	// ---------- mode jeu ----------

	// touches physiques (e.code) : ZQSD sur AZERTY = WASD sur QWERTY
	var TOUCHES = {
		KeyW: 87, KeyS: 83, KeyA: 65, KeyD: 68,
		ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39
	};
	var SENSIBILITE = 1.3;

	var jeu = {
		actif: false,
		couche: null,
		viseur: null,
		aide: null,
		joystick: null,
		enfoncees: {},
		// glisser virtuel pour tourner la camera
		tenu: false,
		vx: 0,
		vy: 0,
		cumulX: 0,
		cumulY: 0,
		minuterie: 0,

		demarrer: function () {
			if (this.actif)
				return;
			this.actif = true;
			boutonJeu.setAttribute("aria-pressed", "true");
			var tactile = window.matchMedia("(pointer: coarse)").matches;

			this.viseur = el("div", { id: "sv-viseur" });
			this.aide = el("div", { id: "sv-aide" }, tactile
				? "Joystick : marcher &middot; Glisser l'écran : regarder"
				: "<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou flèches : marcher &middot; Souris : regarder &middot; Clic : aller au viseur &middot; <kbd>Échap</kbd> : quitter");
			document.body.appendChild(this.viseur);
			document.body.appendChild(this.aide);
			var aide = this.aide;
			setTimeout(function () { aide.classList.add("sv-discret"); }, 7000);

			window.addEventListener("keydown", this.surTouche, true);
			window.addEventListener("keyup", this.surTouche, true);
			window.addEventListener("blur", this.relacherTout);

			if (tactile)
				this.creerJoystick();
			else
				this.verrouillerSouris();
		},

		arreter: function () {
			if (!this.actif)
				return;
			this.actif = false;
			if (boutonJeu)
				boutonJeu.setAttribute("aria-pressed", "false");
			window.removeEventListener("keydown", this.surTouche, true);
			window.removeEventListener("keyup", this.surTouche, true);
			window.removeEventListener("blur", this.relacherTout);
			document.removeEventListener("pointerlockchange", this.surVerrou);
			this.relacherTout();
			if (document.pointerLockElement)
				document.exitPointerLock();
			[this.couche, this.viseur, this.aide, this.joystick].forEach(function (e) {
				if (e)
					e.remove();
			});
			this.couche = this.viseur = this.aide = this.joystick = null;
		},

		relacherTout: function () {
			for (var code in jeu.enfoncees)
				envoyerTouche("keyup", jeu.enfoncees[code]);
			jeu.enfoncees = {};
			jeu.finRegard();
		},

		// clavier : on renvoie au lecteur la touche selon sa position physique
		surTouche: function (e) {
			if (!e.isTrusted)
				return;
			var cible = e.target;
			if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)))
				return;
			var code = TOUCHES[e.code];
			if (!code)
				return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.type === "keydown") {
				if (jeu.enfoncees[e.code])
					return;
				jeu.enfoncees[e.code] = code;
				envoyerTouche("keydown", code);
			} else if (jeu.enfoncees[e.code]) {
				delete jeu.enfoncees[e.code];
				envoyerTouche("keyup", code);
			}
		},

		// souris : pointeur verrouille, chaque mouvement devient un petit glisser
		verrouillerSouris: function () {
			var couche = this.couche = el("div", { id: "sv-jeu-couche" });
			document.body.appendChild(couche);
			document.addEventListener("pointerlockchange", this.surVerrou);
			couche.addEventListener("mousemove", function (e) { jeu.regarder(e.movementX, e.movementY); });
			couche.addEventListener("mousedown", function (e) {
				if (e.button !== 0)
					return;
				if (document.pointerLockElement !== couche) {
					couche.requestPointerLock();
					return;
				}
				jeu.allerAuViseur();
			});
			try {
				var p = couche.requestPointerLock();
				if (p && p.catch)
					p.catch(function () {});
			} catch (err) {
				// pas de verrouillage possible : un clic sur la couche le redemandera
			}
		},

		surVerrou: function () {
			// Echap libere la souris : on quitte le mode jeu
			if (jeu.couche && document.pointerLockElement !== jeu.couche && jeu.verrouille)
				jeu.arreter();
			jeu.verrouille = document.pointerLockElement === jeu.couche;
		},

		regarder: function (dx, dy) {
			if (!dx && !dy)
				return;
			// au verrouillage, certains navigateurs envoient un saut enorme : on l'ignore
			if (Math.abs(dx) > 150 || Math.abs(dy) > 150)
				return;
			var l = window.innerWidth, h = window.innerHeight;
			if (!this.tenu) {
				// on attend un vrai mouvement, sinon le lecteur prendrait ca pour un clic
				this.cumulX += dx;
				this.cumulY += dy;
				if (Math.abs(this.cumulX) + Math.abs(this.cumulY) < 6)
					return;
				dx = this.cumulX;
				dy = this.cumulY;
				this.cumulX = this.cumulY = 0;
				this.vx = l / 2;
				this.vy = h / 2;
				envoyerPointeur("pointerdown", this.vx, this.vy, 0, 1);
				this.tenu = true;
			}
			// le lecteur « attrape » la vue : tirer vers la gauche fait regarder a droite
			this.vx -= dx * SENSIBILITE;
			this.vy -= dy * SENSIBILITE;
			envoyerPointeur("pointermove", this.vx, this.vy, -1, 1);
			clearTimeout(this.minuterie);
			if (this.vx < l * 0.1 || this.vx > l * 0.9 || this.vy < h * 0.1 || this.vy > h * 0.9)
				this.finRegard();
			else
				this.minuterie = setTimeout(function () { jeu.finRegard(); }, 140);
		},

		finRegard: function () {
			clearTimeout(this.minuterie);
			this.cumulX = this.cumulY = 0;
			if (!this.tenu)
				return;
			this.tenu = false;
			envoyerPointeur("pointerup", this.vx, this.vy, 0, 0);
		},

		allerAuViseur: function () {
			this.finRegard();
			var x = window.innerWidth / 2, y = window.innerHeight / 2;
			envoyerPointeur("pointermove", x, y, -1, 0);
			envoyerPointeur("pointerdown", x, y, 0, 1);
			envoyerPointeur("pointerup", x, y, 0, 0);
		},

		// mobile : joystick virtuel, la vue se tourne en glissant sur l'ecran
		creerJoystick: function () {
			var j = this.joystick = el("div", { id: "sv-joystick" }, '<div class="sv-manette"></div>');
			document.body.appendChild(j);
			var manette = j.firstChild;
			var doigt = null, actuelle = null;

			function direction(dx, dy) {
				var r = 44;
				var d = Math.min(Math.hypot(dx, dy), r);
				var a = Math.atan2(dy, dx);
				manette.style.transform = "translate(" + Math.cos(a) * d + "px," + Math.sin(a) * d + "px)";
				if (d < 18)
					return null;
				if (Math.abs(dy) >= Math.abs(dx))
					return dy < 0 ? 87 : 83;
				return dx < 0 ? 65 : 68;
			}

			function changer(code) {
				if (code === actuelle)
					return;
				if (actuelle)
					envoyerTouche("keyup", actuelle);
				actuelle = code;
				if (code)
					envoyerTouche("keydown", code);
			}

			function centre() {
				var r = j.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			}

			j.addEventListener("pointerdown", function (e) {
				doigt = e.pointerId;
				j.setPointerCapture(doigt);
				var c = centre();
				changer(direction(e.clientX - c.x, e.clientY - c.y));
				e.preventDefault();
			});
			j.addEventListener("pointermove", function (e) {
				if (e.pointerId !== doigt)
					return;
				var c = centre();
				changer(direction(e.clientX - c.x, e.clientY - c.y));
			});
			function fin(e) {
				if (e.pointerId !== doigt)
					return;
				doigt = null;
				manette.style.transform = "";
				changer(null);
			}
			j.addEventListener("pointerup", fin);
			j.addEventListener("pointercancel", fin);
		}
	};

	jeu.surTouche = jeu.surTouche.bind(jeu);
	jeu.surVerrou = jeu.surVerrou.bind(jeu);
	jeu.relacherTout = jeu.relacherTout.bind(jeu);

	quandPret(function () {
		creerBarre();
		if (avecIntro)
			lancerIntro();
	});
})();
