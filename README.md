# Scourgify

Scourgify is a local-first Electron PDF research workspace inspired by spatial research tools. Read a paper, select exact source passages, and keep translations, explanations, notes, highlights, figures, and citation assessments on one connected board.

## Features

- Hover actions for headings, figures, tables, equations, and citations
- Tight PDF-aware bounding boxes that remain stable while zooming
- Three right-sidebar modes: **AI**, **Board**, and **Citations**
- Keyword dictionary, 3-line summary, paper summary, and document-grounded discussion
- Translation, explanation, infographic, note, and highlight cards linked to their source
- Citation identity verification through Semantic Scholar and Crossref
- Conservative citation triage: Deep Read, Skim, Abstract Only, or Pass
- OpenAI API and OpenRouter support
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
npm run dev
```

Run validation and build an installer:

```bash
npm run verify
npm run make
```

## AI configuration

### Installed app (recommended)

Open **Settings → AI settings**, choose OpenAI or OpenRouter, enter the model ID and API key, then save. The key is encrypted with Electron `safeStorage` and is never exposed to the PDF renderer.

### Development `.env`

```bash
cp .env.example .env
```

OpenAI:

```dotenv
SCOURGIFY_AI_PROVIDER=openai
SCOURGIFY_AI_MODEL=gpt-5
OPENAI_API_KEY=your_key_here
```

OpenRouter:

```dotenv
SCOURGIFY_AI_PROVIDER=openrouter
SCOURGIFY_AI_MODEL=z-ai/glm-5.3-flash
OPENROUTER_API_KEY=your_key_here
```

The OpenRouter model selector includes `z-ai/glm-5.3-flash`,
`deepseek/deepseek-v4-flash-0731`, and `nvidia/nemotron-3-ultra-550b-a55b:free`.

Create an OpenAI API key in the [OpenAI API dashboard](https://platform.openai.com/api-keys). API usage is billed separately from ChatGPT subscriptions. Never commit `.env` or an API key.

## Citation triage

Scourgify first verifies a cited paper using DOI/title/author/year evidence. Its AI then scores dependency, methodological relevance, conceptual relevance, evidentiary importance, and context sufficiency. The app—not the model—assigns the final reading tier with conservative quotas so most references remain **Pass**.

## Privacy

- PDF import and layout preparation are local.
- Network requests happen only after explicit citation or AI actions.
- API keys, document text, and personal workspace data are excluded from the repository.

## License

[MIT](LICENSE)
