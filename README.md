# GrowEasy AI CRM CSV Importer 🚀

An intelligent, production-grade, AI-powered CSV Ingestion Pipeline built to map, clean, and normalize CRM lead datasets from any valid format (Facebook Lead exports, Google Ads tables, manually created Excel spreadsheets, etc.) into the standardized GrowEasy CRM schema.

Developed by [Vatsal Goel](https://github.com/vatsalgoel111).

---

## 🔗 Project Links

- **Live Demo Link:** [https://groweasy-ai-crm-csv-importer.onrender.com/](https://groweasy-ai-crm-csv-importer.onrender.com/)
- **GitHub Repository:** [https://github.com/vatsalgoel111](https://github.com/vatsalgoel111)

---

## ✨ Features

- **Messy File Ingestion:** Supports raw marketing exports (Facebook, Google Sheets, Excel sheets converted to CSV) containing custom columns, duplicate phone headers, and dirty capitalization.
- **AI-Powered Normalization:** Coordinated via Gemini 3.5 Flash using strict JSON schema outputs to parse names, normalize country codes, separate phone extensions, and resolve source identifiers.
- **Dynamic Structural Column Mapping:** Let AI figure out headers automatically or preview mappings to target fields interactively.
- **Interactive Multi-Step Progress Tracker:** 4-stage pipeline (Upload → Header Alignment → AI Normalization → Extraction Results) with step-back flexibility.
- **Real-Time Extraction Statistics:** Track mapped counts, validation failures, skipped rows, and processing durations.
- **Interactive Testing Corner:** Provides instant, pre-built messy campaign worksheets (Facebook Leads, Scrambled Multi-Format) to run instantly without uploading files.
- **Export Normalized Leads:** One-click download of cleaned leads as a standard compliant CSV template.

---

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, PapaParse, Lucide Icons, Axios, Motion
- **Backend:** Node.js, Express, @google/genai (Gemini 3.5 Flash SDK)
- **Deployment & Containers:** Docker, Render

---

## 💻 Local Setup & Installation

Follow these steps to run the application locally on your system.

### 1. Prerequisites
Ensure you have **Node.js (v18+)** installed.

### 2. Environment Setup
Create a `.env` file in the project root and add your Google Gemini API Key:
```env
GEMINI_API_KEY="your-google-gemini-api-key-here"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Locally (Development Server)
Runs both the Express API and Vite React server concurrently on a single port:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application in your browser.

### 5. Production Build & Execution
```bash
# Compile client assets and build production bundles
npm run build

# Start the compiled full-stack server
npm run start
```

---

## 🐳 Docker

This project is fully Dockerized and ready for deployment on containerized platforms.

### Build Docker Image
```bash
docker build -t groweasy-ai .
```

### Run Docker Container
Ensure your environment variables are configured in `.env` before running:
```bash
docker run -p 3000:3000 --env-file .env groweasy-ai
```
Access the running application at [http://localhost:3000](http://localhost:3000).

---

## 🤖 AI Normalization Rules

Our pipeline leverages **Gemini 3.5 Flash** using strict schema controls to enforce the following CRM business rules:

1. **CRM Status Mapping**:
   Maps status variations to allowed categories: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, or `SALE_DONE` (unrecognized maps to `null`).
2. **Data Source Identifiers**:
   Standardizes campaign tags into recognized sources: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, or `sarjapur_plots`.
3. **Date Formats**:
   Validates and standardizes arbitrary Date strings into standard readable/ISO formats.
4. **Contact Parsing**:
   If multiple email addresses or phone listings exist in a row, the primary contact details are extracted and additional ones are safely appended to `crm_note`.
5. **Validation Safety**:
   Filters out invalid rows missing both a valid email and phone number to prevent CRM pollution.
