(function configureApiBase() {
  // Set this only when frontend and API are in different domains.
  // Example: "https://api.seudominio.com/api"
  var PRODUCTION_API_BASE = "https://SUA_API_AQUI/api";

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function pickConfiguredBase() {
    var fromWindow = normalizeBase(window.BARBER_API_BASE);
    if (fromWindow) return fromWindow;

    var fromConstant = normalizeBase(PRODUCTION_API_BASE);
    if (/SUA_API_AQUI/i.test(fromConstant)) {
      fromConstant = "";
    }
    if (fromConstant) return fromConstant;

    var metaTag = document.querySelector("meta[name='barber-api-base']");
    var fromMeta = normalizeBase(metaTag ? metaTag.content : "");
    if (fromMeta) return fromMeta;

    try {
      var fromStorage = normalizeBase(localStorage.getItem("barber_api_base"));
      if (fromStorage) return fromStorage;
    } catch (_error) {
      // Ignore storage access errors.
    }

    return "";
  }

  var configuredBase = pickConfiguredBase();
  if (configuredBase) {
    window.BARBER_API_BASE = configuredBase;
    return;
  }

  var isLocalFile = window.location.protocol === "file:";
  var isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalFile || isLocalHost) {
    window.BARBER_API_BASE = "http://127.0.0.1:8080/api";
    return;
  }

  window.BARBER_API_BASE = window.location.origin.replace(/\/+$/, "") + "/api";
})();
