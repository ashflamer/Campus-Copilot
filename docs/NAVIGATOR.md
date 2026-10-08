# Navigator data guide

The Campus Navigator reads its campus data from `backend/navigator-api/data/*.json`. The checked-in files are demo inputs, not an authoritative campus directory. In particular, `locations.json` and `graph.json` explicitly mark coordinates/paths as approximate, and `rooms.json` describes placeholder room-prefix rules. The engine's calculations can be deterministic while the input facts remain unverified.

## Files and fields

### `locations.json`

Top-level keys:

- `_note`: data-quality guidance.
- `campus`: campus name, approximate map center, and initial zoom.
- `locations`: place records keyed by unique `id`.

Each place currently uses fields such as:

- `id`: stable machine identifier referenced by routes, graph nodes, room records, and timetable data.
- `name`, `type`, `category`: display and filtering values.
- `lat`, `lng`: latitude and longitude in decimal degrees. Current coordinates are not all verified.
- `node`: graph junction to which the building/place is connected.
- `aliases`: known phrases for deterministic name resolution. Add only aliases that actually refer to the place.
- `inside`: short descriptive strings shown to users; verify them independently before treating them as facts.
- `hours`: currently a simple `HH:MM-HH:MM`, `24h`, or null value. Null/invalid data results in “Hours not verified.” These values do not model weekdays, holidays, exceptions, or live changes.
- `hours_note`: optional source/context text used by the engine to label hours as officially listed; do not set this without a suitable source.
- `verified`: boolean display metadata. Only mark data verified after checking a reliable source or confirming it on campus.

### `graph.json`

- `nodes`: graph junction IDs with `lat`, `lng`, and optional `label`.
- `edges`: undirected connections with `from`, `to`, optional `name`, `stairs`, and `covered`.

Every edge endpoint must be an existing graph node or location ID. The engine connects each location to its configured `node` automatically. Edge length is computed from endpoint coordinates using haversine distance; it is not a measured walking distance. Dijkstra selects shortest paths over this graph. `accessible=true` excludes edges marked `stairs`; that label does not establish that the resulting route is independently accessibility-audited. Ramps, stairs, path closures, surface conditions, and route safety must be verified before making accessibility or safety claims.

### `rooms.json`

- `rooms`: explicit room-code to location mappings, with optional `floor` and `label`.
- `prefix_rules`: fallback room-prefix to location mappings. In the checked-in file these rules are explicitly placeholders. The engine may derive the floor from the first digit of a room number when a more specific mapping is absent; this is a guess and must not be presented as verified.

Explicit room mappings take precedence over prefix rules. Keep location IDs synchronized with `locations.json`.

### `timetable.json`

Contains demo `entries`, with `day` (`0=Monday` through `6=Sunday`), `start`, `end`, `course`, and `room`. It is not a verified or shared student timetable. The Navigator's standalone next-class endpoint reads these entries; a POST integration can supply another entries list for that request.

### `emergency.json`

Contains emergency contact labels, optional phone fields, and optional location IDs. The checked-in phone values are null. Never fill them with guessed numbers: only use an official, independently checked campus source. Emergency UI information is not a substitute for contacting local emergency services or staff.

## How the data is used

`navigator/engine.py` loads the JSON on startup. It resolves names using IDs, names, and aliases; uses graph routes for distances; reads simple hours for open status; maps room codes to buildings; and looks up the next class from the demo timetable. `navigator/nlu.py` may use Gemma to parse a request, but validates/resolves places against the loaded data and builds computed answers from the engine. If model use fails or is disabled, it falls back to keyword parsing. Model-generated prose must not be used to add campus facts.

The Navigator pin editor (`Alt+E` in the UI; the page instructions may also mention `E`) can save coordinates via `/api/editor/save` to the two JSON files. It is enabled by default unless `NAV_EDITOR=0`; it is unauthenticated. Use only in a trusted local environment, review its changes, and do not assume dragging pins verifies rooms, routes, ramps, stairs, or operating hours.

## Verification and safe updates

1. Obtain location, room, hours, path, and emergency details from reliable official sources or on-site checks. Record the provenance outside user-facing fields where appropriate; the current schema has limited source metadata.
2. Confirm coordinates use latitude/longitude order and correspond to the intended place. Check each graph edge on the ground and label stairs/covered segments honestly.
3. Validate every ID reference across locations, graph, rooms, and timetable. Run `python backend/navigator-api/tests/test_navigator.py` after data changes.
4. Keep unknown information unknown: leave missing hours null, unknown contact numbers null, and unverified status false. Do not publish sensitive access details.
5. Preserve the map's OpenStreetMap attribution shown in `frontend/navigator-ui/index.html`. The displayed basemap and CampusScope's own approximate graph/pins have separate data provenance.

Even after an update, a successful route calculation only means a route exists in the configured graph. It does not certify that the path is open, safe, step-free, or suitable for a particular person.
