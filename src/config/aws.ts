import dotenv from "dotenv";

dotenv.config();

function getOptionalEnvironmentValue(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value || undefined;
}

export const awsRegion = getOptionalEnvironmentValue("AWS_REGION") || "us-east-1";
export const schedulerRoleArn = getOptionalEnvironmentValue("AWS_SCHEDULER_ROLE_ARN");
export const schedulerGroupName = getOptionalEnvironmentValue("AWS_SCHEDULER_GROUP_NAME") || "default";
export const schedulerNamePrefix = getOptionalEnvironmentValue("AWS_SCHEDULER_NAME_PREFIX") || "wake-up-device";
