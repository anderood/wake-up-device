import { execFile } from "node:child_process";
import { isIPv4 } from "node:net";

const activePings = new Map<string, Promise<boolean>>();

export function pingIpv4(ipAddress: string): Promise<boolean> {
    if (!isIPv4(ipAddress)) {
        return Promise.reject(new Error("Endereco IPv4 invalido."));
    }

    const activePing = activePings.get(ipAddress);

    if (activePing) {
        return activePing;
    }

    const ping = new Promise<boolean>((resolve, reject) => {
        execFile("ping", ["-c", "1", "-W", "1", ipAddress], { timeout: 2_000 }, (error) => {
            if (!error) {
                resolve(true);
                return;
            }

            if (error.code === 1 || error.killed) {
                resolve(false);
                return;
            }

            reject(error);
        });
    });

    activePings.set(ipAddress, ping);

    return ping.finally(() => {
        if (activePings.get(ipAddress) === ping) {
            activePings.delete(ipAddress);
        }
    });
}
