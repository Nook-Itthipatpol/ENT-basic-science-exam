# ENT R1 Mock Web

A static, Vercel-ready single-page mock examination for ENT R1 Basic Science Set 02 (61 questions, 90 minutes).

## Local preview

No install step is required. From this directory, run:

```bash
npx serve .
```

Open the local URL printed by the command. For code and data checks, run:

```bash
npm run check
npm test
```

## Deploy to Vercel

Either import this folder/repository in the Vercel dashboard (Framework Preset: **Other**) and deploy, or use the CLI:

```bash
npx vercel deploy
```

The app is static; `vercel.json` supplies clean URLs and response headers.
