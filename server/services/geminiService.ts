import Groq from "groq-sdk";
import { GoogleGenAI, Type } from "@google/genai";
import { CRMRecord, ExtractionResult } from "../types/crm.js";

// Lazy-initialized Groq client to prevent startup crashes if API key is not set
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// Lazy-initialized Gemini client to prevent startup crashes if API key is not set
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

export class GeminiService {
  /**
   * Normalizes a batch of raw rows into GrowEasy CRM format using Gemini.
   */
  static async normalizeWithGemini(
    batch: Array<{ index: number; data: any }>,
    systemInstruction: string
  ): Promise<any[]> {
    const client = getGeminiClient();
    const prompt = `Analyze and normalize the following batch of raw lead records:\n${JSON.stringify(batch, null, 2)}`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  status: { type: Type.STRING },
                  error: { type: Type.STRING },
                  normalized: {
                    type: Type.OBJECT,
                    properties: {
                      created_at: { type: Type.STRING },
                      name: { type: Type.STRING },
                      email: { type: Type.STRING },
                      country_code: { type: Type.STRING },
                      mobile_without_country_code: { type: Type.STRING },
                      company: { type: Type.STRING },
                      city: { type: Type.STRING },
                      state: { type: Type.STRING },
                      country: { type: Type.STRING },
                      lead_owner: { type: Type.STRING },
                      crm_status: { type: Type.STRING },
                      crm_note: { type: Type.STRING },
                      data_source: { type: Type.STRING },
                      possession_time: { type: Type.STRING },
                      description: { type: Type.STRING },
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response received from Gemini API");
    }

    let cleanedText = responseText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(cleanedText);
    if (parsed && Array.isArray(parsed.results)) {
      return parsed.results;
    } else if (Array.isArray(parsed)) {
      return parsed;
    } else {
      throw new Error("Gemini response does not contain a valid results array or array of objects");
    }
  }

  /**
   * Normalizes a batch of raw rows into GrowEasy CRM format using Groq. Falls back to Gemini on error.
   */
  static async normalizeBatch(
    batch: Array<{ index: number; data: any }>
  ): Promise<ExtractionResult[]> {
    const systemInstruction = `You are an expert CRM data ingestion and normalization engine for GrowEasy.
Your task is to analyze an array of raw, unmapped CSV rows and map/normalize their fields into the standard GrowEasy CRM format.

Output MUST be a single valid JSON object containing a "results" key whose value is an array of objects matching the schema below.

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

Expected Output JSON Schema:
{
  "results": [
    {
      "index": number, // the original index parameter from the input batch
      "status": "success" | "skipped",
      "error": string | null, // Reason for skipping or mapping details if any
      "normalized": { // The fully mapped GrowEasy CRM object. Set to null if status is skipped.
        "created_at": string | null,
        "name": string | null,
        "email": string | null,
        "country_code": string | null, // Country code (e.g., +91 or +1) parsed from phone
        "mobile_without_country_code": string | null, // Mobile number excluding country code
        "company": string | null,
        "city": string | null,
        "state": string | null,
        "country": string | null,
        "lead_owner": string | null,
        "crm_status": "GOOD_LEAD_FOLLOW_UP" | "DID_NOT_CONNECT" | "BAD_LEAD" | "SALE_DONE" | null,
        "crm_note": string | null,
        "data_source": "leads_on_demand" | "meridian_tower" | "eden_park" | "varah_swamy" | "sarjapur_plots" | null,
        "possession_time": string | null,
        "description": string | null
      }
    }
  ]
}`;

    let results: any[] | null = null;
    let usedModel = "llama-3.3-70b-versatile";
    let isFallback = false;

    try {
      if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY environment variable is not set");
      }
      const client = getGroqClient();

      const response = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: systemInstruction,
          },
          {
            role: "user",
            content: `Analyze and normalize the following batch of raw lead records:\n${JSON.stringify(batch, null, 2)}`
          }
        ],
        temperature: 0.1, // low temperature for highly deterministic mapping
        response_format: { type: "json_object" }
      });

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error("Empty response received from Groq API");
      }

      try {
        let cleanedText = responseText.trim();
        if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }
        const parsed = JSON.parse(cleanedText);
        if (parsed && Array.isArray(parsed.results)) {
          results = parsed.results;
        } else if (Array.isArray(parsed)) {
          results = parsed;
        } else {
          throw new Error("Groq response does not contain a valid results array or array of objects");
        }
      } catch (parseError: any) {
        console.error(`[Groq Parsing Error] Failed to parse response text as JSON:`, parseError);
        console.error(`Raw response text was:`, responseText);
        throw new Error(`Failed to parse AI response as valid JSON: ${parseError.message}`);
      }
    } catch (error: any) {
      const httpStatus = error.status || error.statusCode || error.response?.status || "N/A";
      const errMsg = error.message || String(error);
      const batchRowsCount = batch.length;
      const batchIndices = batch.map(b => b.index);

      console.warn(`[Groq API Failed]
- HTTP Status: ${httpStatus}
- Error Message: ${errMsg}
- Batch Size: ${batchRowsCount} rows
- Batch Indices: [${batchIndices.join(", ")}]
- Attempting seamless fallback to Google Gemini (gemini-3.5-flash)...
`);

      try {
        isFallback = true;
        usedModel = "gemini-3.5-flash";
        results = await this.normalizeWithGemini(batch, systemInstruction);
        console.log(`[Gemini Fallback Success] Successfully processed batch of ${batchRowsCount} using Gemini fallback!`);
      } catch (geminiError: any) {
        console.error(`[Gemini Fallback Failed] Both Groq and Gemini fallback failed:`, geminiError);
        // Fallback: return failed state for all items in batch so they can be retried or continued gracefully
        return batch.map(inputItem => ({
          index: inputItem.index,
          original: inputItem.data,
          normalized: null,
          status: 'failed',
          error: `AI processing failed (both Groq and Gemini failed): ${geminiError.message || geminiError}`
        }));
      }
    }

    // Parse, validate, and structure the return values
    return batch.map(inputItem => {
      const matchingResult = results!.find((r: any) => r.index === inputItem.index);
      
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
  }
}
