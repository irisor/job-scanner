import React, { useState } from 'react';
import { Search, ThumbsUp, ThumbsDown, Settings, Briefcase, MapPin, TrendingUp, AlertCircle, Loader } from 'lucide-react';

// =========================================================================
// 🔥 LIVE API IMPLEMENTATION: Using Gemini API for Search Grounding and JSON Output
// =========================================================================
/**
 * NOTE: The API key and all direct calls to the Gemini API have been moved to serverless functions
 * in the `/api` directory. This is a critical security improvement to prevent exposing the
 * API key on the client-side. The frontend now calls our own backend endpoints (`/api/search`, `/api/insights`).
 */

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
 * Calls our secure serverless function to search for jobs.
 */
const fetchStructuredJobData = async (combinedPrompt) => {
    const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combinedPrompt }),
    });

    const data = await response.json();

    if (!response.ok) {
        // The serverless function provides a structured error
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
};

/**
 * Calls our secure serverless function to get AI insights.
 */
const fetchAIInsights = async (searchParams, jobResults, isFallback = false) => {
    if (isFallback) {
        // Simulated AI analysis for the rich fallback data
        return `📊 AI Analysis: Based on the **Fallback Data** provided, the results are a good match for "English-speaking entry-level" roles in the hospitality and administrative sectors. You successfully targeted specific locations like Mödling and Vienna.
        
💡 Tip: Since the job market for English-only roles is competitive, consider broadening your search terms to include roles that may be bilingual but accept English as the primary internal language.

🔑 Suggested keywords to add: 'customer support', 'Bilingual', 'office assistant', 'minijob'
❌ Consider removing: 'fast food' (unless specifically desired), 'animal care' (if you want to focus on office/hospitality)`;
    }
    
    const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchParams, jobResultsCount: jobResults.length }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data.insights;
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
  const [aiInsights, setAiInsights] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searchProgress, setSearchProgress] = useState('');
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [useFallbackForTesting, setUseFallbackForTesting] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    setJobs([]);
    setSearchError('');
    setAiInsights(null);
    setIsFallbackMode(false);

    // If "Use Fallback" is checked, just load fallback data and skip API calls.
    if (useFallbackForTesting) {
        setSearchProgress('1/1: Loading fallback data for testing...');
        setIsFallbackMode(true);
        const fallbackJobs = RICH_FALLBACK_JOBS.map((job, index) => ({
            ...job,
            id: job.id ? String(job.id) : `fallback-job-${index}`,
        }));
        setJobs(fallbackJobs);
        setSearchError('Displaying hardcoded fallback data as requested by the testing setting.');
        await generateAIInsights(fallbackJobs, true);
        setIsSearching(false);
        setSearchProgress('');
        return;
    }

    let jobResults = [];

    try {
      setSearchProgress('1/3: Generating comprehensive search query...');
      const combinedPrompt = `Search for job listings in Austria for an English-speaking entry-level graduate near ${searchParams.location}.
Keywords: ${searchParams.keywords}. Exclude: ${searchParams.excludeKeywords}. Job Types: ${searchParams.jobTypes.join(', ')}.`;

      setSearchProgress('2/3: Searching Google and extracting structured job data...');
      jobResults = await fetchStructuredJobData(combinedPrompt);
      
      if (!Array.isArray(jobResults) || jobResults.length === 0) {
        setSearchError('No Results Found. The AI could not find any job listings matching your criteria. Try broadening your search terms.');
        jobResults = []; // Ensure results are empty
      }
      
    } catch (error) {
      console.error('Search error:', error);      
      // Improved Error Handling: Check for the specific API key error message.
      if (error.message.includes("GEMINI_API_KEY")) {
        setSearchError(`Configuration Error: The GEMINI_API_KEY is missing. 
        - If running locally with 'vercel dev', ensure your '.env.development.local' file is correct.
        - If this is a deployed app, check your Environment Variables in your Vercel project settings.`);
      } else {
        setSearchError(`A critical API error occurred during the search. Error: ${error.message}`);
      }

      jobResults = []; // Ensure results are empty on error
    }

    // Process results (either live or fallback)
    const finalJobs = jobResults.map((job, index) => ({
        ...job,
        // Ensure ID is always a unique string for React keys
        id: job.id ? String(job.id) : `fallback-job-${index}`,
    }));

    setJobs(finalJobs);

    // Reset feedback for new search results
    setFeedback({});

    if (finalJobs.length > 0) {
        setSearchProgress('3/3: Generating AI insights...');
        await generateAIInsights(finalJobs, false); // Insights are only for live data now
    }

    setSearchProgress('');
    setIsSearching(false);
  };

  const generateAIInsights = async (jobResults, isFallback) => {
    try {
        const insights = await fetchAIInsights(searchParams, jobResults, isFallback);
        setAiInsights(insights);
    } catch(error) {
        console.error('Insight generation failed:', error);
        // Set a structured error object so the UI doesn't break
        setAiInsights({
            analysis: `Insight generation failed: ${error.message}`
        });
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

              <div className="md:col-span-2 border-t pt-4 mt-2">
                 <label className="flex items-center text-sm cursor-pointer font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={useFallbackForTesting}
                        onChange={(e) => setUseFallbackForTesting(e.target.checked)}
                        className="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600" /> Force Fallback Data (for testing)
                      </span>
                    </label>
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
          <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${useFallbackForTesting ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-red-50 border-2 border-red-300'}`}>
            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${useFallbackForTesting ? 'text-yellow-600' : 'text-red-600'}`} />
            <div>
              <h3 className={`font-bold ${useFallbackForTesting ? 'text-yellow-900' : 'text-red-900'}`}>Search Information</h3>
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
            <div className="space-y-4 text-sm">
              {aiInsights.analysis && (
                <p className="text-gray-800 bg-white p-3 rounded-lg border border-gray-200">
                  <strong>Analysis:</strong> {aiInsights.analysis}
                </p>
              )}
              {aiInsights.suggestions && (
                <p className="text-gray-800 bg-white p-3 rounded-lg border border-gray-200">
                  <strong>Suggestions:</strong> {aiInsights.suggestions}
                </p>
              )}
              {aiInsights.keywordsToAdd && aiInsights.keywordsToAdd.length > 0 && (
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <strong className="text-green-800">Keywords to Add:</strong>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {aiInsights.keywordsToAdd.map(kw => <span key={kw} className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{kw}</span>)}
                  </div>
                </div>
              )}
            </div>
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
