import type { NextFunction, Request, Response } from "express";
import { Op, type WhereOptions } from "sequelize";
import database from "../database/database.ts";
import ec2Config from "../models/ec2-config.ts";
import ec2Run from "../models/ec2-run.ts";
import ec2Schedule from "../models/ec2-schedule.ts";
import ec2Transition from "../models/ec2-transition.ts";
import { generateToken } from "../auth/csrf.ts";
import { isSupportedAwsRegion, supportedAwsRegions } from "../services/aws-regions.ts";

const INSTANCE_ID = /^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/;
const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown): boolean {
    return value === "on" || value === "true" || value === "1";
}

function isoNow(): string {
    return new Date().toISOString();
}

function plain<T>(value: T & { get(options: { plain: true }): unknown }): T {
    return value.get({ plain: true }) as T;
}

async function page(req: Request, res: Response, status = 200, error?: string): Promise<void> {
    const [configModel, schedules, runs] = await Promise.all([
        ec2Config.findByPk(1),
        ec2Schedule.findAll({ order: [["weekday", "ASC"], ["local_time", "ASC"], ["id", "ASC"]] }),
        ec2Run.findAll({ order: [["id", "DESC"]], limit: 50 })
    ]);
    res.status(status).render("ec2/index", {
        config: configModel ? configModel.get({ plain: true }) : null,
        schedules: schedules.map((item) => item.get({ plain: true })),
        runs: runs.map((item) => item.get({ plain: true })),
        regions: supportedAwsRegions(),
        csrfToken: generateToken(req),
        user: req.session.user,
        error
    });
}

export async function index(req: Request, res: Response): Promise<void> {
    await page(req, res);
}

export async function saveConfig(req: Request, res: Response): Promise<void> {
    const instanceId = text(req.body.instanceId);
    const region = text(req.body.region);
    const revisionText = text(req.body.revision);
    const revision = revisionText ? Number(revisionText) : null;

    if (!INSTANCE_ID.test(instanceId)) {
        await page(req, res, 422, "Informe um instance ID EC2 válido.");
        return;
    }
    if (!isSupportedAwsRegion(region)) {
        await page(req, res, 422, "A região não pertence à allowlist AWS.");
        return;
    }
    if (revisionText && (revision === null || !Number.isInteger(revision) || revision < 1)) {
        await page(req, res, 422, "Revisão de configuração inválida.");
        return;
    }

    const current = await ec2Config.findByPk(1);
    if (current && revision !== current.get("revision")) {
        res.status(409).send("A configuração foi alterada por outra sessão.");
        return;
    }

    const now = isoNow();
    await ec2Config.upsert({
        id: 1,
        instance_id: instanceId,
        region,
        timezone: "America/Sao_Paulo",
        recovery_enabled: bool(req.body.recoveryEnabled) ? 1 : 0,
        scheduler_cursor_utc: current?.get("scheduler_cursor_utc") ?? null,
        revision: current ? Number(current.get("revision")) + 1 : 1,
        updated_at: now
    });
    res.redirect("/ec2?updated=1");
}

export async function saveSchedule(req: Request, res: Response): Promise<void> {
    const action = text(req.body.action);
    const weekday = Number(text(req.body.weekday));
    const localTime = text(req.body.localTime);
    const idText = text(req.body.id);
    const id = idText ? Number(idText) : null;

    if (!(action === "start" || action === "stop") || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !TIME.test(localTime)) {
        await page(req, res, 422, "Schedule inválido. Use ação start/stop, dia entre 1 e 7 e horário HH:MM.");
        return;
    }
    if (idText && (!Number.isInteger(id) || id! < 1)) {
        await page(req, res, 422, "Schedule ID inválido.");
        return;
    }

    const now = isoNow();
    try {
        if (id) {
            const schedule = await ec2Schedule.findByPk(id);
            if (!schedule) {
                res.status(404).send("Schedule não encontrado.");
                return;
            }
            await schedule.update({ action, weekday, local_time: localTime, enabled: bool(req.body.enabled) ? 1 : 0, updated_at: now });
        } else {
            await ec2Schedule.create({ action, weekday, local_time: localTime, enabled: 1, updated_at: now });
        }
    } catch (error) {
        if (error instanceof Error && error.name === "SequelizeUniqueConstraintError") {
            await page(req, res, 422, "Já existe uma schedule para essa ação nesse dia.");
            return;
        }
        throw error;
    }
    res.redirect("/ec2?updated=1");
}

export async function deleteSchedule(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).send("Schedule ID inválido.");
        return;
    }
    await ec2Schedule.destroy({ where: { id } });
    res.redirect("/ec2?updated=1");
}

