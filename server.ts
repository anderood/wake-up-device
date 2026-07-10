import express, { type Express, type Request, type Response, json } from "express";
import routes from './src/router/routes.ts';
import web from './src/router/web.ts';

const app: Express = express();

app.use("/api", routes);
app.use("/", web);

app.listen(3000, () => {
    console.log("Running...")
});