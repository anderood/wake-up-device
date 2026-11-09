import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

type RegionCatalog = Record<string, string[]>;

const defaultCatalogPath = fileURLToPath(new URL("../../config/aws-ec2-regions.json", import.meta.url));
const catalogPath = process.env.AWS_REGION_FILE?.trim()
    ? resolve(process.env.AWS_REGION_FILE)
    : defaultCatalogPath;
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as RegionCatalog;
const regions = new Map<string, string>();

for (const [partition, names] of Object.entries(catalog)) {
    for (const name of names) {
        regions.set(name, partition);
    }
}

export function getAwsRegionPartition(region: string): string | null {
    return regions.get(region.trim()) ?? null;
}

export function isSupportedAwsRegion(region: string): boolean {
    return getAwsRegionPartition(region) !== null;
}

export function supportedAwsRegions(): string[] {
    return [...regions.keys()].sort();
}
