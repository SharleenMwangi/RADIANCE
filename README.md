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

## Public Products & Catalogue API Guide
{
  "api": {
    "name": "Public Products & Catalogue API",
    "version": "1.0",
    "last_updated": "2025-08-14",
    "description": "Publicly accessible, read-only endpoints for products, categories, images, and prices."
  },
  "base_urls": {
    "production": "https://api.regisamtechnologies.co.ke",
    "staging": "https://staging.api.example.com",
    "local_dev": "http://localhost:5000"
  },
  "authentication": {
    "type": "api_key",
    "header": "X-API-Key",
  "demo_key": "",
    "error_example": {
      "status": 401,
      "body": { "error": "Invalid or missing API key" }
    }
  },
  "response_format": {
    "encoding": "UTF-8",
    "format": "JSON",
    "conventions": {
      "ids": "integer",
      "prices": "float (currency defined separately)",
      "pagination": {
        "fields": ["page", "per_page", "total", "pages", "data_collection"]
      }
    }
  },
  "endpoints": [
    {
      "name": "List Products",
      "method": "GET",
      "path": "/public/products",
      "query_params": {
        "page": "int (default=1)",
        "per_page": "int (default=20, max=100)",
        "sort": "enum[name, price, created] (default=created)",
        "direction": "enum[asc, desc] (default=desc)",
        "q": "string (search by name)",
        "category_id": "int"
      },
      "sample_request": "GET /public/products?per_page=5&sort=price&direction=asc&q=phone",
      "sample_response": {
        "page": 1,
        "per_page": 5,
        "total": 42,
        "pages": 9,
        "products": [
          {
            "id": 101,
            "name": "Budget Phone",
            "description": "Entry-level device",
            "price": 99.99,
            "category_id": 3,
            "image_urls": ["https://res.cloudinary.com/demo/image/upload/v.../budget_phone.jpg"]
          }
        ]
      }
    },
    {
      "name": "Product Detail",
      "method": "GET",
      "path": "/public/products/{product_id}",
      "sample_response": {
        "id": 101,
        "name": "Budget Phone",
        "description": "Entry-level device",
        "price": 99.99,
        "category_id": 3,
        "images": [
          { "id": 5001, "name": "Front", "url": "https://.../front.jpg", "color": "black" }
        ]
      }
    },
    {
      "name": "List Categories",
      "method": "GET",
      "path": "/public/categories",
      "sample_response": {
        "categories": [
          { "id": 3, "name": "Phones", "description": "Smart & feature phones" }
        ]
      }
    },
    {
      "name": "List Images",
      "method": "GET",
      "path": "/public/images",
      "query_params": {
        "page": "int",
        "per_page": "int (max=100)",
        "product_id": "int"
      },
      "sample_response": {
        "page": 1,
        "per_page": 10,
        "total": 4,
        "pages": 1,
        "images": [
          { "id": 5001, "name": "Front", "url": "https://.../front.jpg", "color": "black", "product_id": 101 }
        ]
      }
    },
    {
      "name": "List Prices",
      "method": "GET",
      "path": "/public/prices",
      "query_params": {
        "product_id": "int",
        "price_type": "string (trade, retail, sale)"
      },
      "sample_response": [
        { "id": 9001, "product_id": 101, "price_type": "trade", "value": 200.0, "currency": "USD", "min_qty": null },
        { "id": 9002, "product_id": 101, "price_type": "retail", "value": 266.0, "currency": "USD", "min_qty": null }
      ]
    },
    {
      "name": "Price Categories",
      "method": "GET",
      "path": "/public/price-categories",
      "sample_response": [
        { "id": 10, "name": "Default", "tradePrice": 200.0, "retailPrice": 266.0 }
      ]
    }
  ],
  "status_codes": {
    "200": "Success",
    "400": "Bad query parameter",
    "401": "Invalid or missing API key",
    "404": "Resource not found",
    "500": "Internal server error"
  },
  "error_format": {
    "invalid_key": { "error": "Invalid or missing API key" },
    "not_found": { "error": "Not Found" }
  },
  "pagination": {
    "strategy": "Use page & per_page. Stop when page > pages or empty result."
  },
  "caching": {
    "recommendation": "300–600 seconds edge cache. Categories can be cached 1 hour."
  },
  "rate_limiting": {
    "enforced": false,
    "recommendation": "≤ 5 requests/second. Back off on 429 if enforced later."
  },
  "security": {
    "guidelines": [
      "Keep API key server-side.",
      "Rotate keys periodically.",
      "Monitor unusual traffic."
    ]
  },
  "versioning": {
    "current": "unversioned",
    "future": "Possible /v1/public/ endpoints"
  },
  "changelog": [
    { "date": "2025-08-14", "change": "Initial public documentation created" }
  ],
  "contact": {
    "support_email": "support@example.com"
  }
}
