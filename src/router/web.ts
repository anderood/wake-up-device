import express from "express";
import HomeController from "../controllers/home.controller.ts";
import ScheduleController from "../controllers/schedule.controller.ts";

const homeController = new HomeController();
const scheduleController = new ScheduleController();

const router = express.Router();

router.get("/", homeController.index);
router.get("/ec2", homeController.ec2);
router.get("/add/create", homeController.create);
router.post("/add", homeController.store);
router.get("/device", homeController.show);
router.get("/device/:id/edit", homeController.edit);
router.post("/device/:id/update", homeController.update);
router.post("/device/:id/wake", homeController.wake);
router.post("/device/:id/ping", homeController.ping);
router.delete("/device/:id", homeController.destroy);
router.get("/device/:id/schedules", scheduleController.index);
router.post("/device/:id/schedules", scheduleController.store);
router.post("/device/:id/schedules/:scheduleId/update", scheduleController.update);
router.post("/device/:id/schedules/:scheduleId/toggle", scheduleController.toggle);
router.delete("/device/:id/schedules/:scheduleId", scheduleController.destroy);

export default router;
