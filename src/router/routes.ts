import express, { type Request, type Response } from "express";
import ApiController from "../controllers/api.controller.ts";
import PasscardsController from "../controllers/passcards.controller.ts";

const apiController = new ApiController();
const passcardsController = new PasscardsController();

const router = express.Router();

router.get("/", apiController.index);
router.get("/passwords", passcardsController.list.bind(passcardsController));
router.get("/passwords/:id", passcardsController.show.bind(passcardsController));
router.post("/passwords", passcardsController.store.bind(passcardsController));
router.patch("/passwords/:id", passcardsController.update.bind(passcardsController));
router.put("/passwords/:id", passcardsController.update.bind(passcardsController));
router.delete("/passwords/:id", passcardsController.destroy.bind(passcardsController));

export default router;
