# Contributing to oh-my-paper

Thanks for helping improve local-first research reading.

## Before you start

- Open an issue for behavior changes that affect PDF geometry, privacy, or provider boundaries.
- Never commit API keys, personal PDFs, document text, local databases, or generated model caches.
- Keep imported PDFs and test evidence outside the repository unless they are synthetic fixtures.

## Development

```bash
npm ci
npm run dev
```

The development launcher owns both processes and stops Vite when Electron exits. Use a fresh
temporary `OH_MY_PAPER_USER_DATA_DIR` for manual acceptance checks so local app state is not reused.

Before opening a pull request:

```bash
npm run verify
npm run build
```

Add the smallest test that fails without your change. For PDF behavior, prefer a compact synthetic
fixture and an observable Electron interaction over screenshots alone.

## Pull requests

- Explain the user-visible problem and the root change.
- List the commands you ran.
- Include screenshots only when appearance or geometry changed.
- Keep unrelated cleanup in a separate pull request.
