# Public API Integration Reference

This file provides integration examples and best practices for consuming the public, read-only endpoints under `/public` from https://api.regisamtechnologies.co.ke.

## Authentication
- Pass the public key in the header: `X-API-Key: <PUBLIC_API_KEY>`
- Default demo key (development only): `public-demo-key-12345`

## Best Practices
- Keep the public API key in your backend (never embed in front-end JavaScript)
- Use short cache for product list responses (60–300 seconds), longer for categories (1 hour)
- Respect pagination (`per_page`, `page`)
- Throttle clients (5 req/sec suggested)
- Use exponential backoff on 429 errors

## Endpoints & Examples

### GET /public/products
- Query: `per_page`, `page`, `q`, `sort`, `direction`, `category_id`
- Header: `X-API-Key: <PUBLIC_API_KEY>`

#### Example cURL
```bash
curl -H "X-API-Key: $PUBLIC_API_KEY" \
  "https://api.regisamtechnologies.co.ke/public/products?per_page=5&sort=price&direction=asc&q=phone"
```

#### Example Response
```json
{
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
      "prices": [
        { "price_type": "trade", "value": 80.0, "currency": "USD" },
        { "price_type": "retail", "value": 99.99, "currency": "USD" }
      ],
      "category_id": 3,
      "image_urls": ["https://res.cloudinary.com/demo/image/upload/v.../budget_phone.jpg"]
    }
  ]
}
```

### GET /public/products/{product_id}
- Header: `X-API-Key: <PUBLIC_API_KEY>`

#### Example cURL
```bash
curl -H "X-API-Key: $PUBLIC_API_KEY" https://api.regisamtechnologies.co.ke/public/products/101
```

#### Example Response
```json
{
  "id": 101,
  "name": "Budget Phone",
  "description": "Entry-level device",
  "price": 99.99,
  "prices": [
    { "price_type": "trade", "value": 80.0, "currency": "USD" },
    { "price_type": "retail", "value": 99.99, "currency": "USD" }
  ],
  "category_id": 3,
  "images": [
    { "id": 5001, "name": "Front", "url": "https://.../front.jpg", "color": "black" }
  ]
}
```

### GET /public/images
- Query: `product_id`, `page`, `per_page`

#### Example cURL
```bash
curl -H "X-API-Key: $PUBLIC_API_KEY" "https://api.regisamtechnologies.co.ke/public/images?product_id=101&per_page=10"
```

#### Example Response
```json
{
  "page": 1,
  "per_page": 10,
  "total": 4,
  "pages": 1,
  "images": [
    { "id": 5001, "name": "Front", "url": "https://.../front.jpg", "color": "black", "product_id": 101 }
  ]
}
```

### GET /public/prices
- Query: `product_id`, `price_type`

#### Example cURL
```bash
curl -H "X-API-Key: $PUBLIC_API_KEY" "https://api.regisamtechnologies.co.ke/public/prices?product_id=101"
```

#### Example Response
```json
[
  { "id": 9001, "product_id": 101, "price_type": "trade", "value": 200.0, "currency": "USD", "min_qty": null },
  { "id": 9002, "product_id": 101, "price_type": "retail", "value": 266.0, "currency": "USD", "min_qty": null }
]
```

## Client-side Caching & Storage
- Cache product lists on CDN/edge for 5 minutes
- Cache product detail for 10–60 minutes
- Store product price data in backend for quick lookups
- Do not rely on client-side caching for pricing critical flows

---

For OpenAPI/Redoc integration or reusable OpenAPI examples, contact the API maintainer.
