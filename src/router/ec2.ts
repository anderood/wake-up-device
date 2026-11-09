import express from "express";
import { csrfSynchronisedProtection } from "../auth/csrf.ts";
import { requireAuthentication } from "../auth/oidc.ts";
import {
    deleteSchedule,
    enqueueAction,
    index,
    runs,
    saveConfig,
    saveSchedule,
    status
} from "../controllers/ec2.controller.ts";

const router = express.Router();

router.use(requireAuthentication);
router.get("/", index);
router.get("/runs", runs);
router.get("/status", status);
router.post("/config", csrfSynchronisedProtection, saveConfig);
router.post("/schedules", csrfSynchronisedProtection, saveSchedule);
router.post("/schedules/:id/delete", csrfSynchronisedProtection, deleteSchedule);
router.post("/actions", csrfSynchronisedProtection, enqueueAction);
router.post("/actions/:action", csrfSynchronisedProtection, enqueueAction);
router.post("/status/refresh", csrfSynchronisedProtection, (req, res, next) => {
    req.body.action = "inspect";
    next();
}, enqueueAction);

export default router;
