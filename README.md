# GrowEasy AI — CRM CSV Importer 🚀

An intelligent, production-grade, AI-powered CSV Ingestion Pipeline built to map, clean, and normalize CRM lead datasets from any valid format (Facebook Lead exports, Google Ads tables, manually created Excel spreadsheets, etc.) into the standardized GrowEasy CRM schema.

This project is structured as a full-stack Node.js + Express + React (Vite) application following strict SOLID design principles and internship-level submission guidelines.

---

## 🎨 Visual Themes & Design
This application utilizes the **Professional Polish** design language:
- **Workspace Canvas**: Light gray `#f8fafc` background with elegant white cards.
- **Visual Focus & Contrast**: Deep Slate sidebar background (`#0f172a`) paired with Indigo accents (`#6366f1`) and high-contrast status badges.
- **Responsive Layout**: Designed mobile-first but optimized for desktop-first precision, using a grid/flex container pattern to prevent content stretching on ultra-wide screens.

---

## 📁 Project Folder Structure

```
├── server.ts                    # Full-Stack entry point (express server + dev Vite middleware)
├── server/                      # Backend Architecture
│   ├── controllers/
│   │   └── csvController.ts     # Request validation & PapaParse coordination
│   ├── routes/
│   │   └── api.ts               # Router mapping GET /health, POST /parse, POST /extract
│   ├── services/
│   │   └── geminiService.ts     # Google GenAI SDK integration with responseSchema mapping
│   └── types/
│       └── crm.ts               # Shared CRM Lead and Extraction type definitions
├── src/                         # Frontend Application (React SPA)
│   ├── App.tsx                  # Main multi-step dashboard UI with dynamic batching pipeline
│   ├── index.css                # Tailwind CSS global styles
│   ├── main.tsx                 # Client react-dom mounter
│   └── index.html               # Main page index frame
├── package.json                 # Dependency management and execution scripts
├── tsconfig.json                # TypeScript configuration
└── vite.config.ts               # Vite bundler, alias, and dev proxy setups
```

---

## 🛠️ Tech Stack & Key Libraries

### Frontend
- **React 19 & TypeScript 5** — For scalable, type-safe rendering.
- **Tailwind CSS v4** — Modern utility framework for styling.
- **PapaParse** — Client-side fast CSV parsing and formatting (unparsing).
- **Lucide React** — For high-fidelity icon pairings.
- **Axios** — High-performance HTTP client for backend endpoints.

### Backend & AI
- **Node.js & Express** — Lightweight and performant web server.
- **@google/genai (v2.4.0)** — Modern, official Google SDK to query **Gemini 3.5 Flash** for deterministic structured normalizations.
- **TSX & ESBuild** — Native TypeScript runtime runner and fast bundler.

---

## 🤖 AI Normalization & Business Rules

Our pipeline leverages the **Gemini 3.5 Flash** model using strict JSON schema controls (`responseMimeType: "application/json"` with schema validations). This prevents hallucinations and enforces the following business logic:

1. **Allowed CRM Status Values**:
   - `GOOD_LEAD_FOLLOW_UP`
   - `DID_NOT_CONNECT`
   - `BAD_LEAD`
   - `SALE_DONE`
   - *(Unrecognized statuses default to `null`)*

2. **Allowed Data Source Values**:
   - `leads_on_demand`
   - `meridian_tower`
   - `eden_park`
   - `varah_swamy`
   - `sarjapur_plots`
   - *(If no confident match is found, defaults to `null`)*

3. **Date Format**:
   - `created_at` field is cleaned and normalized into standard readable/ISO format, guaranteed to be convertible using `new Date(created_at)`.

4. **Multi-Contact Parsing**:
   - If multiple email addresses or mobile numbers exist in a row, the AI uses the first contact for primary fields and appends the rest to the `crm_note` field.

5. **Skip Invalid Records**:
   - If a record has **neither a valid email nor a mobile number**, the record is filtered or flagged as `skipped` in compliance with GrowEasy CRM ingestion constraints.

---

## 🔌 API Documentation

### `GET /api/health`
- **Description**: Lightweight health and diagnostic probe.
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-07-10T18:00:00.000Z",
    "service": "AI CRM CSV Importer Backend"
  }
  ```

### `POST /api/parse`
- **Description**: Accepts raw CSV body string or payload and returns parsed JSON array.
- **Payload**: `{ "csvText": "name,email,phone\nJohn,john@example.com,123456" }`
- **Response**:
  ```json
  {
    "success": true,
    "headers": ["name", "email", "phone"],
    "rowCount": 1,
    "rows": [{ "_originalIndex": 0, "name": "John", "email": "john@example.com", "phone": "123456" }]
  }
  ```

### `POST /api/extract`
- **Description**: Accepts a batch of raw records, runs structured AI mapping, and outputs GrowEasy CRM records.
- **Payload**:
  ```json
  {
    "batch": [
      {
        "index": 0,
        "data": { "client_name": "ANNA SMITH", "mail_id": "anna@company.com", "cellphone": "+919988776655" }
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "results": [
      {
        "index": 0,
        "original": { "client_name": "ANNA SMITH", "mail_id": "anna@company.com", "cellphone": "+919988776655" },
        "status": "success",
        "normalized": {
          "created_at": null,
          "name": "Anna Smith",
          "email": "anna@company.com",
          "country_code": "+91",
          "mobile_without_country_code": "9988776655",
          "company": null,
          "city": null,
          "state": null,
          "country": null,
          "lead_owner": null,
          "crm_status": null,
          "crm_note": null,
          "data_source": null,
          "possession_time": null,
          "description": null
        }
      }
    ]
  }
  ```

---

## 🚀 Getting Started

### 1. Environment Configuration
Create a `.env` file in the project root:
```env
GEMINI_API_KEY="your-google-gemini-api-key-here"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
Executes the Express API and Vite React server concurrently on a single unified port:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### 4. Production Build & Execution
```bash
# Compile client assets and build
npm run build

# Start the full-stack server
npm run start
```

---

## 💎 Future Roadmap & Scaling
- **Relational Databases Integration**: Configure PostgreSQL/PostGIS with Cloud SQL to persist mapped leads and preserve historic imports.
- **Interactive Schema Mapper**: Allow users to explicitly drag-and-drop links from raw column headers to CRM fields for custom manual alignments.
- **Duplication Checker**: Add client-side and database-level entity-matching models to alert users about existing duplicate emails before importing.
