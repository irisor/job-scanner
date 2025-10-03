import React, { useState } from 'react';
import { Search, ThumbsUp, ThumbsDown, Settings, Briefcase, MapPin, TrendingUp, AlertCircle, Loader } from 'lucide-react';

// =========================================================================
// 🔥 LIVE API IMPLEMENTATION: Using Gemini API for Search Grounding and JSON Output
// =========================================================================

// Global configuration for the Gemini API
// The API is returning a 404 for "gemini-1.5-flash".
// Switching to "gemini-pro", which is another common and capable model available on the v1beta endpoint.
// The API is still returning a 404 for "gemini-1.5-pro-latest" on the v1beta endpoint.
// Switching to "gemini-1.5-pro" as a final attempt to find a valid model name.
const MODEL = "gemini-2.5-flash-preview-05-20";
const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const API_ENDPOINT = `${BASE_API_URL}/${MODEL}:generateContent`;

// ** IMPORTANT: For local testing, replace the empty string below with your actual Gemini API Key.
// If run in a Canvas/Gemini environment, leave it blank, and the environment will handle injection (if working).
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
/**
 * Helper function to robustly extract JSON content from text that might contain markdown wrappers.
 */
const extractJsonFromText = (text) => {
    // First, try to find a JSON code block.
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        return markdownMatch[1].trim();
    }

    // If no code block, find the first '[' and last ']' to extract the array.
    // This is more robust against conversational text from the model.
    const arrayMatch = text.match(/(\[[\s\S]*\])/);
    if (arrayMatch) {
        return arrayMatch[1].trim();
    }

    return text.trim();
};

/**
 * Defines the structured JSON schema for the job results.
 */
const JOB_SCHEMA = {
    type: "ARRAY",
    items: {
        type: "OBJECT",
        properties: {
            "id": { "type": "NUMBER", "description": "A unique identifier for the job." },
            "title": { "type": "STRING", "description": "The title of the job listing." },
            "company": { "type": "STRING", "description": "The hiring company name." },
            "location": { "type": "STRING", "description": "The job location." },
            "type": { "type": "STRING", "description": "Job type (e.g., Full-time, Part-time)." },
            "description": { "type": "STRING", "description": "A very brief, one-sentence summary of the role." },
            "url": { "type": "STRING", "description": "The URL to the original job posting." },
            "salary": { "type": "STRING", "description": "The listed salary or 'Not specified'." },
            "posted": { "type": "STRING", "description": "When the job was posted (e.g., '1 day ago')." }
        },
        required: ["id", "title", "company", "location", "type", "description", "url"]
    }
};

/**
 * Rich, hardcoded job data for use when the live API fails due to the 401 error.
 */
const RICH_FALLBACK_JOBS = [
    { id: 101, title: "English-Speaking Office Coordinator", company: "TechHub Vienna", location: "Vienna, 1010", type: "Full-time", description: "Manage office logistics and support the international team. Requires excellent English communication skills.", url: "#", salary: "€32,000 - €36,000", posted: "1 day ago" },
    { id: 102, title: "Part-Time Animal Care Assistant", company: "Mödling Vet Clinic", location: "Mödling", type: "Part-time", description: "Assist veterinarians with basic patient care and administrative tasks. No German required.", url: "#", salary: "€15/hour", posted: "3 days ago" },
    { id: 103, title: "Entry-Level Data Entry Specialist", company: "Global Logistics AG", location: "Vienna, 1030", type: "Contract", description: "Input and verify shipping data for European distribution networks. Fast-paced, detail-oriented work.", url: "#", salary: "Not specified", posted: "1 week ago" },
    { id: 104, title: "Hotel Front Desk Intern (Summer)", company: "Imperial Palace Hotel", location: "Vienna, 1070", type: "Internship", description: "Join our hospitality team for a 3-month paid internship. Focus on guest relations and check-in procedures.", url: "#", salary: "€800/month", posted: "5 days ago" }
];

/**
 * Calls the Gemini API to search the web (Google Search tool) and extract structured job data.
 * Includes inline exponential backoff logic for resilience.
 */
