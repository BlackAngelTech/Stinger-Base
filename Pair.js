// ============================================================
// 🐝 STINGER V6 — WHATSAPP WEBPAIR ENGINE
// Pair.js
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const pino = require("pino");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");

// ============================================================
// PATHS
// ============================================================

const ROOT = __dirname;

const SESSIONS_DIR = path.join(ROOT, "sessions");
const DATABASE_DIR = path.join(ROOT, "database");

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(DATABASE_DIR, { recursive: true });

// ============================================================
// LOGGER
// ============================================================

const logger = pino({
    level: process.env.LOG_LEVEL || "info"
});

// ============================================================
// ACTIVE PAIRING REQUESTS
// ============================================================

const pairingRequests = new Map();

// ============================================================
// HELPERS
// ============================================================

function normalizeNumber(value) {
    return String(value || "")
        .replace(/\D/g, "");
}

function validNumber(number) {
    return (
        number.length >= 7 &&
        number.length <= 15
    );
}

function sessionPath(number) {
    return path.join(
        SESSIONS_DIR,
        `pair_${number}`
    );
}

function now() {
    return Date.now();
}

function cleanError(error) {
    if (!error) {
        return "Unknown error";
    }

    if (typeof error === "string") {
        return error;
    }

    return (
        error?.message ||
        error?.output?.payload?.message ||
        error?.data?.message ||
        error?.error ||
        String(error)
    );
}

// ============================================================
// FORMAT PAIRING CODE
// ============================================================

function formatCode(code) {
    if (!code) {
        return null;
    }

    const clean = String(code)
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();

    return clean.match(/.{1,4}/g)?.join("-") || clean;
}

// ============================================================
// GET STATUS
// ============================================================

function getPairingStatus(rawNumber) {
    const number = normalizeNumber(rawNumber);

    if (!number) {
        return {
            success: false,
            status: "invalid"
        };
    }

    const request = pairingRequests.get(number);

    if (!request) {
        return {
            success: true,
            number,
            status: "idle",
            code: null,
            error: null
        };
    }

    return {
        success: true,
        number,
        status: request.status,
        code: request.code
            ? formatCode(request.code)
            : null,
        rawCode: request.code || null,
        error: request.error || null,
        connected: request.connected || false,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt
    };
}

// ============================================================
// CLOSE PAIRING SOCKET
// ============================================================

async function closePairing(number, reason = "closed") {
    const request = pairingRequests.get(number);

    if (!request) {
        return;
    }

    clearTimeout(request.timer);

    try {
        if (request.socket) {
            request.socket.ev.removeAllListeners();

            try {
                request.socket.ws?.close();
            } catch (_) {}

            try {
                request.socket.end?.(
                    new Error(reason)
                );
            } catch (_) {}
        }
    } catch (_) {}

    pairingRequests.delete(number);
}

// ============================================================
// GENERATE PAIRING CODE
// ============================================================

