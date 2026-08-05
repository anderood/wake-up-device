import type { Request, Response } from "express";
import { isIPv4 } from "node:net";
import { UniqueConstraintError } from "sequelize";
import devices from "../models/device.ts";
import { pingIpv4 } from "../services/ping.ts";
import { wakeDevice } from "../services/wake-on-lan.ts";

type DeviceFormValues = {
    name: string;
    type: string;
    location: string;
    macAddress: string;
    ipAddress: string;
    hasExternalLink: string;
    externalUrl: string;
};

type DeviceValues = {
    name: string;
    type: string;
    location: string;
    mac_address: string;
    ip_address: string | null;
    external_url: string | null;
};

const emptyDeviceForm: DeviceFormValues = {
    name: "",
    type: "",
    location: "",
    macAddress: "",
    ipAddress: "",
    hasExternalLink: "no",
    externalUrl: ""
};

function parseDeviceId(value: unknown): number | null {
    if (typeof value !== "string") {
        return null;
    }

    const deviceId = Number(value);
    return Number.isSafeInteger(deviceId) && deviceId > 0 ? deviceId : null;
}

function getDeviceFormValues(req: Request): DeviceFormValues {
    const body = req.body && typeof req.body === "object"
        ? req.body as Record<string, unknown>
        : {};
    const value = (field: string) => {
        const fieldValue = body[field];
        return typeof fieldValue === "string" ? fieldValue.trim() : "";
    };

    return {
        name: value("name"),
        type: value("type"),
        location: value("location"),
        macAddress: value("macAddress"),
        ipAddress: value("ipAddress"),
        hasExternalLink: value("hasExternalLink"),
        externalUrl: value("externalUrl")
    };
}

function validateDeviceForm(values: DeviceFormValues): { error: string } | { data: DeviceValues } {
    if ([values.name, values.type, values.location, values.macAddress].some((field) => field.length === 0)) {
        return { error: "Preencha todos os campos obrigatorios." };
    }

    if (values.hasExternalLink !== "yes" && values.hasExternalLink !== "no") {
        return { error: "Informe se o dispositivo possui um link externo." };
    }

    if (values.name.length > 20 || values.type.length > 20 || values.location.length > 50) {
        return { error: "Um ou mais campos excedem o tamanho permitido." };
    }

    const normalizedMacAddress = values.macAddress.toUpperCase().replaceAll("-", ":");

    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizedMacAddress)) {
        return { error: "Informe um endereco MAC valido, como AA:BB:CC:DD:EE:FF." };
    }

    if (values.ipAddress.length > 0 && !isIPv4(values.ipAddress)) {
        return { error: "Informe um endereco IPv4 valido, como 192.168.1.10." };
    }

    let externalUrl: string | null = null;

    if (values.hasExternalLink === "yes") {
        if (values.externalUrl.length === 0) {
            return { error: "Informe o link externo do dispositivo." };
        }

        if (values.externalUrl.length > 2048) {
            return { error: "O link externo excede o tamanho permitido." };
        }

        try {
            const parsedUrl = new URL(values.externalUrl);

            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                return { error: "Informe um link iniciado por http:// ou https://." };
            }

            externalUrl = parsedUrl.toString();
        } catch {
            return { error: "Informe um link externo valido." };
        }
    }

    return {
        data: {
            name: values.name,
            type: values.type,
            location: values.location,
            mac_address: normalizedMacAddress,
            ip_address: values.ipAddress || null,
            external_url: externalUrl
        }
    };
}

export default class HomeController {

    async index(req: Request, res: Response) {
        const allDevices = await devices.findAll({ where: { status: 1 } });
        return res.render("home/index", {
            devices: allDevices,
            created: req.query.created === "1",
            updated: req.query.updated === "1"
        });
    }

    create(_req: Request, res: Response) {
        return res.render("home/add", {
            error: null,
            values: emptyDeviceForm
        });
    }

