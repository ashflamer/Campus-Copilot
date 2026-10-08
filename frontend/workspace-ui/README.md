# frontend/workspace-ui (FE-1)

The student's workspace: **Board** (assignments), **My Day** (next class + Gemma's plan for today) and **Timetable** (weekly class editor). Plain HTML, CSS and ES modules. No build step, no npm.

```bash
cd frontend/workspace-ui
python serve.py            # http://localhost:5173  (open this)
UI_PORT=8080 python serve.py
```

Open the page in a browser. On a phone, use the same Wi-Fi and open `http://<laptop-ip>:5173`. The timetable table scrolls sideways on narrow screens.

## Files

| File | What |
|---|---|
| `index.html` | Page shell: header tabs, quick-add bar, the three tab panels |
| `css/app.css` | Theme (light / dark / system), layout, cards, timetable, phone breakpoints |
| `js/config.js` | Backend URLs. Defaults to the same host on ports 8766 (assignments) and 8765 (navigator) |
| `js/api.js` | Fetch wrappers: `api.*` for the assignments backend, `nav.*` for the navigator |
| `js/util.js` | Shared helpers (`$`, `esc`, `toast`, `dueInfo`, `navigateRoom`) and app state |
| `js/app.js` | Boot, tabs, theme toggle, AI status chip |
| `js/myday.js` | My Day: next-class card, leave-now warning, overdue / due-today list, progress, Gemma plan |
| `js/timetable.js` | Timetable editor: add / remove rows, validation, save |
| `serve.py` | Static file server (standard library only) |

## Backends

Override the backend addresses without editing code:

```
http://localhost:5173/?api=http://192.168.1.20:8766&nav=http://192.168.1.20:8765
```

The UI calls these endpoints:

| Backend | Endpoint | Used by |
|---|---|---|
| assignments-api `:8766` | `GET /api/ai/status` | AI chip |
| | `GET /api/assignments` | My Day due list and progress |
| | `POST /api/ai/plan` | Plan my day |
| | `GET /api/timetable`, `PUT /api/timetable` `{entries}` | Timetable editor, next class |
| navigator-api `:8765` | `GET /api/campus` | Origin picker (From ▾) |
| | `POST /api/next-class` `{entries, from}` | Next class card and walking time |

If the navigator is offline, My Day still renders with **Main Gate** as the only origin and no walking time. If the assignments API is offline, each card shows its own error message and the rest of the page keeps working.

## Design rule

Gemma understands, our code calculates, verified data answers. The UI shows what the backends return and never invents a room, a time or a route.

## Notes

- Origin is saved in `localStorage` (`cs:origin`). The theme is saved as `cs:theme`. The last tab is saved as `cs:tab`.
- The timetable uses the day numbers `0 = Mon … 6 = Sun`, the same as the navigator's `timetable.json`.
- Room codes are upper-cased on save (`a-402` → `A-402`) so they match the campus database.
