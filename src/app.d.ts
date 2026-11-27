// The shape of an error a page can show, and what the request gate puts on every request (hooks.server.ts).
declare global {
  namespace App {
    interface Error {
      message: string;
      reqId?: string;
    }
    interface Locals {
      /** A public load explicitly confirms content eligibility; absent means noindex. */
      searchVisible?: boolean;
      /** The request id server.ts logs; a page shows it with an error. */
      reqId: string;
      /** The route's deadline: loads and actions pass it to every call they make. */
      deadline: AbortSignal;
      /** The signed-in member, on a route whose policy reads the session; absent for a visitor. */
      member?: import("./lib/server/sign-in/session.ts").Member;
    }
    interface PageData {
      seo?: import("./lib/seo.ts").PageSeo;
    }
  }
}

export {};
