
const _hostRegex = new RegExp( /(https?:\/\/[^/]+)/,"i");
window._replaceHost = function(str){
	if (! str)
		return str;
	if (window._ProxyAppendURL) {
		const encodedOrig = str;
		if (str.includes("?"))
			str +="&";
		else
			str +="?";
		str += "__OU=" + encodeURIComponent(encodedOrig);
	}

	if (window._NoTilde)
		str = str.replace("~","_")
	return window._mapStatic(str.replace(_hostRegex,window._ProxyBase));
}

/*
Hebergement statique (Vercel) : reproduit cote navigateur les choix que faisait
OurSimpleHTTPRequestHandler dans matterport-dl.py. La liste des fichiers presents
vient de _mp_manifest.js (genere par scripts/generer-manifeste.py).
*/
const _mpManifest = window._MpManifest || { graphOps: [], locales: [], crops: [] };
const _mpGraphOps = new Set(_mpManifest.graphOps);
const _mpLocales = new Set(_mpManifest.locales);
const _mpCrops = new Set(_mpManifest.crops);

window._mpLocalUrl = function(str){
	try {
		const u = new URL(str, window.location.href);
		return u.origin === window.location.origin ? u : null;
	} catch (e) {
		return null;
	}
}

window._mapStatic = function(str, graphOp){
	const u = window._mpLocalUrl(str);
	if (!u)
		return str;
	const p = u.pathname;

	// GraphQL : /api/mp/models/graph?operationName=X => graph_X.json, sinon {"data": "empty"}
	if (p === "/api/mp/models/graph") {
		const op = graphOp || u.searchParams.get("operationName");
		u.pathname = "/_mp_api/mp/models/" + (_mpGraphOps.has(op) ? `graph_${op}.json` : "graph");
		u.search = "";
		return u.href;
	}

	// le dossier api/ est reserve aux Functions sur Vercel, les donnees sont dans _mp_api/
	if (p.startsWith("/api/")) {
		u.pathname = "/_mp_api/" + p.substring(5);
		return u.href;
	}

	// locale non telechargee => locale par defaut
	const locale = p.match(/^\/locale\/messages\/strings_(.+)\.json$/);
	if (locale && !_mpLocales.has(locale[1])) {
		u.pathname = "/locale/strings.json";
		u.search = "";
		return u.href;
	}

	// textures maquette 3D / plan : x.jpg?width=W&crop=C => x.jpgwidth=W_crop=C.jpg si present
	if (p.endsWith(".jpg") && u.searchParams.has("crop")) {
		const width = u.searchParams.get("width");
		const cropPath = p + (width !== null ? `width=${width}_` : "") + `crop=${u.searchParams.get("crop")}.jpg`;
		if (_mpCrops.has(decodeURIComponent(cropPath))) {
			u.pathname = cropPath;
			u.search = "";
			return u.href;
		}
	}
	return str;
}

// le serveur Python traitait tout POST comme un GET (un hebergement statique renvoie 405)
window._isStaticPost = function(method, url){
	return !!method && !["GET", "HEAD"].includes(method.toUpperCase()) && !!window._mpLocalUrl(url);
}

window._graphOpFromBody = function(body){
	try {
		return typeof body === "string" ? JSON.parse(body).operationName : undefined;
	} catch (e) {
		return undefined;
	}
}

window.nv_XMLHttpRequest = new Proxy(XMLHttpRequest, {
	construct: function (target, args) {
		const originalRequest = new target();
		const prototypeDescriptors = Object.getOwnPropertyDescriptors(
			target.prototype
		)
		for (const propertyName in prototypeDescriptors) {
			Reflect.defineProperty(
				originalRequest,
				propertyName,
				prototypeDescriptors[propertyName]
			)
		}
		return new Proxy(originalRequest, {
			get: (target, name, trap) => {


				if (typeof target[name] === 'function') {
				  return (...args) => {
					switch (name) {
					  case 'open':
						if (args.length > 1) {
							args[1] = window._replaceHost(args[1]);
							if (window._isStaticPost(args[0], args[1]))
								args[0] = "GET";
						}
						break;

					  default:
						break;
					}

					return target[name].apply(target, args);
				  }
				}


				return target[name];
			  },
			set: function (target, prop, value) {
				Reflect.set(target, prop, value) // or target[prop] = value
				return true;
			},
		})
	}
})

var oReq = new XMLHttpRequest();

window.nv_fetch = new Proxy(window.fetch, {
	apply: function (target, that, args) {
		if (args.length > 0 && args[0]) {
			const init = args[1] || {};
			const isRequest = typeof args[0] !== 'string' && args[0].url;
			const origUrl = isRequest ? args[0].url : args[0].toString();
			const method = init.method || (isRequest ? args[0].method : "GET");
			if (window._isStaticPost(method, window._replaceHost(origUrl))) {
				const graphOp = window._graphOpFromBody(init.body);
				const newUrl = window._mapStatic(origUrl.replace(_hostRegex, window._ProxyBase), graphOp);
				args = [newUrl, { method: "GET", headers: init.headers || (isRequest ? args[0].headers : undefined), signal: init.signal || (isRequest ? args[0].signal : undefined) }];
			}
			else if (isRequest){
				const newUrl = window._replaceHost( args[0].url );
				if (newUrl != args[0].url)
					args[0] = new Request(newUrl, args[0]);
			}
			else
				args[0] = window._replaceHost(args[0].toString());
		}
		return target.apply(that, args);
	},
});

// statistiques d'usage envoyees a Matterport : inutiles hors ligne
if (navigator.sendBeacon) {
	const origSendBeacon = navigator.sendBeacon.bind(navigator);
	navigator.sendBeacon = function(url, data){
		const newUrl = window._replaceHost(url);
		return window._mpLocalUrl(newUrl) ? true : origSendBeacon(newUrl, data);
	};
}

window.XMLHttpRequest = window.nv_XMLHttpRequest;
window.fetch = window.nv_fetch;
window.oldAppendChild = Element.prototype.appendChild;
Element.prototype.appendChild = function() {
	if (arguments.length > 0) {
		if ( (arguments[0]?.tagName == "SCRIPT" || arguments[0]?.tagName == "IMG") && arguments[0].src)
			arguments[0].src = window._replaceHost(arguments[0].src);
		else if ( arguments[0]?.tagName == "DIV" && arguments[0].style?.backgroundImage?.startsWith("url"))
			arguments[0].style.backgroundImage = window._replaceHost(arguments[0].style?.backgroundImage);
	}
    return window.oldAppendChild.apply(this, arguments);
};

console.log("PROXY IN PLACE");

/*
For react you may run into an issue:
reactCont=reactCont.replace("(t.src=s.src)","(t.src=\"\"+(t.src??s.src))") # hacky but in certain conditions react will try to reset the source on something after it loads to re-trigger the load event but this breaks jsnetproxy.  This allows the same triggering but uses the existing source if it exists.  https://github.com/facebook/react/blob/37906d4dfbe80d71f312f7347bb9ddb930484d28/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L744

we could check it after load but thats a bit of a pita can't seem to override the src attribute to make it read only or anything.  we could copy it but if it needs the handle to it that would break it.
*/
