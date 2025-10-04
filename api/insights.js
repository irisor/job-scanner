import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import path from 'path';

// Reverting to the direct dotenv implementation that works reliably in local development.
// This loads variables from `.env.development.local` when running `vercel dev`.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });
}

/**
 * This is the serverless function that securely handles AI insight generation.
 * It receives search context from the frontend, calls the Gemini API for analysis,
 * and returns a string of insights.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Securely access and validate the API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Provide a more helpful error message for local development
      if (process.env.NODE_ENV === 'development') {
        throw new Error("GEMINI_API_KEY not found. Did you create a .env.development.local file? If using Vercel, try running 'vercel env pull .env.development.local'.");
      }
      throw new Error("GEMINI_API_KEY is not set in the production environment. Please check your Vercel project settings.");
    }


    // 2. Get the search context from the frontend
    const { searchParams, jobResultsCount } = req.body;

    if (!searchParams) {
      return res.status(400).json({ error: 'No search parameters provided.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

    // 3. Construct a detailed prompt for the AI to generate insights
    const insightsPrompt = `
      You are a helpful career assistant. Analyze the following job search and its results to provide helpful insights for the user.

      Search Parameters:
      - Location: ${searchParams.location}
      - Keywords: ${searchParams.keywords}
      - Excluded Keywords: ${searchParams.excludeKeywords}
      - Job Types: ${searchParams.jobTypes.join(', ')}
      Number of Jobs Found: ${jobResultsCount}

      Based on this, generate a JSON object with the following structure:
      {
        "analysis": "A brief, one-sentence summary of the search results. Mention if the results seem relevant to the keywords.",
        "suggestions": "A short paragraph with 1-2 actionable tips for improving the next search. For example, suggest broadening the location or refining keywords.",
        "keywordsToAdd": ["keyword1", "keyword2", "keyword3"],
        "keywordsToRemove": ["keywordA", "keywordB"]
      }

      IMPORTANT: Do not include any text or markdown formatting outside of the JSON object itself. The entire response must be a single, valid JSON object, enclosed in \`\`\`json and \`\`\`.
    `;

    // 4. Call the Gemini API and send the response back
    const result = await model.generateContent(insightsPrompt);
    const response = await result.response;
    const rawText = response.text();

    // 5. Clean and parse the response to extract the JSON
    // This regex handles cases where the AI wraps the JSON in markdown code blocks.
    const match = rawText.match(/```json\n([\s\S]*?)\n```/);

    if (!match || !match[1]) {
      console.error("AI response for insights did not contain a valid JSON block. Response:", rawText);
      throw new Error("The AI model's response for insights was not in the expected JSON format.");
    }

    const jsonString = match[1];

    try {
      // Parse the JSON response from the AI, protecting against malformed JSON
      const insightsJson = JSON.parse(jsonString);
      res.status(200).json({ insights: insightsJson });
    } catch (parseError) {
      console.error("Failed to parse JSON from AI response in /api/insights. Raw JSON string:", jsonString);
      console.error("Original raw text from AI:", rawText); // Log the full response for better debugging
      // Instead of throwing, send a specific error to the client.
      res.status(500).json({ error: "The AI model's response for insights was not valid JSON." });
    }

  } catch (error) {
    console.error("Error in /api/insights:", error);
    const errorMessage = error.message || "Failed to generate AI insights. Check the server logs.";
    res.status(500).json({ error: errorMessage });
  }
}
