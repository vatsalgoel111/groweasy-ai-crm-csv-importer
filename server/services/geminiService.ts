import { GoogleGenAI, Type } from "@google/genai";
import { CRMRecord, ExtractionResult } from "../types/crm.js";

// Lazy-initialized Gemini client to prevent startup crashes if API key is not set
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export class GeminiService {
  /**
   * Normalizes a batch of raw rows into GrowEasy CRM format using Gemini.
   */
  static async normalizeBatch(
    batch: Array<{ index: number; data: any }>
  ): Promise<ExtractionResult[]> {
    try {
      const client = getAiClient();

      const systemInstruction = `You are an expert CRM data ingestion and normalization engine for GrowEasy.
Your task is to analyze an array of raw, unmapped CSV rows and map/normalize their fields into the standard GrowEasy CRM format.

Follow these strict rules:
1. CRM Status:
   Only use one of the following exact strings:
   - GOOD_LEAD_FOLLOW_UP
   - DID_NOT_CONNECT
   - BAD_LEAD
   - SALE_DONE
   If none match confidently, leave it null.

2. Data Source:
   Only use one of the following exact strings:
   - leads_on_demand
   - meridian_tower
   - eden_park
   - varah_swamy
   - sarjapur_plots
   If none match confidently, leave it null.

3. Date Format:
   created_at must be convertible using JavaScript "new Date(created_at)".
   Normalize it to a standardized ISO 8601 string or readable YYYY-MM-DD HH:mm:ss format.

4. CRM Notes (crm_note):
   Use crm_note to aggregate:
   - Remarks
   - Follow-up notes
   - Additional comments
   - Extra phone numbers (if multiple exist)
   - Extra email addresses (if multiple exist)
   - Any useful information that doesn't fit another field.

5. Multiple Emails or Mobile Numbers:
   - If multiple email addresses are present: use the first email for the email field, and append the remaining emails into crm_note.
   - If multiple mobile numbers are present: use the first mobile for the mobile_without_country_code field, and append the remaining numbers into crm_note.

6. Missing/Unknown Fields:
   - Never hallucinate values. If a field is not present or cannot be determined, set it to null.

7. Invalid/Skip Criteria:
   - If a record contains NEITHER a valid email nor a mobile number, mark its status as "skipped" and set normalized to null. Otherwise, status should be "success".

Return a JSON array of objects, each containing:
- index: the original index from the input.
- normalized: the normalized CRM object, or null if skipped.
- status: "success" or "skipped".
- error: null or error details if skipped/failed.`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Analyze and normalize the following batch of raw lead records:
${JSON.stringify(batch, null, 2)}`
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.1, // low temperature for highly deterministic mapping
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Array of normalized results",
            items: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER, description: "The original index parameter from the input batch" },
                status: { type: Type.STRING, enum: ["success", "skipped"], description: "Normalization status" },
                error: { type: Type.STRING, description: "Reason for skipping or mapping details if any" },
                normalized: {
                  type: Type.OBJECT,
                  description: "The fully mapped GrowEasy CRM object. Set to null if status is skipped.",
                  properties: {
                    created_at: { type: Type.STRING, description: "Normalized lead creation date. Must be JS convertible." },
                    name: { type: Type.STRING, description: "Cleaned full name of the lead" },
                    email: { type: Type.STRING, description: "First valid primary email found" },
                    country_code: { type: Type.STRING, description: "Country code (e.g., +91 or +1) parsed from phone" },
                    mobile_without_country_code: { type: Type.STRING, description: "Mobile number excluding country code" },
                    company: { type: Type.STRING, description: "Cleaned company name" },
                    city: { type: Type.STRING, description: "Cleaned city name" },
                    state: { type: Type.STRING, description: "Cleaned state name" },
                    country: { type: Type.STRING, description: "Cleaned country name" },
                    lead_owner: { type: Type.STRING, description: "Assigned lead owner" },
                    crm_status: { 
                      type: Type.STRING, 
                      enum: ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE", ""],
                      description: "Normalized lead status. Strictly maps to specified list or null."
                    },
                    crm_note: { type: Type.STRING, description: "Merged notes, secondary contact details, remarks, and overflow data" },
                    data_source: { 
                      type: Type.STRING, 
                      enum: ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots", ""],
                      description: "Normalized lead data source. Strictly maps to specified list or null."
                    },
                    possession_time: { type: Type.STRING, description: "Property possession time or timeline" },
                    description: { type: Type.STRING, description: "Any fallback description or raw row summary" }
                  }
                }
              },
              required: ["index", "status"]
            }
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response received from Gemini API");
      }

      const results = JSON.parse(responseText);
      
      // Parse, validate, and structure the return values
      return batch.map(inputItem => {
        const matchingResult = results.find((r: any) => r.index === inputItem.index);
        
        if (!matchingResult) {
          return {
            index: inputItem.index,
            original: inputItem.data,
            normalized: null,
            status: 'failed',
            error: 'AI did not return normalization for this item'
          };
        }

        // Clean empty strings to null for enum fields
        if (matchingResult.normalized) {
          if (matchingResult.normalized.crm_status === "") {
            matchingResult.normalized.crm_status = null;
          }
          if (matchingResult.normalized.data_source === "") {
            matchingResult.normalized.data_source = null;
          }

          // Pre-validation checking the email/mobile number presence rule
          const hasEmail = !!matchingResult.normalized.email;
          const hasMobile = !!matchingResult.normalized.mobile_without_country_code;
          if (!hasEmail && !hasMobile) {
            return {
              index: inputItem.index,
              original: inputItem.data,
              normalized: null,
              status: 'skipped',
              error: 'Missing both email and mobile number'
            };
          }
        }

        return {
          index: inputItem.index,
          original: inputItem.data,
          normalized: matchingResult.normalized || null,
          status: matchingResult.status === 'skipped' ? 'skipped' : 'success',
          error: matchingResult.error || undefined
        };
      });

    } catch (error: any) {
      console.error("Error during Gemini processing batch:", error);
      // Fallback: return failed state for all items in batch so they can be retried
      return batch.map(inputItem => ({
        index: inputItem.index,
        original: inputItem.data,
        normalized: null,
        status: 'failed',
        error: error.message || 'Unknown processing error'
      }));
    }
  }
}
