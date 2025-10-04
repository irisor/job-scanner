# AI Job Scanner

The AI Job Scanner is a smart job search application designed for English speakers looking for entry-level positions in Austria. It leverages the Google Gemini API with search grounding to perform live, relevant job searches and provide AI-driven insights to help users refine their search strategy.

## ✨ Features

- **Live Job Search**: Uses the Gemini API to perform real-time Google searches for job listings.
- **AI-Powered Insights**: Analyzes search results to provide actionable suggestions and keyword recommendations.
- **Secure Backend**: All API calls are handled securely through Vercel Serverless Functions, ensuring your API key is never exposed on the client-side.
- **Advanced Filtering**: Allows users to specify locations, keywords to include/exclude, and job types.
- **Modern UI**: Built with React, Tailwind CSS, and Lucide icons for a clean and responsive user experience.
- **Fallback Mode**: Includes a fallback mechanism with hardcoded data for testing and demonstration purposes.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Vercel Serverless Functions (Node.js)
- **AI**: Google Gemini API (`gemini-2.5-flash-preview-05-20`)
- **Deployment**: Vercel

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- A Google Gemini API Key

### Local Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd job-scanner
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up environment variables:**
    You need a `.env.development.local` file in the root of your project containing your `GEMINI_API_KEY`. You have two options:

    **Option A: Create the file manually**
    Create the file and add your key:
    ```plaintext
    GEMINI_API_KEY="your_api_key_here"
    ```

    **Option B: Pull from Vercel (Recommended)**
    If you have already set up your environment variables in your Vercel project (see Deployment section), you can pull them to your local environment. This is the best way to keep variables in sync.
    ```bash
    npm install -g vercel # Install Vercel CLI globally if you haven't already
    vercel link          # Link your local project to your Vercel project
    vercel env pull .env.development.local
    ```
    This command creates the `.env.development.local` file for you.

4.  **Run the development server:**
    The best way to run the project locally is with the Vercel CLI, as it accurately simulates the serverless environment.
    ```bash
    vercel dev
    ```
    Your application should now be running at `http://localhost:3000`.

---

## 🌐 Deployment to Vercel

This project is configured for easy deployment with Vercel.

1.  **Push your code to a Git repository** (e.g., GitHub, GitLab, Bitbucket).

2.  **Import your project into Vercel:**
    - Go to your Vercel dashboard and click "Add New... > Project".
    - Select your Git repository.
    - Vercel will automatically detect the Vite configuration. No changes are needed for the build settings.

3.  **Configure Environment Variables:**
    - In your Vercel project's settings, navigate to the "Environment Variables" section.
    - Add a new variable with the key `GEMINI_API_KEY` and paste your API key as the value.
    - Ensure the variable is available for all environments (Production, Preview, and Development).

4.  **Deploy:**
    - Click the "Deploy" button. Vercel will build and deploy your application.
    - After deployment, you will get a public URL for your live AI Job Scanner!