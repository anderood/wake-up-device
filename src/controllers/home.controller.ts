import type { Request, Response } from "express";
import { isIPv4 } from "node:net";
import { Op, UniqueConstraintError } from "sequelize";
import devices from "../models/device.ts";
import deviceSchedules from "../models/device-schedule.ts";
import { pingIpv4 } from "../services/ping.ts";
import { wakeDevice } from "../services/wake-on-lan.ts";
import { deleteEc2Schedule } from "../services/eventbridge-scheduler.ts";

type DeviceFormValues = {
    name: string;
    type: string;
    enableWake: boolean;
    enableAccess: boolean;
    macAddress: string;
    localIpAddress: string;
    externalIpAddress: string;
    accessPort: string;
    ec2InstanceId: string;
    awsRegion: string;
};

type DeviceValues = {
    name: string;
    type: string;
    mac_address: string | null;
    ip_address: string | null;
    external_ip_address: string | null;
    access_port: number | null;
    ec2_instance_id: string | null;
    aws_region: string | null;
};

const emptyDeviceForm: DeviceFormValues = {
    name: "",
    type: "",
    enableWake: false,
    enableAccess: false,
    macAddress: "",
    localIpAddress: "",
    externalIpAddress: "",
    accessPort: "",
    ec2InstanceId: "",
    awsRegion: ""
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
    const checked = (field: string) => value(field).length > 0;
    const enableWake = checked("enableWake");
    const enableAccess = checked("enableAccess");

    return {
        name: value("name"),
        type: value("type"),
        enableWake,
        enableAccess,
        macAddress: enableWake ? value("macAddress") : "",
        localIpAddress: value("localIpAddress") || value("ipAddress"),
        externalIpAddress: value("externalIpAddress"),
        accessPort: enableAccess ? value("accessPort") : "",
        ec2InstanceId: value("ec2InstanceId"),
        awsRegion: value("awsRegion")
    };
}

function validateDeviceForm(values: DeviceFormValues): { error: string } | { data: DeviceValues } {
    if ([values.name, values.type].some((field) => field.length === 0)) {
        return { error: "Preencha todos os campos obrigatorios." };
    }

    if (values.name.length > 20 || values.type.length > 20) {
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

    let accessPort: number | null = null;

    if (values.enableAccess && values.accessPort.length === 0) {
        return { error: "Informe a porta de acesso." };
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

    let ec2InstanceId: string | null = null;
    let awsRegion: string | null = null;

    if (values.ec2InstanceId.length > 0 || values.awsRegion.length > 0) {
        if (values.ec2InstanceId.length === 0 || values.awsRegion.length === 0) {
            return { error: "Informe a instancia EC2 e a regiao AWS juntas." };
        }

        if (!/^i-[0-9a-f]{8,17}$/.test(values.ec2InstanceId)) {
            return { error: "Informe um ID de instancia EC2 valido." };
        }

        if (!/^[a-z]{2}(?:-[a-z]+)?-[a-z0-9-]+-\d$/.test(values.awsRegion)) {
            return { error: "Informe uma regiao AWS valida, como us-east-1." };
        }

        ec2InstanceId = values.ec2InstanceId;
        awsRegion = values.awsRegion;
    }

    return {
        data: {
            name: values.name,
            type: values.type,
            mac_address: macAddress,
            ip_address: values.localIpAddress || null,
            external_ip_address: values.externalIpAddress || null,
            access_port: accessPort,
            ec2_instance_id: ec2InstanceId,
            aws_region: awsRegion
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

async function renderDeviceIndex(req: Request, res: Response, ec2Only: boolean) {
    const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Record<string | symbol, unknown> = { status: 1 };

    if (ec2Only) {
        where.ec2_instance_id = { [Op.not]: null };
    }

    if (searchTerm.length > 0) {
        where[Op.or] = [
            { name: { [Op.like]: `%${searchTerm}%` } },
            { type: { [Op.like]: `%${searchTerm}%` } }
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
        searchAction: ec2Only ? "/ec2" : "/",
        isEc2Page: ec2Only,
        created: req.query.created === "1",
        updated: req.query.updated === "1"
    });
}

export default class HomeController {

    async index(req: Request, res: Response) {
        return renderDeviceIndex(req, res, false);
    }

    async ec2(req: Request, res: Response) {
        return renderDeviceIndex(req, res, true);
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
                enableWake: typeof storedValues.mac_address === "string" && storedValues.mac_address.length > 0,
                enableAccess: Boolean(storedValues.access_port),
                macAddress: String(storedValues.mac_address ?? ""),
                localIpAddress: String(storedValues.ip_address ?? ""),
                externalIpAddress: String(storedValues.external_ip_address ?? ""),
                accessPort: String(storedValues.access_port ?? ""),
                ec2InstanceId: String(storedValues.ec2_instance_id ?? ""),
                awsRegion: String(storedValues.aws_region ?? "")
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
            const currentDevice = await devices.findOne({
                attributes: ["ec2_instance_id", "aws_region"],
                where: { id: deviceId, status: 1 }
            });

            if (!currentDevice) {
                return renderError("Dispositivo nao encontrado.", 404);
            }

            const scheduleCount = await deviceSchedules.count({ where: { device_id: deviceId } });
            const currentInstanceId = currentDevice.get("ec2_instance_id");
            const currentRegion = currentDevice.get("aws_region");
            const nextInstanceId = validation.data.ec2_instance_id;
            const nextRegion = validation.data.aws_region;
            const awsLinkChanged = currentInstanceId !== nextInstanceId || currentRegion !== nextRegion;

            if (scheduleCount > 0 && awsLinkChanged) {
                return renderError("Remova os agendamentos AWS antes de alterar o vinculo EC2.");
            }

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
            const device = await devices.findOne({
                attributes: ["id", "aws_region"],
                where: { id: deviceId }
            });

            if (!device) {
                return res.status(404).json({ error: "Dispositivo nao encontrado." });
            }

            const schedules = await deviceSchedules.findAll({ where: { device_id: deviceId } });
            const awsRegion = device.get("aws_region");

            if (typeof awsRegion === "string") {
                for (const schedule of schedules) {
                    const schedulerName = schedule.get("scheduler_name");

                    if (typeof schedulerName === "string") {
                        await deleteEc2Schedule(schedulerName, awsRegion);
                    }
                }
            }

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
