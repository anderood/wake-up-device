import type { Request, Response } from "express";
import { Op, type Transaction } from "sequelize";
import database from "../database/database.ts";
import passcardFields from "../models/passcard-field.ts";
import passcards from "../models/passcard.ts";
import {
    decryptPasscardValue,
    encryptPasscardValue
} from "../services/passcard-encryption.ts";

const PROFILE_OPTIONS = [
    { id: 1, label: "Tecnologia" },
    { id: 2, label: "Financeiro" },
    { id: 3, label: "Lojas" },
    { id: 4, label: "Design" },
    { id: 5, label: "Diretoria" },
    { id: 6, label: "Jornalismo" }
] as const;

type PasscardFieldInput = {
    type: string;
    value: string;
    status: number;
    position: number;
};

type PasscardBody = Record<string, unknown>;
type ValidationErrors = Record<string, string>;

function getBody(req: Request): PasscardBody {
    return req.body && typeof req.body === "object"
        ? req.body as PasscardBody
        : {};
}

function parsePasscardId(value: unknown): number | null {
    if (typeof value !== "string") {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parsePage(value: unknown): number {
    if (typeof value !== "string") {
        return 1;
    }

    const page = Number(value);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function parsePerPage(value: unknown): number {
    if (typeof value !== "string") {
        return 20;
    }

    const perPage = Number(value);
    if (!Number.isSafeInteger(perPage)) {
        return 20;
    }

    return Math.min(100, Math.max(10, perPage));
}

function parseNullableInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseStatus(value: unknown, fallback: number | null = null): number | null {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    if (value === 1 || value === "1" || value === true || value === "active" || value === "ativo") {
        return 1;
    }

    if (value === 0 || value === "0" || value === false || value === "inactive" || value === "inativo") {
        return 0;
    }

    return null;
}

function parseStoredGroups(value: unknown): number[] {
    let parsed: unknown = value;

    if (typeof value === "string") {
        try {
            parsed = JSON.parse(value);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return [...new Set(
        parsed
            .map((item) => Number(item))
            .filter((item) => Number.isSafeInteger(item) && PROFILE_OPTIONS.some((profile) => profile.id === item))
    )];
}

function normalizeGroups(value: unknown): number[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    return parseStoredGroups(value);
}

function groupLabels(groups: unknown): string[] {
    const ids = parseStoredGroups(groups);
    return ids.flatMap((id) => {
        const profile = PROFILE_OPTIONS.find((item) => item.id === id);
        return profile ? [profile.label] : [];
    });
}

function normalizeFields(value: unknown): { fields: PasscardFieldInput[]; errors: ValidationErrors } {
    if (!Array.isArray(value)) {
        return {
            fields: [],
            errors: { fields: "Adicione os campos personalizados em uma lista válida." }
        };
    }

    const errors: ValidationErrors = {};
    const fields = value.map((item, index) => {
        const field = item && typeof item === "object"
            ? item as Record<string, unknown>
            : {};
        const type = typeof field.type === "string" ? field.type.trim() : "";
        const rawValue = field.value;
        const fieldValue = rawValue === null || rawValue === undefined ? "" : String(rawValue);
        const status = parseStatus(field.status, 1);

        if (type.length === 0) {
            errors[`fields.${index}.type`] = "Informe o tipo ou rótulo.";
        }

        if (fieldValue.trim().length === 0) {
            errors[`fields.${index}.value`] = "Informe o valor.";
        }

        if (status === null) {
            errors[`fields.${index}.status`] = "Selecione um status válido.";
        }

        return {
            type,
            value: fieldValue,
            status: status ?? 1,
            position: index
        };
    });

    return { fields, errors };
}

function getOptionalText(body: PasscardBody, name: string): string | null {
    if (!(name in body) || body[name] === null || body[name] === undefined) {
        return null;
    }

    return typeof body[name] === "string" ? body[name].trim() : String(body[name]);
}

function validationResponse(res: Response, errors: ValidationErrors) {
    return res.status(422).json({
        error: "Revise os campos destacados.",
        errors
    });
}

async function createFieldRows(
    passcardId: number,
    fields: PasscardFieldInput[],
    transaction: Transaction
): Promise<void> {
    const now = new Date();

    for (const field of fields) {
        const encrypted = encryptPasscardValue(field.value);
        await passcardFields.create({
            date_created: now,
            user_created: null,
            date_updated: now,
            user_updated: null,
            type: field.type,
            value: encrypted.value,
            value_e: encrypted.value_e,
            status: 1,
            field_status: field.status,
            position: field.position,
            passcard_id: passcardId
        }, { transaction });
    }
}

async function serializePasscard(passcard: ReturnType<typeof passcards.build>): Promise<Record<string, unknown>> {
    const passcardValues = passcard.toJSON() as Record<string, unknown>;
    const fields = await passcardFields.findAll({
        where: { passcard_id: passcard.get("id"), status: 1 },
        order: [["position", "ASC"], ["id", "ASC"]]
    });

    return {
        ...passcardValues,
        groupLabels: groupLabels(passcardValues.groups),
        fields: fields.map((field) => {
            const values = field.toJSON() as Record<string, unknown>;
            const decryptedValue = decryptPasscardValue(values.value_e, values.value);
            const {
                value_e: _valueEncrypted,
                field_status: fieldStatus,
                status: _revisionStatus,
                ...publicValues
            } = values;

            return {
                ...publicValues,
                status: Number(fieldStatus ?? 1),
                value: decryptedValue
            };
        })
    };
}

export default class PasscardsController {
    private async getList(query: Request["query"]) {
        const searchTerm = typeof query.q === "string" ? query.q.trim() : "";
        const page = parsePage(query.page);
        const perPage = parsePerPage(query.per_page);
        const where: Record<string | symbol, unknown> = {};

        if (searchTerm.length > 0) {
            where.title = { [Op.like]: `%${searchTerm}%` };
        }

        const { rows, count } = await passcards.findAndCountAll({
            where,
            order: [["title", "ASC"]],
            limit: perPage,
            offset: (page - 1) * perPage
        });

        const data = await Promise.all(rows.map(async (passcard) => {
            const values = passcard.toJSON() as Record<string, unknown>;
            const fieldCount = await passcardFields.count({
                where: { passcard_id: values.id, status: 1 }
            });

            return {
                ...values,
                groupLabels: groupLabels(values.groups),
                fieldCount
            };
        }));

        return {
            data,
            pager: {
                page,
                per_page: perPage,
                total: count,
                page_count: Math.max(1, Math.ceil(count / perPage))
            }
        };
    }

    private async findPassword(id: number): Promise<Record<string, unknown> | null> {
        const passcard = await passcards.findByPk(id);
        return passcard ? serializePasscard(passcard) : null;
    }

    async webIndex(req: Request, res: Response) {
        try {
            const result = await this.getList(req.query);
            return res.render("passcards/list", {
                passcards: result.data,
                pager: result.pager,
                searchTerm: typeof req.query.q === "string" ? req.query.q.trim() : "",
                currentSection: "passcards"
            });
        } catch (error) {
            console.error("Nao foi possivel carregar os passcards.", error);
            return res.status(500).send("Nao foi possivel carregar os passcards.");
        }
    }

    async webCreate(_req: Request, res: Response) {
        return res.render("passcards/form", {
            password: null,
            profileOptions: PROFILE_OPTIONS,
            currentSection: "passcards",
            successMessage: null
        });
    }

    async webEdit(req: Request, res: Response) {
        const id = parsePasscardId(req.params.id);

        if (id === null) {
            return res.status(400).send("Password card not found.");
        }

        try {
            const password = await this.findPassword(id);
            if (!password) {
                return res.status(404).send("Password card not found.");
            }

            return res.render("passcards/form", {
                password,
                profileOptions: PROFILE_OPTIONS,
                currentSection: "passcards",
                successMessage: req.query.saved === "1" ? "Senha salva com sucesso." : null
            });
        } catch (error) {
            console.error("Nao foi possivel carregar o passcard.", error);
            return res.status(500).send("Nao foi possivel carregar o passcard.");
        }
    }

    async webShow(req: Request, res: Response) {
        const id = parsePasscardId(req.params.id);
        if (id === null) {
            return res.status(400).send("Password card not found.");
        }

        return res.redirect(`/passwords/${id}/edit`);
    }

    async list(req: Request, res: Response) {
        try {
            return res.status(200).json(await this.getList(req.query));
        } catch (error) {
            console.error("Nao foi possivel listar os passcards.", error);
            return res.status(500).json({
                error: "Nao foi possivel listar os passcards."
            });
        }
    }

    async show(req: Request, res: Response) {
        const id = parsePasscardId(req.params.id);

        if (id === null) {
            return res.status(404).json({ error: "Password card not found." });
        }

        try {
            const password = await this.findPassword(id);
            return password
                ? res.status(200).json({ password })
                : res.status(404).json({ error: "Password card not found." });
        } catch (error) {
            console.error("Nao foi possivel abrir o passcard.", error);
            return res.status(500).json({
                error: "Nao foi possivel abrir o passcard."
            });
        }
    }

    async store(req: Request, res: Response) {
        const body = getBody(req);
        const errors: ValidationErrors = {};
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const status = parseStatus(body.status, 1);
        const groups = normalizeGroups(body.groups);
        const fieldsResult = "fields" in body
            ? normalizeFields(body.fields)
            : { fields: [], errors: {} };

        if (title.length === 0) {
            errors.title = "Informe o título.";
        } else if (title.length > 255) {
            errors.title = "O título deve ter no máximo 255 caracteres.";
        }

        if (status === null) {
            errors.status = "Selecione um status válido.";
        }

        if (groups === null || groups.length === 0) {
            errors.groups = "Selecione pelo menos um perfil.";
        }

        Object.assign(errors, fieldsResult.errors);

        if (Object.keys(errors).length > 0) {
            return validationResponse(res, errors);
        }

        const now = new Date();
        const transaction = await database.transaction();

        try {
            const passcard = await passcards.create({
                date_created: now,
                user_created: null,
                date_updated: now,
                user_updated: null,
                title,
                status,
                obs: getOptionalText(body, "obs"),
                groups: JSON.stringify(groups),
                user_id: null,
                client_id: parseNullableInteger(body.client_id)
            }, { transaction });

            await createFieldRows(Number(passcard.get("id")), fieldsResult.fields, transaction);
            await transaction.commit();

            const password = await this.findPassword(Number(passcard.get("id")));
            return res.status(201).json({ password });
        } catch (error) {
            await transaction.rollback();
            console.error("Nao foi possivel criar o passcard.", error);
            return res.status(500).json({
                error: "Nao foi possivel criar o passcard."
            });
        }
    }

    async update(req: Request, res: Response) {
        const id = parsePasscardId(req.params.id);

        if (id === null) {
            return res.status(404).json({ error: "Password card not found." });
        }

        const body = getBody(req);
        const passcard = await passcards.findByPk(id);
        if (!passcard) {
            return res.status(404).json({ error: "Password card not found." });
        }

        const errors: ValidationErrors = {};
        const changes: Record<string, unknown> = {
            date_updated: new Date(),
            user_updated: null
        };

        if ("title" in body) {
            const title = typeof body.title === "string" ? body.title.trim() : "";
            if (title.length === 0) {
                errors.title = "Informe o título.";
            } else if (title.length > 255) {
                errors.title = "O título deve ter no máximo 255 caracteres.";
            } else {
                changes.title = title;
            }
        }

        if ("status" in body) {
            const status = parseStatus(body.status);
            if (status === null) {
                errors.status = "Selecione um status válido.";
            } else {
                changes.status = status;
            }
        }

        if ("obs" in body) {
            changes.obs = getOptionalText(body, "obs");
        }

        if ("groups" in body) {
            const groups = normalizeGroups(body.groups);
            if (groups === null || groups.length === 0) {
                errors.groups = "Selecione pelo menos um perfil.";
            } else {
                changes.groups = JSON.stringify(groups);
            }
        }

        let fieldsResult: { fields: PasscardFieldInput[]; errors: ValidationErrors } | null = null;
        if ("fields" in body) {
            fieldsResult = normalizeFields(body.fields);
            Object.assign(errors, fieldsResult.errors);
        }

        if (Object.keys(errors).length > 0) {
            return validationResponse(res, errors);
        }

        const transaction = await database.transaction();

        try {
            await passcard.update(changes, { transaction });

            if (fieldsResult) {
                await passcardFields.update(
                    { status: 0, date_updated: new Date(), user_updated: null },
                    { where: { passcard_id: id, status: 1 }, transaction }
                );
                await createFieldRows(id, fieldsResult.fields, transaction);
            }

            await transaction.commit();
            const password = await this.findPassword(id);
            return res.status(200).json({ password });
        } catch (error) {
            await transaction.rollback();
            console.error("Nao foi possivel atualizar o passcard.", error);
            return res.status(500).json({
                error: "Nao foi possivel atualizar o passcard."
            });
        }
    }

    async destroy(req: Request, res: Response) {
        const id = parsePasscardId(req.params.id);
        if (id === null) {
            return res.status(404).json({ error: "Password card not found." });
        }

        const passcard = await passcards.findByPk(id);
        if (!passcard) {
            return res.status(404).json({ error: "Password card not found." });
        }

        const transaction = await database.transaction();
        try {
            await passcardFields.destroy({ where: { passcard_id: id }, transaction });
            await passcard.destroy({ transaction });
            await transaction.commit();
            return res.status(204).send();
        } catch (error) {
            await transaction.rollback();
            console.error("Nao foi possivel excluir o passcard.", error);
            return res.status(500).json({
                error: "Nao foi possivel excluir o passcard."
            });
        }
    }
}
