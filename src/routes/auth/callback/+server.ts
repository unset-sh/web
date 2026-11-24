// GET /auth/callback: where the account's server sends the browser back. lib/server/sign-in does the work.
import type { RequestHandler } from "@sveltejs/kit";
import { completeSignIn } from "#lib/server/sign-in/sign-in.ts";

export const GET: RequestHandler = ({ request, cookies, locals }) => completeSignIn(request, cookies, locals.deadline);
