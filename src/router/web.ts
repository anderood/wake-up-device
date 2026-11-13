import express from "express";
import HomeController from "../controllers/home.controller.ts";
import PasscardsController from "../controllers/passcards.controller.ts";

const homeController = new HomeController();
const passcardsController = new PasscardsController();

const router = express.Router();

router.get("/", homeController.index);
router.get("/add/create", homeController.create);
router.post("/add", homeController.store);
router.get("/device", homeController.show);
router.get("/device/:id/edit", homeController.edit);
router.post("/device/:id/update", homeController.update);
router.post("/device/:id/wake", homeController.wake);
router.post("/device/:id/ping", homeController.ping);
router.delete("/device/:id", homeController.destroy);
router.get("/passwords", passcardsController.webIndex.bind(passcardsController));
router.get("/passwords/create", passcardsController.webCreate.bind(passcardsController));
router.get("/passwords/:id/edit", passcardsController.webEdit.bind(passcardsController));
router.get("/passwords/:id", passcardsController.webShow.bind(passcardsController));

export default router;
