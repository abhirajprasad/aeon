#!/usr/bin/env node
// serendipity-ed25519.mjs — ed25519 keygen + signing that is wire-compatible
// with Serendipity's `serendipity-crypto::sig` (ed25519_dalek).
//
// Wire formats (must match the server exactly):
//   secret  : 64 hex chars — the 32-byte ed25519 seed (SigningKey::from_bytes).
//   pubkey  : "ed25519:" + base64(standard) of the 32-byte public key.
//   sig     : "ed25519:" + base64(standard) of the 64-byte detached signature.
//
// Uses only the Node stdlib `crypto` module — no npm dependencies, so it drops
// into an AEON fork without touching its package.json.
//
//   node serendipity-ed25519.mjs keygen            -> prints secret + pubkey (JSON)
//   node serendipity-ed25519.mjs pubkey <hexseed>  -> prints the ed25519: pubkey
//   node serendipity-ed25519.mjs sign  <hexseed> <message> -> prints ed25519: signature
//
// Authored and signed by Jakub Dimitri Rezayev <jakub@vertsolutions.ai>

import crypto from "node:crypto";

// RFC 8410 DER framing for raw Ed25519 keys.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex"); // + 32-byte seed
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex"); //   + 32-byte pubkey

function privFromSeedHex(hexSeed) {
  const seed = Buffer.from(hexSeed.trim(), "hex");
  if (seed.length !== 32) {
    throw new Error(`secret must be 32 bytes (64 hex chars), got ${seed.length} bytes`);
  }
  const der = Buffer.concat([PKCS8_PREFIX, seed]);
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function rawPub(privKey) {
  const spki = crypto.createPublicKey(privKey).export({ type: "spki", format: "der" });
  return spki.subarray(spki.length - 32); // last 32 bytes are the raw public key
}

function pubkeyString(privKey) {
  return "ed25519:" + rawPub(privKey).toString("base64");
}

function cmdKeygen() {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  const seed = pkcs8.subarray(pkcs8.length - 32); // last 32 bytes are the seed
  return JSON.stringify({
    secret: seed.toString("hex"),
    pubkey: pubkeyString(privateKey),
  });
}

function cmdPubkey(hexSeed) {
  return pubkeyString(privFromSeedHex(hexSeed));
}

function cmdSign(hexSeed, message) {
  const priv = privFromSeedHex(hexSeed);
  // For Ed25519, `crypto.sign` ignores the digest arg and signs the raw message.
  const sig = crypto.sign(null, Buffer.from(message, "utf8"), priv);
  return "ed25519:" + sig.toString("base64");
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "keygen":
        process.stdout.write(cmdKeygen() + "\n");
        break;
      case "pubkey":
        if (!rest[0]) throw new Error("usage: pubkey <hexseed>");
        process.stdout.write(cmdPubkey(rest[0]) + "\n");
        break;
      case "sign":
        if (rest.length < 2) throw new Error("usage: sign <hexseed> <message>");
        process.stdout.write(cmdSign(rest[0], rest[1]) + "\n");
        break;
      default:
        process.stderr.write(
          "usage: serendipity-ed25519.mjs <keygen|pubkey <hexseed>|sign <hexseed> <message>>\n"
        );
        process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }
}

main();
