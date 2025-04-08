# YouTube SEO Dashboard

A Node.js application to track YouTube channel statistics and engagement metrics.

## Prerequisites

-   [Node.js](https://nodejs.org/) (v16 or higher)
-   [npm](https://www.npmjs.com/) (usually comes with Node.js)
-   [YouTube Data API Key](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
-   [Redis](https://redis.io/) server running locally or via `REDIS_URL`
-   (Optional) Docker

## Setup

### General Steps (All Platforms)

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd YouTubeSEODashboard
    ```

2.  **Create and configure `.env` file:**

    *   Create a `.env` file in the root directory of the project.
    *   Add the following environment variables, replacing the placeholders with your actual values:

        ```
        YOUTUBE_API_KEY=your_youtube_api_key_here
        YOUTUBE_CHANNEL_ID=your_youtube_channel_id_here
        REDIS_URL=redis://localhost:6379 # Optional, if Redis is not on localhost
        ```

3.  **Install dependencies:**

    *   Install root dependencies:

        ```bash
        npm install
        ```

    *   Install client dependencies:

        ```bash
        cd client
        npm install
        cd ..
        ```

4.  **Build frontend:**

    ```bash
    cd client
    npm run build
    cd ..
    ```

### Running Natively

#### Windows

1.  **Install Node.js and npm:**

    *   Download the installer from the Node.js website and follow the instructions.

2.  **Install Redis:**

    *   Download Redis from the Redis website.
    *   Extract the archive and run `redis-server.exe`.

3.  **Start the server:**

    ```bash
    npm start
    ```

4.  **Access the application:**

    *   Open your web browser and go to `http://localhost:3000`.

#### MacOS

1.  **Install Node.js and npm:**

    *   You can use Homebrew to install Node.js:

        ```bash
        brew install node
        ```

2.  **Install Redis:**

    *   Use Homebrew to install Redis:

        ```bash
        brew install redis
        brew services start redis
        ```

3.  **Start the server:**

    ```bash
    npm start
    ```

4.  **Access the application:**

    *   Open your web browser and go to `http://localhost:3000`.

#### Ubuntu

1.  **Install Node.js and npm:**

    ```bash
    sudo apt update
    sudo apt install nodejs npm
    ```

2.  **Install Redis:**

    ```bash
    sudo apt update
    sudo apt install redis-server
    sudo systemctl start redis
    sudo systemctl enable redis
    ```

3.  **Start the server:**

    ```bash
    npm start
    ```

4.  **Access the application:**

    *   Open your web browser and go to `http://localhost:3000`.

### Running with Docker

#### Windows, MacOS, and Ubuntu

1.  **Install Docker:**

    *   Download and install Docker Desktop for your operating system.

2.  **Build the Docker image:**

    ```bash
    docker build -t youtube-seo-dashboard .
    ```

3.  **Run the Docker container:**

    ```bash
    docker run -p 3000:3000 -e YOUTUBE_API_KEY=your_youtube_api_key_here -e YOUTUBE_CHANNEL_ID=your_youtube_channel_id_here youtube-seo-dashboard
    ```

    *   Replace `your_youtube_api_key_here` and `your_youtube_channel_id_here` with your actual API key and channel ID.
    *   If your Redis server is not running on localhost, you can also pass the `REDIS_URL` environment variable:

        ```bash
        docker run -p 3000:3000 -e YOUTUBE_API_KEY=your_youtube_api_key_here -e YOUTUBE_CHANNEL_ID=your_youtube_channel_id_here -e REDIS_URL=redis://<redis_host>:<redis_port> youtube-seo-dashboard
        ```

4.  **Access the application:**

    *   Open your web browser and go to `http://localhost:3000`.

## Features

-   Daily incremental updates
-   SQLite3 database
-   Redis caching
-   React frontend
-   Historical stats tracking and engagement charts
