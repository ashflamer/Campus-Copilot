# frontend/navigator-ui (FE-2)

Leaflet map UI for the Campus Navigator, the pin editor (Alt+E) and `widget.js`, the one-line drop-in that lets any page open the navigator.
Served by `backend/navigator-api` at http://localhost:8765 (override with `NAV_STATIC_DIR`).

| File | What |
|---|---|
| `index.html` | map, search box, voice input, category chips, route cards, HELP, pin editor |
| `game.js`, `game.css` | Campus Explorer gamification layer (XP, levels, badges) |
| `widget.js` | `CampusNav.open()`, `CampusNav.nextClassCard()`, `CampusNav.linkRooms()`, floating 🗺️ button |
| `integration-demo.html` | example of embedding in another page |
| `vendor/leaflet/` | Leaflet 1.9 (BSD-2-Clause), bundled so it works without a CDN |

Deep links: `/?room=A-402&from=central_library`, `/?q=nearest%20canteen`, `/?next=1&from=main_gate`, `&embed=1`.

## Quality-of-life features

- **Arrive by**: every route shows the expected arrival time next to distance and walking minutes.
- **🔗 Share route**: copies a deep link (`?from=…&to=…`) so a friend opens the same route; uses the phone share sheet on mobile.
- **⇄ Reverse**: one tap shows the way back.
- **Recent searches**: last 5 questions are kept in the browser (emergency queries are never stored).
- **Shortcuts**: `/` focuses search, `Esc` clears the route, `Alt+E` opens the pin editor.
- **★ Favourite places**: "☆ Save place" on any place card; saved places appear as one-tap chips that route you there from your start point.
- **🌓 Light / dark mode**: toggle in the header, remembered per browser (defaults to your system setting).
- **🗺️ Map legend**: collapsible key for every pin icon, your route, step-free routes, walkways and paths with stairs.

## 🏅 Campus Explorer (gamification)

`game.js` + `game.css` turn exploring campus into a game, without touching the core map code:

- **XP**: discover a place +10, plan a route +15, step-free route +10, share a route +20, +1 per 100 m planned.
- **Levels**: Fresher → Wanderer → Pathfinder → Navigator → Campus Pro → Legend (100 XP each).
- **8 badges**: First Steps 🥾, Explorer 🧭, Scholar 📚, Foodie 🍴, Ally ♿, Campus Guide 🔗, 1 km Club 🏃, Campus Master 🏆. Click the level card to see them all.
- Visited places get a green ✓ on the map; level-ups and badges show a toast and confetti.
- **Safety first**: HELP / emergency routes never give XP. Progress is stored only in your browser and can be reset.
