import express from "express";
import HomeController from "../controllers/home.controller.ts";
import SettingsController from "../controllers/settings.controller.ts";

const homeController = new HomeController();
const settingsController = new SettingsController();

const router = express.Router();

router.get("/", homeController.index);
router.get("/settings", settingsController.edit);
router.post("/settings", settingsController.update);
router.get("/add/create", homeController.create);
router.post("/add", homeController.store);
router.get("/device", homeController.show);
router.get("/device/:id/edit", homeController.edit);
router.post("/device/:id/update", homeController.update);
router.post("/device/:id/wake", homeController.wake);
router.post("/device/:id/ping", homeController.ping);
router.delete("/device/:id", homeController.destroy);

export default router;
