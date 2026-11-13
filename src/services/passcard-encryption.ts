import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey(): Buffer | null {
    const configuredKey = process.env.PASSCARD_ENCRYPTION_KEY?.trim();
    return configuredKey ? createHash("sha256").update(configuredKey).digest() : null;
}

export function encryptPasscardValue(value: string): { value: string; value_e: string | null } {
    const key = getKey();

    if (!key) {
        return { value, value_e: null };
    }

    try {
        const iv = randomBytes(12);
        const cipher = createCipheriv(algorithm, key, iv);
        const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");

        return { value: "", value_e: payload };
    } catch (error) {
        console.error("Nao foi possivel criptografar o valor do passcard.", error);
        return { value, value_e: null };
    }
}

export function decryptPasscardValue(valueEncrypted: unknown, legacyValue: unknown): string {
    if (typeof valueEncrypted !== "string" || valueEncrypted.length === 0) {
        return typeof legacyValue === "string" ? legacyValue : "";
    }

    const key = getKey();
    if (!key) {
        return "";
    }

    try {
        const payload = Buffer.from(valueEncrypted, "base64");
        const iv = payload.subarray(0, 12);
        const authTag = payload.subarray(12, 28);
        const encrypted = payload.subarray(28);
        const decipher = createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch (error) {
        console.error("Nao foi possivel descriptografar um valor de passcard.", error);
        return "";
    }
}
