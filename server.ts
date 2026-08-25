import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import routes from './src/router/routes.ts';
import web from './src/router/web.ts';

const app: Express = express();

app.set("view engine", "ejs");
app.set("views", "./src/views");

const fontAwesomeRoot = new URL("./node_modules/@fortawesome/fontawesome-free/", import.meta.url);
app.use("/assets/fontawesome/css", express.static(fileURLToPath(new URL("css/", fontAwesomeRoot))));
app.use("/assets/fontawesome/webfonts", express.static(fileURLToPath(new URL("webfonts/", fontAwesomeRoot))));
app.use(express.urlencoded({ extended: false }));
app.use("/api", routes);
app.use("/", web);

app.listen(3000, () => {
    console.log("Running...")
});
