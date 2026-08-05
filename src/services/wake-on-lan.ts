import { createRequire } from "node:module";
import { isIPv4 } from "node:net";

type WakeOptions = {
    address: string;
};

type WakeOnLanModule = {
    wake: (
        macAddress: string,
        options: WakeOptions,
        callback: (error?: Error | null) => void
    ) => void;
};

const require = createRequire(import.meta.url);
const wakeOnLan = require("wake_on_lan") as WakeOnLanModule;

export function wakeDevice(macAddress: string): Promise<void> {
    const broadcastAddress = process.env.WOL_BROADCAST_ADDRESS ?? "255.255.255.255";

    if (!isIPv4(broadcastAddress)) {
        return Promise.reject(new Error("WOL_BROADCAST_ADDRESS deve ser um endereco IPv4 valido."));
    }

    return new Promise((resolve, reject) => {
        try {
            wakeOnLan.wake(macAddress, { address: broadcastAddress }, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}
