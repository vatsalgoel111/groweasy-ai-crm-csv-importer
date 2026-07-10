import { Request, Response } from "express";
import Papa from "papaparse";
import { GeminiService } from "../services/geminiService.js";

export class CSVController {
  /**
   * GET /api/health
   * Simple health check for the backend API
   */
  static healthCheck(req: Request, res: Response) {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "AI CRM CSV Importer Backend"
    });
  }

  /**
   * POST /api/parse
   * Accepts raw CSV text and parses it into JSON rows
   */
  static parseCSV(req: Request, res: Response) {
    try {
      const csvText = req.body.csvText || req.body;
      
      if (!csvText || typeof csvText !== "string") {
        return res.status(400).json({
          error: "Invalid input. Please provide raw CSV text in the request body."
        });
      }

      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
      });

      if (parsed.errors && parsed.errors.length > 0) {
        console.warn("PapaParse warnings/errors:", parsed.errors);
      }

      const headers = parsed.meta.fields || [];
      const rows = parsed.data || [];

      return res.status(200).json({
        success: true,
        headers,
        rowCount: rows.length,
        rows: (rows as any[]).map((row, idx) => ({
          _originalIndex: idx,
          ...(row as Record<string, any>)
        }))
      });
    } catch (error: any) {
      console.error("Error parsing CSV:", error);
      return res.status(500).json({
        error: "Failed to parse CSV: " + error.message
      });
    }
  }

  /**
   * POST /api/upload
   * Same as parse, but handles both file content or standard text content.
   */
  static uploadCSV(req: Request, res: Response) {
    // We route this to parseCSV to ensure maximum compatibility with different client-side approaches
    return CSVController.parseCSV(req, res);
  }

  /**
   * POST /api/extract
   * Normalizes a batch of CSV rows using the Gemini AI service.
   * Expected payload: { batch: [{ index: number, data: any }] }
   */
  static async extractBatch(req: Request, res: Response) {
    try {
      const { batch } = req.body;

      if (!batch || !Array.isArray(batch)) {
        return res.status(400).json({
          error: "Invalid input. Expected an array of records in the 'batch' parameter."
        });
      }

      if (batch.length === 0) {
        return res.status(200).json({
          success: true,
          results: []
        });
      }

      // Format input for the Gemini service
      const itemsToNormalize = batch.map((item: any) => ({
        index: typeof item.index === "number" ? item.index : item._originalIndex,
        data: item.data || item
      }));

      // Call Gemini AI service
      const results = await GeminiService.normalizeBatch(itemsToNormalize);

      return res.status(200).json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error("Error in AI extraction:", error);
      return res.status(500).json({
        error: "AI Extraction failed: " + error.message
      });
    }
  }
}
