# oh-my-paper promo

The README video and the in-app tip clips, made from real recordings of the running app with
[Remotion](https://www.remotion.dev/). This folder is its own npm package so the app does not
depend on Remotion.

```bash
cd promo
npm install
```

## 1. Record real use

Start the app on a throwaway data folder (so your library stays out of the video), connect AI,
then let a headless browser use it. The recorder moves the pointer along eased paths, captures
2x frames through the Chrome DevTools screencast, logs every click and key, and writes
`public/rec-<name>.mp4` plus `public/timeline-<name>.json`.

```bash
OH_MY_PAPER_WEB_PORT=8805 OH_MY_PAPER_WEB_DATA_DIR=/tmp/omp-demo npm --prefix .. run start:web:raw

# import scene only (records the file picker and the paper arriving)
APP_URL=http://127.0.0.1:8805 DEMO_PDF=/path/paper.pdf OUT_NAME=import SCENES=import npm run record

# reading scenes (waits for page analysis, then translates, explains, notes…)
APP_URL=http://127.0.0.1:8805 OUT_NAME=main \
  SCENES=open,translate,explain,page-translation,note,overview npm run record
```

`public/timelines.json` lists which recordings the video uses, in order. Each scene has a
caption, optional key caps and a `focus` rectangle the camera eases toward; edit the JSON to
retime or reframe without recording again.

## 2. Render

```bash
npm run studio                 # preview and scrub
npm run render                 # out/oh-my-paper.mp4 (1920×1080)
npm run render:clips           # tip clips → ../src/web/public/tutorials/*.mp4
```

Add `--browser-executable=<chrome-headless-shell>` (or `REMOTION_BROWSER` for the clips) to
reuse an installed headless Chromium, for example Playwright's.

The demo paper is Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language
Models", [arXiv:2201.11903](https://arxiv.org/abs/2201.11903), CC BY 4.0; the outro credits it.
