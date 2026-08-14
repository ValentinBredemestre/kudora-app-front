# Kudora chain app working tree

The existing static design remains under `mirror-assets/`. `integration/chain.js`
contains the single wallet/chain adapter and `integration/ui.js` connects the
real transactions to the existing interface. Esbuild produces the ignored
browser bundle.

Use the root workspace commands to build and test this application. Do not
commit `kudora-local-*.json`: those files are generated only for the disposable
Docker localnet.
