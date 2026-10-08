// Testimonial Carousel / Slider Controller
document.addEventListener('DOMContentLoaded', () => {
  const slides = document.querySelectorAll('.quote-slide')
  const dots = document.querySelectorAll('.quote-dot')
  const prevBtn = document.querySelector('#prev-quote-btn')
  const nextBtn = document.querySelector('#next-quote-btn')
  const sliderContainer = document.querySelector('.quote-slider-wrapper')

  if (!slides.length) return

  let currentIndex = 0
  let autoPlayTimer = null

  function showSlide(index, direction = 'next') {
    if (index < 0) index = slides.length - 1
    if (index >= slides.length) index = 0

    slides.forEach((slide, i) => {
      slide.classList.remove('active', 'slide-out-left')
      if (i === index) {
        slide.classList.add('active')
      }
    })

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index)
    })

    currentIndex = index
  }

  function nextSlide() {
    showSlide(currentIndex + 1, 'next')
  }

  function prevSlide() {
    showSlide(currentIndex - 1, 'prev')
  }

  // Button clicks
  nextBtn?.addEventListener('click', () => {
    nextSlide()
    resetAutoPlay()
  })

  prevBtn?.addEventListener('click', () => {
    prevSlide()
    resetAutoPlay()
  })

  // Dot clicks
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.index, 10)
      if (!isNaN(idx)) {
        showSlide(idx)
        resetAutoPlay()
      }
    })
  })

  // Auto-play timer
  function startAutoPlay() {
    stopAutoPlay()
    autoPlayTimer = setInterval(nextSlide, 5000)
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer)
      autoPlayTimer = null
    }
  }

  function resetAutoPlay() {
    stopAutoPlay()
    startAutoPlay()
  }

  // Pause on hover
  if (sliderContainer) {
    sliderContainer.addEventListener('mouseenter', stopAutoPlay)
    sliderContainer.addEventListener('mouseleave', startAutoPlay)
  }

  // Touch Swipe Support
  let touchStartX = 0
  let touchEndX = 0

  sliderContainer?.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX
  }, { passive: true })

  sliderContainer?.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX
    handleSwipe()
  }, { passive: true })

  function handleSwipe() {
    const diff = touchEndX - touchStartX
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        nextSlide()
      } else {
        prevSlide()
      }
      resetAutoPlay()
    }
  }

  // Newsletter form submission handling
  const newsletterForm = document.querySelector('#newsletter-form')
  const newsletterHint = document.querySelector('#newsletter-hint')

  newsletterForm?.addEventListener('submit', e => {
    e.preventDefault()
    const input = newsletterForm.querySelector('input[type="email"]')
    if (input && input.value) {
      const email = input.value
      input.value = ''
      if (newsletterHint) {
        newsletterHint.textContent = `✓ Thanks for subscribing! We've sent a welcome issue to ${email}.`
        newsletterHint.style.color = '#10B981'
        newsletterHint.style.fontWeight = '600'
      }
    }
  })

  // Dynamic copyright year update
  const yr = new Date().getFullYear()
  document.querySelectorAll('.current-year').forEach(el => {
    el.textContent = yr
  })

  // Start initial auto-play
  startAutoPlay()
})
