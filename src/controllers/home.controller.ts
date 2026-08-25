import type { Request, Response } from "express";
import { isIPv4 } from "node:net";
import { Op, UniqueConstraintError } from "sequelize";
import devices from "../models/device.ts";
import { pingIpv4 } from "../services/ping.ts";
import { wakeDevice } from "../services/wake-on-lan.ts";

type DeviceFormValues = {
    name: string;
    type: string;
    location: string;
    macAddress: string;
    localIpAddress: string;
    externalIpAddress: string;
    accessPort: string;
};

type DeviceValues = {
    name: string;
    type: string;
    location: string;
    mac_address: string | null;
    ip_address: string | null;
    external_ip_address: string | null;
    access_port: number | null;
};

const emptyDeviceForm: DeviceFormValues = {
    name: "",
    type: "",
    location: "",
    macAddress: "",
    localIpAddress: "",
    externalIpAddress: "",
    accessPort: ""
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
        localIpAddress: value("localIpAddress") || value("ipAddress"),
        externalIpAddress: value("externalIpAddress"),
        accessPort: value("accessPort")
    };
}

function validateDeviceForm(values: DeviceFormValues): { error: string } | { data: DeviceValues } {
    if ([values.name, values.type, values.location].some((field) => field.length === 0)) {
        return { error: "Preencha todos os campos obrigatorios." };
    }

    if (values.name.length > 20 || values.type.length > 20 || values.location.length > 50) {
        return { error: "Um ou mais campos excedem o tamanho permitido." };
    }

    let macAddress: string | null = null;

    if (values.macAddress.length > 0) {
        macAddress = values.macAddress.toUpperCase().replaceAll("-", ":");

        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macAddress)) {
            return { error: "Informe um endereco MAC valido, como AA:BB:CC:DD:EE:FF." };
        }
    }

    if (values.localIpAddress.length > 0 && !isIPv4(values.localIpAddress)) {
        return { error: "Informe um endereco IPv4 local valido, como 192.168.1.6." };
    }

    if (values.externalIpAddress.length > 0 && !isIPv4(values.externalIpAddress)) {
        return { error: "Informe um endereco IPv4 externo valido, como 100.100.10.10." };
    }

    const hasAccessAddress = values.localIpAddress.length > 0 || values.externalIpAddress.length > 0;
    let accessPort: number | null = null;

    if (hasAccessAddress && values.accessPort.length === 0) {
        return { error: "Informe a porta de acesso dos enderecos local e externo." };
    }

    if (!hasAccessAddress && values.accessPort.length > 0) {
        return { error: "Informe um endereco IPv4 local ou externo para usar a porta de acesso." };
    }

    if (values.accessPort.length > 0) {
        accessPort = Number(values.accessPort);

        if (!/^\d{1,5}$/.test(values.accessPort)
            || !Number.isInteger(accessPort)
            || accessPort < 1
            || accessPort > 65_535) {
            return { error: "Informe uma porta valida entre 1 e 65535." };
        }
    }

    return {
        data: {
            name: values.name,
            type: values.type,
            location: values.location,
            mac_address: macAddress,
            ip_address: values.localIpAddress || null,
            external_ip_address: values.externalIpAddress || null,
            access_port: accessPort
        }
    };
}

function buildIpv4AccessUrl(ipAddress: unknown, accessPort: unknown): string | null {
    if (typeof ipAddress !== "string"
        || !isIPv4(ipAddress)
        || typeof accessPort !== "number"
        || !Number.isInteger(accessPort)
        || accessPort < 1
        || accessPort > 65_535) {
        return null;
    }

    return `http://${ipAddress}:${accessPort}`;
}

export default class HomeController {

    async index(req: Request, res: Response) {
        const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const where: Record<string | symbol, unknown> = { status: 1 };

        if (searchTerm.length > 0) {
            where[Op.or] = [
                { name: { [Op.like]: `%${searchTerm}%` } },
                { type: { [Op.like]: `%${searchTerm}%` } },
                { location: { [Op.like]: `%${searchTerm}%` } }
            ];
        }

        const allDevices = await devices.findAll({ where });
        const renderedDevices = allDevices.map((device) => {
            const values = device.toJSON() as Record<string, unknown>;

            return {
                ...values,
                local_access_url: buildIpv4AccessUrl(values.ip_address, values.access_port),
                external_access_url: buildIpv4AccessUrl(values.external_ip_address, values.access_port)
            };
        });

        return res.render("home/index", {
            devices: renderedDevices,
            searchTerm,
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
            const values: DeviceFormValues = {
                name: String(storedValues.name ?? ""),
                type: String(storedValues.type ?? ""),
                location: String(storedValues.location ?? ""),
                macAddress: String(storedValues.mac_address ?? ""),
                localIpAddress: String(storedValues.ip_address ?? ""),
                externalIpAddress: String(storedValues.external_ip_address ?? ""),
                accessPort: String(storedValues.access_port ?? "")
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
                    error: "Dispositivo sem endereco IPv4 local configurado."
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
