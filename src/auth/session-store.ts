import { Store, type SessionData } from "express-session";
import { EventEmitter } from "node:events";
import authSession from "../models/auth-session.ts";

type StoredSession = {
    sid: string;
    issuer: string;
    subject: string;
    data: string;
    created_at: string;
    last_access_at: string;
    expires_at: string;
};

function now(): string {
    return new Date().toISOString();
}

export class SequelizeSessionStore extends Store {

    get(sid: string, callback: (err: Error | null, session?: SessionData | null) => void): void {
        void authSession.findByPk(sid).then((model) => {
            if (!model) {
                callback(null, null);
                return;
            }
            const row = model.get({ plain: true }) as StoredSession;
            if (Date.parse(row.expires_at) <= Date.now()) {
                void authSession.destroy({ where: { sid } });
                callback(null, null);
                return;
            }
            callback(null, JSON.parse(row.data) as SessionData);
        }).catch((error: Error) => callback(error));
    }

    set(sid: string, session: SessionData, callback: (err?: Error | null) => void): void {
        const data = JSON.stringify(session);
        const user = session.user;
        const timestamp = now();
        const expiresAt = session.cookie.expires?.toISOString() ?? new Date(Date.now() + 86400000).toISOString();
        void authSession.findByPk(sid).then((existing) => {
            if (existing) {
                return existing.update({
                    issuer: user?.issuer ?? existing.get("issuer"),
                    subject: user?.subject ?? existing.get("subject"),
                    data,
                    last_access_at: timestamp,
                    expires_at: expiresAt
                });
            }
            return authSession.create({
                sid,
                issuer: user?.issuer ?? "",
                subject: user?.subject ?? "",
                data,
                created_at: timestamp,
                last_access_at: timestamp,
                expires_at: expiresAt
            });
        }).then(() => callback(null)).catch((error: Error) => callback(error));
    }

    destroy(sid: string, callback: (err?: Error | null) => void): void {
        void authSession.destroy({ where: { sid } }).then(() => callback(null)).catch((error: Error) => callback(error));
    }

    touch(sid: string, session: SessionData, callback: (err?: Error | null) => void): void {
        const expiresAt = session.cookie.expires?.toISOString() ?? new Date(Date.now() + 86400000).toISOString();
        void authSession.update({ last_access_at: now(), expires_at: expiresAt }, { where: { sid } })
            .then(() => callback(null)).catch((error: Error) => callback(error));
    }
}
