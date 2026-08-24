import type { Request, Response } from "express";
import { isIPv4 } from "node:net";
import appSettings from "../models/app-setting.ts";

type SettingsFormValues = {
    externalIpAddress: string;
};

function getSettingsFormValues(req: Request): SettingsFormValues {
    const body = req.body && typeof req.body === "object"
        ? req.body as Record<string, unknown>
        : {};
    const externalIpAddress = body.externalIpAddress;

    return {
        externalIpAddress: typeof externalIpAddress === "string"
            ? externalIpAddress.trim()
            : ""
    };
}

export default class SettingsController {
    async edit(req: Request, res: Response) {
        try {
            const settings = await appSettings.findByPk(1, {
                attributes: ["external_ip_address"]
            });

            return res.render("settings/index", {
                error: null,
                updated: req.query.updated === "1",
                values: {
                    externalIpAddress: String(settings?.get("external_ip_address") ?? "")
                }
            });
        } catch (error) {
            console.error("Nao foi possivel carregar as configuracoes.", error);
            return res.status(500).send("Nao foi possivel carregar as configuracoes.");
        }
    }

    async update(req: Request, res: Response) {
        const values = getSettingsFormValues(req);
        const renderError = (error: string, status = 422) => res.status(status).render("settings/index", {
            error,
            updated: false,
            values
        });

        if (values.externalIpAddress.length === 0) {
            return renderError("Informe o endereco IPv4 externo.");
        }

        if (!isIPv4(values.externalIpAddress)) {
            return renderError("Informe um endereco IPv4 valido, como 100.20.10.123.");
        }

        try {
            await appSettings.upsert({
                id: 1,
                external_ip_address: values.externalIpAddress
            });
        } catch (error) {
            console.error("Nao foi possivel salvar as configuracoes.", error);
            return renderError("Nao foi possivel salvar as configuracoes. Tente novamente.", 500);
        }

        return res.redirect("/settings?updated=1");
    }
}
