import { csrfSync } from "csrf-sync";

export const {
    generateToken,
    csrfSynchronisedProtection
} = csrfSync({
    getTokenFromRequest: (request) => {
        const bodyToken = request.body && typeof request.body._csrf === "string" ? request.body._csrf : undefined;
        return bodyToken ?? request.headers["x-csrf-token"] as string | undefined;
    }
});
