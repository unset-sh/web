// The shape server.ts uses of adapter-node's build/handler.js (adapter-node 6.0.2 files/handler.js exports `handler`, a
// Polka-style middleware). package.json "imports" maps `#kit/handler` to the build for Node and to this file for the
// type checker, so the type checker never walks the build output.
import type { IncomingMessage, ServerResponse } from "node:http";

export declare const handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
