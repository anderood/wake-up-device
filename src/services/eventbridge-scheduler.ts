import {
    DescribeInstancesCommand,
    EC2Client
} from "@aws-sdk/client-ec2";
import {
    CreateScheduleCommand,
    DeleteScheduleCommand,
    GetScheduleCommand,
    SchedulerClient,
    UpdateScheduleCommand,
    type FlexibleTimeWindow,
    type ScheduleState,
    type Target
} from "@aws-sdk/client-scheduler";
import {
    schedulerGroupName,
    schedulerNamePrefix,
    schedulerRoleArn
} from "../config/aws.ts";

export type ScheduleAction = "start" | "stop";

type ScheduleInput = {
    deviceId: number;
    scheduleId: number;
    action: ScheduleAction;
    expression: string;
    timezone: string;
    enabled: boolean;
    instanceId: string;
    region: string;
    schedulerName?: string | null;
    schedulerArn?: string | null;
};

type ScheduleResult = {
    schedulerName: string;
    schedulerArn: string | null;
};

const flexibleTimeWindow: FlexibleTimeWindow = { Mode: "OFF" };

function assertSchedulerRoleArn(): string {
    if (!schedulerRoleArn) {
        throw new Error("AWS_SCHEDULER_ROLE_ARN nao foi configurada.");
    }

    return schedulerRoleArn;
}

function getScheduleName(deviceId: number, scheduleId: number): string {
    const name = `${schedulerNamePrefix}-device-${deviceId}-schedule-${scheduleId}`;
    return name.replace(/[^a-zA-Z0-9-_.]/g, "-").slice(0, 64);
}

function getTarget(action: ScheduleAction, instanceId: string): Target {
    return {
        Arn: `arn:aws:scheduler:::aws-sdk:ec2:${action === "start" ? "startInstances" : "stopInstances"}`,
        RoleArn: assertSchedulerRoleArn(),
        Input: JSON.stringify({ InstanceIds: [instanceId] })
    };
}

function getScheduleProperties(input: ScheduleInput) {
    return {
        GroupName: schedulerGroupName,
        ScheduleExpression: input.expression,
        ScheduleExpressionTimezone: input.timezone,
        FlexibleTimeWindow: flexibleTimeWindow,
        State: (input.enabled ? "ENABLED" : "DISABLED") as ScheduleState,
        Target: getTarget(input.action, input.instanceId)
    };
}

function isMissingResource(error: unknown): boolean {
    return error instanceof Error && error.name === "ResourceNotFoundException";
}

export async function validateEc2Instance(instanceId: string, region: string): Promise<void> {
    const client = new EC2Client({ region });
    const result = await client.send(new DescribeInstancesCommand({
        InstanceIds: [instanceId]
    }));
    const instance = result.Reservations?.flatMap((reservation) => reservation.Instances ?? [])
        .find((candidate) => candidate.InstanceId === instanceId);

    if (!instance) {
        throw new Error("A instancia EC2 nao foi encontrada na regiao informada.");
    }
}

export async function upsertEc2Schedule(input: ScheduleInput): Promise<ScheduleResult> {
    const client = new SchedulerClient({ region: input.region });
    const schedulerName = input.schedulerName || getScheduleName(input.deviceId, input.scheduleId);
    const properties = getScheduleProperties(input);

    if (input.schedulerName) {
        try {
            await client.send(new GetScheduleCommand({
                Name: schedulerName,
                GroupName: schedulerGroupName
            }));

            await client.send(new UpdateScheduleCommand({
                Name: schedulerName,
                ...properties
            }));

            return {
                schedulerName,
                schedulerArn: input.schedulerArn || null
            };
        } catch (error) {
            if (!isMissingResource(error)) {
                throw error;
            }
        }
    }

    const result = await client.send(new CreateScheduleCommand({
        Name: schedulerName,
        ...properties
    }));

    return {
        schedulerName,
        schedulerArn: result.ScheduleArn || input.schedulerArn || null
    };
}

export async function deleteEc2Schedule(
    schedulerName: string,
    region: string
): Promise<void> {
    const client = new SchedulerClient({ region });

    try {
        await client.send(new DeleteScheduleCommand({
            Name: schedulerName,
            GroupName: schedulerGroupName
        }));
    } catch (error) {
        if (!isMissingResource(error)) {
            throw error;
        }
    }
}
