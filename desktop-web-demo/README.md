# Desktop Web Demo

This directory is reserved for desktop/web-only demo work.

Rule going forward:

- If the task is about a phone-sized app interface, do not work here.
- If the task is about the desktop reading workspace, work here.

The active mobile app prototype now lives in:

- `../mobile-app-design/prototype/mobile-learning-app/`

Stable local serving:

- `npm run serve:stable`: build the app and run the full Node web/API server in the background on `127.0.0.1:4174`
- `npm run stop:stable`: stop the background preview server
- `npm run status:stable`: check whether the stable preview server is running

Runtime files for the stable preview server are stored in:

- `.runtime/preview.log`

Full YouTube + AI mode:

- Copy `.env.example` to `.env` locally or set the same variables in your deploy platform.
- `KIMI_API_KEY` must stay server-side. Do not put it in React code or GitHub Pages.
- `SUPADATA_API_KEY` is optional. When Render or another server IP is blocked by YouTube bot checks, the importer can fall back to Supadata for captions.
- `npm run serve:full` builds the frontend and runs `server.mjs`.
- `POST /api/youtube/import` imports a YouTube URL, reads metadata, and attempts to fetch English captions.
- `POST /api/ask` asks Kimi about the imported transcript or highlighted passage.
- `GET /api/library` restores videos, notes, conversations, and translation caches through the authenticated server boundary.
- `POST /api/videos/:videoId/progress` persists playback progress.
- `PATCH /api/videos/:videoId` updates status, favourite state, and tags.
- `PUT /api/videos/:videoId/translations/:language` persists bounded translation caches.
- `DELETE /api/videos/:videoId` and `DELETE /api/notes/:noteId` remove owned workspace data.
- `POST /api/notes` persists highlighted notes and AI explanations.

Deployment note:

- GitHub Pages can host the static UI, but it cannot securely run the Kimi API proxy or YouTube transcript parser.
- For the real online version, deploy this folder as a Node app on a server platform such as Render, Railway, Fly.io, or Vercel with a server runtime and set the `.env.example` variables there.
- A Render blueprint is included at `../render.yaml`; connect the GitHub repo and set `KIMI_API_KEY` in Render's environment variables. Add `SUPADATA_API_KEY` if you need reliable YouTube captions from cloud server IPs.
- Learning data is stored in Supabase behind RLS. The browser uses Supabase only for Auth; all learning-data reads and writes go through the same-origin Node API.
- Database migrations live in `../supabase/migrations/`. Apply them before deploying server code that depends on a new contract.
