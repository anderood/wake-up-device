import { DataTypes, literal } from "sequelize";
import type { Migration } from "../migrate.ts";

const tables = ["ec2_run", "ec2_transition", "ec2_schedule", "ec2_config", "auth_session"];

async function addCheck(
    context: Parameters<Migration>[0]["context"],
    tableName: string,
    name: string,
    fields: string[],
    where: string
): Promise<void> {
    await context.addConstraint(tableName, {
        type: "check",
        name,
        fields,
        where: literal(where)
    });
}

export const up: Migration = async ({ context }) => {
    const existing = await context.showAllTables();

    if (!existing.includes("auth_session")) {
        await context.createTable("auth_session", {
            sid: { type: DataTypes.STRING(128), primaryKey: true, allowNull: false },
            issuer: { type: DataTypes.STRING(512), allowNull: false },
            subject: { type: DataTypes.STRING(512), allowNull: false },
            data: { type: DataTypes.TEXT, allowNull: false },
            created_at: { type: DataTypes.STRING(40), allowNull: false },
            last_access_at: { type: DataTypes.STRING(40), allowNull: false },
            expires_at: { type: DataTypes.STRING(40), allowNull: false }
        });
    }

    if (!existing.includes("ec2_config")) {
        await context.createTable("ec2_config", {
            id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
            instance_id: { type: DataTypes.STRING(19), allowNull: false },
            region: { type: DataTypes.STRING(32), allowNull: false },
            timezone: { type: DataTypes.STRING(64), allowNull: false },
            recovery_enabled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            scheduler_cursor_utc: { type: DataTypes.TEXT, allowNull: true },
            revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            updated_at: { type: DataTypes.STRING(40), allowNull: false }
        });
    }

    if (!existing.includes("ec2_transition")) {
        await context.createTable("ec2_transition", {
            instance_id: { type: DataTypes.STRING(19), primaryKey: true, allowNull: false },
            state: { type: DataTypes.STRING(32), allowNull: false },
            run_id: { type: DataTypes.INTEGER, allowNull: false },
            updated_at: { type: DataTypes.STRING(40), allowNull: false }
        });
    }

    if (!existing.includes("ec2_schedule")) {
        await context.createTable("ec2_schedule", {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
            action: { type: DataTypes.STRING(10), allowNull: false },
            weekday: { type: DataTypes.INTEGER, allowNull: false },
            local_time: { type: DataTypes.STRING(5), allowNull: false },
            enabled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            updated_at: { type: DataTypes.STRING(40), allowNull: false }
        });
    }

    if (!existing.includes("ec2_run")) {
        await context.createTable("ec2_run", {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
            idempotency_key: { type: DataTypes.STRING(255), allowNull: false },
            occurrence_key: { type: DataTypes.STRING(255), allowNull: true },
            source: { type: DataTypes.STRING(16), allowNull: false },
            mode: { type: DataTypes.STRING(16), allowNull: false },
            action: { type: DataTypes.STRING(16), allowNull: false },
            instance_id: { type: DataTypes.STRING(19), allowNull: false },
            region: { type: DataTypes.STRING(32), allowNull: false },
            config_revision: { type: DataTypes.INTEGER, allowNull: false },
            schedule_id: { type: DataTypes.INTEGER, allowNull: true },
            scheduled_date: { type: DataTypes.STRING(10), allowNull: true },
            scheduled_time: { type: DataTypes.STRING(5), allowNull: true },
            scheduled_at_utc: { type: DataTypes.STRING(40), allowNull: true },
            schedule_revision: { type: DataTypes.INTEGER, allowNull: true },
            actor_issuer: { type: DataTypes.STRING(512), allowNull: true },
            actor_subject: { type: DataTypes.STRING(512), allowNull: true },
            reconciles_run_id: { type: DataTypes.INTEGER, allowNull: true },
            status: { type: DataTypes.STRING(32), allowNull: false },
            claim_token: { type: DataTypes.STRING(128), allowNull: true },
            requested_at: { type: DataTypes.STRING(40), allowNull: false },
            started_at: { type: DataTypes.STRING(40), allowNull: true },
            finished_at: { type: DataTypes.STRING(40), allowNull: true },
            observed_state: { type: DataTypes.STRING(32), allowNull: true },
            result: { type: DataTypes.TEXT, allowNull: true },
            error_code: { type: DataTypes.STRING(32), allowNull: true },
            error_message: { type: DataTypes.TEXT, allowNull: true }
        });
    }

    await context.addIndex("ec2_schedule", ["action", "weekday"], {
        name: "ec2_schedule_action_weekday_unique",
        unique: true
    });
    await context.addIndex("ec2_run", ["idempotency_key"], {
        name: "ec2_run_idempotency_key_unique",
        unique: true
    });
    await context.addIndex("ec2_run", ["occurrence_key"], {
        name: "ec2_run_occurrence_key_unique",
        unique: true
    });
    await context.addIndex("ec2_run", ["instance_id"], {
        name: "ec2_run_real_running_unique",
        unique: true,
        where: { mode: "real", status: "running" }
    });
    await context.addIndex("ec2_run", ["status", "requested_at"], {
        name: "ec2_run_queue_order"
    });

    await addCheck(context, "ec2_config", "ec2_config_id_singleton", ["id"], "id = 1");
    await addCheck(context, "ec2_config", "ec2_config_timezone", ["timezone"], "timezone = 'America/Sao_Paulo'");
    await addCheck(context, "ec2_config", "ec2_config_recovery", ["recovery_enabled"], "recovery_enabled IN (0, 1)");
    await addCheck(context, "ec2_transition", "ec2_transition_state", ["state"], "state IN ('active', 'needs_reconciliation')");
    await addCheck(context, "ec2_schedule", "ec2_schedule_action", ["action"], "action IN ('start', 'stop')");
    await addCheck(context, "ec2_schedule", "ec2_schedule_weekday", ["weekday"], "weekday BETWEEN 1 AND 7");
    await addCheck(context, "ec2_schedule", "ec2_schedule_time", ["local_time"], "local_time >= '00:00' AND local_time <= '23:59' AND local_time GLOB '[0-2][0-9]:[0-5][0-9]'");
    await addCheck(context, "ec2_schedule", "ec2_schedule_enabled", ["enabled"], "enabled IN (0, 1)");
    await addCheck(context, "ec2_run", "ec2_run_source", ["source"], "source IN ('automatic', 'manual')");
    await addCheck(context, "ec2_run", "ec2_run_mode", ["mode"], "mode IN ('real', 'simulation')");
    await addCheck(context, "ec2_run", "ec2_run_action", ["action"], "action IN ('start', 'stop', 'inspect')");
    await addCheck(context, "ec2_run", "ec2_run_status", ["status"], "status IN ('queued', 'running', 'requested', 'observed', 'noop', 'skipped', 'simulated', 'failed', 'interrupted', 'unknown', 'conflict')");
    await addCheck(context, "ec2_run", "ec2_run_error_code", ["error_code"], "error_code IS NULL OR error_code IN ('network', 'auth', 'permission', 'not_found', 'throttled', 'timeout', 'unknown')");
};

export const down: Migration = async ({ context }) => {
    const existing = await context.showAllTables();

    for (const table of tables) {
        if (existing.includes(table)) {
            await context.dropTable(table);
        }
    }
};
