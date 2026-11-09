import {
    ClientSecretBasic,
    None,
    authorizationCodeGrant,
    buildAuthorizationUrl,
    calculatePKCECodeChallenge,
    discovery,
    randomPKCECodeVerifier
} from "openid-client";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";

type OidcConfig = Awaited<ReturnType<typeof discovery>>;

let configPromise: Promise<OidcConfig> | undefined;

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} não configurado`);
    }
    return value;
}

function redirectUri(): string {
    return process.env.OIDC_REDIRECT_URI?.trim() || "http://localhost:3000/auth/callback";
}

async function getConfig(): Promise<OidcConfig> {
    if (!configPromise) {
        const issuer = new URL(required("OIDC_ISSUER"));
        const clientId = required("OIDC_CLIENT_ID");
        const secret = process.env.OIDC_CLIENT_SECRET?.trim();
        configPromise = discovery(
            issuer,
            clientId,
            undefined,
            secret ? ClientSecretBasic(secret) : None()
        );
    }
    return configPromise;
}

function safeReturnTo(value: unknown): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
        return "/ec2";
    }
    return value;
}

export async function login(req: Request, res: Response): Promise<void> {
    const config = await getConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");

    req.session.oidc = {
        state,
        nonce,
        codeVerifier,
        returnTo: safeReturnTo(req.query.returnTo)
    };

    await new Promise<void>((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve());
    });

    const url = buildAuthorizationUrl(config, {
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: "openid profile email",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
    });
    res.redirect(url.href);
}

export async function callback(req: Request, res: Response): Promise<void> {
    const pending = req.session.oidc;
    if (!pending) {
        res.status(400).send("Sessão OIDC ausente");
        return;
    }

    const config = await getConfig();
    const incomingUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
    const currentUrl = new URL(redirectUri());
    currentUrl.search = incomingUrl.search;
    const tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        pkceCodeVerifier: pending.codeVerifier,
        idTokenExpected: true
    }, {
        redirect_uri: redirectUri()
    });
    const claims = tokens.claims();
    const subject = claims?.sub;
    if (typeof subject !== "string" || !subject) {
        throw new Error("ID token sem subject");
    }

    const returnTo = pending.returnTo;
    await new Promise<void>((resolve, reject) => {
        req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.user = {
        issuer: typeof claims?.iss === "string" ? claims.iss : required("OIDC_ISSUER"),
        subject
    };
    await new Promise<void>((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve());
    });
    res.redirect(returnTo);
}

export function logout(req: Request, res: Response): void {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
}

export function requireAuthentication(req: Request, res: Response, next: () => void): void {
    if (req.session.user) {
        next();
        return;
    }
    if (req.path.startsWith("/actions") || req.path.startsWith("/status") || req.path === "/runs" || req.get("accept")?.includes("application/json")) {
        res.status(401).json({ error: "Autenticação necessária." });
        return;
    }
    const returnTo = encodeURIComponent(req.originalUrl.startsWith("/ec2") ? req.originalUrl : "/ec2");
    res.redirect(`/auth/login?returnTo=${returnTo}`);
}