const fetchStructuredJobData = async (combinedPrompt) => {
    // By embedding the schema and adding very specific constraints directly in the prompt,
    // we give the model a much stronger instruction to follow.
    const systemPrompt = `You are a highly specialized job search engine for jobs in Austria.
1. Perform a Google search to find job listings based on the user's detailed query.
2. CRITICAL: All job listings MUST be located within Austria. Discard any results from other countries, even if the city name matches (e.g., Vienna, USA).
3. From the valid, Austria-based search results, extract the top 15-20 unique, real job listings that are most relevant to the user's query.
4. Return ONLY a valid JSON array of objects. Do not include any text, headers, or markdown outside the JSON block.
4. Each object in the array MUST strictly follow this schema: ${JSON.stringify(JOB_SCHEMA.items)}
5. If a value for a field (like 'salary' or 'posted') cannot be found, you MUST include the key and set its value to "Not specified".
6. The 'id' MUST be a unique number for each job. You can generate it sequentially (e.g., 1, 2, 3).
7. The 'url' MUST be a direct, absolute URL to the job posting details or application page. Do NOT use a URL to a search results page. If you cannot find a direct link for a job, do not include that job in the results.
8. Make a best effort to find the 'posted' date (e.g., '1 day ago', '2 weeks ago', 'Posted on May 20, 2024').

Example of a single job object:
{"id": 1, "title": "Example Job", "company": "Example Corp", "location": "Vienna, Austria", "type": "Full-time", "description": "An example job summary.", "url": "https://example.com/job/123", "salary": "€50,000", "posted": "2 days ago"}`;

    const payload = {
        contents: [{ parts: [{ text: combinedPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }],
    };

    if (!payload.contents || payload.contents.length === 0 || !combinedPrompt) {
        throw new Error("Payload validation failed: Missing prompt content.");
    }

    const finalUrl = API_ENDPOINT; // The API key will be sent in the header

    const headers = {
        'Content-Type': 'application/json',
    };
    if (API_KEY) {
        headers['x-goog-api-key'] = API_KEY;
    }

    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    };

    const maxRetries = 5;

    // --- DEBUG LOGGING ---
    console.groupCollapsed("Gemini API Request Details (Job Search)");
    console.log("Request URL:", finalUrl);
    // Create a copy of headers for logging, excluding sensitive keys
    const headersForLogging = { ...options.headers };
    delete headersForLogging['x-goog-api-key'];
    console.log("Headers:", headersForLogging);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.groupEnd();

    let result;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(finalUrl, options);

            if (response.status === 401) {
                // Throw specific error for the main function to catch and switch to fallback
                throw new Error("HTTP error! status: 401 (Unauthorized)");
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            result = await response.json();
            break; // Exit loop on success
        } catch (error) {
            // Re-throw 401 immediately if caught here
            if (error.message.includes('401')) {
                throw error;
            }

            if (attempt === maxRetries - 1) {
                console.error("Max retries reached. Failing.", error);
                throw error;
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (!result) {
        throw new Error("API call failed after all retries.");
    }

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
        console.error("API Error: Received API response but found no text content in candidates structure. Full result:", result);
        throw new Error("API response was valid, but contained no content.");
    }

    console.log("Raw API Text Content Received:", rawText);
    
    const cleanJsonText = extractJsonFromText(rawText);

    try {
        return JSON.parse(cleanJsonText);
    } catch (e) {
        console.error("JSON Parsing Error:", e);
        throw new Error(`Failed to parse structured job data: The AI returned improperly formatted data.`);
    }
};

/**
 * Calls the Gemini API to analyze the search results and current parameters, or returns a simulated analysis for fallback.
 */
const fetchAIInsights = async (searchParams, jobResults, isFallback = false) => {
    if (isFallback) {
        // Simulated AI analysis for the rich fallback data
        return `📊 AI Analysis: Based on the **Fallback Data** provided, the results are a good match for "English-speaking entry-level" roles in the hospitality and administrative sectors. You successfully targeted specific locations like Mödling and Vienna.
        
💡 Tip: Since the job market for English-only roles is competitive, consider broadening your search terms to include roles that may be bilingual but accept English as the primary internal language.

🔑 Suggested keywords to add: 'customer support', 'Bilingual', 'office assistant', 'minijob'
❌ Consider removing: 'fast food' (unless specifically desired), 'animal care' (if you want to focus on office/hospitality)`;
    }
    
    // --- Live API Call Logic ---    
    const systemPrompt = `You are an expert career counselor. Analyze the provided job search parameters and the search results. Provide a concise, actionable analysis in a friendly tone. Suggest 2-3 new keywords to include, and 1-2 keywords to remove or refine. Use the following format: '📊 AI Analysis:...\n\n💡 Tip:...\n\n🔑 Suggested keywords to add: ...\n❌ Consider removing: ...'`;
    
    const userQuery = `Analyze the current search parameters: ${JSON.stringify(searchParams)}. The recent search returned ${jobResults.length} jobs. Provide insights based on this context.`;    

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    if (!payload.contents || payload.contents.length === 0 || !userQuery) {
        throw new Error("Payload validation failed: Missing user query for insights.");
    }
    
    const finalUrl = API_ENDPOINT; // The API key will be sent in the header

    const headers = {
        'Content-Type': 'application/json',
    };
    if (API_KEY) {
        headers['x-goog-api-key'] = API_KEY;
    }

    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    };

    const maxRetries = 5;
    
    let result;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(finalUrl, options);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            result = await response.json();
            break; // Exit loop on success
        } catch (error) {
            if (attempt === maxRetries - 1) {
                console.error("Max retries reached for insights. Failing.", error);
                throw error;
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return result?.candidates?.[0]?.content?.parts?.[0]?.text || 'No insights generated.';
};

/**
 * Performs a very simple API test to check for basic connectivity and authentication.
 */
const runSimpleApiTest = async () => {
    const testPrompt = "Hello, world!";
    const payload = {
        contents: [{ parts: [{ text: testPrompt }] }],
    };

    // Simplification: Pass the API key directly in the URL as a query parameter.
    // This is a common pattern in API documentation and the most direct way to authenticate.
    const finalUrl = `${API_ENDPOINT}?key=${API_KEY}`;

    const headers = {
        'Content-Type': 'application/json',
    };
    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    };

    console.groupCollapsed("Gemini API Request Details (Simple Test)");
    console.log("Request URL:", finalUrl);
    console.log("Headers:", options.headers);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.groupEnd();

    const response = await fetch(finalUrl, options);

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
    }

    return await response.json();
};

