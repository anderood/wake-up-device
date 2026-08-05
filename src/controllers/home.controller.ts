import type { Request, Response } from "express";
import { UniqueConstraintError } from "sequelize";
import { fileURLToPath } from "node:url";
import devices from "../models/device.ts";

const editViewPath = fileURLToPath(new URL("../views/home/edit.html", import.meta.url));

type DeviceFormValues = {
    name: string;
    type: string;
    location: string;
    macAddress: string;
    hasExternalLink: string;
    externalUrl: string;
};

const emptyDeviceForm: DeviceFormValues = {
    name: "",
    type: "",
    location: "",
    macAddress: "",
    hasExternalLink: "no",
    externalUrl: ""
};

export default class HomeController {

    async index(req: Request, res: Response) {
        const allDevices = await devices.findAll({ where: { status: 1 } });
        return res.render("home/index", {
            devices: allDevices,
            created: req.query.created === "1"
        });
    }

    create(_req: Request, res: Response) {
        return res.render("home/add", {
            error: null,
            values: emptyDeviceForm
        });
    }

    async store(req: Request, res: Response) {
        const body = req.body && typeof req.body === "object"
            ? req.body as Record<string, unknown>
            : {};
        const value = (field: string) => {
            const fieldValue = body[field];
            return typeof fieldValue === "string" ? fieldValue.trim() : "";
        };
        const values: DeviceFormValues = {
            name: value("name"),
            type: value("type"),
            location: value("location"),
            macAddress: value("macAddress"),
            hasExternalLink: value("hasExternalLink"),
            externalUrl: value("externalUrl")
        };
        const renderError = (error: string) => res.status(422).render("home/add", {
            error,
            values
        });

        if ([values.name, values.type, values.location, values.macAddress].some((field) => field.length === 0)) {
            return renderError("Preencha todos os campos.");
        }

        if (values.hasExternalLink !== "yes" && values.hasExternalLink !== "no") {
            return renderError("Informe se o dispositivo possui um link externo.");
        }

        if (values.name.length > 20 || values.type.length > 20 || values.location.length > 50) {
            return renderError("Um ou mais campos excedem o tamanho permitido.");
        }

        const normalizedMacAddress = values.macAddress.toUpperCase().replaceAll("-", ":");

        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizedMacAddress)) {
            return renderError("Informe um endereco MAC valido, como AA:BB:CC:DD:EE:FF.");
        }

        let externalUrl: string | null = null;

        if (values.hasExternalLink === "yes") {
            if (values.externalUrl.length === 0) {
                return renderError("Informe o link externo do dispositivo.");
            }

            if (values.externalUrl.length > 2048) {
                return renderError("O link externo excede o tamanho permitido.");
            }

            try {
                const parsedUrl = new URL(values.externalUrl);

                if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                    return renderError("Informe um link iniciado por http:// ou https://.");
                }

                externalUrl = parsedUrl.toString();
            } catch {
                return renderError("Informe um link externo valido.");
            }
        }

        try {
            await devices.create({
                name: values.name,
                type: values.type,
                location: values.location,
                external_url: externalUrl,
                mac_address: normalizedMacAddress,
                status: 1
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                return renderError("Ja existe um dispositivo com este endereco MAC.");
            }

            console.error("Nao foi possivel cadastrar o dispositivo.", error);
            return res.status(500).render("home/add", {
                error: "Nao foi possivel cadastrar o dispositivo. Tente novamente.",
                values
            });
        }

        return res.redirect("/?created=1");
    }

    show(_req: Request, res: Response) {
        return res.sendStatus(501);
    }

    edit(req: Request, res: Response) {
        return res.sendFile(editViewPath);
    }

    update(_req: Request, res: Response) {
        return res.sendStatus(501);
    }

    destroy(_req: Request, res: Response) {
        return res.sendStatus(501);
    }
}
