import type { Request, Response } from "express";
import { fileURLToPath } from "node:url";

const homeViewPath = fileURLToPath(new URL("../views/home/index.html", import.meta.url));
const addViewPath = fileURLToPath(new URL("../views/home/add.html", import.meta.url));
const editViewPath = fileURLToPath(new URL("../views/home/edit.html", import.meta.url));

export default class HomeController {

    index(_req: Request, res: Response) {
        return res.sendFile(homeViewPath);
    }

    create(req: Request, res: Response) {
        return res.sendFile(addViewPath);
    }

    store(req: Request, res: Response) {
        return res.sendFile(addViewPath);
    }

    show(req: Request, res: Response) {
        return res.sendFile(addViewPath);
    }

    edit(req: Request, res: Response) {
        return res.sendFile(editViewPath);
    }

    update(req: Request, res: Response) {
        return res.sendFile(addViewPath);
    }

    destroy(req: Request, res: Response) {
        return res.sendFile(addViewPath);
    }
}
