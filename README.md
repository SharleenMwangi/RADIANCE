# Radiance Pharmaceuticals Static Server

This project uses an Express.js server to serve static HTML files and assets for Radiance Pharmaceuticals.

## Prerequisites
- Node.js (v14 or higher recommended)
- npm (Node package manager)

## Setup
1. Install dependencies:
   ```bash
   npm install express dotenv
   ```
2. Create a `.env` file in the project root with the following content:
   ```env
   PORT=3001
   PUBLIC_API_KEY=your-api-key-here
   PUBLIC_API_BASE=https://api.example.com
   ```
   You can change the values as needed.

## Running the Server
To start the server, run:
```bash
node server.js
```
Or, if you have a `start` script in your `package.json`:
```bash
npm start
```

The server will run at `http://localhost:3001` (or the port specified in your `.env`).

## Features
- Serves HTML files and static assets from the project directory
- Injects meta tags for `PUBLIC_API_KEY` and `PUBLIC_API_BASE` into HTML files
- Uses environment variables for configuration

## Troubleshooting
- Ensure your `.env` file is present and correctly formatted
- If you get a port error, make sure the port is not in use or change the `PORT` value in `.env`
- Check the console for error messages if the server does not start

## License
This project is for internal use at Radiance Pharmaceuticals.
# Radiance Pharmaceuticals Static Server

This project uses an Express.js server to serve static HTML and assets for Radiance Pharmaceuticals.

## Prerequisites
- Node.js (v14 or higher recommended)
- npm (Node package manager)

## Setup
1. Install dependencies:
   ```bash
   npm install express dotenv
   ```
2. Create a `.env` file in the project root with the following sample content:
   ```env
   PORT=3001
   PUBLIC_API_KEY=your-api-key-here
   PUBLIC_API_BASE=https://api.example.com
   ```
   - You can change the values as needed.

## Running the Server
To start the server, run:
```bash
node server.js
```
Or, if you have a `start` script in your `package.json`:
```bash
npm start
```

The server will run at `http://localhost:3001` (or the port specified in your `.env`).

## Features
- Serves HTML files and static assets from the project directory.
- Injects meta tags for `PUBLIC_API_KEY` and `PUBLIC_API_BASE` into HTML files.
- Uses environment variables for configuration.

## Troubleshooting
- Ensure your `.env` file is present and correctly formatted.
- If you get a port error, make sure the port is not in use or change the `PORT` value in `.env`.
- Check the console for error messages if the server does not start.

## License
This project is for internal use at Radiance Pharmaceuticals.
