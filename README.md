# Kudora app frontend

`Kudora-Chain-App-complete.zip` is the preserved visual input snapshot.
`app/` is its extracted working tree with the small real-chain integration,
local configuration support, and Dockerized Playwright business scenarios.

Start the complete product from the workspace root:

```sh
cd /home/ubuntu/kudora
make localnet
```

The generated local wallet/config files are ignored and are not included in the
production worker build. The application talks directly to Kudora Cosmos REST
and EVM JSON-RPC; it has no application backend.