async function generatePairingCode(rawNumber) {

    const number = normalizeNumber(rawNumber);

    // --------------------------------------------------------
    // VALIDATE
    // --------------------------------------------------------

    if (!validNumber(number)) {
        return {
            success: false,
            status: "failed",
            error:
                "Invalid phone number. Use country code and digits only."
        };
    }

    // --------------------------------------------------------
    // EXISTING REQUEST
    // --------------------------------------------------------

    const existing = pairingRequests.get(number);

    if (existing) {

        if (
            existing.code &&
            !existing.connected &&
            existing.status !== "failed" &&
            existing.status !== "expired"
        ) {
            return {
                success: true,
                number,
                status: existing.status,
                code: formatCode(existing.code)
            };
        }

        if (
            existing.status === "failed" ||
            existing.status === "expired"
        ) {
            await closePairing(
                number,
                "starting new pairing"
            );
        }
    }

    // --------------------------------------------------------
    // SESSION
    // --------------------------------------------------------

    const authPath = sessionPath(number);

    fs.mkdirSync(
        authPath,
        {
            recursive: true
        }
    );

    let state;
    let saveCreds;

    try {

        const auth = await useMultiFileAuthState(
            authPath
        );

        state = auth.state;
        saveCreds = auth.saveCreds;

    } catch (error) {

        return {
            success: false,
            status: "failed",
            error:
                `Auth initialization failed: ${cleanError(error)}`
        };
    }

    // --------------------------------------------------------
    // ALREADY REGISTERED
    // --------------------------------------------------------

    if (state.creds.registered) {

        return {
            success: false,
            status: "already_registered",
            number,
            error:
                "This number already has a registered STINGER session."
        };
    }

    // --------------------------------------------------------
    // REQUEST STATE
    // --------------------------------------------------------

    const request = {
        number,
        socket: null,
        code: null,
        status: "connecting",
        connected: false,
        error: null,
        createdAt: now(),
        expiresAt: now() + (
            Number(process.env.PAIR_TIMEOUT) || 120000
        ),
        timer: null,
        codeRequested: false
    };

    pairingRequests.set(
        number,
        request
    );

    // --------------------------------------------------------
    // CREATE SOCKET
    // --------------------------------------------------------

    try {

        const sock = makeWASocket({

            auth: state,

            logger,

            printQRInTerminal: false,

            // IMPORTANT:
            // Canonical browser profile for pairing-code flow.
            browser: Browsers.macOS("Chrome"),

            syncFullHistory: false,

            markOnlineOnConnect: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 20000,

            retryRequestDelayMs: 250,

            generateHighQualityLinkPreview: false

        });

        request.socket = sock;

        // ----------------------------------------------------
        // SAVE CREDENTIALS
        // ----------------------------------------------------

        sock.ev.on(
            "creds.update",
            saveCreds
        );

        // ----------------------------------------------------
        // CONNECTION EVENTS
        // ----------------------------------------------------

        sock.ev.on(
            "connection.update",
            async (update) => {

                const {
                    connection,
                    lastDisconnect
                } = update;

                // --------------------------------------------
                // OPEN
                // --------------------------------------------

                if (connection === "open") {

                    request.connected = true;
                    request.status = "connected";
                    request.error = null;

                    clearTimeout(
                        request.timer
                    );

                    console.log(
                        `\n✅ STINGER PAIRING SUCCESS: ${number}\n`
                    );

                    return;
                }

                // --------------------------------------------
                // CLOSE
                // --------------------------------------------

                if (connection === "close") {

                    const statusCode =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;

                    const errorText =
                        cleanError(
                            lastDisconnect?.error
                        );

                    console.log(
                        `\n❌ Pairing connection closed for ${number}`
                    );

                    console.log(
                        `Status: ${statusCode || "unknown"}`
                    );

                    console.log(
                        `Error: ${errorText}\n`
                    );

                    if (
                        !request.connected &&
                        request.status !== "connected"
                    ) {

                        request.status = "failed";

                        request.error =
                            statusCode
                                ? `WhatsApp connection closed (${statusCode}): ${errorText}`
                                : errorText ||
                                  "WhatsApp closed the pairing connection.";
                    }
                }
            }
        );

        // ====================================================
        // REQUEST CODE
        // ====================================================

        request.status = "requesting_code";

        /*
         * Do NOT wait for a QR event.
         *
         * The pairing-code API can be requested directly
         * after creating the socket.
         */

        let pairingError = null;

        for (
            let attempt = 1;
            attempt <= 2;
            attempt++
        ) {

            try {

                console.log(
                    `🐝 Requesting pairing code for ${number} (attempt ${attempt})`
                );

                const code =
                    await sock.requestPairingCode(
                        number
                    );

                if (!code) {
                    throw new Error(
                        "WhatsApp returned an empty pairing code."
                    );
                }

                request.code = code;
                request.status = "waiting";
                request.error = null;
                request.codeRequested = true;

                console.log(
                    `\n🔐 STINGER V6 PAIRING CODE`
                );

                console.log(
                    `📱 Number: ${number}`
                );

                console.log(
                    `🔑 Code: ${formatCode(code)}`
                );

                console.log(
                    `\nOpen WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number\n`
                );

                break;

            } catch (error) {

                pairingError = error;

                console.error(
                    `❌ Pairing code attempt ${attempt} failed:`,
                    cleanError(error)
                );

                if (attempt < 2) {

                    request.status =
                        "retrying";

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                2500
                            )
                    );
                }
            }
        }

        // ----------------------------------------------------
        // FAILED TO GENERATE CODE
        // ----------------------------------------------------

        if (!request.code) {

            request.status = "failed";

            request.error =
                `Pairing code request failed: ${cleanError(pairingError)}`;

            clearTimeout(
                request.timer
            );

            return {
                success: false,
                status: "failed",
                number,
                error: request.error
            };
        }

        // ----------------------------------------------------
        // EXPIRATION
        // ----------------------------------------------------

        request.timer = setTimeout(
            async () => {

                const current =
                    pairingRequests.get(number);

                if (!current) {
                    return;
                }

                if (
                    current.status !== "connected"
                ) {

                    current.status =
                        "expired";

                    current.error =
                        "Pairing code expired.";

                    console.log(
                        `⌛ Pairing expired: ${number}`
                    );

                    try {
                        current.socket?.end?.(
                            new Error(
                                "Pairing timeout"
                            )
                        );
                    } catch (_) {}
                }

            },
            Number(process.env.PAIR_TIMEOUT) || 120000
        );

        return {
            success: true,
            number,
            status: request.status,
            code: formatCode(request.code),
            expiresAt: request.expiresAt
        };

    } catch (error) {

        request.status = "failed";

        request.error =
            `Socket initialization failed: ${cleanError(error)}`;

        console.error(
            `❌ STINGER socket error for ${number}:`,
            error
        );

        return {
            success: false,
            status: "failed",
            number,
            error: request.error
        };
    }
}

// ============================================================
// EXPRESS ROUTER
// ============================================================

function createPairRouter() {

    const router = express.Router();

    // --------------------------------------------------------
    // POST /pair
    // POST /api/pair
    // --------------------------------------------------------

    router.post(
        "/pair",
        async (req, res) => {

            try {

                const number =
                    req.body?.number ||
                    req.body?.phone ||
                    req.body?.phoneNumber;

                const result =
                    await generatePairingCode(
                        number
                    );

                res.status(
                    result.success ? 200 : 400
                ).json(result);

            } catch (error) {

                console.error(
                    "Pair API error:",
                    error
                );

                res.status(500).json({
                    success: false,
                    status: "failed",
                    error:
                        cleanError(error)
                });
            }
        }
    );

    // --------------------------------------------------------
    // GET /pair/status?number=
    // GET /api/pair/status?number=
    // --------------------------------------------------------

    router.get(
        "/pair/status",
        (req, res) => {

            const number =
                req.query.number ||
                req.query.phone ||
                req.query.phoneNumber;

            res.json(
                getPairingStatus(number)
            );
        }
    );

    // --------------------------------------------------------
    // POST /pair/reset
    // --------------------------------------------------------

    router.post(
        "/pair/reset",
        async (req, res) => {

            const number =
                normalizeNumber(
                    req.body?.number ||
                    req.body?.phone
                );

            if (!validNumber(number)) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid phone number."
                });
            }

            await closePairing(
                number,
                "manual reset"
            );

            res.json({
                success: true,
                status: "reset",
                number
            });
        }
    );

    return router;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    generatePairingCode,
    getPairingStatus,
    closePairing,
    createPairRouter,
    normalizeNumber
};
