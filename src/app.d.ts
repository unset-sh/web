// The shape of an error a page can show, and what the request gate puts on every request (hooks.server.ts).
declare global {
  namespace App {
    interface Error {
      message: string;
      reqId?: string;
    }
    interface Locals {
      /** The request id server.ts logs; a page shows it with an error. */
      reqId: string;
      /** The route's deadline: loads and actions pass it to every call they make. */
      deadline: AbortSignal;
    }
  }
}

export {};
