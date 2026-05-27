# Contributing and maintenance notes

This project is plain browser JavaScript, GLSL, and CSS. The main maintenance rule is simple: put behavior in the owning domain or lower-level module. Keep `src/app/create-app.js` boring, explicit, and readable.

Boring is the safety rail.

## Development commands

```sh
npm install
npm run start
npm run check
npm test
npm run test:all
```

`npm run test:all` runs the JavaScript syntax check, the Node unit test suite, and the E2E smoke test when a browser is available.

## Add a new UI control

1. Add the element to `index.html`.
2. Add its ID to `src/ui/dom.js` if it needs central lookup.
3. Add default state and sanitization in `src/state/config.js`.
4. Bind control behavior in `src/ui/controls.js` or a dedicated controller.
5. Route dirty flags in `src/app/config-controller.js`.
6. Use the config in the owning domain or lower-level runtime/palette/shader module.
7. Avoid adding behavior directly to `src/app/create-app.js`.
8. Add or update tests.

## Change app wiring

1. Find the owning domain in `src/app/domains/`.
2. Add behavior to that domain or to the lower-level controller it already wraps.
3. If another domain needs access, expose a named capability on the domain return object or through `src/app/ports.js`.
4. Keep `src/app/create-app.js` as a readable graph of constructors and port attachments. It should explain the machine, not become the machine again.
5. Add domain-level tests in `tests/app-domains.test.js` when the wiring surface changes.

## Add a new shader option

1. Add default config and sanitization in `src/state/config.js`.
2. Add UI in `index.html` and syncing in the UI modules.
3. Add define/uniform handling in `src/runtime/shader-programs.js`, `src/runtime/render-session.js`, or `src/gl/palette-renderer.js`.
4. Implement GLSL in `src/shaders/palette.frag` or `src/shaders/levels.frag`.
5. Mirror CPU behavior in diagnostics when needed.
6. Add tests for config, shader defines, render settings, and diagnostics.

## Add a new export format

1. Add an option in `index.html`.
2. Add serialization in `src/palette-export.js` for text formats, or `src/export/palette-files.js` for binary formats.
3. Verify dispatch through `src/export/export-actions.js`.
4. Add tests around the serializer or export action.

## Documentation conventions

- Keep `README.md` focused on the front door: what the app is, how to run it, what it can do, and where to go next.
- Put user-facing control detail in `docs/user-guide.md`.
- Put inspector swatch-editing mechanics in `docs/x-ray-editing.md`.
- Put module maps and runtime structure in `docs/architecture.md` or `src/README.md`.
- Put maintenance recipes here.

A README that explains everything explains nothing. It becomes fog. Keep the fog in docs where people can choose to walk into it.

## Troubleshooting

- **Blank page from `file://`:** serve the folder over HTTP. Shader loading uses `fetch()`.
- **Startup error about WebGL:** use a browser/device with WebGL2 enabled.
- **Exports do nothing:** check whether the browser blocked downloads or whether no image/palette is active yet.
- **Saved recipes disappeared:** recipes live in this browser's `localStorage`; clearing site data removes them.
- **E2E tests are skipped:** Playwright did not find an available browser in the current environment. Unit tests and syntax checks can still run.
