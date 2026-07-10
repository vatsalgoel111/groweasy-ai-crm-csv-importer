import { Router } from "express";
import { CSVController } from "../controllers/csvController.js";

const router = Router();

// GET /api/health
router.get("/health", CSVController.healthCheck);

// POST /api/upload
router.post("/upload", CSVController.uploadCSV);

// POST /api/parse
router.post("/parse", CSVController.parseCSV);

// POST /api/extract
router.post("/extract", CSVController.extractBatch);

export default router;
