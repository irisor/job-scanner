import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import path from 'path';

// Reverting to the direct dotenv implementation that works reliably in local development.
// This loads variables from `.env.development.local` when running `vercel dev`.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.development.local') });
}

/**
 * This is the serverless function that securely handles job search requests.
 * It receives a prompt from the frontend, calls the Gemini API,
 * parses the response, and returns structured job data.
 */
export default async function handler(req, res) {
  // 1. Basic security: only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 2. Securely access and VALIDATE the API key from server-side environment variables.
    //    This is the most critical step.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Provide a more helpful error message for local development
      if (process.env.NODE_ENV === 'development') {
        throw new Error("GEMINI_API_KEY not found. Did you create a .env.development.local file? If using Vercel, try running 'vercel env pull .env.development.local'.");
      }
      throw new Error("GEMINI_API_KEY is not set in the production environment. Please check your Vercel project settings.");
    }

    // 3. Get the prompt from the frontend's request body
    const { combinedPrompt } = req.body;
    if (!combinedPrompt) {
      return res.status(400).json({ error: 'No prompt provided.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });


    // 4. Add instructions for the AI to format the output as JSON
    const fullPrompt = `${combinedPrompt}

---

IMPORTANT: Please perform a Google search to find real, current job listings based on the criteria.
Format the output as a clean JSON array of objects. Each object should have these keys: "id", "title", "company", "location", "type", "description", "url", "salary", "posted".
If a field is not available, use "Not specified" or "N/A". Ensure the 'url' is a direct, absolute URL to the job posting.
Do not include any text or markdown formatting outside of the JSON array itself. Start the response with \`\`\`json and end it with \`\`\`.`;

    // 4. Make the actual call to the Gemini API from the server
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // 5. Clean and parse the response to extract the JSON
    const match = text.match(/```json\n([\s\S]*?)\n```/);

    if (!match || !match[1]) {
      // If the AI didn't return the expected format, we can't proceed.
      // Log the actual response for debugging.
      console.error("AI response did not contain a valid JSON block. Response:", text);
      throw new Error("The AI model's response was not in the expected JSON format.");
    }

    const jsonString = match[1];
    try {
      // It's also a good practice to wrap JSON.parse in its own try-catch
      // in case the AI generates malformed JSON (e.g., with a trailing comma).
      const jobs = JSON.parse(jsonString);
      res.status(200).json(jobs);
    } catch (parseError) {
      console.error("Failed to parse JSON from AI response in /api/search. Raw JSON string:", jsonString);
      res.status(500).json({ error: "The AI model's response for jobs was not valid JSON." });
    }

  } catch (error) {
    console.error("Error in /api/search:", error);
    // Send a more specific error message to the frontend if available.
    const errorMessage = error.message || "Failed to fetch data from the AI model. Check the server logs for more details.";
    res.status(500).json({ error: errorMessage });
  }
}
