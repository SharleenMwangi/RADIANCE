// main.js
// All previously inline scripts from index.html are now here

function openTab(tabName) {
  // Remove active states
  const links = document.querySelectorAll(".tab-link");
  const contents = document.querySelectorAll(".tab-contents");

  links.forEach(link => link.classList.remove("active-link"));
  contents.forEach(content => content.classList.remove("active-tab"));

  // Activate the selected tab
  document.getElementById(tabName).classList.add("active-tab");
  event.target.classList.add("active-link");
}

// Full product dataset
const products = [
  // ...existing code...
];

// Fetch categories from public API and display in Our Products section
function setupCategoriesAndCarousels() {
  const partnerCarousel = document.querySelector(".partners-carousel");
  const clientCarousel = document.querySelector(".clients-carousel");

  // Clone carousel items to create infinite loop effect
  if (partnerCarousel) partnerCarousel.innerHTML += partnerCarousel.innerHTML;
  if (clientCarousel) clientCarousel.innerHTML += clientCarousel.innerHTML;

  // Fetch categories from API
  const categoryList = document.getElementById("categoryList");
  const apiKeyMeta = document.querySelector('meta[name="public-api-key"]');
  const apiBaseMeta = document.querySelector('meta[name="public-api-base"]');
  if (!categoryList || !apiKeyMeta || !apiBaseMeta) return;
  const apiKey = apiKeyMeta.content;
  const apiBase = apiBaseMeta.content;

  fetch(apiBase + "/public/categories", {
    headers: {
      "X-API-Key": apiKey
    }
  })
    .then(res => res.ok ? res.json() : Promise.reject(res))
    .then(data => {
      if (data && Array.isArray(data.categories)) {
        categoryList.innerHTML = '<h3>Product Categories</h3><ul>' +
          data.categories.map(cat => `<li>${cat.name}</li>`).join('') + '</ul>';
      } else {
        categoryList.innerHTML = '<p>No categories found.</p>';
      }
    })
    .catch(() => {
      categoryList.innerHTML = '<p>Could not load categories.</p>';
    });
}

document.addEventListener("DOMContentLoaded", setupCategoriesAndCarousels);

function searchProduct() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const resultsContainer = document.getElementById("productResults");
  resultsContainer.innerHTML = ""; // clear previous results

  // filter matching products
  const filtered = products.filter(p => p.name.toLowerCase().includes(input));

  if (filtered.length > 0) {
    filtered.forEach(p => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <img src="${p.image}" alt="${p.name}">
        <h3>${p.name}</h3>
        <p>${p.class}</p>
      `;
      resultsContainer.appendChild(card);
    });
  } else {
    resultsContainer.innerHTML = `<p>No product found</p>`;
  }
}

// Carousel rotation
let currentIndex = 0;
setInterval(() => {
  const items = document.querySelectorAll(".carousel-item");
  if (items.length === 0) return;
  items[currentIndex].classList.remove("active");
  currentIndex = (currentIndex + 1) % items.length;
  items[currentIndex].classList.add("active");
}, 3000);
