import express, { type Express } from "express";
import routes from './src/router/routes.ts';
import web from './src/router/web.ts';

const app: Express = express();

app.set("view engine", "ejs");
app.set("views", "./src/views");

app.use(express.urlencoded({ extended: false }));
app.use("/api", routes);
app.use("/", web);

app.listen(3000, () => {
    console.log("Running...")
});
