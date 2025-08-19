// Accordion functionality
document.addEventListener('DOMContentLoaded', () => {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      body.classList.toggle('active');
      if(body.style.maxHeight){
        body.style.maxHeight = null;
      } else {
        body.style.maxHeight = body.scrollHeight + "px";
      }
    });
  });

  // Live search
  const searchInputs = document.querySelectorAll('.search-bar');
  searchInputs.forEach(input => {
    input.addEventListener('input', () => {
      const filter = input.value.toLowerCase();
      const products = document.querySelectorAll('.product-card');
      products.forEach(p => {
        const name = p.querySelector('.name').textContent.toLowerCase();
        p.style.display = name.includes(filter) ? 'block' : 'none';
      });
    });
  });
});
