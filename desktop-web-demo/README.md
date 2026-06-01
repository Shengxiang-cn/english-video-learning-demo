# Desktop Web Demo

This directory is reserved for desktop/web-only demo work.

Rule going forward:

- If the task is about a phone-sized app interface, do not work here.
- If the task is about the desktop reading workspace, work here.

The active mobile app prototype now lives in:

- `../mobile-app-design/prototype/mobile-learning-app/`

Stable local serving:

- `npm run serve:stable`: build the app and run `vite preview` in a detached `screen` session on `127.0.0.1:4174`
- `npm run stop:stable`: stop the background preview server
- `npm run status:stable`: check whether the stable preview server is running

Runtime files for the stable preview server are stored in:

- `.runtime/preview.log`
