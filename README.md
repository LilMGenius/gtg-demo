# GTG demo

The game runs from the static web/ tree.

## Wiki

Clone the MIT-licensed gamewiki tool beside this repository and install its locked dependencies with npm ci in that clone. In this repository run npm install; the devDependency is gamewiki: file:../gamewiki. npm blocks github: installs with EALLOWGIT in this environment. The tracked gamewiki dist/ supplies the CLI even when npm blocks prepare.

Wiki prose lives in web/wiki/src as GFM with gamewiki wikilinks, JSON schemas and named relations. Run npm run wiki:build with an empty web/wiki/dist output directory. For a rebuild, remove only the four previously generated JSON files there first. Commit all four outputs with their sources: the static server performs no build. The source and output directories must be siblings.

Each valueFrom field names an imported code constant. wiki.mjs resolves it without evaluating expressions; arrays and the derived top reward remain code-owned tables. JSON module imports provide the built fallback while a single pages.json fetch refreshes the panel.

Run node tools/wikisrc-gate.mjs against the static server to check fresh-build hashes, category sources, number-free prose, rendered bodies and controls.