    async store(req: Request, res: Response) {
        const values = getDeviceFormValues(req);
        const validation = validateDeviceForm(values);
        const renderError = (error: string) => res.status(422).render("home/add", {
            error,
            values
        });

        if ("error" in validation) {
            return renderError(validation.error);
        }

        try {
            await devices.create({ ...validation.data, status: 1 });
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

    async edit(req: Request, res: Response) {
        const deviceId = parseDeviceId(req.params.id);

        if (deviceId === null) {
            return res.status(400).send("Dispositivo invalido.");
        }

        try {
            const device = await devices.findOne({ where: { id: deviceId, status: 1 } });

            if (!device) {
                return res.status(404).send("Dispositivo nao encontrado.");
            }

            const storedValues = device.toJSON() as Record<string, unknown>;
            const externalUrl = typeof storedValues.external_url === "string"
                ? storedValues.external_url
                : "";
            const values: DeviceFormValues = {
                name: String(storedValues.name ?? ""),
                type: String(storedValues.type ?? ""),
                location: String(storedValues.location ?? ""),
                macAddress: String(storedValues.mac_address ?? ""),
                ipAddress: String(storedValues.ip_address ?? ""),
                hasExternalLink: externalUrl ? "yes" : "no",
                externalUrl
            };

            return res.render("home/edit", { deviceId, error: null, values });
        } catch (error) {
            console.error("Nao foi possivel carregar o dispositivo.", error);
            return res.status(500).send("Nao foi possivel carregar o dispositivo.");
        }
    }

    async update(req: Request, res: Response) {
        const deviceId = parseDeviceId(req.params.id);

        if (deviceId === null) {
            return res.status(400).send("Dispositivo invalido.");
        }

        const values = getDeviceFormValues(req);
        const validation = validateDeviceForm(values);
        const renderError = (error: string, status = 422) => res.status(status).render("home/edit", {
            deviceId,
            error,
            values
        });

        if ("error" in validation) {
            return renderError(validation.error);
        }

        try {
            const [updatedDevices] = await devices.update(validation.data, {
                where: { id: deviceId, status: 1 }
            });

            if (updatedDevices === 0) {
                return renderError("Dispositivo nao encontrado.", 404);
            }
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                return renderError("Ja existe um dispositivo com este endereco MAC.");
            }

            console.error("Nao foi possivel atualizar o dispositivo.", error);
            return renderError("Nao foi possivel atualizar o dispositivo. Tente novamente.", 500);
        }

        return res.redirect("/?updated=1");
    }

    async wake(req: Request, res: Response) {
        const deviceId = parseDeviceId(req.params.id);

        if (deviceId === null) {
            return res.status(400).json({ error: "Dispositivo invalido." });
        }

        try {
            const device = await devices.findOne({
                attributes: ["mac_address", "ip_address"],
                where: { id: deviceId, status: 1 }
            });

            if (!device) {
                return res.status(404).json({ error: "Dispositivo nao encontrado." });
            }

            const macAddress = device.get("mac_address");
            const ipAddress = device.get("ip_address");

            if (typeof macAddress !== "string") {
                throw new Error("Dispositivo sem endereco MAC valido.");
            }

            await wakeDevice(macAddress);

            return res.status(200).json({
                message: "Pacote Wake-on-LAN enviado.",
                canConfirm: typeof ipAddress === "string" && isIPv4(ipAddress)
            });
        } catch (error) {
            console.error("Nao foi possivel acordar o dispositivo.", error);
            return res.status(500).json({
                error: "Nao foi possivel enviar o pacote Wake-on-LAN. Tente novamente."
            });
        }
    }

    async ping(req: Request, res: Response) {
        const deviceId = parseDeviceId(req.params.id);

        if (deviceId === null) {
            return res.status(400).json({ error: "Dispositivo invalido." });
        }

        try {
            const device = await devices.findOne({
                attributes: ["ip_address"],
                where: { id: deviceId, status: 1 }
            });

            if (!device) {
                return res.status(404).json({ error: "Dispositivo nao encontrado." });
            }

            const ipAddress = device.get("ip_address");

            if (typeof ipAddress !== "string" || !isIPv4(ipAddress)) {
                return res.status(422).json({
                    error: "Dispositivo sem endereco IPv4 configurado."
                });
            }

            return res.status(200).json({ online: await pingIpv4(ipAddress) });
        } catch (error) {
            console.error("Nao foi possivel verificar o dispositivo.", error);
            return res.status(500).json({
                error: "Nao foi possivel verificar se o dispositivo esta online."
            });
        }
    }

    async destroy(req: Request, res: Response) {
        const deviceId = parseDeviceId(req.params.id);

        if (deviceId === null) {
            return res.status(400).json({ error: "Dispositivo invalido." });
        }

        try {
            const deletedDevices = await devices.destroy({ where: { id: deviceId } });

            if (deletedDevices === 0) {
                return res.status(404).json({ error: "Dispositivo nao encontrado." });
            }

            return res.sendStatus(204);
        } catch (error) {
            console.error("Nao foi possivel excluir o dispositivo.", error);
            return res.status(500).json({
                error: "Nao foi possivel excluir o dispositivo. Tente novamente."
            });
        }
    }
}
