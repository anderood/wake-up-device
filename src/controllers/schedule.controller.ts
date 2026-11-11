import type { Request, Response } from "express";
import type { Model } from "sequelize";
import devices from "../models/device.ts";
import deviceSchedules from "../models/device-schedule.ts";
import {
    deleteEc2Schedule,
    upsertEc2Schedule,
    validateEc2Instance,
    type ScheduleAction
} from "../services/eventbridge-scheduler.ts";

const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const weekdayLabels: Record<string, string> = {
    MON: "Seg",
    TUE: "Ter",
    WED: "Qua",
    THU: "Qui",
    FRI: "Sex",
    SAT: "Sab",
    SUN: "Dom"
};

type ScheduleFormValues = {
    action: ScheduleAction;
    hour: string;
    minute: string;
    days: string[];
    timezone: string;
    enabled: boolean;
};

type ValidatedSchedule = ScheduleFormValues & {
    expression: string;
};

const emptyScheduleForm: ScheduleFormValues = {
    action: "start",
    hour: "08",
    minute: "00",
    days: [...weekdays],
    timezone: "America/Sao_Paulo",
    enabled: true
};

function parseId(value: unknown): number | null {
    if (typeof value !== "string") {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getBody(req: Request): Record<string, unknown> {
    return req.body && typeof req.body === "object"
        ? req.body as Record<string, unknown>
        : {};
}

function getString(body: Record<string, unknown>, name: string): string {
    return typeof body[name] === "string" ? body[name].trim() : "";
}

function getDays(body: Record<string, unknown>): string[] {
    const value = body.days;
    const values = Array.isArray(value) ? value : [value];

    return values
        .filter((day): day is string => typeof day === "string")
        .map((day) => day.trim().toUpperCase())
        .filter((day, index, allDays) => weekdays.includes(day as typeof weekdays[number])
            && allDays.indexOf(day) === index)
        .sort((left, right) => weekdays.indexOf(left as typeof weekdays[number])
            - weekdays.indexOf(right as typeof weekdays[number]));
}

function getFormValues(req: Request): ScheduleFormValues {
    const body = getBody(req);
    const action = getString(body, "action");

    return {
        action: action === "stop" ? "stop" : "start",
        hour: getString(body, "hour"),
        minute: getString(body, "minute"),
        days: getDays(body),
        timezone: getString(body, "timezone"),
        enabled: getString(body, "enabled").length > 0
    };
}

function validateForm(values: ScheduleFormValues): { error: string } | { data: ValidatedSchedule } {
    const hour = Number(values.hour);
    const minute = Number(values.minute);

    if (!/^\d{1,2}$/.test(values.hour) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        return { error: "Informe uma hora valida entre 0 e 23." };
    }

    if (!/^\d{1,2}$/.test(values.minute) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
        return { error: "Informe um minuto valido entre 0 e 59." };
    }

    if (values.days.length === 0) {
        return { error: "Selecione pelo menos um dia da semana." };
    }

    if (values.timezone.length === 0 || values.timezone.length > 64) {
        return { error: "Informe um fuso horario valido." };
    }

    try {
        new Intl.DateTimeFormat("en-US", { timeZone: values.timezone }).format();
    } catch {
        return { error: "Informe um fuso horario IANA valido." };
    }

    const normalizedHour = String(hour).padStart(2, "0");
    const normalizedMinute = String(minute).padStart(2, "0");
    const isEveryDay = values.days.length === weekdays.length;
    const dayOfMonth = isEveryDay ? "*" : "?";
    const dayOfWeek = isEveryDay ? "?" : values.days.join(",");

    return {
        data: {
            ...values,
            hour: normalizedHour,
            minute: normalizedMinute,
            expression: `cron(${normalizedMinute} ${normalizedHour} ${dayOfMonth} * ${dayOfWeek} *)`
        }
    };
}

function getValuesFromExpression(action: ScheduleAction, expression: string, timezone: string): ScheduleFormValues {
    const match = /^cron\((\d{1,2}) (\d{1,2}) [*?] \* ([*?A-Z,]+) \*\)$/.exec(expression);
    const days = !match || match[3] === "*" || match[3] === "?"
        ? [...weekdays]
        : match[3].split(",");

    return {
        action,
        hour: match?.[2]?.padStart(2, "0") || "08",
        minute: match?.[1]?.padStart(2, "0") || "00",
        days,
        timezone,
        enabled: true
    };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Erro desconhecido.";
}

function getDeviceId(req: Request): number | null {
    return parseId(req.params.id);
}

function formatSchedule(schedule: Model) {
    const values = schedule.toJSON() as Record<string, unknown>;
    const action = values.action === "stop" ? "stop" : "start";
    const form = getValuesFromExpression(action, String(values.expression || ""), String(values.timezone || ""));

    return {
        ...values,
        enabled: Boolean(values.enabled),
        action,
        actionLabel: action === "start" ? "Ligar" : "Desligar",
        time: `${form.hour}:${form.minute}`,
        daysText: form.days.map((day) => weekdayLabels[day] || day).join(", "),
        statusLabel: values.sync_status === "error"
            ? "Erro de sincronizacao"
            : values.enabled
                ? "Ativo"
                : "Desativado"
    };
}

export default class ScheduleController {
    private async loadDevice(deviceId: number) {
        return devices.findOne({ where: { id: deviceId, status: 1 } });
    }

    private async syncSchedule(schedule: Model, device: Model): Promise<void> {
        const instanceId = device.get("ec2_instance_id");
        const region = device.get("aws_region");

        if (typeof instanceId !== "string" || typeof region !== "string") {
            throw new Error("Configure a instancia EC2 e a regiao AWS antes de criar agendamentos.");
        }

        await validateEc2Instance(instanceId, region);

        const result = await upsertEc2Schedule({
            deviceId: Number(device.get("id")),
            scheduleId: Number(schedule.get("id")),
            action: schedule.get("action") as ScheduleAction,
            expression: String(schedule.get("expression")),
            timezone: String(schedule.get("timezone")),
            enabled: Boolean(schedule.get("enabled")),
            instanceId,
            region,
            schedulerName: schedule.get("scheduler_name") as string | null,
            schedulerArn: schedule.get("scheduler_arn") as string | null
        });

        await schedule.update({
            scheduler_name: result.schedulerName,
            scheduler_arn: result.schedulerArn,
            sync_status: schedule.get("enabled") ? "active" : "disabled",
            last_sync_error: null
        });
    }

    private async renderPage(
        res: Response,
        device: Model,
        values: ScheduleFormValues,
        error: string | null = null,
        status = 200,
        editingScheduleId: number | null = null
    ) {
        const schedules = await deviceSchedules.findAll({
            where: { device_id: device.get("id") },
            order: [["action", "ASC"], ["id", "ASC"]]
        });

        return res.status(status).render("home/schedules", {
            device: device.toJSON(),
            deviceId: device.get("id"),
            schedules: schedules.map(formatSchedule),
            values,
            error,
            editingScheduleId
        });
    }

    async index(req: Request, res: Response) {
        const deviceId = getDeviceId(req);

        if (deviceId === null) {
            return res.status(400).send("Dispositivo invalido.");
        }

        const device = await this.loadDevice(deviceId);

        if (!device) {
            return res.status(404).send("Dispositivo nao encontrado.");
        }

        const editingScheduleId = parseId(req.query.edit);

        if (editingScheduleId === null) {
            return this.renderPage(res, device, emptyScheduleForm);
        }

        const schedule = await deviceSchedules.findOne({
            where: { id: editingScheduleId, device_id: deviceId }
        });

        if (!schedule) {
            return res.status(404).send("Agendamento nao encontrado.");
        }

        const values = getValuesFromExpression(
            schedule.get("action") === "stop" ? "stop" : "start",
            String(schedule.get("expression")),
            String(schedule.get("timezone"))
        );
        values.enabled = Boolean(schedule.get("enabled"));

        return this.renderPage(res, device, values, null, 200, editingScheduleId);
    }

    async store(req: Request, res: Response) {
        const deviceId = getDeviceId(req);

        if (deviceId === null) {
            return res.status(400).send("Dispositivo invalido.");
        }

        const device = await this.loadDevice(deviceId);

        if (!device) {
            return res.status(404).send("Dispositivo nao encontrado.");
        }

        const values = getFormValues(req);
        const validation = validateForm(values);

        if ("error" in validation) {
            return this.renderPage(res, device, values, validation.error, 422);
        }

        const schedule = await deviceSchedules.create({
            device_id: deviceId,
            action: validation.data.action,
            expression: validation.data.expression,
            timezone: validation.data.timezone,
            enabled: validation.data.enabled ? 1 : 0,
            sync_status: "pending",
            last_sync_error: null
        });

        try {
            await this.syncSchedule(schedule, device);
        } catch (error) {
            await schedule.update({
                sync_status: "error",
                last_sync_error: getErrorMessage(error)
            });

            return this.renderPage(res, device, values, `Nao foi possivel sincronizar o agendamento: ${getErrorMessage(error)}`, 502);
        }

        return res.redirect(`/device/${deviceId}/schedules`);
    }

    async update(req: Request, res: Response) {
        const deviceId = getDeviceId(req);
        const scheduleId = parseId(req.params.scheduleId);

        if (deviceId === null || scheduleId === null) {
            return res.status(400).send("Agendamento invalido.");
        }

        const device = await this.loadDevice(deviceId);
        const schedule = await deviceSchedules.findOne({ where: { id: scheduleId, device_id: deviceId } });

        if (!device || !schedule) {
            return res.status(404).send("Agendamento nao encontrado.");
        }

        const values = getFormValues(req);
        const validation = validateForm(values);

        if ("error" in validation) {
            return this.renderPage(res, device, values, validation.error, 422, scheduleId);
        }

        await schedule.update({
            action: validation.data.action,
            expression: validation.data.expression,
            timezone: validation.data.timezone,
            enabled: validation.data.enabled ? 1 : 0,
            sync_status: "pending",
            last_sync_error: null
        });

        try {
            await this.syncSchedule(schedule, device);
        } catch (error) {
            await schedule.update({
                sync_status: "error",
                last_sync_error: getErrorMessage(error)
            });

            return this.renderPage(res, device, values, `Nao foi possivel sincronizar o agendamento: ${getErrorMessage(error)}`, 502, scheduleId);
        }

        return res.redirect(`/device/${deviceId}/schedules`);
    }

    async toggle(req: Request, res: Response) {
        const deviceId = getDeviceId(req);
        const scheduleId = parseId(req.params.scheduleId);

        if (deviceId === null || scheduleId === null) {
            return res.status(400).send("Agendamento invalido.");
        }

        const device = await this.loadDevice(deviceId);
        const schedule = await deviceSchedules.findOne({ where: { id: scheduleId, device_id: deviceId } });

        if (!device || !schedule) {
            return res.status(404).send("Agendamento nao encontrado.");
        }

        await schedule.update({
            enabled: schedule.get("enabled") ? 0 : 1,
            sync_status: "pending",
            last_sync_error: null
        });

        try {
            await this.syncSchedule(schedule, device);
        } catch (error) {
            await schedule.update({
                sync_status: "error",
                last_sync_error: getErrorMessage(error)
            });

            return res.status(502).send(`Nao foi possivel sincronizar o agendamento: ${getErrorMessage(error)}`);
        }

        return res.redirect(`/device/${deviceId}/schedules`);
    }

    async destroy(req: Request, res: Response) {
        const deviceId = getDeviceId(req);
        const scheduleId = parseId(req.params.scheduleId);

        if (deviceId === null || scheduleId === null) {
            return res.status(400).send("Agendamento invalido.");
        }

        const device = await this.loadDevice(deviceId);
        const schedule = await deviceSchedules.findOne({ where: { id: scheduleId, device_id: deviceId } });

        if (!device || !schedule) {
            return res.status(404).send("Agendamento nao encontrado.");
        }

        const schedulerName = schedule.get("scheduler_name");
        const region = device.get("aws_region");

        try {
            if (typeof schedulerName === "string" && typeof region === "string") {
                await deleteEc2Schedule(schedulerName, region);
            }

            await schedule.destroy();
        } catch (error) {
            console.error("Nao foi possivel excluir o agendamento.", error);
            return res.status(502).send(`Nao foi possivel excluir o agendamento: ${getErrorMessage(error)}`);
        }

        return res.redirect(`/device/${deviceId}/schedules`);
    }
}
