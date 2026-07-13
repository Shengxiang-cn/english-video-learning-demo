# Vist / 观知

English Video Learning workspace for learning from long English videos.

The core flow is:

- Import or select a video
- Watch the video alongside synced transcript text
- Highlight transcript passages
- Ask AI about the selected passage
- Save structured notes
- Export notes as Markdown

## Web App

The runnable web app lives in `desktop-web-demo/`.

Local development:

```sh
cd desktop-web-demo
npm install
npm run dev
```

Production build:

```sh
cd desktop-web-demo
npm run build
```

## Deployment

The production app is a Node/Express service deployed on Render. Render uses
`desktop-web-demo/` as the service root, runs `npm ci && npm run build`, and
starts the server with `npm start`. The app is not a static GitHub Pages site:
AI questions, transcript retrieval, translations, Supabase persistence, and
guest migration require the server and configured service credentials.

Production service: `english-video-learning-demo`
