import type { Request, Response } from "express";
import { fileURLToPath } from "node:url";
import devices from "../models/device.ts";

const addViewPath = fileURLToPath(new URL("../views/home/add.html", import.meta.url));
const editViewPath = fileURLToPath(new URL("../views/home/edit.html", import.meta.url));

export default class HomeController {

    async index(_req: Request, res: Response) {
        const allDevices = await devices.findAll({ where: { status: 1 } });
        return res.render("home/index", { devices: allDevices });
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
