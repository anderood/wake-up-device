import type { Request, Response } from "express";
export default class ApiController {

    index(req: Request, res: Response){
        return res.json({
            'message': "Bem vindo ao Controller API"
        });
    }
}