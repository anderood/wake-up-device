import "express-session";

declare module "express-session" {
    interface SessionData {
        user?: {
            issuer: string;
            subject: string;
        };
        oidc?: {
            state: string;
            nonce: string;
            codeVerifier: string;
            returnTo: string;
        };
    }
}
