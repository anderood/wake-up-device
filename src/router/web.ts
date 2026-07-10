import express, { type Request, type Response } from "express";
import HomeController from "../controllers/home.controller.ts";

const homeController = new HomeController();

const router = express.Router();

router.get("/", homeController.index);
router.get("/add/create", homeController.create);
router.post("/add", homeController.store);
router.get("/device", homeController.show);
router.get("/device/:id/edit", homeController.edit);
router.put("/device/:id/update", homeController.update);
router.delete("/device/:id", homeController.destroy);

export default router;