export async function enqueueAction(req: Request, res: Response): Promise<void> {
    const config = await ec2Config.findByPk(1);
    if (!config) {
        res.status(409).json({ error: "Configure a instância EC2 antes de executar uma ação." });
        return;
    }

    const action = text(req.params.action) || text(req.body.action);
    const mode = text(req.body.mode) || "real";
    const requestId = text(req.get("x-request-id")) || text(req.body.requestId);
    const reconcilesRunIdText = text(req.body.reconcilesRunId);
    const reconcilesRunId = reconcilesRunIdText ? Number(reconcilesRunIdText) : null;
    if (!(action === "start" || action === "stop" || action === "inspect") || !(mode === "real" || mode === "simulation") || !REQUEST_ID.test(requestId)) {
        res.status(422).json({ error: "Ação, modo e requestId são inválidos." });
        return;
    }
    if (reconcilesRunIdText && (!Number.isInteger(reconcilesRunId) || reconcilesRunId! < 1)) {
        res.status(422).json({ error: "reconcilesRunId inválido." });
        return;
    }

    try {
        const run = await database.transaction(async (transaction) => {
            const existing = await ec2Run.findOne({ where: { idempotency_key: requestId }, transaction });
            if (existing) {
                const same = ["action", "mode", "instance_id", "region", "reconciles_run_id"].every((field) => {
                    const expected = field === "instance_id" ? config.get("instance_id")
                        : field === "region" ? config.get("region")
                            : field === "reconciles_run_id" ? reconcilesRunId : field === "action" ? action : mode;
                    return existing.get(field) === expected;
                });
                if (!same) {
                    const conflict = new Error("requestId já foi usado para outra intenção");
                    (conflict as Error & { status?: number }).status = 409;
                    throw conflict;
                }
                return existing;
            }

            if (reconcilesRunId) {
                const linked = await ec2Run.findByPk(reconcilesRunId, { transaction });
                const linkedStatus = linked?.get("status");
                const linkedInstance = linked?.get("instance_id");
                const linkedRegion = linked?.get("region");
                const isUncertain = linkedStatus === "unknown" || linkedStatus === "interrupted";
                const isReconciliationInspect = linked?.get("action") === "inspect" && linkedStatus === "observed" && Boolean(linked?.get("reconciles_run_id"));
                if (!linked || linkedInstance !== config.get("instance_id") || linkedRegion !== config.get("region") || (!isUncertain && !isReconciliationInspect)) {
                    const conflict = new Error("reconcilesRunId não referencia uma execução reconciliável");
                    (conflict as Error & { status?: number }).status = 422;
                    throw conflict;
                }
            }

            const realMutation = mode === "real" && (action === "start" || action === "stop");
            if (realMutation && await ec2Transition.findByPk(String(config.get("instance_id")), { transaction })) {
                const conflict = new Error("Já existe uma transição que exige reconciliação");
                (conflict as Error & { status?: number }).status = 409;
                throw conflict;
            }

            const run = await ec2Run.create({
                idempotency_key: requestId,
                source: "manual",
                mode,
                action,
                instance_id: config.get("instance_id"),
                region: config.get("region"),
                config_revision: config.get("revision"),
                actor_issuer: req.session.user?.issuer ?? null,
                actor_subject: req.session.user?.subject ?? null,
                reconciles_run_id: reconcilesRunId,
                status: "queued",
                requested_at: isoNow()
            }, { transaction });
            if (realMutation) {
                await ec2Transition.create({
                    instance_id: config.get("instance_id"),
                    state: "active",
                    run_id: run.get("id"),
                    updated_at: isoNow()
                }, { transaction });
            }
            return run;
        });
        const status = run.get("status") === "queued" ? 202 : 200;
        res.status(status).json({
            runId: run.get("id"),
            status: run.get("status"),
            mode: run.get("mode"),
            message: "Solicitação registrada para processamento.",
            run: run.get({ plain: true })
        });
    } catch (error) {
        const status = error instanceof Error && "status" in error ? Number((error as Error & { status?: number }).status) : 500;
        if (status === 409 || status === 422) {
            res.status(status).json({ error: error instanceof Error ? error.message : "Conflito" });
            return;
        }
        throw error;
    }
}

export async function runs(req: Request, res: Response): Promise<void> {
    const where: WhereOptions = {};
    for (const field of ["status", "source", "mode"] as const) {
        const value = text(req.query[field]);
        if (value) where[field] = value;
    }
    const reconciliation = text(req.query.reconcilesRunId);
    if (reconciliation) {
        const id = Number(reconciliation);
        if (!Number.isInteger(id) || id < 1) {
            res.status(422).json({ error: "reconcilesRunId inválido." });
            return;
        }
        where.reconciles_run_id = id;
    }
    const from = text(req.query.from);
    const to = text(req.query.to);
    if (from || to) {
        where.requested_at = {};
        if (from) (where.requested_at as Record<symbol, string>)[Op.gte] = from;
        if (to) (where.requested_at as Record<symbol, string>)[Op.lte] = to;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await ec2Run.findAll({ where, order: [["id", "DESC"]], limit, offset });
    res.json({ items: rows.map((row) => row.get({ plain: true })), limit, offset });
}

export async function status(req: Request, res: Response): Promise<void> {
    const config = await ec2Config.findByPk(1);
    if (!config) {
        res.json({ configured: false, transition: null, latestRun: null, latestObservation: null });
        return;
    }
    const [transition, latestRun, latestObservation] = await Promise.all([
        ec2Transition.findByPk(String(config.get("instance_id"))),
        ec2Run.findOne({ where: { instance_id: config.get("instance_id") }, order: [["id", "DESC"]] }),
        ec2Run.findOne({ where: { instance_id: config.get("instance_id"), action: "inspect", status: "observed" }, order: [["id", "DESC"]] })
    ]);
    const observation = latestObservation?.get({ plain: true }) as { observed_state?: string; finished_at?: string } | undefined;
    res.json({
        configured: true,
        instanceId: config.get("instance_id"),
        region: config.get("region"),
        observedState: observation?.observed_state ?? null,
        observedAt: observation?.finished_at ?? null,
        nextAction: null,
        transition: transition?.get({ plain: true }) ?? null,
        latestRun: latestRun?.get({ plain: true }) ?? null,
        latestObservation: latestObservation?.get({ plain: true }) ?? null
    });
}

export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(error);
        return;
    }
    const status = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: number }).status)
            : 500;
    res.status(status >= 400 && status < 600 ? status : 500).send(
        status === 403 ? "Token CSRF inválido." : "Erro interno ao processar a solicitação."
    );
}
