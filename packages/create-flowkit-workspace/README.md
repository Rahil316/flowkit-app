# create-flowkit-workspace

Scaffold a new [FlowKit](https://github.com/rahil-avj/flowkit-app) multi-workspace author project — multiple sibling prototyping workspaces in one project, switchable at dev time (React 19 + Vite + Tailwind).

> **Status:** this package is not yet published under its real name. To try it today, use the scoped canary rehearsal build instead — see [Trying it today](#trying-it-today) below.

## Usage

```bash
npm create flowkit-workspace@latest <project-name> [-- --empty]
```

Example:

```bash
npm create flowkit-workspace@latest my-project -- --empty
```

This scaffolds a project with one initial workspace and a root `vite.config.ts` pre-wired for multi-workspace mode. Each workspace gets its own:

- `flowBook/` — pages, organized by chapter
- `flowStories/` — playback scripts
- `workspace.ts` — workspace config (`defineConfig`)
- `lib/` — shared workspace data/components

By default the initial workspace ships with a playable demo (a splash/welcome intro into
a hub of 6 mini-games) so you have real content to explore immediately. Pass `--empty` for
a bare scaffold instead — zero chapters, empty db/simulator stubs, ready for your own content.

Once scaffolded:

```bash
cd my-project
npm install
npm run dev
```

Add, remove, or rename workspaces afterward with the `flowkit` CLI:

```bash
npx flowkit create:workspace --name:<id> [--empty]
npx flowkit remove:workspace --name:<id>
npx flowkit rename:workspace <old> <new>
```

## Trying it today

The real `create-flowkit-workspace` / `flowkit` package names are reserved but not yet published. A scoped canary build is live on the npm registry for end-to-end testing:

```bash
npx @rahil316/create-flowkit-workspace@latest my-project
```

Check `npm view @rahil316/create-flowkit-workspace dist-tags` for the current canary version — it advances on every rehearsal publish and is not a stable release channel.

## Learn more

Full platform docs, CLI reference, and architecture: see the [FlowKit repository](https://github.com/rahil-avj/flowkit-app).

## License

MIT
