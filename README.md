# Scourgify

Scourgify is a local-first Electron PDF research workspace inspired by spatial research tools. Read a paper, select exact source passages, and keep translations, explanations, notes, highlights, figures, and citation assessments on one connected board.

## Features

- Hover actions for headings, figures, tables, equations, and citations
- Tight PDF-aware bounding boxes that remain stable while zooming
- Purpose-specific right-sidebar modes for AI overview, translation, explanation, visual cards, notes, highlights, and citations
- Keyword dictionary, 3-line summary, paper summary, and document-grounded discussion
- Translation, explanation, infographic, note, and highlight cards linked to their source
- Citation identity verification through Semantic Scholar and Crossref
- Conservative citation triage: Deep Read, Skim, Abstract Only, or Pass
- OpenAI API, OpenRouter, and an already-authenticated local OpenCodex proxy
- Light, dark, and system appearance with a persistent, optional board minimap
- Local PDF preparation; no AI request occurs until you click an AI action

## Install

Download the installer for macOS, Windows, or Linux from [GitHub Releases](https://github.com/heonyus/scourgify/releases/latest).

Scourgify is an early preview. macOS builds are not notarized yet, so macOS may require **Control-click → Open** on first launch.

## Development

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/heonyus/scourgify.git
cd scourgify
npm ci
npm run setup:layout
npm run dev
```

`setup:layout` uses `uv` and Python 3.12 to install the optional local PP-DocLayout runtime and download its model once. Scourgify then analyzes each PDF locally one time, caches page boxes, and uses them for Figure/Table/heading overlays. Without this runtime, the built-in PDF.js detector remains available as a fallback.

Run validation and build an installer:

```bash
npm run verify
npm run make
```

## AI configuration

### Installed app (recommended)

Open **Settings → AI settings** and choose OpenAI, OpenRouter, or Local OpenCodex. Hosted-provider keys are encrypted with Electron `safeStorage` and are never exposed to the PDF renderer. Local OpenCodex connects only to the existing loopback proxy at `127.0.0.1:10100` and stores no key.

### Development `.env`

```bash
cp .env.example .env
```

OpenRouter (default):

```dotenv
SCOURGIFY_AI_PROVIDER=openrouter
SCOURGIFY_AI_MODEL=z-ai/glm-5.3-flash
OPENROUTER_API_KEY=your_key_here
```

The model selector also includes `deepseek/deepseek-v4-flash-0731` and
`nvidia/nemotron-3-ultra-550b-a55b:free`.

OpenAI alternative:

```dotenv
SCOURGIFY_AI_PROVIDER=openai
SCOURGIFY_AI_MODEL=gpt-5
OPENAI_API_KEY=your_key_here
```

Create an OpenAI API key in the [OpenAI API dashboard](https://platform.openai.com/api-keys). API usage is billed separately from ChatGPT subscriptions. Never commit `.env` or an API key.

## Citation triage

Scourgify first verifies a cited paper using DOI/title/author/year evidence. Its AI then scores dependency, methodological relevance, conceptual relevance, evidentiary importance, and context sufficiency. The app—not the model—assigns the final reading tier with conservative quotas so most references remain **Pass**.

## Privacy

- PDF import and layout preparation are local. The optional layout model is downloaded only by the explicit `npm run setup:layout` command.
- Network requests happen only after explicit citation or AI actions.
- API keys, document text, and personal workspace data are excluded from the repository.

## License

[MIT](LICENSE)
