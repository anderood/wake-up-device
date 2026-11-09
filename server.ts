import express, { type Express } from "express";
import session from "express-session";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import routes from './src/router/routes.ts';
import web from './src/router/web.ts';
import { SequelizeSessionStore } from './src/auth/session-store.ts';
import { callback, login, logout } from './src/auth/oidc.ts';
import { csrfSynchronisedProtection } from './src/auth/csrf.ts';
import ec2 from './src/router/ec2.ts';
import { errorHandler } from './src/controllers/ec2.controller.ts';

export const app: Express = express();

const sessionSecret = process.env.SESSION_SECRET?.trim();
if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET é obrigatório em produção");
}

app.set("view engine", "ejs");
app.set("views", "./src/views");

const fontAwesomeRoot = new URL("./node_modules/@fortawesome/fontawesome-free/", import.meta.url);
app.use("/assets/fontawesome/css", express.static(fileURLToPath(new URL("css/", fontAwesomeRoot))));
app.use("/assets/fontawesome/webfonts", express.static(fileURLToPath(new URL("webfonts/", fontAwesomeRoot))));
app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: sessionSecret || "development-only-change-me",
    resave: false,
    saveUninitialized: false,
    store: new SequelizeSessionStore(),
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.SESSION_COOKIE_SECURE !== "false",
        maxAge: 8 * 60 * 60 * 1000
    }
}));
app.get("/auth/login", login);
app.get("/auth/callback", callback);
app.post("/auth/logout", csrfSynchronisedProtection, logout);
app.use("/api", routes);
app.use("/", web);
app.use("/ec2", ec2);
app.use(errorHandler);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.APP_PORT || 3000);
    app.listen(port, () => {
        console.log(`Running on port ${port}`);
    });
}
