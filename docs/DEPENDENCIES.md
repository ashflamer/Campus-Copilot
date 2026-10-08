# Dependencies and runtime requirements

This inventory reflects the current checkout. It does not imply production readiness.

## Required

| Component | Requirement | Use |
|---|---|---|
| Python | Python 3.9+ per the project README | Navigator HTTP server, Navigator engine/NLU, static workspace server, assignment SQLite/Gemma helper modules. These code paths use the Python standard library; no pip package is required to run the files currently present. |
| Modern browser | JavaScript modules, `fetch`, `URLSearchParams`, `localStorage`, and CSS support | Workspace shell and Navigator browser UI. Browser support for speech recognition varies and is not a Python/package dependency. |
| Network access for map tiles | Internet access to the OpenStreetMap tile service used by the page | The local map UI uses external tiles; the bundled Leaflet library can load without a CDN. Tile access and OpenStreetMap service terms/usage limits still apply. |

`requirements.txt` lists no mandatory Python dependencies. It mentions `pytest>=7` only as an optional way to run tests; the Navigator test file also runs directly with Python. No `package.json`, npm build, or frontend package install is present in this checkout.

## Optional model services

The Gemma integrations are clients, not vendored model runtimes or weights:

- **Ollama**: separate installation and a locally available model (defaults in the code include `gemma4:e4b`). Navigator and assignment helper code send HTTP requests to the configured service. The model itself is not included in this repository.
- **Google AI Studio**: optional remote provider in the Gemma client code; it requires an externally configured API key and a reachable service. Never commit a key or place real credentials in demo configuration.
- **Rules-only mode**: `GEMMA_PROVIDER=none` disables model requests; Navigator uses its keyword parser. Assignment code that calls Gemma must still handle the disabled/error path; the assignment HTTP server is absent from this checkout.

Relevant environment variables are listed in `.env.example`. Defaults and supported values differ slightly between the Navigator NLU and assignments Gemma helper; check each module's docstring/source. Both clients use HTTP timeouts, and Navigator parsing falls back to keyword rules when a model request or parse fails.

## Bundled third-party code and data attribution

- `frontend/navigator-ui/vendor/leaflet/` contains Leaflet 1.9.4. Its license is BSD-2-Clause; see the upstream license and bundled notices where available.
- Map tiles are requested from OpenStreetMap. Preserve the visible **© OpenStreetMap** attribution. Geographic map data has its own ODbL attribution/terms; this is distinct from the Leaflet code license.
- Gemma model weights are downloaded separately and are not in this repository. Review the applicable model license and service terms for whichever model/provider is selected.

## Not dependencies / not available services

There is no committed assignments API server, workspace app module (`frontend/workspace-ui/js/app.js`), community/Campus Life prototype, reverse proxy, database service, authentication provider, or hosting configuration in the current checkout. The assignment storage helper uses SQLite from Python's standard library, but that is not by itself an API service. No production identity or campus data service is configured.
