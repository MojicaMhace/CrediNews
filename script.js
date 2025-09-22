// CrediNews Main JavaScript

// Basic functionality for the main page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize smooth scrolling for navigation links
    initializeSmoothScrolling();
    
    // Initialize any interactive elements
    initializeInteractiveElements();
});

function initializeSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function initializeInteractiveElements() {
    // Add any interactive functionality for buttons, forms, etc.
    const buttons = document.querySelectorAll('.check-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Add button click animations or functionality
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
        });
    });
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}