/**
 * A new, separate API test based on the user-provided working example.
 * This helps isolate whether the issue is with the prompt/schema or with the fundamental API connection.
 */
const runGoldApiTest = async () => {
    // CRITICAL: Construct the authenticated URL locally to guarantee the ?key= parameter is present.
    const apiUrlWithKey = `${API_ENDPOINT}?key=${API_KEY}`;

    const systemPrompt = "You are a friendly, concise API tester. Provide a single, short sentence summarizing the current price of gold.";
    const userQuery = "What is the current price of gold?";

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        // Use the Google Search tool to force a live, up-to-date interaction.
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    };

    console.groupCollapsed("Gemini API Request Details (Gold Price Test)");
    console.log("Request URL:", apiUrlWithKey);
    console.log("Headers:", options.headers);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.groupEnd();

    // Simplified fetch without backoff for a direct test
    const response = await fetch(apiUrlWithKey, options);

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gold API Test Error Body:", errorBody);
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Gold API Test Success Response:", result);

    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'No text content returned from API.';
};

export default function App() {
  const [searchParams, setSearchParams] = useState({
    location: 'Vienna, Mödling',
    keywords: 'entry level, English, junior, office, assistant, customer service, marketing, tech, administrative, data entry, hospitality',
    excludeKeywords: 'senior, manager, German required, Deutsch erforderlich',
    jobTypes: ['Full-time', 'Part-time', 'Internship']
  });

  const [feedback, setFeedback] = useState({}); // Use an object for faster lookups: { jobId: 'positive' }
  const [isSearching, setIsSearching] = useState(false);  
  const [jobs, setJobs] = useState([]); 
  const [showSettings, setShowSettings] = useState(false);
  const [aiInsights, setAiInsights] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchProgress, setSearchProgress] = useState('');
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    setJobs([]);
    setSearchError('');
    setAiInsights('');
    setIsFallbackMode(false);

    let jobResults = [];
    let isFallback = false;

    try {
      setSearchProgress('1/3: Generating comprehensive search query...');
      
      const combinedPrompt = `Search for job listings in Austria for an English-speaking entry-level graduate near ${searchParams.location}.
Keywords: ${searchParams.keywords}. Exclude: ${searchParams.excludeKeywords}. Job Types: ${searchParams.jobTypes.join(', ')}.`;

      setSearchProgress('2/3: Searching Google and extracting structured job data...');
      
      jobResults = await fetchStructuredJobData(combinedPrompt);
      
      if (!Array.isArray(jobResults) || jobResults.length === 0) {
        setSearchError('Search completed, but the model could not find or extract any structured job listings based on your criteria. Try broadening your search.');
        // If live search returns 0, we still want to show fallback to demonstrate
        jobResults = RICH_FALLBACK_JOBS;
        isFallback = true;        
      }
      
    } catch (error) {
      console.error('Search error:', error);      
      
      // Check for the specific 401 error and trigger fallback
      if (error.message.includes('HTTP error! status: 401')) {
        // This confirms the environment is not injecting the key regardless of method
        setSearchError('Authentication Failed (401). The live API key cannot be injected. Showing **Fallback Data** to demonstrate app functionality.');
        jobResults = RICH_FALLBACK_JOBS;
        isFallback = true;
      } else {
        setSearchError(`A critical API error occurred during the search. Showing fallback data. Error: ${error.message}`);
        jobResults = RICH_FALLBACK_JOBS;
        isFallback = true;
      }
    }

    // Process results (either live or fallback)
    setIsFallbackMode(isFallback);
    const finalJobs = jobResults.map((job, index) => ({
        ...job,
        // Ensure ID is always a unique string for React keys
        id: job.id ? String(job.id) : `fallback-job-${index}`,
    }));

    setJobs(finalJobs);

    // Reset feedback for new search results
    setFeedback({});

    setSearchProgress('3/3: Generating AI insights...');
    await generateAIInsights(finalJobs, isFallback);

    setSearchProgress('');
    setIsSearching(false);
  };

  const generateAIInsights = async (jobResults, isFallback) => {
    try {
        const insights = await fetchAIInsights(searchParams, jobResults, isFallback);
        setAiInsights(insights);
    } catch(error) {
        console.error('Insight generation failed:', error);
        setAiInsights('Failed to generate insights.');
    }
  };

  const handleFeedback = (job, type) => {
    setFeedback(prevFeedback => {
      const currentFeedback = prevFeedback[job.id];
      const newFeedback = { ...prevFeedback };

      if (currentFeedback === type) {
        delete newFeedback[job.id]; // Toggle off if same button is clicked
      } else {
        newFeedback[job.id] = type; // Set or change feedback
      }
      return newFeedback;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-['Inter']">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
                <Briefcase className="text-indigo-600 w-8 h-8" />
                AI Job Scanner (Live Search)
              </h1>
              <p className="text-gray-600 mt-1">Smart job search for English speakers in Austria using the Gemini API</p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full transition shadow-md"
              title="Toggle Settings"
            >
              <Settings className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white rounded-xl shadow-xl p-6 mb-6 border-l-4 border-indigo-500">
            <h2 className="text-xl font-bold mb-4 text-indigo-700">Search Settings</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="inline w-4 h-4 mr-1 text-indigo-500" />
                  Location (e.g., 'Vienna, Mödling')
                </label>
                <input
                  type="text"
                  value={searchParams.location}
                  onChange={(e) => setSearchParams(prev => ({...prev, location: e.target.value}))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Types
                </label>
                <div className="flex gap-4 flex-wrap p-2 border border-gray-300 rounded-lg bg-gray-50">
                  {['Full-time', 'Part-time', 'Internship', 'Contract'].map(type => (
                    <label key={type} className="flex items-center text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={searchParams.jobTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSearchParams(prev => ({...prev, jobTypes: [...prev.jobTypes, type]}));
                          } else {
                            setSearchParams(prev => ({...prev, jobTypes: prev.jobTypes.filter(t => t !== type)}));
                          }
                        }}
                        className="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Keywords (comma-separated, e.g., 'data entry, hotel')
                </label>
                <textarea
                  value={searchParams.keywords}
                  onChange={(e) => setSearchParams(prev => ({...prev, keywords: e.target.value}))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  rows="3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Exclude Keywords (comma-separated, e.g., 'senior, German required')
                </label>
                <textarea
                  value={searchParams.excludeKeywords}
                  onChange={(e) => setSearchParams(prev => ({...prev, excludeKeywords: e.target.value}))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  rows="2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Search Button */}
        <div className="bg-white rounded-xl shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition transform hover:scale-[1.01] duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <>
                  <Loader className="w-6 h-6 animate-spin" />
                  Searching... ({searchProgress})
                </>
              ) : (
                <>
                  <Search className="w-6 h-6" />
                  Search Jobs
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {searchError && (
          <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${isFallbackMode ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-red-50 border-2 border-red-300'}`}>
            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isFallbackMode ? 'text-yellow-600' : 'text-red-600'}`} />
            <div>
              <h3 className="font-bold text-gray-900">Search Information</h3>
              <p className={`text-sm ${isFallbackMode ? 'text-yellow-800' : 'text-red-700'}`}>{searchError}</p>
            </div>
          </div>
        )}

        {/* AI Insights */}
        {aiInsights && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl shadow-lg p-6 mb-6 border-2 border-purple-300">
            <h2 className="text-xl font-bold text-purple-900 flex items-center gap-2 mb-3">
              <TrendingUp className="w-6 h-6 text-purple-600" />
              AI Insights
            </h2>
            <pre className="text-gray-700 whitespace-pre-line bg-white p-4 rounded-lg border border-gray-200 text-sm overflow-x-auto">
              {aiInsights}
            </pre>
          </div>
        )}

        {/* Job Results */}
        {jobs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">Found {jobs.length} Jobs</h2>
            <p className="text-sm text-gray-600">Results are generated from a {isFallbackMode ? '**hardcoded fallback list**' : 'live Google search'} via the Gemini API.</p>
            {jobs.map((job, index) => (
              <div 
                key={job.id}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{job.title}</h3>
                    <p className="text-indigo-600 font-semibold">{job.company}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleFeedback(job, 'positive')}
                      className={`p-3 rounded-full transition shadow-md ${
                        feedback[job.id] === 'positive'
                          ? 'bg-green-500 text-white hover:bg-green-600' 
                          : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
                      }`}
                      title="Like this job"
                    >
                      <ThumbsUp className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleFeedback(job, 'negative')}
                      className={`p-3 rounded-full transition shadow-md ${
                        feedback[job.id] === 'negative'
                          ? 'bg-red-500 text-white hover:bg-red-600' 
                          : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                      }`}
                      title="Not interested"
                    >
                      <ThumbsDown className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-4 text-sm text-gray-600 mb-3 flex-wrap">
                  <span className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full">
                    <MapPin className="w-4 h-4 text-indigo-500" />
                    {job.location}
                  </span>
                  <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-medium">
                    {job.type}
                  </span>
                  {/* Add fallback for optional fields like salary and posted */}
                  <span className="font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">{job.salary || 'Not specified'}</span>
                </div>

                <p className="text-gray-700 mb-4">{job.description}</p>

                <div className="flex justify-between items-center border-t pt-4">
                  {/* Add fallback for optional fields like salary and posted */}
                  <span className="text-sm text-gray-500">Posted: {job.posted || 'N/A'}</span>
                  {/* The button is now disabled if the URL is missing or not a valid absolute URL */}
                  {(() => {
                    const isValidUrl = job.url && (job.url.startsWith('http://') || job.url.startsWith('https://'));
                    return (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold transition shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                    aria-disabled={!isValidUrl}
                    onClick={(e) => !isValidUrl && e.preventDefault()}
                  >
                    View Job
                  </a>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {jobs.length === 0 && !isSearching && !searchError && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center border-2 border-dashed border-gray-200">
            <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-600 mb-2">Ready to find your perfect job?</h3>
            <p className="text-gray-500 mb-4">Click the search button to start the AI job scan.</p>
            <p className="text-sm text-gray-400">The application will now perform a live search using the Gemini API and Google Search grounding.</p>
          </div>
        )}
      </div>
    </div>
  );
}
