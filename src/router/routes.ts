import express, { type Request, type Response } from "express";
import ApiController from "../controllers/api.controller.ts";

const apiController = new ApiController();

const router = express.Router();

router.get("/", apiController.index);

export default router;