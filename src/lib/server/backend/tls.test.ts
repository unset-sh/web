// accounts.ts `mutualTlsFetch`: web reaches backend over mutual TLS with its client certificate, and refuses a backend
// whose certificate its CA did not sign. The server is a stand-in requiring client certificates as backend's does
// (backend src/server/serve.ts `serverTls`). The certificates are throwaway ones made with OpenSSL in a temp folder
// and deleted after; real ones come from unset-sh/deployment's scripts/internal-tls.sh, run by Alex.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createBackendAccounts } from "./accounts.ts";

const dir = mkdtempSync(join(tmpdir(), "web-tls-"));
const pem = (name: string) => readFileSync(join(dir, name), "utf8");
const DID = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";

function openssl(...args: string[]) {
  const run = spawnSync("openssl", args, { cwd: dir, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`openssl ${args[0]}: ${run.stderr}`);
}

function ca(name: string) {
  openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", `${name}.key`);
  openssl(
    "req",
    "-x509",
    "-new",
    "-key",
    `${name}.key`,
    "-out",
    `${name}.crt`,
    "-days",
    "1",
    "-subj",
    `/CN=${name}`,
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign",
  );
}

function leaf(name: string, signer: string, extensions: string) {
  openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", `${name}.key`);
  openssl("req", "-new", "-key", `${name}.key`, "-subj", `/CN=${name}`, "-out", `${name}.csr`);
  writeFileSync(join(dir, `${name}.ext`), extensions);
  openssl(
    "x509",
    "-req",
    "-in",
    `${name}.csr`,
    "-CA",
    `${signer}.crt`,
    "-CAkey",
    `${signer}.key`,
    "-CAcreateserial",
    "-days",
    "1",
    "-extfile",
    `${name}.ext`,
    "-out",
    `${name}.crt`,
  );
}

let backend: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  for (const name of ["server-ca", "client-ca", "other-ca"]) ca(name);
  leaf("backend", "server-ca", "extendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n");
  leaf("web", "client-ca", "extendedKeyUsage=clientAuth\n");
  backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: { cert: pem("backend.crt"), key: pem("backend.key"), ca: pem("client-ca.crt"), requestCert: true },
    fetch: () => Response.json({ did: DID }),
  });
});

afterAll(async () => {
  await backend.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const accounts = (tls?: { cert: string; key: string; ca: string }) =>
  createBackendAccounts({ url: `https://localhost:${backend.port}`, ...(tls ? { tls } : {}) });
const deadline = () => AbortSignal.timeout(5000);

describe("mutual TLS with backend", () => {
  test("web's_certificate_reaches_backend", async () => {
    const web = accounts({ cert: pem("web.crt"), key: pem("web.key"), ca: pem("server-ca.crt") });
    expect(await web.memberOf("t".repeat(32), deadline())).toEqual({ did: DID });
  });

  test("without_web's_certificate_backend_is_unavailable", async () => {
    await expect(accounts().memberOf("t".repeat(32), deadline())).rejects.toThrow("service.unavailable");
  });

  test("a_backend_certificate_another_ca_signed_is_refused", async () => {
    const wrongCa = accounts({ cert: pem("web.crt"), key: pem("web.key"), ca: pem("other-ca.crt") });
    await expect(wrongCa.memberOf("t".repeat(32), deadline())).rejects.toThrow("service.unavailable");
  });
});
