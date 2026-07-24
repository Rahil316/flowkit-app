# create-flowkit-app

Scaffold a new [FlowKit](https://github.com/rahil-avj/flowkit-app) author project — a single-workspace, browser-based UI prototyping app (React 19 + Vite + Tailwind).

> **Status:** this package is not yet published under its real name. To try it today, use the scoped canary rehearsal build instead — see [Trying it today](#trying-it-today) below.

## Usage

```bash
npm create flowkit-app@latest <project-name> [-- --empty]
```

Example:

```bash
npm create flowkit-app@latest my-prototype -- --empty
```

This scaffolds a new project with:

- `flows/` — your screens, organized by flow
- `flowplans/` — playback scripts describing step-by-step flows
- `workspace.ts` — workspace config (`defineConfig`)
- `lib/` — shared workspace data/components
- `vite.config.ts` pre-wired with the `flowkit/vite` plugin

Once scaffolded:

```bash
cd my-prototype
npm install
npm run dev
```

## Trying it today

The real `create-flowkit-app` / `flowkit` package names are reserved but not yet published. A scoped canary build is live on the npm registry for end-to-end testing:

```bash
npx @rahil316/create-flowkit-app@latest my-prototype
```

Check `npm view @rahil316/create-flowkit-app dist-tags` for the current canary version — it advances on every rehearsal publish and is not a stable release channel.

## Learn more

Full platform docs, CLI reference, and architecture: see the [FlowKit repository](https://github.com/rahil-avj/flowkit-app).

## License

MIT
